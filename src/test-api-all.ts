import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const workspaceId = "cmoi0g4bj03bj1470b1v8fqw8"; 
  const topicKey = "access_control";

  console.log("Simulating API request for topicScope='all'");
  
  const andClauses: any[] = [];
  andClauses.push({ topic: { key: topicKey } });

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
