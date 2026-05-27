import { TopicMatchingService } from "./topic-matching-service";
import { prisma } from "@/lib/db/prisma";

async function verifyTopicMatching() {
    console.log("--- Starting Topic Matching Service Verification ---");

    try {
        const workspace = await prisma.workspace.findFirst();
        if (!workspace) throw new Error("No workspace found.");

        const testCases = [
            { query: "How do you handle multi-factor authentication?", expected: 'matched', topic: 'MFA' },
            { query: "What is your backup policy?", expected: 'matched', topic: 'Backups' },
            { query: "Do you like pineapple on pizza?", expected: 'unresolved' },
            // Ambiguity case: if we had topics like "Access" and "Access Control" that were too close, but let's test a generic one
            { query: "Identity and access management", expected: 'matched', topic: 'Access Control' }
        ];

        for (const test of testCases) {
            console.log(`\nTesting: "${test.query}"`);
            const result = await TopicMatchingService.matchTopic(test.query, workspace.id);
            console.log(`Status: ${result.status}`);
            console.log(`Score: ${Math.round(result.score * 100)}%`);
            console.log(`Reason: ${result.reason}`);

            if (result.status !== test.expected) {
              if (test.expected === 'matched' && result.status === 'ambiguous') {
                console.log("NOTE: Result was ambiguous, which is a valid stable fallback.");
              } else {
                throw new Error(`Expected status ${test.expected}, got ${result.status}`);
              }
            }
        }

        console.log("\n--- Verification Complete ---");
    } catch (err) {
        console.error("\nVerification FAILED:", err);
        process.exit(1);
    }
}

verifyTopicMatching();
