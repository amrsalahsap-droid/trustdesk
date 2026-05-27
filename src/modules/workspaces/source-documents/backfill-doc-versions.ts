import { prisma } from "../../db/prisma";

async function backfill() {
  console.log("--- Starting Source Document Versioning Backfill ---");

  const documents = await prisma.sourceDocument.findMany({
    where: {
      groupId: null,
    },
  });

  console.log(`Found ${documents.length} documents requiring groupId initialization.`);

  let count = 0;
  for (const doc of documents) {
    await prisma.sourceDocument.update({
      where: { id: doc.id },
      data: {
        groupId: doc.id,
        version: 1,
        isLatest: true,
      },
    });
    console.log(`Initialized group for: ${doc.id} (${doc.originalName})`);
    count++;
  }

  console.log(`Successfully backfilled ${count} documents.`);
  console.log("--- Backfill Complete ---");
}

backfill()
  .catch((e) => {
    console.error("Backfill FAILED:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
