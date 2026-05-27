import { PrismaClient } from "@prisma/client";

/**
 * Migration script to backfill workspaceId for sub-entities after MT-EN-03 schema update.
 */
async function backfill() {
  const prisma = new PrismaClient();
  console.log("Starting workspaceId backfill...");

  // 1. SourceDocumentContent -> SourceDocument
  const contents = await prisma.sourceDocumentContent.findMany({
    where: { workspaceId: null },
    include: { sourceDocument: true },
  });

  console.log(`Backfilling ${contents.length} SourceDocumentContent records...`);
  for (const item of contents) {
    await (prisma as any).sourceDocumentContent.update({
      where: { id: item.id },
      data: { workspaceId: item.sourceDocument.workspaceId },
    });
  }

  // 2. QuestionnaireItem -> Questionnaire
  const qItems = await prisma.questionnaireItem.findMany({
    include: { questionnaire: true },
  });
  console.log(`Backfilling ${qItems.length} QuestionnaireItem records...`);
  for (const item of qItems) {
    if (!item.workspaceId) {
      await (prisma as any).questionnaireItem.update({
        where: { id: item.id },
        data: { workspaceId: item.questionnaire.workspaceId },
      });
    }
  }

  // 3. AnswerLibraryItemVersion -> AnswerLibraryItem
  const versions = await prisma.answerLibraryItemVersion.findMany({
    include: { answer: true },
  });
  console.log(`Backfilling ${versions.length} AnswerLibraryItemVersion records...`);
  for (const item of versions) {
    if (!item.workspaceId) {
      await (prisma as any).answerLibraryItemVersion.update({
        where: { id: item.id },
        data: { workspaceId: item.answer.workspaceId },
      });
    }
  }

  // 4. AnswerEvidence -> AnswerLibraryItem
  const evidence = await prisma.answerEvidence.findMany({
    include: { answer: true },
  });
  console.log(`Backfilling ${evidence.length} AnswerEvidence records...`);
  for (const item of evidence) {
    if (!item.workspaceId) {
      await (prisma as any).answerEvidence.update({
        where: { id: item.id },
        data: { workspaceId: item.answer.workspaceId },
      });
    }
  }

  // 5. AnswerSeedingTopicRun -> AnswerSeedingJob
  const topicRuns = await prisma.answerSeedingTopicRun.findMany({
    include: { seedingJob: true },
  });
  console.log(`Backfilling ${topicRuns.length} AnswerSeedingTopicRun records...`);
  for (const item of topicRuns) {
    if (!item.workspaceId) {
      await (prisma as any).answerSeedingTopicRun.update({
        where: { id: item.id },
        data: { workspaceId: item.seedingJob.workspaceId },
      });
    }
  }

  // 6. SourceChunkTopic -> SourceDocumentChunk
  const chunkTopics = await prisma.sourceChunkTopic.findMany({
    include: { chunk: true },
  });
  console.log(`Backfilling ${chunkTopics.length} SourceChunkTopic records...`);
  for (const item of chunkTopics) {
    if (!item.workspaceId) {
      await (prisma as any).sourceChunkTopic.update({
        where: { id: item.id },
        data: { workspaceId: item.chunk.workspaceId },
      });
    }
  }

  console.log("Backfill complete.");
  await prisma.$disconnect();
}

backfill().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
