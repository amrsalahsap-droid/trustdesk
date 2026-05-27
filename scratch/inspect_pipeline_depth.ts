import { uncheckedPrisma as prisma } from "../src/lib/db/prisma";
import { TopicsService } from "../src/modules/knowledge/topics/topics-service";
import { AnswerGenerationService } from "../src/modules/workspaces/intelligence/answer-generation-service";

async function inspectPipeline() {
  const workspaceId = "cmo6s3z4r00gb145cdsi5nh8b"; // kolo-poly
  const topicId = "cmo6n0ft9000514uk5k1m6ncu"; // Access Control
  const topicName = "Access Control";

  console.log("=== STEP 1: SOURCE DOCUMENT TRUTH ===");
  const doc = await prisma.sourceDocument.findFirst({
    where: { workspaceId, fileName: { contains: "Access Control" } },
    include: { parseJobs: { take: 1, orderBy: { createdAt: 'desc' } } }
  });

  if (!doc) {
    console.log("FAIL: No Access Control document found.");
  } else {
    console.log(`Document: ${doc.fileName} (${doc.id})`);
    console.log(`Status: ${doc.status}`);
    console.log(`Parse Job Status: ${doc.parseJobs[0]?.status || 'N/A'}`);
    
    const chunks = await prisma.sourceDocumentChunk.findMany({
      where: { sourceDocumentId: doc.id }
    });
    console.log(`Total Chunks: ${chunks.length}`);
    
    const relevantChunks = await prisma.sourceChunkTopic.findMany({
       where: { topicId, chunk: { sourceDocumentId: doc.id } },
       include: { chunk: true },
       orderBy: { score: 'desc' }
    });
    console.log(`Chunks classified to this topic: ${relevantChunks.length}`);
    relevantChunks.slice(0, 3).forEach(c => {
      console.log(`- Chunk ${c.chunkId} (Score: ${c.score}): ${c.chunk.content.substring(0, 80)}...`);
    });
  }

  console.log("\n=== STEP 2: TOPIC RESOLUTION ===");
  const topic = await prisma.knowledgeTopic.findUnique({ where: { id: topicId } });
  if (topic) {
    console.log(`Name: ${topic.name}, Key: ${topic.key}`);
    console.log(`Workspace: ${topic.workspaceId || 'GLOBAL'}`);
    console.log(`Status: ${topic.status}`);
  }

  console.log("\n=== STEP 3: TRACE EVIDENCE RETRIEVAL ===");
  const topAssociations = await prisma.sourceChunkTopic.findMany({
    where: { topicId, chunk: { workspaceId } },
    orderBy: { score: "desc" },
    take: 5,
    include: { chunk: { include: { sourceDocument: true } } },
  });
  console.log(`Candidate chunks retrieved: ${topAssociations.length}`);
  topAssociations.forEach((assoc, i) => {
    console.log(`Rank ${i+1}: Chunk ${assoc.chunkId} (Score: ${assoc.score}) from ${assoc.chunk.sourceDocument.fileName}`);
    console.log(`Content: ${assoc.chunk.content.substring(0, 150)}...`);
  });

  console.log("\n=== STEP 4: TRACE PROMPT CONSTRUCTION (SIMULATED) ===");
  const context = topAssociations.map(c => `SOURCE: [${c.chunk.sourceDocument.fileName}]\nCONTENT: ${c.chunk.content}`).join("\n\n---\n\n");
  const prompt = `
        You are a professional Security Compliance Officer. 
        Synthesize a coherent OFFICIAL SECURITY RESPONSE for: "${topicName}".
        
        EVIDENCE CLIPS:
        ${context}

        INSTRUCTIONS:
        1. EVIDENCE-FIRST: Build the answer ONLY from provided CLIPS.
        2. BE CONCISE...
  `;
  console.log("Full context length in prompt: " + context.length);

  console.log("\n=== STEP 5: VERIFY MODEL EXECUTION ===");
  const apiKey = process.env.OPENAI_API_KEY;
  console.log(`API Key set: ${apiKey && apiKey !== "YOUR_OPENAI_API_KEY" ? 'YES' : 'NO (FALLBACK TO MOCK)'}`);
  
  const generated = await AnswerGenerationService.generateFromEvidence(topicName, 
    topAssociations.map(a => ({ id: a.chunkId, content: a.chunk.content, docName: a.chunk.sourceDocument.fileName })),
    workspaceId
  );
  console.log("Raw Generated Answer:", generated.answer);
  console.log("Concrete Facts Found:", generated.concreteFacts);
  console.log("Quality Result:", generated.isLowQuality ? 'REJECTED' : 'ACCEPTED');

  console.log("\n=== STEP 7: TRACE PERSISTENCE ===");
  const saved = await prisma.answerLibraryItem.findFirst({
    where: { workspaceId, topicId, title: topicName },
    include: { evidence: true }
  });
  if (saved) {
    console.log(`AnswerId: ${saved.id}`);
    console.log(`Status: ${saved.status}`);
    console.log(`Confidence: ${saved.confidenceScore}`);
    console.log(`Text: ${saved.answer}`);
  } else {
    console.log("NOT PERSISTED");
  }

  process.exit(0);
}

inspectPipeline().catch(console.error);
