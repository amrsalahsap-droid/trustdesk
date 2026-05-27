/**
 * Full repair orchestrator for one workspace + one questionnaire.
 * Runs all five stages in order, stops on the first hard failure, and
 * emits structured JSON per stage so every step is auditable.
 *
 *   tsx scripts/run-repair.ts --workspace=<id>
 *   tsx scripts/run-repair.ts --workspace=<id> --questionnaire=<id>
 *   tsx scripts/run-repair.ts --workspace=<id> --apply     # default is dry-run for promote
 *
 * Stages:
 *   1. seed-canonical-topics    — idempotent SYSTEM_WORKSPACE upsert
 *   2. reclassify-chunks        — top-K chunk→topic reassignment
 *   3. reseed-topics            — AnswerLibraryItem draft generation
 *   4. promote-bottleneck-drafts — specific DRAFT→APPROVED for known bottlenecks
 *   5. rematch-questionnaire    — replay matchRows + applyResultsToDatabase
 *
 * The --apply flag only controls stage 4 (promotion). Stages 1-3 are always
 * applied because they are purely additive and fully idempotent. Stage 5
 * always runs if stage 4 has --apply (or is skipped because nothing to
 * promote). Pass --skip-rematch to skip stage 5.
 *
 * Exit codes:
 *   0 — all stages completed successfully
 *   1 — a stage failed; the broken stage is logged to stderr
 */

import { uncheckedPrisma } from "../src/lib/db/prisma";
import { TopicsService } from "../src/modules/knowledge/topics/topics-service";
import { ClassificationService } from "../src/modules/workspaces/source-documents/parsing/classification-service";
import { SeedingService } from "../src/modules/workspaces/intelligence/seeding-service";
import { promoteDrafts } from "../src/modules/knowledge/topics/promote-drafts-service";
import { QuestionnaireMatchingService } from "../src/modules/workspaces/intelligence/questionnaire-matching-service";

type Args = {
  workspaceId?: string;
  questionnaireId?: string;
  apply: boolean;
  skipRematch: boolean;
};

function parseArgs(argv: string[]): Args {
  const args: Args = { apply: false, skipRematch: false };
  for (const raw of argv.slice(2)) {
    if (raw.startsWith("--workspace=")) args.workspaceId = raw.slice("--workspace=".length);
    else if (raw.startsWith("--questionnaire=")) args.questionnaireId = raw.slice("--questionnaire=".length);
    else if (raw === "--apply") args.apply = true;
    else if (raw === "--skip-rematch") args.skipRematch = true;
    else if (raw === "--help" || raw === "-h") {
      console.log(
        "Usage: tsx scripts/run-repair.ts --workspace=<id> [--questionnaire=<id>] [--apply] [--skip-rematch]",
      );
      process.exit(0);
    }
  }
  return args;
}

function emit(stage: string, event: string, payload: Record<string, unknown>): void {
  console.log(JSON.stringify({ stage, event, ...payload }));
}

function fmtPct(n: number, d: number): number {
  return d > 0 ? Number(((n / d) * 100).toFixed(2)) : 0;
}

async function countChunkCoverage(workspaceId: string): Promise<{ total: number; classified: number; orphan: number; orphanPct: number; associations: number }> {
  const total = await uncheckedPrisma.sourceDocumentChunk.count({ where: { workspaceId } });
  const associations = await uncheckedPrisma.sourceChunkTopic.count({ where: { workspaceId } });
  const classifiedChunkIds = await uncheckedPrisma.sourceChunkTopic.findMany({
    where: { workspaceId },
    select: { chunkId: true },
    distinct: ["chunkId"],
  });
  const classified = classifiedChunkIds.length;
  const orphan = total - classified;
  return { total, classified, orphan, orphanPct: fmtPct(orphan, total), associations };
}

async function countAnswers(workspaceId: string): Promise<{ approved: number; draft: number; emptyEmbedding: number }> {
  const approved = await uncheckedPrisma.answerLibraryItem.count({ where: { workspaceId, status: "APPROVED" } });
  const draft = await uncheckedPrisma.answerLibraryItem.count({ where: { workspaceId, status: "DRAFT" } });
  const all = await uncheckedPrisma.answerLibraryItem.findMany({ where: { workspaceId }, select: { embedding: true } });
  const emptyEmbedding = all.filter((a) => !a.embedding || a.embedding.length === 0).length;
  return { approved, draft, emptyEmbedding };
}

async function countQuestionnaire(workspaceId: string, questionnaireId: string): Promise<{
  rows: number;
  approvedSelected: number;
  unresolvedHistogram: Record<string, number>;
}> {
  const items = await uncheckedPrisma.questionnaireItem.findMany({
    where: { workspaceId, questionnaireId, type: "question_row" },
    select: { suggestedAnswerId: true, unresolvedReason: true },
  });
  const approvedSelected = items.filter((i) => i.suggestedAnswerId != null).length;
  const unresolvedHistogram: Record<string, number> = {};
  for (const item of items) {
    const key = item.unresolvedReason ?? "__resolved__";
    unresolvedHistogram[key] = (unresolvedHistogram[key] ?? 0) + 1;
  }
  return { rows: items.length, approvedSelected, unresolvedHistogram };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  if (!args.workspaceId) {
    console.error("Missing --workspace=<id>");
    process.exit(1);
  }
  const workspaceId = args.workspaceId;

  // Resolve the questionnaire (required for stage 5)
  const questionnaire = args.questionnaireId
    ? await uncheckedPrisma.questionnaire.findUnique({ where: { id: args.questionnaireId }, select: { id: true, title: true } })
    : await uncheckedPrisma.questionnaire.findFirst({
        where: { workspaceId },
        orderBy: { createdAt: "desc" },
        select: { id: true, title: true },
      });

  emit("header", "run-repair.start", {
    workspaceId,
    questionnaireId: questionnaire?.id ?? null,
    questionnaireTitle: questionnaire?.title ?? null,
    apply: args.apply,
    skipRematch: args.skipRematch,
  });

  // Baseline snapshot
  const baseline = {
    chunks: await countChunkCoverage(workspaceId),
    answers: await countAnswers(workspaceId),
    questionnaire: questionnaire ? await countQuestionnaire(workspaceId, questionnaire.id) : null,
  };
  emit("baseline", "run-repair.snapshot", {
    chunks: baseline.chunks,
    answers: baseline.answers,
    questionnaire: baseline.questionnaire,
  });

  // ---------------------------------------------------------------
  // STAGE 1: seed canonical topics
  // ---------------------------------------------------------------
  emit("stage1", "seed-canonical-topics.start", {});
  try {
    const seeded = await TopicsService.seedGlobalTopics();
    const missing3 = ["data_classification", "tenant_isolation", "purview_integration"];
    const present3 = await uncheckedPrisma.knowledgeTopic.findMany({
      where: { workspaceId: "SYSTEM_WORKSPACE", key: { in: missing3 } },
      select: { key: true, id: true },
    });
    const stillMissing = missing3.filter((k) => !present3.some((t) => t.key === k));
    if (stillMissing.length > 0) {
      emit("stage1", "seed-canonical-topics.failed", { stillMissing });
      console.error(`STAGE 1 FAILED: canonical topics still missing: ${stillMissing.join(", ")}`);
      process.exit(1);
    }
    emit("stage1", "seed-canonical-topics.complete", {
      seededTotal: seeded.length,
      missingNowPresent: present3.map((t) => ({ key: t.key, id: t.id })),
    });
  } catch (err) {
    emit("stage1", "seed-canonical-topics.error", { error: String(err) });
    console.error("STAGE 1 ERROR:", err);
    process.exit(1);
  }

  // ---------------------------------------------------------------
  // STAGE 2: reclassify chunks
  // ---------------------------------------------------------------
  emit("stage2", "reclassify-chunks.start", { workspaceId, chunksBefore: baseline.chunks });
  try {
    const docs = await uncheckedPrisma.sourceDocument.findMany({
      where: { workspaceId },
      select: { id: true, fileName: true, chunks: { select: { id: true } } },
    });
    let totalMatches = 0;
    for (const doc of docs) {
      const matches = await ClassificationService.classifyDocumentChunks(workspaceId, doc.id);
      totalMatches += matches;
      emit("stage2", "reclassify-chunks.document", { documentId: doc.id, fileName: doc.fileName, matches });
    }
    const after = await countChunkCoverage(workspaceId);
    emit("stage2", "reclassify-chunks.complete", {
      documents: docs.length,
      totalMatches,
      chunksBefore: baseline.chunks,
      chunksAfter: after,
      deltaClassified: after.classified - baseline.chunks.classified,
      deltaAssociations: after.associations - baseline.chunks.associations,
    });
    // Hard check: at least one previously-orphaned doc should now have coverage.
    if (after.classified <= baseline.chunks.classified) {
      emit("stage2", "reclassify-chunks.no-improvement", {
        note: "Classified chunk count did not increase. Classifier may have insufficient topic embeddings or chunks have no semantic match above MIN_SCORE.",
      });
      // This is a warning, not a hard failure — proceed so seeding + rematch
      // can still run and the user can see the zero-improvement state clearly.
    }
  } catch (err) {
    emit("stage2", "reclassify-chunks.error", { error: String(err) });
    console.error("STAGE 2 ERROR:", err);
    process.exit(1);
  }

  // ---------------------------------------------------------------
  // STAGE 3: reseed topics
  // ---------------------------------------------------------------
  emit("stage3", "reseed-topics.start", { workspaceId, answersBefore: baseline.answers });
  try {
    const result = await SeedingService.runTopicSeeding(workspaceId);
    const after = await countAnswers(workspaceId);
    emit("stage3", "reseed-topics.complete", {
      created: result.created,
      skipped: result.skipped,
      answersBefore: baseline.answers,
      answersAfter: after,
      deltaDrafts: after.draft - baseline.answers.draft,
      deltaApproved: after.approved - baseline.answers.approved,
    });
  } catch (err) {
    emit("stage3", "reseed-topics.error", { error: String(err) });
    console.error("STAGE 3 ERROR:", err);
    process.exit(1);
  }

  // ---------------------------------------------------------------
  // STAGE 4: promote bottleneck drafts
  // ---------------------------------------------------------------
  const bottleneckTargets: Array<{ topicKey: string; subControlKey?: string }> = [
    { topicKey: "logging", subControlKey: "admin_audit_log" },
    { topicKey: "logging", subControlKey: "alert_monitoring" },
    { topicKey: "encryption_at_rest" },
    { topicKey: "rbac" },
    { topicKey: "retention", subControlKey: "retention_policy" },
    { topicKey: "retention", subControlKey: "deletion_process" },
    // After reseed, these may now have drafts too:
    { topicKey: "incident_response" },
    { topicKey: "business_continuity" },
    { topicKey: "vulnerability_management" },
    { topicKey: "mfa" },
    { topicKey: "data_classification" },
    { topicKey: "tenant_isolation" },
    { topicKey: "subprocessors" },
    { topicKey: "encryption_in_transit" },
  ];

  const answersBefore4 = await countAnswers(workspaceId);
  emit("stage4", "promote-drafts.start", {
    targets: bottleneckTargets.length,
    dryRun: !args.apply,
    answersBefore: answersBefore4,
  });

  const promotionResults: Array<{
    topicKey: string;
    subControlKey: string | null;
    promoted: number;
    skippedBelowConfidence: number;
    dryRun: boolean;
  }> = [];

  for (const target of bottleneckTargets) {
    try {
      const res = await promoteDrafts({
        workspaceId,
        actorUserId: null,
        topicKey: target.topicKey,
        subControlKey: target.subControlKey ?? null,
        minConfidence: 0.5, // relaxed from default 0.6 for bottleneck set
        dryRun: !args.apply,
        maxRows: 25,
        useUncheckedPrisma: true,
      });
      promotionResults.push({
        topicKey: target.topicKey,
        subControlKey: target.subControlKey ?? null,
        promoted: res.promoted,
        skippedBelowConfidence: res.skippedBelowConfidence,
        dryRun: !args.apply,
      });
      if (res.requested > 0) {
        emit("stage4", "promote-drafts.target", {
          topicKey: target.topicKey,
          subControlKey: target.subControlKey ?? null,
          requested: res.requested,
          promoted: res.promoted,
          skippedBelowConfidence: res.skippedBelowConfidence,
          dryRun: !args.apply,
          sample: res.sample,
        });
      }
    } catch (err) {
      // Topic may not exist in this environment — soft warn, continue.
      emit("stage4", "promote-drafts.target-skipped", {
        topicKey: target.topicKey,
        subControlKey: target.subControlKey ?? null,
        reason: String(err),
      });
    }
  }

  const answersAfter4 = await countAnswers(workspaceId);
  const totalPromoted = promotionResults.reduce((a, b) => a + b.promoted, 0);
  emit("stage4", "promote-drafts.complete", {
    totalPromoted,
    dryRun: !args.apply,
    answersBefore: answersBefore4,
    answersAfter: answersAfter4,
    deltaApproved: answersAfter4.approved - answersBefore4.approved,
    deltaDrafts: answersAfter4.draft - answersBefore4.draft,
    results: promotionResults.filter((r) => r.promoted > 0 || r.dryRun),
  });

  if (!args.apply) {
    emit("stage4", "promote-drafts.dry-run-notice", {
      note: "Promotion ran in dry-run mode. Re-run with --apply to commit.",
    });
  }

  // ---------------------------------------------------------------
  // STAGE 5: rematch questionnaire
  // ---------------------------------------------------------------
  if (!questionnaire) {
    emit("stage5", "rematch.skipped", { reason: "no questionnaire found for workspace" });
  } else if (args.skipRematch) {
    emit("stage5", "rematch.skipped", { reason: "--skip-rematch flag" });
  } else {
    const qBefore = await countQuestionnaire(workspaceId, questionnaire.id);
    emit("stage5", "rematch.start", {
      questionnaireId: questionnaire.id,
      title: questionnaire.title,
      rowsBefore: qBefore,
    });
    try {
      // Load rows in the same shape matchRows expects.
      const rows = await uncheckedPrisma.questionnaireItem.findMany({
        where: { questionnaireId: questionnaire.id, workspaceId, type: "question_row" },
        select: {
          id: true,
          rowNumber: true,
          type: true,
          question: true,
          topicId: true,
          suggestedAnswerId: true,
          unresolvedReason: true,
          confidence: true,
        },
      });
      const matchingResults = await QuestionnaireMatchingService.matchRows(workspaceId, rows);
      await QuestionnaireMatchingService.applyResultsToDatabase(workspaceId, questionnaire.id, matchingResults);
      const qAfter = await countQuestionnaire(workspaceId, questionnaire.id);
      emit("stage5", "rematch.complete", {
        questionnaireId: questionnaire.id,
        rowsBefore: qBefore,
        rowsAfter: qAfter,
        deltaApprovedSelected: qAfter.approvedSelected - qBefore.approvedSelected,
      });
    } catch (err) {
      emit("stage5", "rematch.error", { error: String(err) });
      console.error("STAGE 5 ERROR:", err);
      process.exit(1);
    }
  }

  // ---------------------------------------------------------------
  // Final summary
  // ---------------------------------------------------------------
  const finalChunks = await countChunkCoverage(workspaceId);
  const finalAnswers = await countAnswers(workspaceId);
  const finalQ = questionnaire ? await countQuestionnaire(workspaceId, questionnaire.id) : null;

  emit("summary", "run-repair.complete", {
    workspaceId,
    questionnaireId: questionnaire?.id ?? null,
    apply: args.apply,
    baseline: { chunks: baseline.chunks, answers: baseline.answers, questionnaire: baseline.questionnaire },
    final: { chunks: finalChunks, answers: finalAnswers, questionnaire: finalQ },
    improvements: {
      classifiedChunks: finalChunks.classified - baseline.chunks.classified,
      orphanChunkDelta: finalChunks.orphan - baseline.chunks.orphan,
      associations: finalChunks.associations - baseline.chunks.associations,
      approvedAnswers: finalAnswers.approved - baseline.answers.approved,
      draftAnswers: finalAnswers.draft - baseline.answers.draft,
      approvedSelected: finalQ && baseline.questionnaire
        ? finalQ.approvedSelected - baseline.questionnaire.approvedSelected
        : null,
    },
  });
}

main()
  .then(() => uncheckedPrisma.$disconnect())
  .catch((err) => {
    console.error(err);
    void uncheckedPrisma.$disconnect();
    process.exit(1);
  });
