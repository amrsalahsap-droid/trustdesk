/**
 * Force a fresh seeding pass against a workspace so sub-control answers
 * land under the canonical topics. Used for end-to-end verification of the
 * subcontrol-coverage-and-synthesis plan.
 *
 *   tsx scratch/reseed-workspace-subcontrols.ts --workspace=<id>
 */
import { SeedingService } from "../src/modules/workspaces/intelligence/seeding-service";

async function main() {
  const arg = process.argv.find((a) => a.startsWith("--workspace="));
  if (!arg) {
    console.error("Usage: tsx scratch/reseed-workspace-subcontrols.ts --workspace=<id>");
    process.exit(1);
  }
  const workspaceId = arg.slice("--workspace=".length);
  const result = await SeedingService.runTopicSeeding(workspaceId);
  console.log(JSON.stringify({ event: "reseed.complete", workspaceId, ...result }));
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
