import { PrismaClient, AnswerStatus } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const workspaceId = "cmoi0g4bj03bj1470b1v8fqw8"; 
  const userId = "cmoi0lo9f03cj1470f4uk5ddb"; 
  const topicKey = "access_control";

  console.log("Simulating API request for filter=my_assigned");
  
  const andClauses: any[] = [];
  andClauses.push({ topic: { key: topicKey } });
  andClauses.push({ approverId: userId }); // filter=my_assigned

  const whereClause: any = {
    workspaceId,
    status: { not: "ARCHIVED" },
    AND: andClauses
  };

  const items = await prisma.answerLibraryItem.findMany({
    where: whereClause,
    select: { id: true, title: true, status: true, governanceStatus: true }
  });

  console.log("Returned items:", items.length);
  console.log(items);
}

main().catch(console.error).finally(() => prisma.$disconnect());
