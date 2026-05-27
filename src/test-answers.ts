import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const workspaceId = "cmoi0g4bj03bj1470b1v8fqw8"; 
  const userId = "cmoi0lo9f03cj1470f4uk5ddb"; 

  console.log("Checking user's assigned answers for workspace:", workspaceId);
  const answers = await prisma.answerLibraryItem.findMany({
    where: { 
      workspaceId,
      OR: [
        { approverId: userId },
        { ownerId: userId }
      ]
    },
    select: {
      id: true,
      title: true,
      status: true,
      governanceStatus: true,
      approverId: true,
      ownerId: true,
      topic: { select: { key: true, name: true } }
    }
  });

  console.log("Total assigned answers for user:", answers.length);
  for (const a of answers) {
    console.log(`- ID: ${a.id}`);
    console.log(`  Topic: ${a.topic?.name} (${a.topic?.key})`);
    console.log(`  Title: ${a.title}`);
    console.log(`  Status: ${a.status} | GovStatus: ${a.governanceStatus}`);
    console.log(`  Approver: ${a.approverId === userId ? "ME" : a.approverId}`);
    console.log(`  Owner: ${a.ownerId === userId ? "ME" : a.ownerId}`);
    console.log('---');
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
