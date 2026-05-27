import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function testCRUD() {
  try {
    console.log("--- Starting Answer CRUD Verification ---");
    
    // 1. Get a workspace
    const workspace = await prisma.workspace.findFirst();
    if (!workspace) throw new Error("No workspace found for testing");
    console.log(`Using workspace: ${workspace.name} (${workspace.id})`);

    // 2. Get a topic
    const topic = await prisma.knowledgeTopic.findFirst({ where: { key: 'mfa' } });
    if (!topic) throw new Error("No 'mfa' topic found. Make sure to seed first.");
    console.log(`Using topic: ${topic.name} (${topic.id})`);

    // 3. CREATE (Cleanup first)
    await prisma.answerLibraryItem.deleteMany({ where: { title: 'TEST QUESTION: MFA' } });
    
    const created = await prisma.answerLibraryItem.create({
      data: {
        workspaceId: workspace.id,
        topicId: topic.id,
        title: 'TEST QUESTION: MFA',
        answer: 'This is a verified test answer for MFA.',
        status: 'APPROVED',
        owner: 'System Test'
      }
    });
    console.log(`CREATED: ${created.id}`);

    // 4. READ
    const fetched = await prisma.answerLibraryItem.findUnique({ where: { id: created.id } });
    console.log(`FETCHED: ${fetched?.title} (Status: ${fetched?.status})`);

    // 5. UPDATE
    const updated = await prisma.answerLibraryItem.update({
      where: { id: created.id },
      data: { status: 'ARCHIVED' }
    });
    console.log(`UPDATED status to: ${updated.status}`);

    // 6. DELETE
    await prisma.answerLibraryItem.delete({ where: { id: created.id } });
    console.log("DELETED successfully.");

    console.log("--- CRUD Verification Complete ---");
  } catch (err) {
    console.error("CRUD Verification FAILED:", err);
  } finally {
    await prisma.$disconnect();
  }
}

testCRUD();
