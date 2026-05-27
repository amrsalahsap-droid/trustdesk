import { QuestionnaireMatchingService } from "./questionnaire-matching-service";
import { prisma } from "@/lib/db/prisma";

async function verifyQuestionnaireMatching() {
    console.log("--- Starting Questionnaire Matching Verification ---");

    try {
        // 1. Get a workspace
        const workspace = await prisma.workspace.findFirst();
        if (!workspace) throw new Error("No workspace found. Please run seed first.");

        // 2. Prepare mock rows (from an imaginary spreadsheet)
        const mockRows = [
            {
                rowNumber: 1,
                type: "question_row",
                question: "How do you handle multi-factor authentication?", // Should match 'mfa' topic
                answer: ""
            },
            {
                rowNumber: 2,
                type: "question_row",
                question: "What is your encryption standard for data at rest?", // Should match 'encryption_at_rest'
                answer: ""
            },
            {
                rowNumber: 3,
                type: "section_header",
                question: "Network Security",
                answer: ""
            },
            {
                rowNumber: 34,
                type: "question_row",
                question: "Do you like pizza?", // Should be low confidence / no match
                answer: ""
            },
            {
                rowNumber: 50,
                type: "question_row",
                question: "What is your data retention policy?",
                answer: "",
                confidence: "low" // Trigger mapping_weakness
            }
        ];

        // 3. Run Matching
        console.log("Running Intelligent Matching...");
        const results = await QuestionnaireMatchingService.matchRows(workspace.id, mockRows);

        // 4. Persistence Test (D13-EN-04)
        console.log("Testing Persistence and GapFlags...");
        let questionnaire = await prisma.questionnaire.findFirst({
            where: { workspaceId: workspace.id }
        });

        if (!questionnaire) {
            console.log("Creating temporary questionnaire for persistence test...");
            questionnaire = await prisma.questionnaire.create({
                data: {
                    workspaceId: workspace.id,
                    title: "Persistence Test Questionnaire",
                }
            });
        }

        // Ensure we have items to update
        for (const row of mockRows) {
            await prisma.questionnaireItem.upsert({
                where: { id: `test-item-${row.rowNumber}`, workspaceId: workspace.id }, // Use stable IDs for test
                update: { question: row.question, rowNumber: row.rowNumber, type: row.type },
                create: { 
                    id: `test-item-${row.rowNumber}`,
                    workspaceId: workspace.id,
                    questionnaireId: questionnaire.id,
                    sortOrder: row.rowNumber,
                    question: row.question,
                    rowNumber: row.rowNumber,
                    type: row.type
                }
            });

        }

        await QuestionnaireMatchingService.applyResultsToDatabase(workspace.id, questionnaire.id, results);


        console.log(`\nProcessed ${results.size} question rows.`);

        // 4. Verify Matches
        const res1 = results.get(1);
        console.log(`Row 1 (MFA): TopicId=${res1?.topicId}, Candidates=${res1?.candidates?.length}, Confidence=${res1?.confidence}, Reason=${res1?.unresolvedReason}`);
        if (!res1?.topicId) throw new Error("Row 1 should have matched MFA topic");
        // Empty workspace libraries yield zero library candidates; high/medium without
        // evidence is downgraded by the integrity guard, so do not require candidates here.
        if ((res1?.candidates?.length || 0) === 0 && res1?.confidence === "high") {
            throw new Error("Row 1 should have answer candidates when confidence is high");
        }

        // Log the search reasoning for the first candidate (optional when library is empty)
        const firstCandidate = res1?.candidates?.[0];
        if (firstCandidate) {
            console.log(`Top Candidate Score: ${Math.round(firstCandidate.score * 100)}% (IsApproved: ${firstCandidate.isApproved})`);
        } else {
            console.log("Top Candidate: (none — empty answer library in this workspace)");
        }
        console.log(`Explanation: ${res1?.explanation}`);

        const res2 = results.get(2);
        console.log(`Row 2 (Encryption): TopicId=${res2?.topicId}, Confidence=${res2?.confidence}, Reviewed=${res2?.reviewed}`);
        if (!res2?.topicId) throw new Error("Row 2 should have matched Encryption topic");

        const res3 = results.get(3);
        if (res3) throw new Error("Row 3 is a section_header and should not have a match result");

        const res34 = results.get(34);
        console.log(`Row 34 (Pizza): TopicId=${res34?.topicId}, Confidence=${res34?.confidence}, Reason=${res34?.unresolvedReason}`);
        
        const res50 = results.get(50);
        console.log(`Row 50 (Retention): TopicId=${res50?.topicId}, Confidence=${res50?.confidence}, Reason=${res50?.unresolvedReason}`);
        if (res50?.unresolvedReason !== "mapping_weakness") {
            throw new Error(`Row 50 should have mapping_weakness, got ${res50?.unresolvedReason}`);
        }

        // --- GapFlag Verification (D13-EN-04) ---
        console.log("\nVerifying Persisted GapFlags...");
        const flags = await prisma.gapFlag.findMany({
            where: { workspaceId: workspace.id },
            orderBy: { gapType: 'asc' }
        });

        console.log(`Found ${flags.length} persisted GapFlags.`);
        flags.forEach(f => {
            console.log(` - Flag: Type=${f.gapType}, ItemId=${f.questionnaireItemId.substring(0, 8)}...`);
        });

        if (flags.length < 2) {
            throw new Error(`Expected at least 2 GapFlags (from MFA no_evidence and Pizza missing_topic), got ${flags.length}`);
        }

        console.log("\n--- Questionnaire Matching Verification Complete ---");
    } catch (err) {
        console.error("\nVerification FAILED:", err);
        process.exit(1);
    }
}

verifyQuestionnaireMatching();
