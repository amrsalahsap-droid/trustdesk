import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const workspaceId = "cmoi0g4bj03bj1470b1v8fqw8"; 
  const userId = "cmoi0lo9f03cj1470f4uk5ddb"; 

  // 1. Find all topics
  const topics = await prisma.knowledgeTopic.findMany({
    where: { workspaceId },
    select: { id: true, key: true, name: true }
  });

  // 2. For each topic, count total answers and approved answers
  for (const t of topics) {
    const answers = await prisma.answerLibraryItem.findMany({
      where: { workspaceId, topicId: t.id, status: { not: "ARCHIVED" } },
      select: { id: true, status: true, approverId: true, ownerId: true }
    });

    const totalAnswers = answers.length;
    const approvedAnswers = answers.filter(a => a.status === "APPROVED").length;

    if (totalAnswers === 1 && approvedAnswers === 1) {
      console.log(`Topic MATCH: ${t.name} (${t.key})`);
      console.log(`Answers:`, answers);
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
