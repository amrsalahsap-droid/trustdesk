/**
 * Idempotent: run after adding entries to MVP_TOPICS so the new canonical
 * KnowledgeTopic rows land in the SYSTEM_WORKSPACE partition and become
 * available to every workspace via the warmup merge in matchRows.
 *
 *   tsx scripts/seed-canonical-topics.ts
 */
import { TopicsService } from "../src/modules/knowledge/topics/topics-service";

async function main() {
  const results = await TopicsService.seedGlobalTopics();
  console.log(
    JSON.stringify({
      event: "seed-canonical-topics.complete",
      count: results.length,
      topics: results.map((t) => ({ id: t.id, key: t.key, name: t.name })),
    }),
  );
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
