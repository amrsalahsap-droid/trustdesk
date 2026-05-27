import { PrismaClient } from "@prisma/client";

async function main() {
  const prisma = new PrismaClient();
  try {
    const ans = await prisma.answerLibraryItem.findUnique({
      where: { id: "cmo9yeedk03x614xoys42i7sh" },
      include: {
        topic: { select: { id: true, key: true, name: true, workspaceId: true } },
        _count: { select: { evidence: true } },
      },
    });
    console.log(JSON.stringify(ans, null, 2));

    const wsApproved = await prisma.answerLibraryItem.findMany({
      where: { workspaceId: "cmo9ydhou03m214xola3hm95i", status: "APPROVED" },
      include: { topic: { select: { key: true, name: true } } },
      select: { id: true, title: true, topicId: true, status: true, topic: { select: { key: true, name: true } } },
    });
    console.log("\n--- all APPROVED in workspace cmo9ydhou03m214xola3hm95i ---");
    console.log(JSON.stringify(wsApproved, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
