/**
 * End-to-end read-only audit of the value path for one workspace + one
 * questionnaire. Emits JSON-lines (`diag.*`) so the operator can grep any
 * bucket individually. No writes.
 *
 *   tsx scratch/diag-value-path.ts --workspace=<id>
 *   tsx scratch/diag-value-path.ts --workspace=<id> --questionnaire=<id>
 *
 * Ordered sections (map onto the inspection-steps 1-11 in the plan):
 *   diag.ingest.document    (step 1)
 *   diag.ingest.summary     (step 1)
 *   diag.topic.inventory    (step 2)
 *   diag.answer.depth       (step 3)
 *   diag.questionnaire.row  (step 4)
 *   diag.questionnaire.summary (step 4)
 *   diag.topic.mapping.per-row (step 5)
 *   diag.subcontrol.gap     (step 6)
 *   diag.seeding.depth      (step 7)
 *   diag.row.resolve        (step 8) — a sampled subset, full matcher replay
 *   diag.comparison.good-vs-bad (step 10)
 *   diag.expectation.matrix (step 9, final)
 */

import { uncheckedPrisma } from "../src/lib/db/prisma";
import { SUBCONTROLS_BY_TOPIC_KEY } from "../src/modules/knowledge/topics/subcontrol-taxonomy";

type Args = { workspaceId?: string; questionnaireId?: string };

function parseArgs(argv: string[]): Args {
  const args: Args = {};
  for (const raw of argv.slice(2)) {
    if (raw.startsWith("--workspace=")) args.workspaceId = raw.slice("--workspace=".length);
    else if (raw.startsWith("--questionnaire=")) args.questionnaireId = raw.slice("--questionnaire=".length);
    else if (raw === "--help" || raw === "-h") {
      console.log("Usage: tsx scratch/diag-value-path.ts --workspace=<id> [--questionnaire=<id>]");
      process.exit(0);
    }
  }
  return args;
}

function emit(event: string, payload: Record<string, unknown>): void {
  console.log(JSON.stringify({ event, ...payload }));
}

interface ExpectedControl {
  controlFamily: string;
  topicKey: string | null;
  requiredSubControls: string[];
  expectedDocHints: string[];
}

const EXPECTED: ExpectedControl[] = [
  {
    controlFamily: "Access Control",
    topicKey: "access_control",
    requiredSubControls: [
      "rbac",
      "access_request",
      "access_approval",
      "access_review",
      "offboarding",
      "privileged_access",
      "admin_mfa",
    ],
    expectedDocHints: ["access", "policy"],
  },
  {
    controlFamily: "Encryption at Rest",
    topicKey: "encryption_at_rest",
    requiredSubControls: [],
    expectedDocHints: ["encryption", "at rest"],
  },
  {
    controlFamily: "Encryption in Transit",
    topicKey: "encryption_in_transit",
    requiredSubControls: [],
    expectedDocHints: ["encryption", "transit", "tls"],
  },
  {
    controlFamily: "Logging",
    topicKey: "logging",
    requiredSubControls: ["admin_audit_log", "alert_monitoring"],
    expectedDocHints: ["log", "audit", "monitoring"],
  },
  {
    controlFamily: "Incident Response",
    topicKey: "incident_response",
    requiredSubControls: ["triage", "containment", "communication", "post_mortem"],
    expectedDocHints: ["incident", "response"],
  },
  {
    controlFamily: "Business Continuity / DR",
    topicKey: "business_continuity",
    requiredSubControls: [],
    expectedDocHints: ["continuity", "disaster", "dr", "backup"],
  },
  {
    controlFamily: "Retention / Deletion",
    topicKey: "retention",
    requiredSubControls: ["retention_policy", "deletion_process"],
    expectedDocHints: ["retention", "deletion", "privacy"],
  },
  {
    controlFamily: "Subprocessors",
    topicKey: "subprocessors",
    requiredSubControls: ["subprocessor_list", "subprocessor_review"],
    expectedDocHints: ["subprocessor", "vendor"],
  },
  {
    controlFamily: "Data Classification",
    topicKey: null,
    requiredSubControls: [],
    expectedDocHints: ["classification", "label"],
  },
  {
    controlFamily: "Vulnerability Management / SDLC",
    topicKey: "vulnerability_management",
    requiredSubControls: [],
    expectedDocHints: ["vulnerability", "sdlc", "secure development"],
  },
  {
    controlFamily: "Purview / Enterprise Labels",
    topicKey: null,
    requiredSubControls: [],
    expectedDocHints: ["purview"],
  },
  {
    controlFamily: "Tenant Isolation",
    topicKey: null,
    requiredSubControls: [],
    expectedDocHints: ["isolation", "multi-tenant", "tenant"],
  },
  {
    controlFamily: "MFA (non-admin)",
    topicKey: "mfa",
    requiredSubControls: [],
    expectedDocHints: ["mfa", "multi-factor"],
  },
];

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  if (!args.workspaceId) {
    console.error("Missing --workspace=<id>");
    process.exit(1);
  }
  const workspaceId = args.workspaceId;

  // Pick the target questionnaire
  const questionnaire = args.questionnaireId
    ? await uncheckedPrisma.questionnaire.findUnique({
        where: { id: args.questionnaireId },
        select: { id: true, title: true, createdAt: true, workspaceId: true },
      })
    : await uncheckedPrisma.questionnaire.findFirst({
        where: { workspaceId },
        orderBy: { createdAt: "desc" },
        select: { id: true, title: true, createdAt: true, workspaceId: true },
      });

  if (!questionnaire) {
    emit("diag.header", { workspaceId, questionnaireId: null, note: "no questionnaire found" });
    return;
  }

  emit("diag.header", {
    workspaceId,
    questionnaireId: questionnaire.id,
    questionnaireTitle: questionnaire.title,
    createdAt: questionnaire.createdAt.toISOString(),
  });

  // -----------------------------------------------------------------------
  // Step 1 — Document ingestion
  // -----------------------------------------------------------------------
  const docs = await uncheckedPrisma.sourceDocument.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      fileName: true,
      uploadStatus: true,
      createdAt: true,
      parseJobs: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { status: true, errorMessage: true },
      },
      content: { select: { fullText: true } },
    },
  });

  const allChunks = await uncheckedPrisma.sourceDocumentChunk.findMany({
    where: { workspaceId },
    select: { id: true, sourceDocumentId: true },
  });
  const chunkByDoc = new Map<string, string[]>();
  for (const c of allChunks) {
    const list = chunkByDoc.get(c.sourceDocumentId) ?? [];
    list.push(c.id);
    chunkByDoc.set(c.sourceDocumentId, list);
  }

  const chunkTopicMap = await uncheckedPrisma.sourceChunkTopic.findMany({
    where: { workspaceId },
    select: {
      chunkId: true,
      topicId: true,
      score: true,
    },
  });
  const classifiedChunkIds = new Set(chunkTopicMap.map((c) => c.chunkId));

  // topic key lookup for later aggregation
  const topicRows = await uncheckedPrisma.knowledgeTopic.findMany({
    where: {
      OR: [{ workspaceId }, { workspaceId: "SYSTEM_WORKSPACE" }, { workspaceId: null }],
    },
    select: {
      id: true,
      key: true,
      name: true,
      workspaceId: true,
    },
  });
  const topicById = new Map(topicRows.map((t) => [t.id, t]));

  let chunkTotal = 0;
  let classifiedTotal = 0;

  for (const doc of docs) {
    const chunkIds = chunkByDoc.get(doc.id) ?? [];
    chunkTotal += chunkIds.length;
    const classifiedIds = chunkIds.filter((id) => classifiedChunkIds.has(id));
    classifiedTotal += classifiedIds.length;

    const topicScores = new Map<string, { score: number; chunkCount: number; key: string | null; name: string | null }>();
    for (const ct of chunkTopicMap) {
      if (!chunkIds.includes(ct.chunkId)) continue;
      const topic = topicById.get(ct.topicId);
      const key = topic?.key ?? ct.topicId;
      const entry = topicScores.get(key) ?? { score: 0, chunkCount: 0, key: topic?.key ?? null, name: topic?.name ?? null };
      entry.score += ct.score;
      entry.chunkCount += 1;
      topicScores.set(key, entry);
    }
    const topMappedTopics = Array.from(topicScores.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map((t) => ({ key: t.key, name: t.name, chunkCount: t.chunkCount, score: Number(t.score.toFixed(3)) }));

    emit("diag.ingest.document", {
      sourceDocumentId: doc.id,
      fileName: doc.fileName,
      uploadStatus: doc.uploadStatus,
      parseStatus: doc.parseJobs[0]?.status ?? "NO_JOB",
      parseError: doc.parseJobs[0]?.errorMessage ?? null,
      textLength: doc.content?.fullText?.length ?? 0,
      chunkCount: chunkIds.length,
      classifiedChunkCount: classifiedIds.length,
      orphanChunkCount: chunkIds.length - classifiedIds.length,
      topMappedTopics,
    });
  }

  // Aggregate topic coverage from chunk-topic associations
  const topicCoverage = new Map<string, { topicKey: string | null; topicName: string | null; chunkCount: number; docIds: Set<string> }>();
  for (const ct of chunkTopicMap) {
    const topic = topicById.get(ct.topicId);
    const key = topic?.key ?? ct.topicId;
    const existing = topicCoverage.get(key) ?? { topicKey: topic?.key ?? null, topicName: topic?.name ?? null, chunkCount: 0, docIds: new Set<string>() };
    existing.chunkCount++;
    const chunkOwner = allChunks.find((c) => c.id === ct.chunkId);
    if (chunkOwner) existing.docIds.add(chunkOwner.sourceDocumentId);
    topicCoverage.set(key, existing);
  }
  emit("diag.ingest.summary", {
    docCount: docs.length,
    parsedCount: docs.filter((d) => d.parseJobs[0]?.status === "COMPLETED").length,
    chunkTotal,
    classifiedTotal,
    orphanTotal: chunkTotal - classifiedTotal,
    topicCoverage: Array.from(topicCoverage.values())
      .sort((a, b) => b.chunkCount - a.chunkCount)
      .map((t) => ({ topicKey: t.topicKey, topicName: t.topicName, chunkCount: t.chunkCount, docCount: t.docIds.size })),
  });

  // -----------------------------------------------------------------------
  // Step 2 — Topic inventory (workspace + SYSTEM_WORKSPACE + legacy null)
  // -----------------------------------------------------------------------
  const allLibrary = await uncheckedPrisma.answerLibraryItem.findMany({
    where: { workspaceId, status: { not: "ARCHIVED" } },
    select: {
      id: true,
      topicId: true,
      title: true,
      status: true,
      subControlKey: true,
      subControlLabels: true,
      embedding: true,
      updatedAt: true,
      _count: { select: { evidence: true } },
    },
  });
  const libByTopic = new Map<string, typeof allLibrary>();
  for (const item of allLibrary) {
    const key = item.topicId ?? "__null__";
    const list = libByTopic.get(key) ?? [];
    list.push(item);
    libByTopic.set(key, list);
  }

  for (const topic of topicRows) {
    const items = libByTopic.get(topic.id) ?? [];
    const approved = items.filter((i) => i.status === "APPROVED");
    const draft = items.filter((i) => i.status === "DRAFT");
    const taxonomy = topic.key ? SUBCONTROLS_BY_TOPIC_KEY[topic.key] ?? [] : [];
    const seededByKey = new Map<string, { approved: number; draft: number }>();
    for (const entry of taxonomy) seededByKey.set(entry.key, { approved: 0, draft: 0 });
    seededByKey.set("__untagged__", { approved: 0, draft: 0 });
    for (const i of items) {
      const key = i.subControlKey ?? "__untagged__";
      const slot = seededByKey.get(key) ?? { approved: 0, draft: 0 };
      if (i.status === "APPROVED") slot.approved++;
      else if (i.status === "DRAFT") slot.draft++;
      seededByKey.set(key, slot);
    }
    emit("diag.topic.inventory", {
      topicId: topic.id,
      topicKey: topic.key,
      topicName: topic.name,
      scope: topic.workspaceId === workspaceId ? "workspace" : topic.workspaceId === "SYSTEM_WORKSPACE" ? "SYSTEM_WORKSPACE" : topic.workspaceId === null ? "legacy-null" : "other",
      approvedCount: approved.length,
      draftCount: draft.length,
      evidenceBackedApprovedCount: approved.filter((a) => a._count.evidence > 0).length,
      subControlTaxonomyCount: taxonomy.length,
      seededSubControls: Array.from(seededByKey.entries()).map(([k, v]) => ({ key: k, ...v })),
    });
  }

  // -----------------------------------------------------------------------
  // Step 3 — Answer depth per expected topic
  // -----------------------------------------------------------------------
  for (const exp of EXPECTED) {
    if (!exp.topicKey) continue;
    const topic = topicRows.find((t) => t.key === exp.topicKey);
    const items = topic ? libByTopic.get(topic.id) ?? [] : [];
    const approved = items.filter((i) => i.status === "APPROVED");
    const draft = items.filter((i) => i.status === "DRAFT");
    emit("diag.answer.depth", {
      topicKey: exp.topicKey,
      topicPresent: !!topic,
      approved: {
        total: approved.length,
        withEmbedding: approved.filter((a) => Array.isArray(a.embedding) && a.embedding.length > 0).length,
        withEvidence: approved.filter((a) => a._count.evidence > 0).length,
        subControls: Array.from(new Set(approved.map((a) => a.subControlKey).filter((k): k is string => !!k))),
      },
      draft: {
        total: draft.length,
        withEmbedding: draft.filter((d) => Array.isArray(d.embedding) && d.embedding.length > 0).length,
        withEvidence: draft.filter((d) => d._count.evidence > 0).length,
        subControls: Array.from(new Set(draft.map((d) => d.subControlKey).filter((k): k is string => !!k))),
      },
      lastUpdated: items.length > 0 ? items.map((i) => i.updatedAt).sort((a, b) => b.getTime() - a.getTime())[0].toISOString() : null,
      sampleTitles: items.slice(0, 3).map((i) => i.title),
    });
  }

  // -----------------------------------------------------------------------
  // Step 4 — Questionnaire rows + summary
  // -----------------------------------------------------------------------
  const items = await uncheckedPrisma.questionnaireItem.findMany({
    where: { workspaceId, questionnaireId: questionnaire.id },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      rowNumber: true,
      type: true,
      question: true,
      topicId: true,
      topicName: true,
      confidence: true,
      reviewStatus: true,
      reviewed: true,
      unresolvedReason: true,
      suggestedAnswer: true,
      suggestedAnswerId: true,
      finalAnswer: true,
      candidatesJson: true,
      sourcesJson: true,
    },
  });

  const questionRows = items.filter((i) => i.type === "question_row");
  const reasonHistogram: Record<string, number> = {};
  for (const r of questionRows) {
    const key = r.unresolvedReason ?? (r.reviewed ? "resolved" : "unresolved_no_reason");
    reasonHistogram[key] = (reasonHistogram[key] ?? 0) + 1;
  }

  for (const item of questionRows) {
    const topic = item.topicId ? topicById.get(item.topicId) : null;
    emit("diag.questionnaire.row", {
      rowNumber: item.rowNumber,
      questionPreview: item.question.slice(0, 80),
      topicId: item.topicId,
      topicKey: topic?.key ?? null,
      topicName: item.topicName,
      confidence: item.confidence,
      reviewStatus: item.reviewStatus,
      reviewed: item.reviewed,
      unresolvedReason: item.unresolvedReason,
      suggestedAnswerId: item.suggestedAnswerId,
      suggestedAnswerLen: (item.suggestedAnswer ?? "").length,
      finalAnswerLen: (item.finalAnswer ?? "").length,
      candidatesJsonCount: Array.isArray(item.candidatesJson) ? item.candidatesJson.length : 0,
      sourcesJsonCount: Array.isArray(item.sourcesJson) ? item.sourcesJson.length : 0,
    });
  }

  emit("diag.questionnaire.summary", {
    rowCount: questionRows.length,
    resolvedTopic: questionRows.filter((r) => r.topicId != null).length,
    approvedSelected: questionRows.filter((r) => r.suggestedAnswerId != null).length,
    reviewed: questionRows.filter((r) => r.reviewed).length,
    reasonHistogram,
  });

  // -----------------------------------------------------------------------
  // Step 6 — Sub-control gaps (topic resolved + no usable answer)
  // -----------------------------------------------------------------------
  for (const item of questionRows) {
    if (!item.unresolvedReason) continue;
    const topic = item.topicId ? topicById.get(item.topicId) : null;
    if (!topic) continue;
    const taxonomy = topic.key ? SUBCONTROLS_BY_TOPIC_KEY[topic.key] ?? [] : [];
    const topicAnswers = libByTopic.get(topic.id) ?? [];
    const approvedSubKeys = new Set(topicAnswers.filter((a) => a.status === "APPROVED" && a.subControlKey).map((a) => a.subControlKey as string));
    const draftSubKeys = new Set(topicAnswers.filter((a) => a.status === "DRAFT" && a.subControlKey).map((a) => a.subControlKey as string));
    emit("diag.subcontrol.gap", {
      rowNumber: item.rowNumber,
      topicKey: topic.key,
      questionPreview: item.question.slice(0, 80),
      taxonomyCount: taxonomy.length,
      presentApprovedSubControls: Array.from(approvedSubKeys),
      presentDraftSubControls: Array.from(draftSubKeys),
      missingSubControls: taxonomy.map((t) => t.key).filter((k) => !approvedSubKeys.has(k) && !draftSubKeys.has(k)),
      unresolvedReason: item.unresolvedReason,
    });
  }

  // -----------------------------------------------------------------------
  // Step 10 — Good vs bad comparison
  // -----------------------------------------------------------------------
  const goodRows = questionRows.filter((r) => r.reviewed || (r.suggestedAnswerId != null && !r.unresolvedReason));
  const badRows = questionRows.filter((r) => r.unresolvedReason != null).slice(0, 5);
  emit("diag.comparison.good-vs-bad", {
    goodRow: goodRows.length > 0
      ? {
          rowNumber: goodRows[0].rowNumber,
          question: goodRows[0].question.slice(0, 120),
          topicKey: goodRows[0].topicId ? topicById.get(goodRows[0].topicId)?.key ?? null : null,
          suggestedAnswerId: goodRows[0].suggestedAnswerId,
          confidence: goodRows[0].confidence,
          unresolvedReason: goodRows[0].unresolvedReason,
          finalAnswerLen: (goodRows[0].finalAnswer ?? "").length,
        }
      : null,
    badRows: badRows.map((r) => ({
      rowNumber: r.rowNumber,
      question: r.question.slice(0, 120),
      topicKey: r.topicId ? topicById.get(r.topicId)?.key ?? null : null,
      suggestedAnswerId: r.suggestedAnswerId,
      confidence: r.confidence,
      unresolvedReason: r.unresolvedReason,
      candidatesJsonCount: Array.isArray(r.candidatesJson) ? r.candidatesJson.length : 0,
    })),
  });

  // -----------------------------------------------------------------------
  // Step 9 — Expectation matrix
  // -----------------------------------------------------------------------
  for (const exp of EXPECTED) {
    const topic = exp.topicKey ? topicRows.find((t) => t.key === exp.topicKey) : null;
    const items = topic ? libByTopic.get(topic.id) ?? [] : [];
    const approvedCount = items.filter((i) => i.status === "APPROVED").length;
    const draftCount = items.filter((i) => i.status === "DRAFT").length;
    const contributingDocs = docs
      .filter((d) => exp.expectedDocHints.some((h) => d.fileName.toLowerCase().includes(h)))
      .map((d) => d.fileName);

    let populationStage: string;
    if (!exp.topicKey) populationStage = "classify"; // no topic in taxonomy → chunks have nowhere to land
    else if (!topic) populationStage = "classify"; // topic missing from DB
    else if (draftCount === 0) populationStage = "seeding";
    else if (approvedCount === 0) populationStage = "approval";
    else populationStage = "ok";

    emit("diag.expectation.matrix", {
      controlFamily: exp.controlFamily,
      topicKey: exp.topicKey,
      topicPresentInDb: !!topic,
      requiredSubControls: exp.requiredSubControls,
      taxonomyPresent: exp.topicKey ? (SUBCONTROLS_BY_TOPIC_KEY[exp.topicKey]?.length ?? 0) > 0 : false,
      uploadedDocsExpectedToContribute: contributingDocs,
      foundDraftCount: draftCount,
      foundApprovedCount: approvedCount,
      populationStage,
    });
  }
}

main()
  .then(() => uncheckedPrisma.$disconnect())
  .catch((err) => {
    console.error(err);
    void uncheckedPrisma.$disconnect();
    process.exit(1);
  });
