import { ClassificationService } from "./classification-service";
import { prisma } from "@/lib/db/prisma";

async function verifyClassification() {
    console.log("--- Starting Chunk Classification Verification ---");

    try {
        const workspace = await prisma.workspace.findFirst();
        if (!workspace) throw new Error("No workspace found.");

        console.log(`Running classification for workspace: ${workspace.name}`);
        const associations = await ClassificationService.classifyWorkspaceChunks(workspace.id);
        
        console.log(`Created ${associations} chunk-to-topic associations.`);

        // Pick a chunk and see its topics
        const sample = await prisma.sourceChunkTopic.findFirst({
            include: { chunk: true, topic: true }
        });

        if (sample) {
            console.log(`\nSample Match:`);
            console.log(`Chunk: ${sample.chunk.content.substring(0, 50)}...`);
            console.log(`Matched Topic: ${sample.topic.name}`);
            console.log(`Score: ${Math.round(sample.score * 100)}%`);
        } else {
            console.log("\nNo associations found. Make sure topics and chunks have embeddings.");
        }

        console.log("\n--- Verification Complete ---");
    } catch (err) {
        console.error("Verification failed:", err);
        process.exit(1);
    }
}

verifyClassification();
