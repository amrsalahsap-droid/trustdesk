/**
 * One-time backfill for `QuestionnaireItem.importedAnswer` on rows that were
 * imported before the imported-answer workflow shipped.
 *
 * Usage:
 *   npx tsx scripts/backfill-imported-answer.ts [--workspace=<id>] [--dry-run]
 *
 * - Safe to re-run: items that already have `importedAnswer` set are skipped.
 * - Emits one summary `AuditEvent` per workspace (type
 *   `QUESTIONNAIRE_IMPORTED_ANSWER_BACKFILL`) with per-source counts.
 * - `--dry-run` logs decisions without writing.
 *
 * See `scripts/backfill-imported-answer-core.ts` for the heuristic decision tree
 * that selects which legacy field (provenance / finalAnswer / suggestedAnswer)
 * should populate `importedAnswer`.
 */

import { PrismaClient } from "@prisma/client";
import {
  decideBackfillForItem,
  type BackfillDecision,
  type BackfillSource,
} from "./backfill-imported-answer-core";

const prisma = new PrismaClient();

interface RunOptions {
  workspaceId: string | null;
  dryRun: boolean;
}

function parseArgs(): RunOptions {
  const args = process.argv.slice(2);
  let workspaceId: string | null = null;
  let dryRun = false;
  for (const arg of args) {
    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }
    const match = arg.match(/^--workspace=(.+)$/);
    if (match) {
      workspaceId = match[1] ?? null;
    }
  }
  return { workspaceId, dryRun };
}

type PerSourceCounts = Record<BackfillSource, number> & { skipped_already_set: number };

function emptyCounts(): PerSourceCounts {
  return {
    raw_import: 0,
    final_answer_legacy: 0,
    suggested_answer_legacy: 0,
    unknown: 0,
    skipped_already_set: 0,
  };
}

async function emitSummaryAuditEvent(
  workspaceId: string,
  counts: PerSourceCounts,
  dryRun: boolean,
): Promise<void> {
  if (dryRun) {
    console.log(`[dry-run] would emit audit event for workspace ${workspaceId}`, counts);
    return;
  }
  await prisma.auditEvent.create({
    data: {
      workspaceId,
      actorUserId: null,
      eventType: "QUESTIONNAIRE_IMPORTED_ANSWER_BACKFILL",
      objectType: "QUESTIONNAIRE",
      objectId: workspaceId,
      metadata: counts as unknown as object,
    },
  });
}

async function backfillWorkspace(
  workspaceId: string,
  dryRun: boolean,
): Promise<PerSourceCounts> {
  const counts = emptyCounts();
  // Stream rows in batches of 500 so very large workspaces don't blow memory.
  const BATCH = 500;
  let cursor: string | undefined = undefined;
  for (;;) {
    const items: Array<{
      id: string;
      importedAnswer: string | null;
      importedAnswerSource: BackfillSource | null;
      finalAnswer: string;
      suggestedAnswer: string;
      suggestedAnswerId: string | null;
      reviewed: boolean;
      verificationStatus: string | null;
      overrideAt: Date | null;
      provenanceJson: unknown;
    }> = await prisma.questionnaireItem.findMany({
      where: { workspaceId, type: "question_row" },
      take: BATCH,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
      select: {
        id: true,
        importedAnswer: true,
        importedAnswerSource: true,
        finalAnswer: true,
        suggestedAnswer: true,
        suggestedAnswerId: true,
        reviewed: true,
        verificationStatus: true,
        overrideAt: true,
        provenanceJson: true,
      },
    });
    if (items.length === 0) break;
    cursor = items[items.length - 1]!.id;

    for (const item of items) {
      const decision: BackfillDecision = decideBackfillForItem({
        ...item,
        verificationStatus: item.verificationStatus as string | null,
      });
      if (decision.action === "skip") {
        counts.skipped_already_set += 1;
        continue;
      }
      counts[decision.source] += 1;
      if (!dryRun) {
        await prisma.questionnaireItem.update({
          where: { id: item.id },
          data: {
            importedAnswer: decision.importedAnswer,
            importedAnswerSource: decision.source,
          },
        });
      }
    }
  }
  return counts;
}

async function main(): Promise<void> {
  const opts = parseArgs();
  const workspaceIds = opts.workspaceId
    ? [opts.workspaceId]
    : (await prisma.workspace.findMany({ select: { id: true } })).map((w) => w.id);

  console.log(
    `Backfill imported-answer running over ${workspaceIds.length} workspace(s). dryRun=${opts.dryRun}`,
  );

  for (const wsId of workspaceIds) {
    const counts = await backfillWorkspace(wsId, opts.dryRun);
    const total =
      counts.raw_import +
      counts.final_answer_legacy +
      counts.suggested_answer_legacy +
      counts.unknown;
    if (total > 0 || counts.skipped_already_set > 0) {
      await emitSummaryAuditEvent(wsId, counts, opts.dryRun);
    }
    console.log(`workspace ${wsId}:`, counts);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
