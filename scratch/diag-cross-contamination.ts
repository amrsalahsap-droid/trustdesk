/**
 * Cross-contamination audit: for every approved AnswerLibraryItem that has
 * been surfaced as `suggestedAnswerId` on any QuestionnaireItem, report how
 * many distinct topic families the consuming rows span, and the cosine
 * between each consuming row's question and the answer's embedding.
 *
 * Read-only. Exposes two contamination modes:
 *   1. Rank contamination — answer's topic != row's matched topic (global
 *      ranking promoted it over same-topic rivals).
 *   2. Fitness contamination — cosine(question, answer) is low even though
 *      the matcher picked this answer.
 */
import { PrismaClient } from "@prisma/client";
import { EmbeddingService } from "../src/lib/ai/embedding-service";

function cosine(a: number[], b: number[]): number {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const mag = Math.sqrt(na) * Math.sqrt(nb);
  return mag === 0 ? 0 : dot / mag;
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const items = await prisma.questionnaireItem.findMany({
      where: {
        type: "question_row",
        suggestedAnswerId: { not: null },
      },
      select: {
        id: true,
        workspaceId: true,
        question: true,
        topicId: true,
        topicName: true,
        suggestedAnswerId: true,
      },
    });

    console.log(`persistedRowsWithSuggestion=${items.length}`);
    if (items.length === 0) {
      // No persisted state — test against the live matcher by running matchRows
      // on every non-header row across the inspected workspace.
      console.log("(no persisted rows; re-run the importer or trigger matchRows to populate)");
    }

    // Group by suggestedAnswerId
    const byAnswer = new Map<
      string,
      {
        rows: Array<{ itemId: string; workspaceId: string; question: string; topicId: string | null; topicName: string | null }>;
      }
    >();
    for (const r of items) {
      const id = r.suggestedAnswerId!;
      const entry = byAnswer.get(id) ?? { rows: [] };
      entry.rows.push({
        itemId: r.id,
        workspaceId: r.workspaceId,
        question: r.question,
        topicId: r.topicId,
        topicName: r.topicName,
      });
      byAnswer.set(id, entry);
    }

    // Pull answer metadata + embedding once per unique suggestedAnswerId
    const answerIds = Array.from(byAnswer.keys());
    const answers = await prisma.answerLibraryItem.findMany({
      where: { id: { in: answerIds } },
      select: {
        id: true,
        workspaceId: true,
        topicId: true,
        title: true,
        answer: true,
        status: true,
        embedding: true,
        topic: { select: { key: true, name: true } },
      },
    });
    const byId = new Map(answers.map((a) => [a.id, a]));

    console.log(`\n--- Contamination sweep ---`);
    for (const [ansId, { rows }] of byAnswer) {
      const ans = byId.get(ansId);
      if (!ans) continue;

      const ansEmb = Array.isArray(ans.embedding) ? (ans.embedding as number[]) : [];

      // Compute cosine(question, answer) per consuming row
      const qVectors = await EmbeddingService.getEmbeddings(rows.map((r) => r.question));

      const perRow = rows.map((r, idx) => ({
        itemId: r.itemId,
        workspaceId: r.workspaceId,
        rowTopic: r.topicName ?? null,
        rowTopicId: r.topicId ?? null,
        topicMatchesAnswer: r.topicId === ans.topicId,
        cosineQuestionVsAnswer: ansEmb.length > 0 ? Number(cosine(qVectors[idx], ansEmb).toFixed(4)) : null,
        question: r.question.slice(0, 110),
      }));

      const distinctTopicIds = new Set(perRow.map((p) => p.rowTopicId).filter(Boolean));
      const offTopicCount = perRow.filter((p) => !p.topicMatchesAnswer).length;
      const avgCosine =
        perRow.length > 0
          ? Number(
              (
                perRow
                  .map((p) => p.cosineQuestionVsAnswer ?? 0)
                  .reduce((a, b) => a + b, 0) / perRow.length
              ).toFixed(4),
            )
          : 0;

      if (distinctTopicIds.size <= 1 && offTopicCount === 0 && avgCosine >= 0.45) continue; // not a contamination

      console.log("\n" + "=".repeat(80));
      console.log(
        JSON.stringify({
          suggestedAnswerId: ansId,
          answerWorkspaceId: ans.workspaceId,
          answerStatus: ans.status,
          answerTopicKey: ans.topic?.key ?? null,
          answerTopicName: ans.topic?.name ?? null,
          answerTitle: ans.title,
          consumerRowCount: perRow.length,
          distinctRowTopics: distinctTopicIds.size,
          offTopicRowCount: offTopicCount,
          avgCosineQuestionVsAnswer: avgCosine,
        }),
      );
      for (const p of perRow) {
        console.log(JSON.stringify(p));
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
