import { PrismaClient } from "@prisma/client";
import { QuestionnaireMatchingService } from "../src/modules/workspaces/intelligence/questionnaire-matching-service";
import { EmbeddingService } from "../src/lib/ai/embedding-service";
import { logger } from "../src/lib/logging/logger";

const prisma = new PrismaClient();

async function verifyMatchPolicy() {
    console.log("--- Starting D11-EN-02: Match Policy Verification ---");

    try {
        const workspace = await prisma.workspace.findFirst();
        if (!workspace) throw new Error("No workspace found");

        const topic = await prisma.knowledgeTopic.findFirst({
            where: { OR: [{ workspaceId: workspace.id }, { workspaceId: null }] }
        });
        if (!topic) throw new Error("No topic found for testing");

        console.log(`Using Workspace: ${workspace.id}, Topic: ${topic.name}`);

        const testQuery = "What is your policy for remote access VPN?";
        const vec = await EmbeddingService.getEmbedding(testQuery);

        // 1. Create a DRAFT item (High Similarity)
        // We'll use the exact text to ensure very high similarity
        const draftItem = await prisma.answerLibraryItem.create({
            data: {
                workspaceId: workspace.id,
                topicId: topic.id,
                title: "Remote Access VPN Policy (DRAFT)",
                answer: "This is a DRAFT answer for VPN. Not yet verified.",
                status: "DRAFT",
                embedding: vec, // Exact match
                version: "v1"
            }
        });

        // 2. Create an APPROVED item (Lower Similarity but still relevant)
        // We'll use slightly different text for lower score
        const approvedVec = await EmbeddingService.getEmbedding("VPN access and remote work standards");
        const approvedItem = await prisma.answerLibraryItem.create({
            data: {
                workspaceId: workspace.id,
                topicId: topic.id,
                title: "Remote Work Standards (APPROVED)",
                answer: "This is the APPROVED answer for remote connectivity.",
                status: "APPROVED",
                embedding: approvedVec,
                version: "v1"
            }
        });

        console.log("Mock data created. Running matching...");

        // 3. Run Matching
        const mockRows = [
            {
                rowNumber: 101,
                type: "question_row",
                question: testQuery,
                confidence: "high"
            }
        ];

        const results = await QuestionnaireMatchingService.matchRows(workspace.id, mockRows);
        const match = results.get(101);

        if (!match) throw new Error("Matching failed to return any result");

        console.log("\n--- Results Analysis ---");
        console.log(`Question: ${testQuery}`);
        console.log(`Suggested Answer ID: ${match.suggestedAnswerId}`);
        console.log(`Suggested Answer Text: ${match.suggestedAnswer}`);
        console.log(`Confidence: ${match.confidence}`);
        console.log(`Suggestion Status: ${match.suggestionStatus}`);
        console.log(`Reviewed (Auto-Review): ${match.reviewed}`);

        // VERIFICATION LOGIC
        if (match.suggestedAnswerId === draftItem.id) {
            throw new Error("FAIL: System quietly used a DRAFT answer!");
        }

        if (match.suggestedAnswerId !== approvedItem.id) {
            console.log("Note: It didn't pick the approved item either. Checking scores...");
            match.candidates.forEach(c => {
                console.log(` - Candidate ${c.id.slice(0, 8)} (${c.isApproved ? 'Approved' : 'Draft'}): ${Math.round(c.score * 100)}%`);
            });
            
            if (match.suggestedAnswerId === null && match.suggestionStatus === "Draft candidate available") {
                 console.log("SUCCESS: System correctly identified a Draft candidate but refused to auto-fill.");
            } else if (match.suggestedAnswerId === null) {
                 throw new Error("FAIL: System failed to suggest anything even though an APPROVED match exists.");
            }
        } else {
            console.log("SUCCESS: System bypassed the better DRAFT match to use the best APPROVED match.");
        }

        // Cleanup
        await prisma.answerLibraryItem.deleteMany({
            where: { id: { in: [draftItem.id, approvedItem.id] } }
        });

        console.log("\n--- Verification Complete ---");
    } catch (err) {
        console.error("\nVerification FAILED:", err);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

verifyMatchPolicy();
