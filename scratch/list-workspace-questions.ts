import { PrismaClient } from "@prisma/client";

async function main() {
  const prisma = new PrismaClient();
  try {
    const rows = await prisma.questionnaireItem.findMany({
      where: {
        workspaceId: "cmo9waqy402oz14xo9bko45wg",
        type: "question_row",
      },
      select: {
        rowNumber: true,
        question: true,
        topicName: true,
        confidence: true,
        suggestedAnswerId: true,
        unresolvedReason: true,
      },
      orderBy: { rowNumber: "asc" },
    });
    for (const r of rows) console.log(JSON.stringify(r));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
