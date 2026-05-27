
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const items = await prisma.questionnaireItem.findMany({
    take: 20,
    select: {
      id: true,
      question: true,
      verificationStatus: true,
      unresolvedReason: true,
    }
  });
  console.log(JSON.stringify(items, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
