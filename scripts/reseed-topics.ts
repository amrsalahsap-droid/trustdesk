/**
 * Re-run the SeedingService for one workspace. Use after:
 *   1. scripts/seed-canonical-topics.ts (if new topics were added)
 *   2. scripts/reclassify-chunks.ts (to rebuild SourceChunkTopic coverage)
 *
 * Idempotent: SeedingService uses evidenceFingerprint/contentHash so a
 * second run against the same chunks produces skipped_duplicate for rows
 * that already exist.
 *
 *   tsx scripts/reseed-topics.ts --workspace=<id>
 */
import { SeedingService } from "../src/modules/workspaces/intelligence/seeding-service";

async function main() {
  const arg = process.argv.find((a) => a.startsWith("--workspace="));
  if (!arg) {
    console.error("Usage: tsx scripts/reseed-topics.ts --workspace=<id>");
    process.exit(1);
  }
  const workspaceId = arg.slice("--workspace=".length);
  const result = await SeedingService.runTopicSeeding(workspaceId);
  console.log(
    JSON.stringify({
      event: "reseed-topics.complete",
      workspaceId,
      created: result.created,
      skipped: result.skipped,
    }),
  );
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
