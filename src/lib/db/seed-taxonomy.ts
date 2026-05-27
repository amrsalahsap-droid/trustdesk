// Scripts/seed-taxonomy-runner.ts
import { TopicsService } from "../../modules/knowledge/topics/topics-service";

/**
 * Manual seed runner for the MVP topic taxonomy.
 * Usage: npx tsx src/lib/db/seed-taxonomy.ts
 */
async function main() {
    try {
        console.log("--- Starting MVP Taxonomy Seeding ---");
        const results = await TopicsService.seedGlobalTopics();
        console.log("--- Seeding Complete ---");
        process.exit(0);
    } catch (err) {
        console.error("Critical error during taxonomy seeding:", err);
        process.exit(1);
    }
}

main();
