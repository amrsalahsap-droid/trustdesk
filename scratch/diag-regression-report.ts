/**
 * Read-only regression inspection for one workspace + one questionnaire.
 * Answers "why does the review screen show zero usable answers after the
 * upstream repair?" without mutating any row.
 *
 *   tsx scratch/diag-regression-report.ts --workspace=<id>
 *   tsx scratch/diag-regression-report.ts --workspace=<id> --questionnaire=<id>
 *   tsx scratch/diag-regression-report.ts --workspace=<id> --repair-cutoff=2026-04-22T20:00:00Z
 *
 * Emits JSON-lines (`diag.*`) to stdout for auditability and writes a
 * four-section Markdown report to `scratch/diag-regression-report.md`.
 */

import * as fs from "node:fs";
import * as path from "node:path";

import { uncheckedPrisma } from "../src/lib/db/prisma";
import {
  SUBCONTROLS_BY_TOPIC_KEY,
  getSubControls,
} from "../src/modules/knowledge/topics/subcontrol-taxonomy";
import { UNRESOLVED_REASON_KEYS } from "../src/lib/questionnaires/unresolved-reasons";

type Args = {
  workspaceId?: string;
  questionnaireId?: string;
  repairCutoff?: string;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {};
  for (const raw of argv.slice(2)) {
    if (raw.startsWith("--workspace=")) args.workspaceId = raw.slice("--workspace=".length);
    else if (raw.startsWith("--questionnaire=")) args.questionnaireId = raw.slice("--questionnaire=".length);
    else if (raw.startsWith("--repair-cutoff=")) args.repairCutoff = raw.slice("--repair-cutoff=".length);
    else if (raw === "--help" || raw === "-h") {
      console.log(
        "Usage: tsx scratch/diag-regression-report.ts --workspace=<id> [--questionnaire=<id>] [--repair-cutoff=<ISO>]",
      );
      process.exit(0);
    }
  }
  return args;
}

const evidenceLines: Array<{ event: string; payload: Record<string, unknown> }> = [];

function emit(event: string, payload: Record<string, unknown>): void {
  evidenceLines.push({ event, payload });
  console.log(JSON.stringify({ event, ...payload }));
}

// ---- expected control families, same ordering as diag-value-path.ts ----

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
  { controlFamily: "Encryption at Rest", topicKey: "encryption_at_rest", requiredSubControls: ["algorithms", "scope"], expectedDocHints: ["encryption", "at rest"] },
  { controlFamily: "Encryption in Transit", topicKey: "encryption_in_transit", requiredSubControls: ["tls_policy", "inter_service"], expectedDocHints: ["encryption", "transit", "tls"] },
  { controlFamily: "Logging", topicKey: "logging", requiredSubControls: ["admin_audit_log", "alert_monitoring"], expectedDocHints: ["log", "audit", "monitoring"] },
  { controlFamily: "Incident Response", topicKey: "incident_response", requiredSubControls: ["triage", "containment", "communication", "post_mortem"], expectedDocHints: ["incident", "response"] },
  { controlFamily: "Business Continuity / DR", topicKey: "business_continuity", requiredSubControls: ["rto_rpo", "backup_frequency", "dr_testing"], expectedDocHints: ["continuity", "disaster", "dr", "backup"] },
  { controlFamily: "Retention / Deletion", topicKey: "retention", requiredSubControls: ["retention_policy", "deletion_process"], expectedDocHints: ["retention", "deletion", "privacy"] },
  { controlFamily: "Subprocessors", topicKey: "subprocessors", requiredSubControls: ["subprocessor_list", "subprocessor_review"], expectedDocHints: ["subprocessor", "vendor"] },
  { controlFamily: "Data Classification", topicKey: "data_classification", requiredSubControls: ["label_taxonomy", "handling_rules"], expectedDocHints: ["classification", "label"] },
  { controlFamily: "Vulnerability Management / SDLC", topicKey: "vulnerability_management", requiredSubControls: ["scanning", "remediation_sla", "pentest", "secure_sdlc"], expectedDocHints: ["vulnerability", "sdlc", "secure development"] },
  { controlFamily: "Purview / Enterprise Labels", topicKey: "purview_integration", requiredSubControls: ["label_sync", "policy_enforcement"], expectedDocHints: ["purview"] },
  { controlFamily: "Tenant Isolation", topicKey: "tenant_isolation", requiredSubControls: ["logical_isolation", "network_isolation", "evidence_export"], expectedDocHints: ["isolation", "multi-tenant", "tenant"] },
  { controlFamily: "MFA", topicKey: "mfa", requiredSubControls: ["admin_mfa", "user_mfa", "mfa_methods"], expectedDocHints: ["mfa", "multi-factor"] },
  { controlFamily: "SSO", topicKey: "sso", requiredSubControls: ["saml_oidc", "scim_provisioning"], expectedDocHints: ["sso", "saml", "oidc"] },
];

const EXPECTED_ENV_TOPIC_KEYS = [
  "access_control",
  "data_classification",
  "tenant_isolation",
  "purview_integration",
  "encryption_at_rest",
  "encryption_in_transit",
  "business_continuity",
  "vulnerability_management",
  "mfa",
  "sso",
  "subprocessors",
];

// ---- helpers ----

function fmtPct(num: number, denom: number): number {
  return denom > 0 ? Number(((num / denom) * 100).toFixed(2)) : 0;
}

function isoOrNull(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}

// ---- main ----

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  if (!args.workspaceId) {
    console.error("Missing --workspace=<id>");
    process.exit(1);
  }
  const workspaceId = args.workspaceId;

  // Sanity: workspace must exist.
  const workspace = await uncheckedPrisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { id: true, name: true, slug: true, createdAt: true },
  });
  if (!workspace) {
    emit("diag.header", { workspaceId, note: "workspace not found" });
    process.exit(1);
  }

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

  emit("diag.header", {
    workspaceId,
    workspaceName: workspace.name,
    workspaceSlug: workspace.slug,
    workspaceCreatedAt: workspace.createdAt.toISOString(),
    questionnaireId: questionnaire?.id ?? null,
    questionnaireTitle: questionnaire?.title ?? null,
    questionnaireCreatedAt: questionnaire ? questionnaire.createdAt.toISOString() : null,
  });

  // ----- repair cutoff -----

  const firstBulkPromoteEvent = await uncheckedPrisma.auditEvent.findFirst({
    where: {
      workspaceId,
      eventType: "ANSWER_LIBRARY_ITEM_UPDATED",
    },
    orderBy: { createdAt: "asc" },
    select: { createdAt: true, metadataJson: true },
  });
  const bulkPromoteCutoff = firstBulkPromoteEvent && (firstBulkPromoteEvent.metadataJson as any)?.bulkPromote === true
    ? firstBulkPromoteEvent.createdAt
    : null;

  // Earliest post-parse reclassification: for each chunk, compare
  // SourceChunkTopic.createdAt vs SourceDocumentChunk.createdAt. If the gap
  // > 60s we count it as a reclassification event.
  const chunksForTiming = await uncheckedPrisma.sourceDocumentChunk.findMany({
    where: { workspaceId },
    select: { id: true, createdAt: true },
  });
  const chunkCreatedAt = new Map(chunksForTiming.map((c) => [c.id, c.createdAt]));
  const chunkTopicTimings = await uncheckedPrisma.sourceChunkTopic.findMany({
    where: { workspaceId },
    select: { chunkId: true, topicId: true, createdAt: true },
  });
  const reclassifiedEarliest = chunkTopicTimings
    .map((ct) => {
      const parent = chunkCreatedAt.get(ct.chunkId);
      if (!parent) return null;
      const deltaMs = ct.createdAt.getTime() - parent.getTime();
      return deltaMs > 60_000 ? ct.createdAt : null;
    })
    .filter((d): d is Date => d !== null)
    .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;

  const firstSeedingJob = await uncheckedPrisma.answerSeedingJob.findFirst({
    where: { workspaceId },
    orderBy: { createdAt: "asc" },
    select: { createdAt: true, startedAt: true },
  });
  const latestSeedingJob = await uncheckedPrisma.answerSeedingJob.findFirst({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true, startedAt: true, finishedAt: true, status: true },
  });
  const secondSeedingJob = await uncheckedPrisma.answerSeedingJob.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "asc" },
    skip: 1,
    take: 1,
    select: { createdAt: true },
  });

  // Candidates for repairCutoff: bulkPromote, reclassification, the
  // second-or-later seeding job (first one is the original ingest-time run).
  const cutoffCandidates: Array<{ source: string; at: Date }> = [];
  if (args.repairCutoff) cutoffCandidates.push({ source: "override", at: new Date(args.repairCutoff) });
  if (bulkPromoteCutoff) cutoffCandidates.push({ source: "auditEvent.bulkPromote", at: bulkPromoteCutoff });
  if (reclassifiedEarliest) cutoffCandidates.push({ source: "sourceChunkTopic.reclassified", at: reclassifiedEarliest });
  if (secondSeedingJob[0]) cutoffCandidates.push({ source: "answerSeedingJob.second", at: secondSeedingJob[0].createdAt });
  cutoffCandidates.sort((a, b) => a.at.getTime() - b.at.getTime());
  const repairCutoff = cutoffCandidates[0] ?? null;

  emit("diag.repair-cutoff", {
    repairCutoff: repairCutoff ? repairCutoff.at.toISOString() : null,
    source: repairCutoff?.source ?? null,
    candidates: cutoffCandidates.map((c) => ({ source: c.source, at: c.at.toISOString() })),
    rolloutApplied: repairCutoff !== null,
  });

  const cutoffDate = repairCutoff?.at ?? null;
  const before = (d: Date) => (cutoffDate ? d.getTime() < cutoffDate.getTime() : true);
  const after = (d: Date) => (cutoffDate ? d.getTime() >= cutoffDate.getTime() : false);

  // --------------------------------------------------------------
  // STEP 1 — Workspace repair-state audit
  // --------------------------------------------------------------

  // 1a. classification-topk-reclassified
  const chunkCount = chunksForTiming.length;
  const associationCount = chunkTopicTimings.length;
  const reclassifiedCount = chunkTopicTimings.filter((ct) => {
    const parent = chunkCreatedAt.get(ct.chunkId);
    return parent && ct.createdAt.getTime() - parent.getTime() > 60_000;
  }).length;
  emit("diag.repair-state.classification-topk-reclassified", {
    appliedToThisWorkspace: reclassifiedCount > 0,
    totalChunkCount: chunkCount,
    totalSourceChunkTopicRows: associationCount,
    reclassifiedAssociationCount: reclassifiedCount,
    earliestReclassifiedAt: isoOrNull(reclassifiedEarliest),
    note:
      reclassifiedCount === 0
        ? "No SourceChunkTopic row was created more than 60s after its parent chunk, so no post-parse reclassification ran."
        : `${reclassifiedCount} associations were created post-parse, evidence of reclassification.`,
  });

  // 1b. canonical-topics-seeded
  const systemTopics = await uncheckedPrisma.knowledgeTopic.findMany({
    where: { workspaceId: "SYSTEM_WORKSPACE" },
    select: { key: true, createdAt: true, updatedAt: true },
  });
  const systemTopicKeys = new Set(systemTopics.map((t) => t.key));
  const requiredCanonical = ["data_classification", "tenant_isolation", "purview_integration"];
  emit("diag.repair-state.canonical-topics-seeded", {
    appliedToThisWorkspace: requiredCanonical.every((k) => systemTopicKeys.has(k)),
    systemTopicCount: systemTopicKeys.size,
    missingFromSystem: requiredCanonical.filter((k) => !systemTopicKeys.has(k)),
    presentDetails: systemTopics
      .filter((t) => requiredCanonical.includes(t.key))
      .map((t) => ({ key: t.key, createdAt: t.createdAt.toISOString(), updatedAt: t.updatedAt.toISOString() })),
  });

  // 1c. subcontrol-taxonomy-rolled-out (code-side)
  const taxonomyKeys = Object.keys(SUBCONTROLS_BY_TOPIC_KEY);
  const newInRollout = [
    "encryption_at_rest",
    "encryption_in_transit",
    "business_continuity",
    "vulnerability_management",
    "mfa",
    "sso",
    "data_classification",
    "tenant_isolation",
    "purview_integration",
  ];
  emit("diag.repair-state.subcontrol-taxonomy-rolled-out", {
    appliedInCode: newInRollout.every((k) => taxonomyKeys.includes(k) && getSubControls(k).length > 0),
    taxonomyKeys,
    newInRolloutPresent: newInRollout.filter((k) => taxonomyKeys.includes(k)),
    newInRolloutMissing: newInRollout.filter((k) => !taxonomyKeys.includes(k)),
  });

  // 1d. reseeded-after-taxonomy
  const seedingJobs = await uncheckedPrisma.answerSeedingJob.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      status: true,
      startedAt: true,
      finishedAt: true,
      createdAt: true,
      topicRuns: { select: { status: true, topicId: true } },
    },
  });
  const postCutoffJobs = cutoffDate
    ? seedingJobs.filter((j) => j.createdAt.getTime() >= cutoffDate.getTime())
    : [];
  const topicRunStatusHistogram: Record<string, number> = {};
  for (const job of postCutoffJobs) {
    for (const run of job.topicRuns) {
      topicRunStatusHistogram[run.status] = (topicRunStatusHistogram[run.status] ?? 0) + 1;
    }
  }
  emit("diag.repair-state.reseeded-after-taxonomy", {
    appliedToThisWorkspace: postCutoffJobs.length > 0,
    totalSeedingJobs: seedingJobs.length,
    postCutoffSeedingJobs: postCutoffJobs.length,
    latestJob: latestSeedingJob
      ? {
          status: latestSeedingJob.status,
          createdAt: latestSeedingJob.createdAt.toISOString(),
          startedAt: isoOrNull(latestSeedingJob.startedAt),
          finishedAt: isoOrNull(latestSeedingJob.finishedAt),
        }
      : null,
    postCutoffTopicRunStatusHistogram: topicRunStatusHistogram,
    firstSeedingJobCreatedAt: firstSeedingJob ? firstSeedingJob.createdAt.toISOString() : null,
  });

  // 1e. answer-embedding-backfilled
  const answers = await uncheckedPrisma.answerLibraryItem.findMany({
    where: { workspaceId },
    select: {
      id: true,
      title: true,
      status: true,
      subControlKey: true,
      createdAt: true,
      updatedAt: true,
      embedding: true,
      topicId: true,
      confidenceScore: true,
      _count: { select: { evidence: true } },
    },
  });
  const emptyEmbeddingCount = answers.filter((a) => !a.embedding || a.embedding.length === 0).length;
  const populatedEmbeddingCount = answers.length - emptyEmbeddingCount;
  emit("diag.repair-state.answer-embedding-backfilled", {
    appliedToThisWorkspace: emptyEmbeddingCount === 0,
    totalAnswers: answers.length,
    emptyEmbeddingCount,
    populatedEmbeddingCount,
    emptyEmbeddingSample: answers
      .filter((a) => !a.embedding || a.embedding.length === 0)
      .slice(0, 5)
      .map((a) => ({ id: a.id, title: a.title, status: a.status })),
  });

  // 1f. drafts-promoted
  const bulkPromoteEvents = await uncheckedPrisma.auditEvent.findMany({
    where: {
      workspaceId,
      eventType: "ANSWER_LIBRARY_ITEM_UPDATED",
    },
    orderBy: { createdAt: "asc" },
    select: { createdAt: true, objectId: true, metadataJson: true },
  });
  const promotedByTopic: Record<string, number> = {};
  const promotedBySubControl: Record<string, number> = {};
  let bulkPromoteCount = 0;
  for (const ev of bulkPromoteEvents) {
    const meta = (ev.metadataJson ?? {}) as { bulkPromote?: boolean; topicKey?: string; subControlKey?: string | null };
    if (meta.bulkPromote !== true) continue;
    bulkPromoteCount++;
    if (meta.topicKey) promotedByTopic[meta.topicKey] = (promotedByTopic[meta.topicKey] ?? 0) + 1;
    const scKey = meta.subControlKey ?? "__untagged__";
    promotedBySubControl[scKey] = (promotedBySubControl[scKey] ?? 0) + 1;
  }
  emit("diag.repair-state.drafts-promoted", {
    appliedToThisWorkspace: bulkPromoteCount > 0,
    bulkPromoteCount,
    promotedByTopic,
    promotedBySubControl,
    firstPromoteAt: bulkPromoteCutoff ? bulkPromoteCutoff.toISOString() : null,
  });

  // --------------------------------------------------------------
  // STEP 2 — Current document coverage
  // --------------------------------------------------------------
  const docs = await uncheckedPrisma.sourceDocument.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      fileName: true,
      uploadStatus: true,
      parseJobs: { orderBy: { createdAt: "desc" }, take: 1, select: { status: true } },
      chunks: { select: { id: true, createdAt: true } },
    },
  });
  const classifiedChunkIdSet = new Set(chunkTopicTimings.map((c) => c.chunkId));
  const topicRows = await uncheckedPrisma.knowledgeTopic.findMany({
    where: {
      OR: [{ workspaceId }, { workspaceId: "SYSTEM_WORKSPACE" }, { workspaceId: null }],
    },
    select: { id: true, key: true, name: true, workspaceId: true, embedding: true },
  });
  const topicByKey = new Map<string, typeof topicRows[number]>();
  for (const t of topicRows) {
    const existing = topicByKey.get(t.key);
    if (!existing || t.workspaceId === workspaceId) topicByKey.set(t.key, t);
  }
  const mergedTopicsById = new Map<string, typeof topicRows[number]>();
  for (const t of topicByKey.values()) mergedTopicsById.set(t.id, t);

  let totalChunkCount = 0;
  let totalClassifiedChunks = 0;
  const docRows: Array<{
    sourceDocumentId: string;
    fileName: string;
    parseStatus: string;
    chunkCount: number;
    classifiedChunkCount: number;
    orphanChunkCount: number;
    orphanPct: number;
    topMappedTopics: Array<{ key: string | null; count: number }>;
    reclassifiedChunkCount: number;
  }> = [];

  for (const d of docs) {
    const chunkIds = d.chunks.map((c) => c.id);
    const classified = chunkIds.filter((id) => classifiedChunkIdSet.has(id));
    totalChunkCount += chunkIds.length;
    totalClassifiedChunks += classified.length;

    const docAssociations = chunkTopicTimings.filter((ct) => chunkIds.includes(ct.chunkId));
    const reclassifiedForDoc = docAssociations.filter((ct) => {
      const parent = chunkCreatedAt.get(ct.chunkId);
      return parent && ct.createdAt.getTime() - parent.getTime() > 60_000;
    }).length;

    const topicKeyById = new Map(topicRows.map((t) => [t.id, t.key]));
    const topicHits = new Map<string | null, number>();
    for (const ct of docAssociations) {
      const key = topicKeyById.get(ct.topicId) ?? null;
      topicHits.set(key, (topicHits.get(key) ?? 0) + 1);
    }
    const topMapped = Array.from(topicHits.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([key, count]) => ({ key, count }));

    const docRow = {
      sourceDocumentId: d.id,
      fileName: d.fileName,
      parseStatus: d.parseJobs[0]?.status ?? "NO_JOB",
      chunkCount: chunkIds.length,
      classifiedChunkCount: classified.length,
      orphanChunkCount: chunkIds.length - classified.length,
      orphanPct: fmtPct(chunkIds.length - classified.length, chunkIds.length),
      topMappedTopics: topMapped,
      reclassifiedChunkCount: reclassifiedForDoc,
    };
    docRows.push(docRow);
    emit("diag.ingest.document", docRow);
  }
  emit("diag.ingest.summary", {
    docCount: docs.length,
    parsedCount: docs.filter((d) => d.parseJobs[0]?.status === "COMPLETED").length,
    chunkTotal: totalChunkCount,
    classifiedTotal: totalClassifiedChunks,
    orphanTotal: totalChunkCount - totalClassifiedChunks,
    orphanPct: fmtPct(totalChunkCount - totalClassifiedChunks, totalChunkCount),
  });

  // --------------------------------------------------------------
  // STEP 3 — Topic inventory + rollout-check
  // --------------------------------------------------------------
  const chunkTopicByTopic = new Map<string, number>();
  for (const ct of chunkTopicTimings) {
    chunkTopicByTopic.set(ct.topicId, (chunkTopicByTopic.get(ct.topicId) ?? 0) + 1);
  }
  const mergedList = Array.from(topicByKey.values());
  emit("diag.topic.rollout-check", {
    expectedKeys: EXPECTED_ENV_TOPIC_KEYS,
    presentKeys: EXPECTED_ENV_TOPIC_KEYS.filter((k) => topicByKey.has(k)),
    missingKeys: EXPECTED_ENV_TOPIC_KEYS.filter((k) => !topicByKey.has(k)),
    totalMergedTopicCount: mergedList.length,
  });
  for (const t of mergedList) {
    const taxonomy = SUBCONTROLS_BY_TOPIC_KEY[t.key] ?? [];
    const items = answers.filter((a) => a.topicId === t.id);
    const approved = items.filter((i) => i.status === "APPROVED");
    const draft = items.filter((i) => i.status === "DRAFT");
    emit("diag.topic.inventory", {
      topicKey: t.key,
      topicName: t.name,
      scope: t.workspaceId === workspaceId ? "workspace" : t.workspaceId === "SYSTEM_WORKSPACE" ? "SYSTEM_WORKSPACE" : t.workspaceId === null ? "legacy-null" : "other",
      chunkCoverageCount: chunkTopicByTopic.get(t.id) ?? 0,
      taxonomyEntries: taxonomy.length,
      approvedCount: approved.length,
      draftCount: draft.length,
      approvedSubControls: Array.from(new Set(approved.map((a) => a.subControlKey).filter((k): k is string => !!k))),
      draftSubControls: Array.from(new Set(draft.map((a) => a.subControlKey).filter((k): k is string => !!k))),
    });
  }

  // --------------------------------------------------------------
  // STEP 4 — Answer library aggregate
  // --------------------------------------------------------------
  const approvedAll = answers.filter((a) => a.status === "APPROVED");
  const draftAll = answers.filter((a) => a.status === "DRAFT");
  const approvedAfter = approvedAll.filter((a) => cutoffDate && (a.createdAt.getTime() >= cutoffDate.getTime() || a.updatedAt.getTime() >= cutoffDate.getTime()));
  const draftAfter = draftAll.filter((a) => cutoffDate && (a.createdAt.getTime() >= cutoffDate.getTime() || a.updatedAt.getTime() >= cutoffDate.getTime()));
  emit("diag.answer.aggregate", {
    approvedTotal: approvedAll.length,
    draftTotal: draftAll.length,
    approvedCreatedOrUpdatedAfterCutoff: approvedAfter.length,
    draftCreatedOrUpdatedAfterCutoff: draftAfter.length,
    answersWithEmptyEmbedding: emptyEmbeddingCount,
    approvedBySubControlTaggedCount: approvedAll.filter((a) => a.subControlKey).length,
    draftBySubControlTaggedCount: draftAll.filter((a) => a.subControlKey).length,
  });

  // --------------------------------------------------------------
  // STEP 5 — Questionnaire rows + histogram
  // --------------------------------------------------------------
  let questionRows: Array<{
    id: string;
    rowNumber: number | null;
    type: string;
    question: string;
    topicId: string | null;
    topicName: string | null;
    confidence: string;
    reviewStatus: string;
    reviewed: boolean;
    unresolvedReason: string | null;
    suggestedAnswer: string;
    suggestedAnswerId: string | null;
    finalAnswer: string;
    candidatesJson: unknown;
    sourcesJson: unknown;
    createdAt: Date;
  }> = [];
  let questionnaireSummary: Record<string, unknown> | null = null;

  if (questionnaire) {
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
        createdAt: true,
      },
    });
    questionRows = items.filter((i) => i.type === "question_row");

    const reasonHistogram: Record<string, number> = {};
    for (const k of UNRESOLVED_REASON_KEYS) reasonHistogram[k] = 0;
    reasonHistogram["__resolved__"] = 0;
    reasonHistogram["__unresolved_no_reason__"] = 0;
    for (const r of questionRows) {
      if (r.unresolvedReason && r.unresolvedReason in reasonHistogram) {
        reasonHistogram[r.unresolvedReason]++;
      } else if (r.unresolvedReason) {
        reasonHistogram[r.unresolvedReason] = (reasonHistogram[r.unresolvedReason] ?? 0) + 1;
      } else if (r.reviewed || r.suggestedAnswerId) {
        reasonHistogram["__resolved__"]++;
      } else {
        reasonHistogram["__unresolved_no_reason__"]++;
      }
    }

    questionnaireSummary = {
      questionnaireId: questionnaire.id,
      rowCount: questionRows.length,
      resolvedTopicCount: questionRows.filter((r) => r.topicId != null).length,
      approvedSelectedCount: questionRows.filter((r) => r.suggestedAnswerId != null).length,
      reviewedCount: questionRows.filter((r) => r.reviewed).length,
      unresolvedReasonHistogram: reasonHistogram,
    };
    emit("diag.questionnaire.summary", questionnaireSummary as Record<string, unknown>);
  } else {
    emit("diag.questionnaire.summary", { rowCount: 0, note: "no questionnaire found for workspace" });
  }

  // --------------------------------------------------------------
  // STEP 6 — Before/after snapshot
  // --------------------------------------------------------------
  // SourceChunkTopic partition: before = associations whose createdAt <= parent.createdAt + 60s (original parse),
  // after = anything else. This is the same rule as the reclassify detector.
  const associationsBefore = chunkTopicTimings.filter((ct) => {
    const parent = chunkCreatedAt.get(ct.chunkId);
    return !parent || ct.createdAt.getTime() - parent.getTime() <= 60_000;
  }).length;
  const associationsAfter = chunkTopicTimings.length - associationsBefore;

  const classifiedChunkCountBefore = new Set(
    chunkTopicTimings
      .filter((ct) => {
        const parent = chunkCreatedAt.get(ct.chunkId);
        return !parent || ct.createdAt.getTime() - parent.getTime() <= 60_000;
      })
      .map((ct) => ct.chunkId),
  ).size;
  const classifiedChunkCountAfter = classifiedChunkIdSet.size; // current total

  const approvedBeforeList = approvedAll.filter((a) => (cutoffDate ? before(a.createdAt) && before(a.updatedAt) : true));
  const approvedAfterList = cutoffDate
    ? approvedAll.filter((a) => after(a.createdAt) || after(a.updatedAt))
    : approvedAll;
  const draftBeforeList = draftAll.filter((a) => (cutoffDate ? before(a.createdAt) && before(a.updatedAt) : true));
  const draftAfterList = cutoffDate
    ? draftAll.filter((a) => after(a.createdAt) || after(a.updatedAt))
    : draftAll;

  emit("diag.regression.before-after", {
    repairCutoff: cutoffDate ? cutoffDate.toISOString() : null,
    classifiedChunkCount: { before: classifiedChunkCountBefore, after: classifiedChunkCountAfter },
    sourceChunkTopicAssociations: { before: associationsBefore, after: associationsBefore + associationsAfter },
    approvedAnswers: { before: approvedBeforeList.length, after: approvedAfterList.length },
    draftAnswers: { before: draftBeforeList.length, after: draftAfterList.length },
    answersWithEmbedding: {
      before: approvedBeforeList.filter((a) => a.embedding && a.embedding.length > 0).length
        + draftBeforeList.filter((a) => a.embedding && a.embedding.length > 0).length,
      after: populatedEmbeddingCount,
    },
    notes: {
      questionnaireItems:
        "QuestionnaireItem has no updatedAt column (schema), so before/after partitioning on questionnaire rows is not recoverable from existing data. Current state is reported as 'after'.",
    },
    questionnaireItems: questionnaireSummary
      ? {
          rowCount: questionnaireSummary.rowCount,
          approvedSelected: questionnaireSummary.approvedSelectedCount,
          unresolvedReasonHistogram: questionnaireSummary.unresolvedReasonHistogram,
        }
      : null,
  });

  // --------------------------------------------------------------
  // STEP 7 — Per-bucket row drill-downs
  // --------------------------------------------------------------
  const buckets: Array<{ bucket: string; reasons: string[] }> = [
    { bucket: "Missing Topics", reasons: ["missing_topic"] },
    { bucket: "No Answer Content", reasons: ["no_approved_answer"] },
    { bucket: "Rejected Draft Candidates", reasons: ["low_quality_draft"] },
    { bucket: "Answer Mismatch", reasons: ["answer_fitness_failed"] },
    { bucket: "Sub-Control Missing", reasons: ["missing_subcontrol_coverage"] },
  ];

  const rowTraces: Array<Record<string, unknown>> = [];
  for (const b of buckets) {
    const row = questionRows.find((r) => r.unresolvedReason && b.reasons.includes(r.unresolvedReason));
    if (!row) {
      const emptyTrace = { bucket: b.bucket, found: false, note: "no row with this unresolvedReason in current questionnaire" };
      rowTraces.push(emptyTrace);
      emit("diag.row.trace", emptyTrace);
      continue;
    }
    const topic = row.topicId ? mergedTopicsById.get(row.topicId) ?? null : null;
    const topicKey = topic?.key ?? null;
    const taxonomy = topicKey ? SUBCONTROLS_BY_TOPIC_KEY[topicKey] ?? [] : [];
    const topicAnswers = topic ? answers.filter((a) => a.topicId === topic.id) : [];
    const approvedUnderTopic = topicAnswers.filter((a) => a.status === "APPROVED");
    const draftUnderTopic = topicAnswers.filter((a) => a.status === "DRAFT");

    const trace: Record<string, unknown> = {
      bucket: b.bucket,
      found: true,
      rowNumber: row.rowNumber,
      rowId: row.id,
      questionPreview: row.question.slice(0, 160),
      resolvedTopicKey: topicKey,
      resolvedTopicName: row.topicName,
      confidence: row.confidence,
      reviewed: row.reviewed,
      unresolvedReason: row.unresolvedReason,
      suggestedAnswerId: row.suggestedAnswerId,
      suggestedAnswerLen: row.suggestedAnswer.length,
      candidatesJsonCount: Array.isArray(row.candidatesJson) ? (row.candidatesJson as unknown[]).length : 0,
      sourcesJsonCount: Array.isArray(row.sourcesJson) ? (row.sourcesJson as unknown[]).length : 0,
      approvedUnderTopic: {
        count: approvedUnderTopic.length,
        topTitles: approvedUnderTopic.slice(0, 3).map((a) => a.title),
        subControls: Array.from(new Set(approvedUnderTopic.map((a) => a.subControlKey).filter((k): k is string => !!k))),
      },
      draftUnderTopic: {
        count: draftUnderTopic.length,
        topTitles: draftUnderTopic.slice(0, 3).map((a) => a.title),
        subControls: Array.from(new Set(draftUnderTopic.map((a) => a.subControlKey).filter((k): k is string => !!k))),
      },
      taxonomyEntries: taxonomy.length,
      missingSubControls: taxonomy
        .map((t) => t.key)
        .filter(
          (k) =>
            !approvedUnderTopic.some((a) => a.subControlKey === k)
            && !draftUnderTopic.some((a) => a.subControlKey === k),
        ),
    };
    rowTraces.push(trace);
    emit("diag.row.trace", trace);
  }

  // --------------------------------------------------------------
  // STEP 8 — Approval bottleneck (drafts blocking rows)
  // --------------------------------------------------------------
  // Rehearse: for each DRAFT answer, count how many of the unresolved rows
  // sit under the same topic (and sub-control, when the row has a resolved
  // topic with taxonomy). A lightweight bottleneck view — it does NOT run
  // cosine on the question text (no embedding access here), so it only
  // counts topic-scope matches. This is the honest maximum upper bound on
  // "what approval of this draft would unlock".
  const draftBlockCounts: Array<{
    answerId: string;
    title: string;
    topicKey: string | null;
    subControlKey: string | null;
    blockedRowCount: number;
  }> = [];
  for (const d of draftAll) {
    const topic = d.topicId ? mergedTopicsById.get(d.topicId) ?? null : null;
    if (!topic) continue;
    const blockedRowCount = questionRows.filter((r) => {
      if (!r.unresolvedReason) return false;
      if (r.topicId !== topic.id) return false;
      if (d.subControlKey) {
        // If the draft is sub-control-scoped, only count rows whose current
        // unresolvedReason implies a sub-control gap.
        if (r.unresolvedReason !== "missing_subcontrol_coverage" && r.unresolvedReason !== "no_approved_answer") return false;
      }
      return true;
    }).length;
    if (blockedRowCount > 0) {
      draftBlockCounts.push({
        answerId: d.id,
        title: d.title,
        topicKey: topic.key,
        subControlKey: d.subControlKey ?? null,
        blockedRowCount,
      });
    }
  }
  draftBlockCounts.sort((a, b) => b.blockedRowCount - a.blockedRowCount);
  const top15 = draftBlockCounts.slice(0, 15);
  emit("diag.bottleneck.drafts-blocking-rows", {
    totalDrafts: draftAll.length,
    draftsWithAtLeastOneBlockedRow: draftBlockCounts.length,
    top15,
  });

  // --------------------------------------------------------------
  // STEP 9 — Expectation matrix
  // --------------------------------------------------------------
  const expectationRows: Array<Record<string, unknown>> = [];
  for (const exp of EXPECTED) {
    const topic = exp.topicKey ? mergedTopicsById.get([...mergedTopicsById.values()].find((t) => t.key === exp.topicKey)?.id ?? "") ?? null : null;
    const topicItems = topic ? answers.filter((a) => a.topicId === topic.id) : [];
    const approved = topicItems.filter((a) => a.status === "APPROVED");
    const draft = topicItems.filter((a) => a.status === "DRAFT");
    const approvedSubs = new Set(approved.map((a) => a.subControlKey).filter((k): k is string => !!k));
    const draftSubs = new Set(draft.map((a) => a.subControlKey).filter((k): k is string => !!k));
    const taxonomyEntries = exp.topicKey ? SUBCONTROLS_BY_TOPIC_KEY[exp.topicKey] ?? [] : [];
    const chunkCoverage = topic ? chunkTopicByTopic.get(topic.id) ?? 0 : 0;
    const blockedRows = topic
      ? questionRows.filter((r) => r.topicId === topic.id && r.unresolvedReason).length
      : 0;

    let firstBrokenGate: string = "n/a";
    let populationStage: string = "ok";
    if (!exp.topicKey) {
      firstBrokenGate = "topic";
      populationStage = "failed";
    } else if (!topic) {
      firstBrokenGate = "topic";
      populationStage = "failed";
    } else if (chunkCoverage === 0) {
      firstBrokenGate = "classification";
      populationStage = "failed";
    } else if (taxonomyEntries.length === 0) {
      firstBrokenGate = "taxonomy";
      populationStage = "partial";
    } else if (draft.length === 0 && approved.length === 0) {
      firstBrokenGate = "seeding";
      populationStage = "failed";
    } else if (approved.length === 0) {
      firstBrokenGate = "approval";
      populationStage = "partial";
    } else if (approved.length > 0) {
      firstBrokenGate = "n/a";
      populationStage = "ok";
    }

    const row = {
      controlFamily: exp.controlFamily,
      topicKey: exp.topicKey,
      topicPresent: !!topic,
      chunkCoverage,
      subControlTaxonomyEntries: taxonomyEntries.length,
      taxonomyKeys: taxonomyEntries.map((t) => t.key),
      approvedSubControls: { count: approved.length, keys: Array.from(approvedSubs) },
      draftSubControls: { count: draft.length, keys: Array.from(draftSubs) },
      blockedQuestionnaireRows: blockedRows,
      populationStage,
      firstBrokenGate,
    };
    expectationRows.push(row);
    emit("diag.expectation.matrix", row);
  }

  // --------------------------------------------------------------
  // Build the Markdown report
  // --------------------------------------------------------------
  const firstBrokenStage = determineFirstBrokenStage({
    repairApplied: repairCutoff !== null,
    reclassifiedCount,
    canonicalPresent: requiredCanonical.every((k) => systemTopicKeys.has(k)),
    taxonomyPresent: newInRollout.every((k) => taxonomyKeys.includes(k)),
    reseedingRan: postCutoffJobs.length > 0,
    embeddingsOk: emptyEmbeddingCount === 0,
    promotedAny: bulkPromoteCount > 0,
    approvedTotal: approvedAll.length,
    draftTotal: draftAll.length,
    approvedSelected: (questionnaireSummary?.approvedSelectedCount as number) ?? 0,
    questionRowCount: questionRows.length,
  });

  const categoryVerdict = decideCategory({
    firstBrokenStage: firstBrokenStage.stage,
    repairApplied: repairCutoff !== null,
    reclassifiedCount,
    canonicalPresent: requiredCanonical.every((k) => systemTopicKeys.has(k)),
    taxonomyPresent: newInRollout.every((k) => taxonomyKeys.includes(k)),
    reseedingRan: postCutoffJobs.length > 0,
    promotedAny: bulkPromoteCount > 0,
    approvedTotal: approvedAll.length,
    draftTotal: draftAll.length,
  });

  const report = buildMarkdownReport({
    workspace,
    questionnaire,
    questionRowCount: questionRows.length,
    repairCutoff,
    cutoffCandidates,
    lastSuccessfulStage: firstBrokenStage.lastOk,
    firstBrokenStage: firstBrokenStage.stage,
    oneLineVerdict: firstBrokenStage.verdict,
    category: categoryVerdict.category,
    beforeAfter: {
      docsParsed: {
        before: docs.filter((d) => d.parseJobs[0]?.status === "COMPLETED").length,
        after: docs.filter((d) => d.parseJobs[0]?.status === "COMPLETED").length,
      },
      totalChunks: totalChunkCount,
      classifiedChunks: { before: classifiedChunkCountBefore, after: classifiedChunkCountAfter },
      orphanPct: fmtPct(totalChunkCount - classifiedChunkCountAfter, totalChunkCount),
      sourceChunkTopicAssociations: { before: associationsBefore, after: associationsBefore + associationsAfter },
      approvedAnswers: { before: approvedBeforeList.length, after: approvedAfterList.length },
      draftAnswers: { before: draftBeforeList.length, after: draftAfterList.length },
      answersWithEmbedding: populatedEmbeddingCount,
      emptyEmbedding: emptyEmbeddingCount,
      questionnaireApprovedSelected: (questionnaireSummary?.approvedSelectedCount as number) ?? 0,
      questionnaireRowCount: questionRows.length,
      unresolvedHistogram: (questionnaireSummary?.unresolvedReasonHistogram as Record<string, number>) ?? {},
    },
    expectationRows,
    rowTraces,
    bottleneckTop15: top15,
    rollout: {
      reclassifiedCount,
      canonicalMissing: requiredCanonical.filter((k) => !systemTopicKeys.has(k)),
      taxonomyMissing: newInRollout.filter((k) => !taxonomyKeys.includes(k)),
      reseedingRan: postCutoffJobs.length > 0,
      promotedCount: bulkPromoteCount,
      promotedByTopic,
    },
    evidenceLines,
    fixPack: categoryVerdict,
  });

  const reportPath = path.resolve("scratch", "diag-regression-report.md");
  fs.writeFileSync(reportPath, report, "utf8");
  emit("diag.report.written", { reportPath });
}

// ---------------- analysis helpers ----------------

interface RolloutSignals {
  repairApplied: boolean;
  reclassifiedCount: number;
  canonicalPresent: boolean;
  taxonomyPresent: boolean;
  reseedingRan: boolean;
  embeddingsOk: boolean;
  promotedAny: boolean;
  approvedTotal: number;
  draftTotal: number;
  approvedSelected: number;
  questionRowCount: number;
}

interface StageVerdict {
  lastOk: string;
  stage: string;
  verdict: string;
}

function determineFirstBrokenStage(s: RolloutSignals): StageVerdict {
  if (!s.repairApplied) {
    return {
      lastOk: "code deploy (taxonomy/classifier changes in source)",
      stage: "rollout-not-applied-to-workspace",
      verdict: "The repair scripts were never executed for this workspace; current DB state predates the upstream fix.",
    };
  }
  if (!s.canonicalPresent) {
    return {
      lastOk: "rollout started",
      stage: "canonical-topics-not-seeded",
      verdict: "Required canonical topics are missing from SYSTEM_WORKSPACE; scripts/seed-canonical-topics.ts has not completed against this environment.",
    };
  }
  if (!s.taxonomyPresent) {
    return {
      lastOk: "canonical topics seeded",
      stage: "sub-control-taxonomy-missing",
      verdict: "The extended sub-control taxonomy is not present in the running code; this process is serving stale modules.",
    };
  }
  if (s.reclassifiedCount === 0) {
    return {
      lastOk: "taxonomy rollout in code",
      stage: "classification-not-rerun",
      verdict: "No chunk was reclassified post-parse; scripts/reclassify-chunks.ts has not run for this workspace so no new top-K topic links exist.",
    };
  }
  if (!s.reseedingRan) {
    return {
      lastOk: "chunks reclassified",
      stage: "seeding-not-rerun",
      verdict: "No AnswerSeedingJob ran after the rollout cutoff; the taxonomy expansion never produced new drafts here.",
    };
  }
  if (s.draftTotal === 0 && s.approvedTotal === 0) {
    return {
      lastOk: "seeding job started",
      stage: "seeding-produced-nothing",
      verdict: "Seeding ran but created zero answers; likely SKIPPED_NO_EVIDENCE dominance from classification still being too sparse.",
    };
  }
  if (s.approvedTotal === 0 && s.draftTotal > 0) {
    return {
      lastOk: "drafts produced",
      stage: "approval-coverage-missing",
      verdict: "Drafts exist but nothing is APPROVED; the matcher only accepts APPROVED rows so every question falls through to unresolved reasons.",
    };
  }
  if (s.approvedSelected === 0 && s.questionRowCount > 0) {
    return {
      lastOk: "approved answers exist",
      stage: "matcher-not-selecting-approved",
      verdict: "Approved answers exist but the matcher did not pick any for this questionnaire; check topic alignment and fitness verdicts per row.",
    };
  }
  return {
    lastOk: "matcher returned approved selections",
    stage: "none",
    verdict: "Pipeline looks healthy end-to-end; zero-answer symptom is not explained by this audit.",
  };
}

function decideCategory(s: {
  firstBrokenStage: string;
  repairApplied: boolean;
  reclassifiedCount: number;
  canonicalPresent: boolean;
  taxonomyPresent: boolean;
  reseedingRan: boolean;
  promotedAny: boolean;
  approvedTotal: number;
  draftTotal: number;
}): { category: string; minimalFix: string[]; strongFix: string[] } {
  if (s.firstBrokenStage === "rollout-not-applied-to-workspace") {
    return {
      category: "reclassification-not-applied",
      minimalFix: [
        "tsx scripts/seed-canonical-topics.ts",
        `tsx scripts/reclassify-chunks.ts --workspace=<this workspace>`,
        `tsx scripts/reseed-topics.ts --workspace=<this workspace>`,
        "Then, in the Library UI: review drafts and approve the ones that match expected sub-controls (or use scripts/promote-drafts.ts per topic with --apply after dry-run inspection).",
        "Finally re-run questionnaire matching (POST /api/questionnaires/<id>/rematch or re-import).",
      ],
      strongFix: [
        "Add a per-workspace coverage-health record in the DB (or use the new /api/workspaces/coverage) and surface the 'rollout not applied' state in the DocumentCoverageBanner so operators see this state immediately.",
        "Wire a one-time auto-repair hook at workspace open that re-runs classification when SourceChunkTopic counts look historically too sparse (< 20% classified).",
      ],
    };
  }
  if (s.firstBrokenStage === "canonical-topics-not-seeded") {
    return {
      category: "missing-canonical-topics",
      minimalFix: ["tsx scripts/seed-canonical-topics.ts (idempotent; can run multiple times)."],
      strongFix: ["Move canonical topic seeding into the application startup / migration path so new environments never need a manual step."],
    };
  }
  if (s.firstBrokenStage === "sub-control-taxonomy-missing") {
    return {
      category: "missing-sub-control-taxonomy",
      minimalFix: ["Restart the Next.js dev server so the updated subcontrol-taxonomy.ts module is loaded."],
      strongFix: ["Lock module reloading during a rollout or add a boot-time assertion that the nine newly-added taxonomy topics are present."],
    };
  }
  if (s.firstBrokenStage === "classification-not-rerun") {
    return {
      category: "reclassification-not-applied",
      minimalFix: [`tsx scripts/reclassify-chunks.ts --workspace=<this workspace>`],
      strongFix: ["Trigger reclassification automatically when the top-K/min-score constants change, keyed off a version hash written to Workspace metadata."],
    };
  }
  if (s.firstBrokenStage === "seeding-not-rerun") {
    return {
      category: "reseeding-not-applied",
      minimalFix: [`tsx scripts/reseed-topics.ts --workspace=<this workspace>`],
      strongFix: ["Enqueue seeding automatically the first time a taxonomy-version mismatch is detected for a workspace."],
    };
  }
  if (s.firstBrokenStage === "seeding-produced-nothing") {
    return {
      category: "weak-synthesis-inputs",
      minimalFix: [
        "Inspect diag.repair-state.reseeded-after-taxonomy.postCutoffTopicRunStatusHistogram — most likely SKIPPED_NO_EVIDENCE or REJECTED_LOW_QUALITY dominance.",
        "Reclassify first, then reseed. If SKIPPED_NO_EVIDENCE persists, add more source documents for the uncovered families.",
      ],
      strongFix: ["Relax evidence requirements in SeedingService only when the workspace has zero drafts under the topic, so the first-pass seeding can generate a starter."],
    };
  }
  if (s.firstBrokenStage === "approval-coverage-missing") {
    return {
      category: "missing-approval-coverage",
      minimalFix: [
        "Review drafts in the Library UI and approve the accurate ones, OR:",
        "tsx scripts/promote-drafts.ts --workspace=<this workspace> --topic=<key> [--subcontrol=<key>] (dry-run first, then --apply).",
        "After approval, re-run questionnaire matching.",
      ],
      strongFix: ["Add a dedicated 'bulk review queue' UI keyed off the DocumentCoverageBanner so reviewers can burn through drafts topic-by-topic with keyboard shortcuts."],
    };
  }
  if (s.firstBrokenStage === "matcher-not-selecting-approved") {
    return {
      category: "verifier-rejecting-generic-outputs",
      minimalFix: [
        "Inspect diag.row.trace entries for bucket='Answer Mismatch'. Check whether the approved answers sit under the same topic as the rows.",
        "If topics match but the verifier rejects, author sub-control-specific APPROVED answers for the dominant unresolved reasons.",
      ],
      strongFix: ["Surface per-row fitness verdicts in the UI so reviewers can see exactly why the matcher rejected an otherwise close answer."],
    };
  }
  return {
    category: "environment-migration-mismatch",
    minimalFix: ["Re-run the full repair sequence (seed-canonical-topics → reclassify-chunks → reseed-topics → promote-drafts)."],
    strongFix: ["Add end-to-end acceptance tests for the repair scripts against a seed workspace."],
  };
}

// ---------------- markdown writer ----------------

interface ReportInput {
  workspace: { id: string; name: string; slug: string; createdAt: Date };
  questionnaire: { id: string; title: string; createdAt: Date } | null;
  questionRowCount: number;
  repairCutoff: { source: string; at: Date } | null;
  cutoffCandidates: Array<{ source: string; at: Date }>;
  lastSuccessfulStage: string;
  firstBrokenStage: string;
  oneLineVerdict: string;
  category: string;
  beforeAfter: {
    docsParsed: { before: number; after: number };
    totalChunks: number;
    classifiedChunks: { before: number; after: number };
    orphanPct: number;
    sourceChunkTopicAssociations: { before: number; after: number };
    approvedAnswers: { before: number; after: number };
    draftAnswers: { before: number; after: number };
    answersWithEmbedding: number;
    emptyEmbedding: number;
    questionnaireApprovedSelected: number;
    questionnaireRowCount: number;
    unresolvedHistogram: Record<string, number>;
  };
  expectationRows: Array<Record<string, unknown>>;
  rowTraces: Array<Record<string, unknown>>;
  bottleneckTop15: Array<{ answerId: string; title: string; topicKey: string | null; subControlKey: string | null; blockedRowCount: number }>;
  rollout: {
    reclassifiedCount: number;
    canonicalMissing: string[];
    taxonomyMissing: string[];
    reseedingRan: boolean;
    promotedCount: number;
    promotedByTopic: Record<string, number>;
  };
  evidenceLines: Array<{ event: string; payload: Record<string, unknown> }>;
  fixPack: { category: string; minimalFix: string[]; strongFix: string[] };
}

function buildMarkdownReport(input: ReportInput): string {
  const lines: string[] = [];

  lines.push(`# Regression inspection — ${input.workspace.id}`);
  lines.push("");

  // SECTION 1
  lines.push("## 1. Executive summary");
  lines.push(`- Workspace: \`${input.workspace.id}\` (${input.workspace.name}, slug \`${input.workspace.slug}\`)`);
  lines.push(
    input.questionnaire
      ? `- Questionnaire: \`${input.questionnaire.id}\` — "${input.questionnaire.title}" (rowCount: ${input.questionRowCount})`
      : `- Questionnaire: none found for this workspace`,
  );
  lines.push(
    input.repairCutoff
      ? `- repairCutoff: ${input.repairCutoff.at.toISOString()} (source: ${input.repairCutoff.source})`
      : `- repairCutoff: null — no evidence of rollout application to this workspace`,
  );
  lines.push(`- Last successful stage: ${input.lastSuccessfulStage}`);
  lines.push(`- First broken or still-missing stage: ${input.firstBrokenStage}`);
  lines.push(`- Verdict: ${input.oneLineVerdict}`);
  lines.push(`- Category: ${input.category}`);
  lines.push("");

  // SECTION 2
  lines.push("## 2. Before/after counts");
  const ba = input.beforeAfter;
  lines.push(`- Documents parsed (COMPLETED): before=${ba.docsParsed.before}, after=${ba.docsParsed.after}`);
  lines.push(`- Total chunks: ${ba.totalChunks}`);
  lines.push(
    `- Classified chunks: before=${ba.classifiedChunks.before}, after=${ba.classifiedChunks.after} (delta=${ba.classifiedChunks.after - ba.classifiedChunks.before}, orphan%=${ba.orphanPct})`,
  );
  lines.push(
    `- SourceChunkTopic associations: before=${ba.sourceChunkTopicAssociations.before}, after=${ba.sourceChunkTopicAssociations.after}`,
  );
  lines.push(`- AnswerLibraryItem approved: before=${ba.approvedAnswers.before}, after=${ba.approvedAnswers.after}`);
  lines.push(`- AnswerLibraryItem draft: before=${ba.draftAnswers.before}, after=${ba.draftAnswers.after}`);
  lines.push(`- Answers with populated embedding: ${ba.answersWithEmbedding} (empty: ${ba.emptyEmbedding})`);
  lines.push(
    `- QuestionnaireItem approvedSelected: ${ba.questionnaireApprovedSelected} (of ${ba.questionnaireRowCount} rows) — no before/after split because QuestionnaireItem has no updatedAt column`,
  );
  lines.push(`- Unresolved reason histogram (current):`);
  for (const [reason, count] of Object.entries(ba.unresolvedHistogram).sort((a, b) => b[1] - a[1])) {
    if (count === 0) continue;
    lines.push(`  - ${reason}: ${count}`);
  }
  lines.push("");

  // SECTION 3
  lines.push("## 3. Per-topic expectation matrix");
  for (const r of input.expectationRows) {
    lines.push(`### ${r.controlFamily} (\`${r.topicKey ?? "n/a"}\`)`);
    lines.push(`- topicPresent: ${(r.topicPresent as boolean) ? "yes" : "no"}`);
    lines.push(`- chunkCoverage: ${r.chunkCoverage as number}`);
    const taxo = r.taxonomyKeys as string[];
    lines.push(`- subControlTaxonomyEntries: ${r.subControlTaxonomyEntries as number} (keys: ${taxo.length > 0 ? taxo.join(", ") : "none"})`);
    const approved = r.approvedSubControls as { count: number; keys: string[] };
    lines.push(`- approvedSubControls: ${approved.count} (keys: ${approved.keys.length > 0 ? approved.keys.join(", ") : "none"})`);
    const draft = r.draftSubControls as { count: number; keys: string[] };
    lines.push(`- draftSubControls: ${draft.count} (keys: ${draft.keys.length > 0 ? draft.keys.join(", ") : "none"})`);
    lines.push(`- blockedQuestionnaireRows: ${r.blockedQuestionnaireRows as number}`);
    lines.push(`- populationStage: ${r.populationStage as string}`);
    lines.push(`- firstBrokenGate: ${r.firstBrokenGate as string}`);
    lines.push("");
  }

  // SECTION 4
  lines.push("## 4. Root cause and fixes");
  lines.push("");
  lines.push(`**Root cause (one paragraph):** ${input.oneLineVerdict}`);
  lines.push("");
  lines.push("**Minimal fix:**");
  for (const step of input.fixPack.minimalFix) lines.push(`- ${step}`);
  lines.push("");
  lines.push("**Strong fix:**");
  for (const step of input.fixPack.strongFix) lines.push(`- ${step}`);
  lines.push("");

  // APPENDIX
  lines.push("## Appendix: raw evidence");
  lines.push("");
  lines.push("### Rollout-state summary");
  lines.push(`- reclassifiedAssociationCount: ${input.rollout.reclassifiedCount}`);
  lines.push(`- canonicalTopicsMissing: ${input.rollout.canonicalMissing.join(", ") || "none"}`);
  lines.push(`- taxonomyTopicsMissing: ${input.rollout.taxonomyMissing.join(", ") || "none"}`);
  lines.push(`- reseedingRan: ${input.rollout.reseedingRan}`);
  lines.push(`- bulkPromoteEventCount: ${input.rollout.promotedCount}`);
  lines.push(`- promotedByTopic: ${JSON.stringify(input.rollout.promotedByTopic)}`);
  lines.push("");
  lines.push("### Per-bucket row drill-downs");
  for (const t of input.rowTraces) {
    lines.push(`- ${t.bucket as string}: ${(t.found as boolean) ? JSON.stringify(t) : "no matching row in questionnaire"}`);
  }
  lines.push("");
  lines.push("### Approval bottleneck — top 15 drafts blocking the most rows");
  if (input.bottleneckTop15.length === 0) {
    lines.push("- (no drafts currently block any rows)");
  } else {
    for (const b of input.bottleneckTop15) {
      lines.push(
        `- \`${b.topicKey ?? "?"}\` / \`${b.subControlKey ?? "__untagged__"}\` — ${b.blockedRowCount} rows — "${b.title}" (answerId: ${b.answerId})`,
      );
    }
  }
  lines.push("");
  lines.push("### All diagnostic JSON lines");
  lines.push("```jsonl");
  for (const l of input.evidenceLines) lines.push(JSON.stringify({ event: l.event, ...l.payload }));
  lines.push("```");
  lines.push("");

  return lines.join("\n");
}

main()
  .then(() => uncheckedPrisma.$disconnect())
  .catch((err) => {
    console.error(err);
    void uncheckedPrisma.$disconnect();
    process.exit(1);
  });
