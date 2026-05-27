import { prisma } from "./src/lib/db/prisma";
import { SimilarityService } from "./src/modules/workspaces/search/similarity-service";

async function verifyIsolation() {
  console.log("--- Testing Tenant Isolation ---");
  
  // Setup: Ensure we have two workspaces
  const wsA = await prisma.workspace.findFirst({ where: { slug: "workspace-a" } }) 
             || await prisma.workspace.create({ data: { name: "Workspace A", slug: "workspace-a" } });
             
  const wsB = await prisma.workspace.findFirst({ where: { slug: "workspace-b" } })
             || await prisma.workspace.create({ data: { name: "Workspace B", slug: "workspace-b" } });

  console.log(`Workspace A: ${wsA.id}`);
  console.log(`Workspace B: ${wsB.id}`);

  // 1. Check SourceDocumentChunks isolation
  const chunkB = await prisma.sourceDocumentChunk.findFirst({
    where: { workspaceId: wsB.id }
  });

  if (chunkB) {
    console.log(`Found chunk in Workspace B: ${chunkB.id}`);
    const resultsA = await SimilarityService.searchChunks(wsA.id, chunkB.content, 10);
    
    const leak = resultsA.find(r => r.item.workspaceId === wsB.id);
    if (leak) {
      console.error("❌ CRITICAL FAILURE: Workspace A search leaked Workspace B chunk!");
      process.exit(1);
    } else {
      console.log("✅ Success: Workspace A search is isolated from Workspace B.");
    }
  } else {
    console.warn("⚠️ No chunks found in Workspace B to test leak against. Please upload a doc to Workspace B first.");
  }

  // 2. Check KnowledgeTopics isolation
  const resultsTopicsA = await SimilarityService.findSimilarTopicsByVector(wsA.id, new Array(1536).fill(0.1), 10);
  const leakedTopic = resultsTopicsA.find(r => r.item.workspaceId && r.item.workspaceId !== wsA.id);
  
  if (leakedTopic) {
    console.error(`❌ FAILURE: Workspace A topic search leaked topic from ${leakedTopic.item.workspaceId}`);
    process.exit(1);
  } else {
    console.log("✅ Success: Knowledge Topics are strictly isolated.");
  }
}

verifyIsolation().catch(console.error);
