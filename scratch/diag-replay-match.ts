/**
 * Replay the live matching pipeline for exactly one failing questionnaire
 * row without writing anything. Prints what `QuestionnaireMatchingService
 * .matchRows` would produce today versus what is currently persisted on
 * the DB row. This is what disambiguates "historical bug (persisted under
 * an older buggy matcher)" from "ongoing bug (matcher still produces a
 * broken shape right now)".
 *
 *   Usage:
 *     QUESTIONNAIRE_DIAG=1 tsx scratch/diag-replay-match.ts
 *     QUESTIONNAIRE_DIAG=1 tsx scratch/diag-replay-match.ts --question="role-based access"
 *     QUESTIONNAIRE_DIAG=1 tsx scratch/diag-replay-match.ts --workspace=<wid>
 *
 * Set `QUESTIONNAIRE_DIAG=1` to also stream the matcher's structured
 * diagnostic logs (per-row scores, line-163 sentinel, outer-catch stack).
 * This script never calls `applyResultsToDatabase`.
 */

import { PrismaClient } from "@prisma/client";

import { QuestionnaireMatchingService } from "../src/modules/workspaces/intelligence/questionnaire-matching-service";

type Args = { question: string; workspaceId?: string };

function parseArgs(argv: string[]): Args {
  const args: Args = { question: "role-based access control" };
  for (const raw of argv.slice(2)) {
    if (raw.startsWith("--question=")) args.question = raw.slice("--question=".length);
    else if (raw.startsWith("--workspace=")) args.workspaceId = raw.slice("--workspace=".length);
    else if (raw === "--help" || raw === "-h") {
      console.log("Usage: tsx scratch/diag-replay-match.ts [--question=<substring>] [--workspace=<id>]");
      process.exit(0);
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  const prisma = new PrismaClient();
  console.log(
    `[replay] question substring=${JSON.stringify(args.question)} diag=${process.env.QUESTIONNAIRE_DIAG === "1" ? "ON" : "OFF"}`,
  );

  try {
    const item = await prisma.questionnaireItem.findFirst({
      where: {
        type: "question_row",
        question: { contains: args.question, mode: "insensitive" },
        ...(args.workspaceId ? { workspaceId: args.workspaceId } : {}),
      },
      orderBy: { createdAt: "desc" },
    });

    if (!item) {
      console.log("No matching QuestionnaireItem found. Try a different --question.");
      return;
    }

    console.log(
      JSON.stringify(
        {
          persisted: {
            id: item.id,
            workspaceId: item.workspaceId,
            rowNumber: item.rowNumber,
            confidence: item.confidence,
            topicId: item.topicId,
            suggestedAnswerId: item.suggestedAnswerId,
            reviewSummary: item.reviewSummary,
            suggestedAnswerLen: item.suggestedAnswer.length,
            finalAnswerLen: item.finalAnswer.length,
          },
        },
        null,
        2,
      ),
    );

    // Build the exact shape `matchRows` expects (matches extractImportedRows).
    const syntheticRow = {
      rowNumber: item.rowNumber ?? 1,
      question: item.question,
      answer: "",
      type: "question_row",
      confidence: "high" as const,
    };

    const t0 = performance.now();
    const map = await QuestionnaireMatchingService.matchRows(item.workspaceId, [syntheticRow]);
    const durationMs = Math.round(performance.now() - t0);

    const result = map.get(syntheticRow.rowNumber);
    if (!result) {
      console.log(
        `\n[replay] MATCHER RETURNED NO ENTRY for rowNumber=${syntheticRow.rowNumber} (durationMs=${durationMs}).`,
      );
      console.log(
        "         This is exactly the symptom produced when an exception inside the per-row loop is swallowed by the outer try/catch in matchRows.",
      );
      console.log(
        "         With QUESTIONNAIRE_DIAG=1, check the server logs for `questionnaire.match:branch-163-entered` and `questionnaire.match:catch-threw`.",
      );
    } else {
      console.log("\n[replay] LIVE MATCHER RESULT:");
      console.log(
        JSON.stringify(
          {
            rowNumber: result.rowNumber,
            status: result.status,
            topicId: result.topicId,
            topicName: result.topicName,
            suggestedAnswerId: result.suggestedAnswerId,
            suggestedAnswerLen: (result.suggestedAnswer ?? "").length,
            confidence: result.confidence,
            reviewed: result.reviewed,
            explanation: result.explanation,
            sourcesCount: result.sources.length,
            candidatesCount: result.candidates.length,
            durationMs,
          },
          null,
          2,
        ),
      );

      console.log("\n[replay] DELTA vs persisted:");
      console.log(`  confidence           live=${result.confidence} persisted=${item.confidence}`);
      console.log(`  topicId              live=${result.topicId ?? "null"} persisted=${item.topicId ?? "null"}`);
      console.log(
        `  suggestedAnswerId    live=${result.suggestedAnswerId ?? "null"} persisted=${item.suggestedAnswerId ?? "null"}`,
      );
      console.log(
        `  reviewSummary empty? live=${!result.explanation} persisted=${!item.reviewSummary}`,
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("[replay] fatal", err);
  process.exit(1);
});
