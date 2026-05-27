/**
 * Read-only sweep: list missing-sub-control hotspots per workspace so the
 * content team knows which focused answers to author next.
 *
 * Groups every persisted QuestionnaireItem whose unresolvedReason is
 * `missing_subcontrol_coverage` by (workspaceId, topicId) and prints:
 *   - workspace id / topic name
 *   - count of asked questions hitting the gap
 *   - sample question snippets
 *   - taxonomy entries that exist for that topic (so the author can see
 *     which sub-controls are still blank in the library)
 *
 *   tsx scratch/diag-missing-subcontrols.ts
 *   tsx scratch/diag-missing-subcontrols.ts --workspace=<id>
 */
import { uncheckedPrisma } from "../src/lib/db/prisma";
import { getSubControls } from "../src/modules/knowledge/topics/subcontrol-taxonomy";

type Args = { workspaceId?: string };

function parseArgs(argv: string[]): Args {
  const args: Args = {};
  for (const raw of argv.slice(2)) {
    if (raw.startsWith("--workspace=")) args.workspaceId = raw.slice("--workspace=".length);
    else if (raw === "--help" || raw === "-h") {
      console.log("Usage: tsx scratch/diag-missing-subcontrols.ts [--workspace=<id>]");
      process.exit(0);
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);

  const items = await uncheckedPrisma.questionnaireItem.findMany({
    where: {
      unresolvedReason: "missing_subcontrol_coverage",
      type: "question_row",
      ...(args.workspaceId ? { workspaceId: args.workspaceId } : {}),
    },
    select: {
      id: true,
      workspaceId: true,
      topicId: true,
      topicName: true,
      question: true,
    },
  });

  if (items.length === 0) {
    console.log(JSON.stringify({ event: "subcontrols.gaps", total: 0 }));
    return;
  }

  // Hydrate topic keys so we can cross-reference the taxonomy.
  const topicIds = Array.from(new Set(items.map((i) => i.topicId).filter(Boolean) as string[]));
  const topics = topicIds.length
    ? await uncheckedPrisma.knowledgeTopic.findMany({
        where: { id: { in: topicIds } },
        select: { id: true, key: true, name: true },
      })
    : [];
  const topicById = new Map(topics.map((t) => [t.id, t]));

  // Group by (workspaceId, topicId).
  const buckets = new Map<
    string,
    {
      workspaceId: string;
      topicId: string | null;
      topicKey: string | null;
      topicName: string | null;
      rowCount: number;
      sampleQuestions: string[];
    }
  >();
  for (const item of items) {
    const key = `${item.workspaceId}::${item.topicId ?? "null"}`;
    const existing = buckets.get(key);
    const topic = item.topicId ? topicById.get(item.topicId) ?? null : null;
    if (existing) {
      existing.rowCount++;
      if (existing.sampleQuestions.length < 3) {
        existing.sampleQuestions.push(item.question.slice(0, 120));
      }
    } else {
      buckets.set(key, {
        workspaceId: item.workspaceId,
        topicId: item.topicId,
        topicKey: topic?.key ?? null,
        topicName: item.topicName ?? topic?.name ?? null,
        rowCount: 1,
        sampleQuestions: [item.question.slice(0, 120)],
      });
    }
  }

  // Load approved sub-controls already authored per (workspace, topic) so we
  // can compute which taxonomy entries are still missing coverage.
  const approved = await uncheckedPrisma.answerLibraryItem.findMany({
    where: {
      status: "APPROVED",
      ...(args.workspaceId ? { workspaceId: args.workspaceId } : {}),
      topicId: { in: topicIds.length ? topicIds : [""] },
    },
    select: { workspaceId: true, topicId: true, subControlKey: true },
  });

  console.log(JSON.stringify({ event: "subcontrols.gaps.summary", total: items.length, buckets: buckets.size }));
  for (const b of Array.from(buckets.values()).sort((a, z) => z.rowCount - a.rowCount)) {
    const taxonomy = b.topicKey ? getSubControls(b.topicKey) : [];
    const coveredKeys = new Set(
      approved
        .filter((a) => a.workspaceId === b.workspaceId && a.topicId === b.topicId && a.subControlKey)
        .map((a) => a.subControlKey as string),
    );
    const missingSubControls = taxonomy.filter((t) => !coveredKeys.has(t.key)).map((t) => t.key);
    const coveredSubControls = taxonomy.filter((t) => coveredKeys.has(t.key)).map((t) => t.key);
    console.log(
      JSON.stringify({
        event: "subcontrols.gaps.bucket",
        workspaceId: b.workspaceId,
        topicId: b.topicId,
        topicKey: b.topicKey,
        topicName: b.topicName,
        rowCount: b.rowCount,
        sampleQuestions: b.sampleQuestions,
        taxonomyEntries: taxonomy.length,
        coveredSubControls,
        missingSubControls,
      }),
    );
  }
}

main()
  .then(() => uncheckedPrisma.$disconnect())
  .catch((e) => {
    console.error(e);
    void uncheckedPrisma.$disconnect();
    process.exit(1);
  });
