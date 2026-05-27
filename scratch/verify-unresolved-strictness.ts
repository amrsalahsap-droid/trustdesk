import { PrismaClient } from "@prisma/client";
import { QuestionnaireMatchingService } from "../src/modules/workspaces/intelligence/questionnaire-matching-service";
import { EmbeddingService } from "../src/lib/ai/embedding-service";

const prisma = new PrismaClient();

async function verifyUnresolvedStrictness() {
    console.log("--- Starting D11-EN-05: Unresolved Strictness Verification ---");

    try {
        const workspace = await prisma.workspace.findFirst();
        if (!workspace) throw new Error("No workspace found");

        const user = await prisma.user.findFirst();
        if (!user) throw new Error("No user found");

        // 1. Setup Perfect DRAFT Match
        const testQuery = "Explicit Strictness Test: VPN configuration policy.";
        const vec = await EmbeddingService.getEmbedding(testQuery);

        const draftItem = await prisma.answerLibraryItem.create({
            data: {
                workspaceId: workspace.id,
                title: "VPN Policy (DRAFT)",
                answer: "This is a perfect semantic match but it is a DRAFT.",
                status: "DRAFT",
                embedding: vec, // 100% Match
                version: "v1"
            }
        });

        // 2. Setup Questionnaire
        const q = await prisma.questionnaire.create({
            data: {
                workspaceId: workspace.id,
                title: "Strictness Test Questionnaire",
                createdById: user.id
            }
        });

        const item = await prisma.questionnaireItem.create({
            data: {
                questionnaireId: q.id,
                sortOrder: 1,
                rowNumber: 1,
                question: testQuery,
                type: "question_row",
            }
        });

        console.log(`Created Draft Item ${draftItem.id} and Item ${item.id}`);

        // 3. Run Matching
        console.log("Running matching...");
        const results = await QuestionnaireMatchingService.matchRows(workspace.id, [{
            rowNumber: 1,
            type: "question_row",
            question: testQuery,
            confidence: "high"
        }]);

        await QuestionnaireMatchingService.applyResultsToDatabase(q.id, results);

        // 4. Verification Check
        let updatedItem = await prisma.questionnaireItem.findUnique({
            where: { id: item.id }
        });

        if (!updatedItem) throw new Error("Item not found after update");

        console.log("\n--- Verification Results ---");
        console.log(`Review Status (DB): ${updatedItem.reviewStatus}`);
        console.log(`Suggested Answer: ${updatedItem.suggestedAnswer}`);
        console.log(`Suggestion Status: ${updatedItem.suggestionStatus}`);

        // ASSERTIONS
        if (updatedItem.reviewStatus !== "unresolved") {
            throw new Error(`FAIL: Row should be 'unresolved' but is '${updatedItem.reviewStatus}'`);
        }
        if (updatedItem.suggestedAnswer !== null && updatedItem.suggestedAnswer !== "") {
            throw new Error(`FAIL: Suggested Answer leaked. Got: ${updatedItem.suggestedAnswer}`);
        }
        if (updatedItem.suggestionStatus !== "Draft candidate available") {
            throw new Error(`FAIL: Incorrect suggestion status. Got: ${updatedItem.suggestionStatus}`);
        }

        console.log("\nSUCCESS: Strictness policy enforced! High-confidence Draft did not leak into suggestedAnswer.");

        // CLEANUP
        await prisma.questionnaireItem.delete({ where: { id: item.id } });
        await prisma.questionnaire.delete({ where: { id: q.id } });
        await prisma.answerLibraryItem.delete({ where: { id: draftItem.id } });

        console.log("\n--- Verification COMPLETE ---");
    } catch (err) {
        console.error("\nVerification FAILED:", err);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

verifyUnresolvedStrictness();
