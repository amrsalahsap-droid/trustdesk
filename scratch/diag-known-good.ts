/**
 * Read-only: find any QuestionnaireItem that actually RESOLVED (reviewed=true or
 * confidence=high with non-null suggestedAnswerId) and print its key fields
 * side-by-side with a failing row for comparison.
 */
import { PrismaClient } from "@prisma/client";

async function main() {
  const prisma = new PrismaClient();
  try {
    const good = await prisma.questionnaireItem.findMany({
      where: {
        type: "question_row",
        confidence: { in: ["high", "medium"] },
        topicId: { not: null },
        suggestedAnswerId: { not: null },
      },
      take: 5,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        workspaceId: true,
        question: true,
        topicId: true,
        topicName: true,
        confidence: true,
        suggestedAnswerId: true,
        unresolvedReason: true,
        reviewStatus: true,
      },
    });
    console.log(`goodRowsFound=${good.length}`);
    for (const g of good) {
      const approvedForTopic = await prisma.answerLibraryItem.count({
        where: { workspaceId: g.workspaceId, topicId: g.topicId ?? undefined, status: "APPROVED" },
      });
      const answer = g.suggestedAnswerId
        ? await prisma.answerLibraryItem.findUnique({
            where: { id: g.suggestedAnswerId },
            select: { id: true, topicId: true, status: true, title: true, embedding: true },
          })
        : null;
      const embLen = answer && Array.isArray(answer.embedding) ? (answer.embedding as number[]).length : 0;
      console.log(
        JSON.stringify({
          id: g.id,
          workspaceId: g.workspaceId,
          question: g.question.slice(0, 80),
          topicId: g.topicId,
          topicName: g.topicName,
          confidence: g.confidence,
          suggestedAnswerId: g.suggestedAnswerId,
          unresolvedReason: g.unresolvedReason,
          reviewStatus: g.reviewStatus,
          approvedForTopic,
          answerTopicId: answer?.topicId ?? null,
          answerEmbeddingLen: embLen,
          topicIdMatches: answer ? answer.topicId === g.topicId : null,
        }),
      );
    }

    console.log("\n--- approved answers with non-empty embedding (any workspace) ---");
    const withEmb = await prisma.$queryRaw<
      Array<{ id: string; workspaceId: string; topicId: string | null; title: string }>
    >`SELECT id, "workspaceId", "topicId", title
      FROM "AnswerLibraryItem"
      WHERE status = 'APPROVED'
        AND cardinality(embedding) > 0
      LIMIT 10`;
    console.log(`approvedWithEmbedding=${withEmb.length}`);
    for (const r of withEmb) console.log(JSON.stringify(r));

    console.log("\n--- approved answers with EMPTY embedding ---");
    const withoutEmb = await prisma.$queryRaw<
      Array<{ id: string; workspaceId: string; topicId: string | null; title: string }>
    >`SELECT id, "workspaceId", "topicId", title
      FROM "AnswerLibraryItem"
      WHERE status = 'APPROVED'
        AND cardinality(embedding) = 0
      LIMIT 20`;
    console.log(`approvedWithoutEmbedding=${withoutEmb.length}`);
    for (const r of withoutEmb) console.log(JSON.stringify(r));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
