import { PrismaClient } from "@prisma/client";
import { uncheckedPrisma } from "../src/lib/db/prisma";

async function main() {
  const prisma = new PrismaClient();
  const row = await prisma.answerLibraryItem.findUnique({
    where: { id: "cmoatabrz000u14fog5pemktu" },
    select: {
      id: true,
      status: true,
      workspaceId: true,
      topicId: true,
      subControlKey: true,
      subControlLabels: true,
      title: true,
    },
  });
  console.log("before:", JSON.stringify(row));

  if (row?.topicId) {
    // Reproduce the exact lookup the PATCH route now uses.
    const topic = await uncheckedPrisma.knowledgeTopic.findUnique({
      where: { id: row.topicId },
      select: { key: true, name: true, workspaceId: true },
    });
    console.log("topic lookup via uncheckedPrisma:", JSON.stringify(topic));
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
