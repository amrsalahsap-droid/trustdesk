/**
 * Bulk promote SEEDED DRAFT AnswerLibraryItems under one topic (and
 * optionally one sub-control) to APPROVED. Uses the same service as the
 * HTTP endpoint so behaviour is identical.
 *
 *   tsx scripts/promote-drafts.ts --workspace=<id> --topic=<key>           # dry-run
 *   tsx scripts/promote-drafts.ts --workspace=<id> --topic=<key> --apply
 *   tsx scripts/promote-drafts.ts --workspace=<id> --topic=<key> --subcontrol=<key> --apply
 *   tsx scripts/promote-drafts.ts --workspace=<id> --topic=<key> --min-confidence=0.5 --max-rows=25 --apply
 *
 * Defaults: dry-run, minConfidence=0.6, maxRows=50.
 */
import { uncheckedPrisma } from "../src/lib/db/prisma";
import { promoteDrafts } from "../src/modules/knowledge/topics/promote-drafts-service";

type Args = {
  workspaceId?: string;
  topicKey?: string;
  subControlKey?: string | null;
  minConfidence?: number;
  maxRows?: number;
  apply: boolean;
};

function parseArgs(argv: string[]): Args {
  const args: Args = { apply: false };
  for (const raw of argv.slice(2)) {
    if (raw.startsWith("--workspace=")) args.workspaceId = raw.slice("--workspace=".length);
    else if (raw.startsWith("--topic=")) args.topicKey = raw.slice("--topic=".length);
    else if (raw.startsWith("--subcontrol=")) args.subControlKey = raw.slice("--subcontrol=".length);
    else if (raw.startsWith("--min-confidence=")) args.minConfidence = Number(raw.slice("--min-confidence=".length));
    else if (raw.startsWith("--max-rows=")) args.maxRows = Number(raw.slice("--max-rows=".length));
    else if (raw === "--apply") args.apply = true;
    else if (raw === "--help" || raw === "-h") {
      console.log(
        "Usage: tsx scripts/promote-drafts.ts --workspace=<id> --topic=<key> [--subcontrol=<key>] [--min-confidence=<0..1>] [--max-rows=<n>] [--apply]",
      );
      process.exit(0);
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.workspaceId || !args.topicKey) {
    console.error("Missing --workspace=<id> or --topic=<key>");
    process.exit(1);
  }

  const result = await promoteDrafts({
    workspaceId: args.workspaceId,
    actorUserId: null,
    topicKey: args.topicKey,
    subControlKey: args.subControlKey ?? null,
    minConfidence: args.minConfidence,
    maxRows: args.maxRows,
    dryRun: !args.apply,
    useUncheckedPrisma: true,
  });

  console.log(
    JSON.stringify({
      event: "promote-drafts.result",
      workspaceId: args.workspaceId,
      topicKey: args.topicKey,
      subControlKey: args.subControlKey ?? null,
      apply: args.apply,
      ...result,
    }),
  );
}

main()
  .then(() => uncheckedPrisma.$disconnect())
  .catch((e) => {
    console.error(e);
    void uncheckedPrisma.$disconnect();
    process.exit(1);
  });
