/**
 * One-shot rematch for an existing questionnaire.
 * tsx scratch/rematch-questionnaire.ts --workspace=<id> --questionnaire=<id>
 */
import { uncheckedPrisma } from "../src/lib/db/prisma";
import { QuestionnaireMatchingService } from "../src/modules/workspaces/intelligence/questionnaire-matching-service";

async function main() {
  const wsArg = process.argv.find((a) => a.startsWith("--workspace="));
  const qArg = process.argv.find((a) => a.startsWith("--questionnaire="));
  if (!wsArg || !qArg) {
    console.error("Usage: tsx scratch/rematch-questionnaire.ts --workspace=<id> --questionnaire=<id>");
    process.exit(1);
  }
  const workspaceId = wsArg.slice("--workspace=".length);
  const questionnaireId = qArg.slice("--questionnaire=".length);

  const rows = await uncheckedPrisma.questionnaireItem.findMany({
    where: { questionnaireId, workspaceId, type: "question_row" },
    select: {
      id: true, rowNumber: true, type: true, question: true,
      topicId: true, suggestedAnswerId: true, unresolvedReason: true, confidence: true,
    },
  });

  console.log(JSON.stringify({
    event: "rematch.before",
    questionnaireId, workspaceId,
    rowCount: rows.length,
    approvedSelected: rows.filter((r) => r.suggestedAnswerId != null).length,
    unresolvedHistogram: rows.reduce((h: Record<string, number>, r) => {
      const k = r.unresolvedReason ?? "__resolved__"; h[k] = (h[k] ?? 0) + 1; return h;
    }, {}),
  }));

  const results = await QuestionnaireMatchingService.matchRows(workspaceId, rows);
  await QuestionnaireMatchingService.applyResultsToDatabase(workspaceId, questionnaireId, results);

  const after = await uncheckedPrisma.questionnaireItem.findMany({
    where: { questionnaireId, workspaceId, type: "question_row" },
    select: { suggestedAnswerId: true, unresolvedReason: true, confidence: true, rowNumber: true, question: true },
  });

  const hist: Record<string, number> = {};
  for (const r of after) {
    const k = r.unresolvedReason ?? "__resolved__";
    hist[k] = (hist[k] ?? 0) + 1;
  }

  console.log(JSON.stringify({
    event: "rematch.after",
    questionnaireId, workspaceId,
    rowCount: after.length,
    approvedSelected: after.filter((r) => r.suggestedAnswerId != null).length,
    unresolvedHistogram: hist,
    rowDetails: after.map((r) => ({
      rowNumber: r.rowNumber,
      questionPreview: r.question.slice(0, 80),
      confidence: r.confidence,
      unresolvedReason: r.unresolvedReason,
      hasApprovedAnswer: r.suggestedAnswerId != null,
    })),
  }));
}

main()
  .then(() => uncheckedPrisma.$disconnect())
  .catch((e) => { console.error(e); void uncheckedPrisma.$disconnect(); process.exit(1); });
