import { EmbeddingService } from "./src/lib/ai/embedding-service";
import { ChunkingService } from "./src/modules/workspaces/source-documents/parsing/chunking-service";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function verifyEmbeddingEngine() {
  try {
    console.log("--- Starting Vector Embedding Engine Verification ---");

    // 1. Test Single Embedding
    console.log("Testing EmbeddingService (Mock Mode)...");
    const v1 = await EmbeddingService.getEmbedding("Security is our top priority.");
    const v2 = await EmbeddingService.getEmbedding("Security is our top priority.");
    const v3 = await EmbeddingService.getEmbedding("An entirely different sentence.");

    console.log(`v1 size: ${v1.length}`);
    console.log(`v1 matches v2? ${JSON.stringify(v1) === JSON.stringify(v2)} (Should be true)`);
    console.log(`v1 matches v3? ${JSON.stringify(v1) === JSON.stringify(v3)} (Should be false)`);

    if (v1.length !== 1536) throw new Error("Incorrect vector dimension");

    // 2. Test End-to-End Chunking
    console.log("\nTesting End-to-End Chunking with Embeddings...");
    const docWithContent = await prisma.sourceDocumentContent.findFirst({
        include: { sourceDocument: true }
    });

    if (docWithContent) {
        console.log(`Processing Document: ${docWithContent.sourceDocument.filename}`);
        const chunks = await ChunkingService.runChunking(docWithContent.sourceDocumentId);
        console.log(`Created ${chunks.length} chunks with embeddings.`);
        
        const sample = chunks[0];
        console.log(`Sample Chunk Embedding type: ${typeof sample.embedding}`);
        console.log(`Sample Chunk Embedding sample: ${sample.embedding.slice(0, 5)}...`);
        
        if (!sample.embedding || sample.embedding.length === 0) {
            throw new Error("Embedded chunk has no vector data");
        }
    } else {
        console.log("No document found to test end-to-end chunking.");
    }

    console.log("\n--- Vector Embedding Engine Verification Complete ---");
  } catch (err) {
    console.error("Verification FAILED:", err);
  } finally {
    await prisma.$disconnect();
  }
}

verifyEmbeddingEngine();
