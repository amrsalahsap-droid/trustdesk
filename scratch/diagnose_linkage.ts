import { prisma } from "../src/lib/db/prisma";
import { SimilarityService } from "../src/modules/workspaces/search/similarity-service";
import { TopicsService } from "../src/modules/knowledge/topics/topics-service";

async function diagnose() {
  console.log("--- Pipeline Diagnostics ---");
  
  // 1. Find Workspace
  const workspace = await prisma.workspace.findFirst({
    where: { slug: { not: "system" } },
    orderBy: { createdAt: 'desc' }
  });
  
  if (!workspace) {
    console.error("No workspace found.");
    return;
  }
  console.log(`Workspace: ${workspace.name} (${workspace.id})`);

  // 2. Find "Access Control" Topic
  const topic = await prisma.knowledgeTopic.findFirst({
    where: { 
      OR: [
        { name: { contains: "Access Control", mode: 'insensitive' } },
        { key: "access_control" }
      ],
      workspaceId: { in: [workspace.id, "SYSTEM_WORKSPACE"] }
    }
  });

  if (!topic) {
    console.error("No 'Access Control' topic found.");
    return;
  }
  console.log(`Topic: ${topic.name} (${topic.id}) - Key: ${topic.key}`);
  console.log(`Topic Embedding Dim: ${Array.isArray(topic.embedding) ? (topic.embedding as any).length : 'None'}`);

  // 3. Find Chunks for Latest Document
  const doc = await prisma.sourceDocument.findFirst({
    where: { workspaceId: workspace.id },
    orderBy: { createdAt: 'desc' }
  });

  if (!doc) {
    console.error("No documents found in workspace.");
    return;
  }
  console.log(`Latest Doc: ${doc.originalName} (${doc.id})`);

  const chunks = await prisma.sourceDocumentChunk.findMany({
    where: { 
      workspaceId: workspace.id,
      sourceDocumentId: doc.id 
    }
  });
  console.log(`Chunk count: ${chunks.length}`);
  
  if (chunks.length > 0) {
    console.log(`Chunk Embedding Dim: ${Array.isArray(chunks[0].embedding) ? (chunks[0].embedding as any).length : 'None'}`);
    
    // 4. Test Similarity
    let topScore = 0;
    let crossMatches = 0;
    
    for (const chunk of chunks) {
      if (!Array.isArray(chunk.embedding) || !Array.isArray(topic.embedding)) continue;
      
      const score = SimilarityService.cosineSimilarity(
        chunk.embedding as number[], 
        topic.embedding as number[]
      );
      
      if (score > topScore) topScore = score;
      if (score >= 0.65) crossMatches++;
    }
    
    console.log(`Max similarity score found: ${topScore.toFixed(4)}`);
    console.log(`Chunks meeting 0.65 threshold: ${crossMatches}`);
    
    if (crossMatches === 0 && topScore > 0) {
      console.log("SUGGESTION: Lower SIMILARITY_THRESHOLD or broaden topic description.");
    }
  }

  // 5. Check SourceChunkTopic records
  const associations = await prisma.sourceChunkTopic.count({
    where: { 
      workspaceId: workspace.id,
      topicId: topic.id 
    }
  });
  console.log(`Existing Evidence Associations (SourceChunkTopic): ${associations}`);

  process.exit(0);
}

diagnose().catch(err => {
  console.error(err);
  process.exit(1);
});
