/**
 * Read-only: inspect embedding state + topic linkage for the 4 APPROVED
 * Access Control answers in workspace cmo9waqy402oz14xo9bko45wg and
 * reconcile against the two KnowledgeTopic records named "Access Control".
 */
import { PrismaClient } from "@prisma/client";

async function main() {
  const prisma = new PrismaClient();
  try {
    const wsId = "cmo9waqy402oz14xo9bko45wg";
    const answers = await prisma.answerLibraryItem.findMany({
      where: { workspaceId: wsId, status: "APPROVED" },
      select: {
        id: true,
        topicId: true,
        status: true,
        title: true,
        embedding: true,
      },
    });
    console.log(`approvedCount=${answers.length}`);
    for (const a of answers) {
      const emb = Array.isArray(a.embedding) ? (a.embedding as number[]) : [];
      console.log(
        JSON.stringify({
          id: a.id,
          topicId: a.topicId,
          status: a.status,
          title: a.title,
          embeddingLen: emb.length,
          embeddingIsEmpty: emb.length === 0,
          embeddingSample: emb.slice(0, 3),
        }),
      );
    }

    console.log("\n--- two Access Control topics ---");
    const topics = await prisma.knowledgeTopic.findMany({
      where: {
        OR: [
          { id: "cmo6lwy6f000714jw33tc963v" },
          { id: "cmo6n0ft9000514uk5k1m6ncu" },
        ],
      },
      select: {
        id: true,
        name: true,
        key: true,
        workspaceId: true,
        embedding: true,
      },
    });
    for (const t of topics) {
      const emb = Array.isArray(t.embedding) ? (t.embedding as number[]) : [];
      console.log(
        JSON.stringify({
          id: t.id,
          name: t.name,
          key: t.key,
          workspaceId: t.workspaceId,
          embeddingLen: emb.length,
          embeddingIsEmpty: emb.length === 0,
        }),
      );
    }

    console.log("\n--- which topic does the matcher's warmup actually see? ---");
    const wsTopics = await prisma.knowledgeTopic.findMany({
      where: { workspaceId: wsId, embedding: { isEmpty: false } },
      select: { id: true, name: true, key: true, workspaceId: true },
    });
    const globalTopics = await prisma.knowledgeTopic.findMany({
      where: { workspaceId: null, embedding: { isEmpty: false } },
      select: { id: true, name: true, key: true, workspaceId: true },
    });
    const systemTopics = await prisma.knowledgeTopic.findMany({
      where: { workspaceId: "SYSTEM_WORKSPACE", embedding: { isEmpty: false } },
      select: { id: true, name: true, key: true, workspaceId: true },
    });
    console.log(`workspace-scoped (loaded by matcher) count=${wsTopics.length}`);
    console.log(`global null-workspace (loaded by matcher) count=${globalTopics.length}`);
    console.log(`SYSTEM_WORKSPACE sentinel (NOT loaded by matcher) count=${systemTopics.length}`);
    const matchedInGlobal = globalTopics.find((t) => t.id === "cmo6lwy6f000714jw33tc963v");
    const matchedInSystem = systemTopics.find((t) => t.id === "cmo6n0ft9000514uk5k1m6ncu");
    console.log(
      `access_control in global-null set? ${!!matchedInGlobal}  in SYSTEM_WORKSPACE set? ${!!matchedInSystem}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
