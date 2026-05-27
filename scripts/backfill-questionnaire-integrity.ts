/**
 * Downgrade persisted questionnaire rows that claim medium/high AI confidence
 * without the evidence chain (topic, answer, sources, review summary).
 *
 *   tsx scripts/backfill-questionnaire-integrity.ts           // dry-run (default)
 *   tsx scripts/backfill-questionnaire-integrity.ts --apply
 *   tsx scripts/backfill-questionnaire-integrity.ts --workspace=<id>
 */

import { prisma, uncheckedPrisma } from "../src/lib/db/prisma";
import { QuestionnaireMatchingService } from "../src/modules/workspaces/intelligence/questionnaire-matching-service";

type Args = {
  apply: boolean;
  workspaceId?: string;
};

function parseArgs(argv: string[]): Args {
  const args: Args = { apply: false };
  for (const raw of argv.slice(2)) {
    if (raw === "--apply") args.apply = true;
    else if (raw === "--dry-run") args.apply = false;
    else if (raw.startsWith("--workspace=")) args.workspaceId = raw.slice("--workspace=".length);
    else if (raw === "--help" || raw === "-h") {
      console.log(
        "Usage: tsx scripts/backfill-questionnaire-integrity.ts [--apply] [--workspace=<id>]",
      );
      process.exit(0);
    }
  }
  return args;
}

/** Same structural checks as write-time guard + reviewSummary (persisted column). */
function listIntegrityViolations(item: {
  confidence: string;
  topicId: string | null;
  suggestedAnswerId: string | null;
  suggestedAnswer: string;
  finalAnswer: string;
  sourcesJson: unknown;
  reviewSummary: string | null;
}): string[] {
  if (item.confidence !== "high" && item.confidence !== "medium") return [];
  const missing: string[] = [];
  if (!item.topicId) missing.push("topicId");
  const hasAnswer =
    !!item.suggestedAnswerId ||
    !!(item.suggestedAnswer && item.suggestedAnswer.trim()) ||
    !!(item.finalAnswer && item.finalAnswer.trim());
  if (!hasAnswer) missing.push("answer");
  const sources = Array.isArray(item.sourcesJson) ? item.sourcesJson : [];
  if (sources.length === 0) missing.push("sources");
  if (!item.reviewSummary || !String(item.reviewSummary).trim()) missing.push("reviewSummary");
  return missing;
}

async function main() {
  const args = parseArgs(process.argv);
  // Cross-tenant scan needs the unguarded client; single-workspace runs stay on the guarded client.
  const db: typeof uncheckedPrisma = (args.workspaceId ? prisma : uncheckedPrisma) as typeof uncheckedPrisma;
  const items = await db.questionnaireItem.findMany({
    where: {
      type: "question_row",
      confidence: { in: ["high", "medium"] },
      ...(args.workspaceId ? { workspaceId: args.workspaceId } : {}),
    },
    include: { questionnaire: true },
  });

  let candidates = 0;
  let skippedHuman = 0;

  for (const item of items) {
    const status = item.verificationStatus;
    if (status === "ACCEPTED" || status === "EDITED" || status === "MANUAL_OVERRIDE") {
      skippedHuman++;
      continue;
    }

    const missing = listIntegrityViolations(item);
    if (missing.length === 0) continue;
    candidates++;

    const payload = {
      event: "questionnaire.integrity.backfill.candidate",
      id: item.id,
      workspaceId: item.workspaceId,
      questionnaireId: item.questionnaireId,
      rowNumber: item.rowNumber,
      verificationStatus: item.verificationStatus,
      missing,
      priorConfidence: item.confidence,
      apply: args.apply,
    };
    console.log(JSON.stringify(payload));

    if (!args.apply) continue;

    await db.$transaction(async (tx) => {
      await tx.questionnaireItem.update({
        where: { id: item.id, workspaceId: item.workspaceId },
        data: {
          confidence: "low",
          unresolvedReason: "pipeline_integrity_guard_backfill",
          verificationStatus: "UNRESOLVED",
          ...(item.reviewStatus === "matched" ? { reviewStatus: "unresolved" } : {}),
        },
      });

      const fresh = await tx.questionnaireItem.findUnique({
        where: { id: item.id, workspaceId: item.workspaceId },
        select: { reviewSummary: true },
      });

      await QuestionnaireMatchingService.syncGapFlags(
        tx,
        item.workspaceId,
        item.questionnaireId,
        item.id,
        "pipeline_integrity_guard_backfill",
        fresh?.reviewSummary ?? item.reviewSummary,
      );
    });
  }

  console.log(
    JSON.stringify({
      event: "questionnaire.integrity.backfill.summary",
      scanned: items.length,
      candidates,
      skippedHuman,
      apply: args.apply,
    }),
  );
}

main()
  .then(() => uncheckedPrisma.$disconnect())
  .catch((e) => {
    console.error(e);
    void uncheckedPrisma.$disconnect();
    process.exit(1);
  });
