import { SeedingService } from "./seeding-service";
import { prisma } from "@/lib/db/prisma";

async function verifySeeding() {
    console.log("--- Starting Answer Seeding Verification ---");

    try {
        const workspace = await prisma.workspace.findFirst();
        if (!workspace) throw new Error("No workspace found.");

        console.log(`Running seeding for workspace: ${workspace.name}`);
        
        // Ensure some topics exist (from taxonomy)
        const topicCount = await prisma.knowledgeTopic.count();
        console.log(`Total Topics in Taxonomy: ${topicCount}`);

        // Run Seeding
        const results = await SeedingService.runTopicSeeding(workspace.id);
        console.log(`\nSeeding Completed:`);
        console.log(`- Drafts Created: ${results.created}`);
        console.log(`- Topics Skipped (No Evidence): ${results.skipped}`);

        // Verify the created items
        const drafts = await prisma.answerLibraryItem.findMany({
            where: { 
                workspaceId: workspace.id,
                status: "DRAFT"
            },
            include: {
                topic: true,
                evidence: true
            }
        });

        console.log(`\nVerification Check:`);
        if (drafts.length > 0) {
            const sample = drafts[0];
            console.log(`Sample Draft Answer:`);
            console.log(`- Title: ${sample.title}`);
            console.log(`- Topic: ${sample.topic?.name}`);
            console.log(`- Evidence Count: ${sample.evidence.length}`);
            console.log(`- Answer Snippet: ${sample.answer?.substring(0, 100)}...`);
        } else {
            console.log("No drafts were created. This is expected if no topics matched chunks (Score >= 0.65).");
        }

        console.log("\n--- Verification Complete ---");
    } catch (err) {
        console.error("Seeding verification failed:", err);
        process.exit(1);
    }
}

verifySeeding();
