import { PrismaClient } from "@prisma/client";
import { QuestionnaireMatchingService } from "../src/modules/workspaces/intelligence/questionnaire-matching-service";
import { EmbeddingService } from "../src/lib/ai/embedding-service";
import { logger } from "../src/lib/logging/logger";

const prisma = new PrismaClient();

async function verifyAuditPersistence() {
    console.log("--- Starting D11-EN-03: Audit Persistence Verification ---");

    try {
        const workspace = await prisma.workspace.findFirst();
        if (!workspace) throw new Error("No workspace found");

        const user = await prisma.user.findFirst();
        if (!user) throw new Error("No user found");

        // 1. Setup Library & Evidence
        const doc = await prisma.sourceDocument.create({
            data: {
                workspaceId: workspace.id,
                uploadedById: user.id,
                fileName: "Security_Policy.pdf",
                originalName: "Security_Policy.pdf",
                mimeType: "application/pdf",
                fileSizeBytes: 1024,
                storageKey: "test-key-" + Date.now(),
                storageBucket: "test-bucket",
                uploadStatus: "UPLOADED"
            }
        });

        const chunk = await prisma.sourceDocumentChunk.create({
            data: {
                workspaceId: workspace.id,
                sourceDocumentId: doc.id,
                chunkIndex: 0,
                content: "All data at rest is encrypted using AES-256. Section 4.2.",
                heading: "Storage Encryption",
            }
        });

        const testQuery = "What is the encryption standard for data? (Structured Evidence Test)";
        const vec = await EmbeddingService.getEmbedding(testQuery);

        const libItem = await prisma.answerLibraryItem.create({
            data: {
                workspaceId: workspace.id,
                title: "Storage Policy",
                answer: "We use AES-256 for storage.",
                status: "APPROVED",
                embedding: vec,
                version: "v1",
                evidence: {
                  create: {
                    chunkId: chunk.id,
                    quote: "All data at rest is encrypted using AES-256."
                  }
                }
            }
        });

        // 2. Setup Questionnaire
        const q = await prisma.questionnaire.create({
            data: {
                workspaceId: workspace.id,
                title: "Evidence Audit Test",
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

        console.log(`Created Questionnaire ${q.id} and Item ${item.id}`);

        // 3. Run Matching & Persistence
        console.log("Running matching and initial persistence...");
        const results = await QuestionnaireMatchingService.matchRows(workspace.id, [{
            rowNumber: 1,
            type: "question_row",
            question: testQuery,
            confidence: "high"
        }]);

        await QuestionnaireMatchingService.applyResultsToDatabase(q.id, results);

        // 4. Verify DB State
        let updatedItem = await prisma.questionnaireItem.findUnique({
            where: { id: item.id }
        });

        if (!updatedItem) throw new Error("Item not found after update");
        
        console.log("\n--- Initial Persistence Check ---");
        console.log(`Suggested ID: ${updatedItem.suggestedAnswerId} (matches ${libItem.id === updatedItem.suggestedAnswerId})`);
        console.log(`Suggested Text: ${updatedItem.suggestedAnswer}`);
        console.log(`Status: ${updatedItem.suggestionStatus}`);
        
        const sources = updatedItem.sourcesJson as any[];
        console.log(`Sources Captured: ${sources.length}`);
        
        if (sources.length > 0) {
            console.log(` - Source 1 Doc: ${sources[0].documentName}`);
            console.log(` - Source 1 Heading: ${sources[0].heading}`);
            console.log(` - Source 1 Quote: ${sources[0].quote}`);
            
            if (sources[0].documentName !== "Security_Policy.pdf") throw new Error("Document name mapping failed!");
            if (sources[0].heading !== "Storage Encryption") throw new Error("Heading mapping failed!");
        } else {
            throw new Error("No evidence sources persisted!");
        }

        if (updatedItem.suggestedAnswerId !== libItem.id) throw new Error("Source linkage failed!");
        if (updatedItem.suggestedAnswer !== libItem.answer) throw new Error("Snapshot failed!");

        // 5. Simulate Library Change
        console.log("\nUpdating library item (simulating growth)...");
        await prisma.answerLibraryItem.update({
            where: { id: libItem.id },
            data: { answer: "UPDATED: We use AES-256 and regular audits." }
        });

        // 6. Verify Snapshot Policy (The row shouldn't change yet)
        updatedItem = await prisma.questionnaireItem.findUnique({ where: { id: item.id } });
        console.log(`Post-Lib-Change Snapshot check: ${updatedItem?.suggestedAnswer === "We use AES-256 for storage." ? "STAYED THE SAME (Correct)" : "CHANGED (Incorrect Snapshot Policy)"}`);

        // 7. Re-run Matching (Updates snapshot)
        console.log("\nRe-running matching to update snapshot...");
        const results2 = await QuestionnaireMatchingService.matchRows(workspace.id, [{
            rowNumber: 1,
            type: "question_row",
            question: testQuery,
            confidence: "high"
        }]);
        await QuestionnaireMatchingService.applyResultsToDatabase(q.id, results2);

        updatedItem = await prisma.questionnaireItem.findUnique({ where: { id: item.id } });
        console.log(`Post-Re-run Snapshot check: ${updatedItem?.suggestedAnswer.includes("UPDATED") ? "UPDATED (Correct)" : "NOT UPDATED (Incorrect Re-run Policy)"}`);

        // CLEANUP
        await prisma.questionnaireItem.delete({ where: { id: item.id } });
        await prisma.questionnaire.delete({ where: { id: q.id } });
        await prisma.answerLibraryItem.delete({ where: { id: libItem.id } });
        await prisma.sourceDocumentChunk.delete({ where: { id: chunk.id } });
        await prisma.sourceDocument.delete({ where: { id: doc.id } });

        console.log("\n--- Evidence Audit Persistence Verification COMPLETE ---");
    } catch (err) {
        console.error("\nVerification FAILED:", err);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

verifyAuditPersistence();
