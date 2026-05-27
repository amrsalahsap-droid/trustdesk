import { prisma } from "../src/lib/db/prisma";
import { SeedingService } from "../src/modules/workspaces/intelligence/seeding-service";

async function testQualityGate() {
  const workspace = await prisma.workspace.findFirst({
    where: { slug: { not: "system" } },
    orderBy: { createdAt: 'desc' }
  });
  
  if (!workspace) return;
  const workspaceId = workspace.id;

  console.log("--- TEST 1: LOW QUALITY (1 CHUNK) ---");
  // We'll use a real topic but simulate 1 chunk by manually deleting SourceChunkTopic if needed?
  // Actually, I'll just check if seeding-service logic rejects it correctly.
  
  const result1 = await SeedingService.seedSingleTopic(workspaceId, "topic-low-quality", "Mock Topic Low");
  console.log("Low Quality Result:", result1);

  console.log("\n--- TEST 2: HIGH QUALITY (2+ CHUNKS) ---");
  // Note: For this to pass the mock gate, it needs at least 2 associated chunks in DB
  // My diagnostic showed "Access Control" has 8.
  const result2 = await SeedingService.seedSingleTopic(workspaceId, "cmo6n0ft9000514uk5k1m6ncu", "Access Control");
  console.log("Access Control Result:", result2);

  process.exit(0);
}

testQualityGate().catch(console.error);
