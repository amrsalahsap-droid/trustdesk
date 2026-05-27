import { prisma } from "../src/lib/db/prisma";
import { SeedingService } from "../src/modules/workspaces/intelligence/seeding-service";

async function testSeed() {
  const workspace = await prisma.workspace.findFirst({
    where: { slug: { not: "system" } },
    orderBy: { createdAt: 'desc' }
  });
  
  if (!workspace) return;
  const workspaceId = workspace.id;
  const topicId = "cmo6n0ft9000514uk5k1m6ncu"; // Access Control
  const topicName = "Access Control";

  console.log(`Testing seed for Topic: ${topicId} in Workspace: ${workspaceId}`);

  try {
    const result = await SeedingService.seedSingleTopic(workspaceId, topicId, topicName);
    console.log("Result:", result);
  } catch (err) {
    console.error("SEEDING FAILED WITH ERROR:");
    console.error(err);
  }

  process.exit(0);
}

testSeed().catch(console.error);
