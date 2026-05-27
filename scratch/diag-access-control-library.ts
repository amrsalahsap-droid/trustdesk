/**
 * Read-only one-shot: for the Access Control topic, report how many
 * AnswerLibraryItem rows exist per workspace (broken down by status),
 * plus which questionnaire items persisted `no_approved_answer` while an
 * approved answer actually exists on the matched topic.
 */
import { PrismaClient } from "@prisma/client";

async function main() {
  const prisma = new PrismaClient();
  try {
    console.log("=".repeat(80));
    console.log("1. KnowledgeTopic records named Access Control");
    console.log("=".repeat(80));
    const topics = await prisma.knowledgeTopic.findMany({
      where: {
        OR: [
          { key: { contains: "access_control", mode: "insensitive" } },
          { name: { contains: "access control", mode: "insensitive" } },
        ],
      },
      select: { id: true, key: true, name: true, workspaceId: true },
    });
    console.log(JSON.stringify(topics, null, 2));

    console.log("\n" + "=".repeat(80));
    console.log("2. AnswerLibraryItem rows per workspace (for those topic ids)");
    console.log("=".repeat(80));
    if (topics.length > 0) {
      const answers = await prisma.answerLibraryItem.groupBy({
        by: ["workspaceId", "topicId", "status"],
        where: { topicId: { in: topics.map((t) => t.id) } },
        _count: true,
      });
      console.log(JSON.stringify(answers, null, 2));
    }

    console.log("\n" + "=".repeat(80));
    console.log("3. Library-size per workspace (all topics, any status != ARCHIVED)");
    console.log("=".repeat(80));
    const libCounts = await prisma.answerLibraryItem.groupBy({
      by: ["workspaceId", "status"],
      _count: true,
    });
    console.log(JSON.stringify(libCounts, null, 2));

    console.log("\n" + "=".repeat(80));
    console.log("4. QuestionnaireItem rows persisted as no_approved_answer with non-null topicId");
    console.log("=".repeat(80));
    const brokenRows = await prisma.questionnaireItem.findMany({
      where: {
        unresolvedReason: "no_approved_answer",
        topicId: { not: null },
      },
      select: {
        id: true,
        workspaceId: true,
        topicId: true,
        topicName: true,
        question: true,
        confidence: true,
      },
    });

    const integrity: Array<{
      itemId: string;
      workspaceId: string;
      topicId: string | null;
      topicName: string | null;
      approvedForTopic: number;
      draftForTopic: number;
      question: string;
    }> = [];
    for (const r of brokenRows) {
      const approvedForTopic = await prisma.answerLibraryItem.count({
        where: {
          workspaceId: r.workspaceId,
          topicId: r.topicId ?? undefined,
          status: "APPROVED",
        },
      });
      const draftForTopic = await prisma.answerLibraryItem.count({
        where: {
          workspaceId: r.workspaceId,
          topicId: r.topicId ?? undefined,
          status: "DRAFT",
        },
      });
      integrity.push({
        itemId: r.id,
        workspaceId: r.workspaceId,
        topicId: r.topicId,
        topicName: r.topicName,
        approvedForTopic,
        draftForTopic,
        question: r.question.slice(0, 100),
      });
    }
    console.log(`totalRows=${brokenRows.length}`);
    const violations = integrity.filter((i) => i.approvedForTopic > 0);
    console.log(`hardViolations (approvedForTopic>0): ${violations.length}`);
    if (violations.length > 0) {
      console.log(JSON.stringify(violations, null, 2));
    } else {
      console.log("(none — every no_approved_answer row has zero approved answers on its topic)");
    }

    console.log("\n" + "=".repeat(80));
    console.log("5. For the failing workspace cmo9waqy402oz14xo9bko45wg: what topics/answers exist");
    console.log("=".repeat(80));
    const targetWorkspaceId = "cmo9waqy402oz14xo9bko45wg";
    const wsAnswers = await prisma.answerLibraryItem.findMany({
      where: { workspaceId: targetWorkspaceId },
      select: { id: true, topicId: true, status: true, title: true },
    });
    console.log(`workspace=${targetWorkspaceId} answerCount=${wsAnswers.length}`);
    if (wsAnswers.length > 0) console.log(JSON.stringify(wsAnswers, null, 2));

    const wsDocs = await prisma.sourceDocument.count({ where: { workspaceId: targetWorkspaceId } });
    const wsChunks = await prisma.sourceDocumentChunk.count({ where: { workspaceId: targetWorkspaceId } });
    const wsSeedingJobs = await prisma.answerSeedingJob.count({ where: { workspaceId: targetWorkspaceId } });
    console.log(`workspace source docs=${wsDocs} chunks=${wsChunks} seedingJobs=${wsSeedingJobs}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
