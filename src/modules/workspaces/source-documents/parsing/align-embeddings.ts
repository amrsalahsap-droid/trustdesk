import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

import { EmbeddingService } from "@/lib/ai/embedding-service";
import { logger } from "@/lib/logging/logger";

async function alignEmbeddings() {
    console.log("--- Starting Embedding Alignment ---");

    try {
        // 1. Identify chunks with wrong dimensions (anything != 384)
        const chunks = await prisma.sourceDocumentChunk.findMany({
            where: {
                embedding: { isEmpty: false }
            }
        });

        const targetDim = 384; // all-MiniLM-L6-v2 dim
        const misaligned = chunks.filter(c => c.embedding.length !== targetDim);

        console.log(`Found ${chunks.length} total chunks.`);
        console.log(`Misaligned chunks (dim != ${targetDim}): ${misaligned.length}`);

        if (misaligned.length === 0) {
            console.log("All chunks already aligned.");
            return;
        }

        // 2. Re-embed in batches
        const BATCH_SIZE = 20;
        for (let i = 0; i < misaligned.length; i += BATCH_SIZE) {
            const batch = misaligned.slice(i, i + BATCH_SIZE);
            const texts = batch.map(c => c.content);
            
            console.log(`Re-embedding batch ${i / BATCH_SIZE + 1}...`);
            const vectors = await EmbeddingService.getEmbeddings(texts);

            // Update DB
            for (let j = 0; j < batch.length; j++) {
                await prisma.sourceDocumentChunk.update({
                    where: { id: batch[j].id },
                    data: { embedding: vectors[j] }
                });
            }
        }

        console.log("\n--- Alignment Complete ---");
    } catch (err) {
        console.error("Alignment failed:", err);
        process.exit(1);
    }
}

alignEmbeddings();
