/**
 * One-shot migration: unify the two representations of "global" KnowledgeTopic
 * rows. Historically two shapes coexist in the DB:
 *
 *   - legacy:    workspaceId = null
 *   - canonical: workspaceId = "SYSTEM_WORKSPACE" (tenant-extension sentinel)
 *
 * Approved answers, questionnaire rows, and source-chunk topic links have
 * fragmented between the two. The matcher warmup only loads the
 * SYSTEM_WORKSPACE set, so references pointing at the null row become
 * effectively unreachable after the warmup fix in Fix 4.
 *
 *   tsx scripts/migrate-global-topics-to-system-workspace.ts            # dry-run
 *   tsx scripts/migrate-global-topics-to-system-workspace.ts --apply
 *
 * Strategy per legacy row (by `key`):
 *   - If a SYSTEM_WORKSPACE sibling exists for the same `key`:
 *       repoint every reference (QuestionnaireItem, AnswerLibraryItem,
 *       SourceChunkTopic, AnswerSeedingTopicRun) from legacy.id to
 *       canonical.id, then delete the legacy row.
 *   - Else: promote the legacy row in place by updating workspaceId.
 *
 * Runs inside a single `uncheckedPrisma.$transaction` so partial failure
 * rolls back. Dry-run prints the exact action plan without writing.
 *
 * Post-condition: COUNT(KnowledgeTopic WHERE workspaceId IS NULL) = 0.
 */

import { uncheckedPrisma } from "../src/lib/db/prisma";

type Args = {
  apply: boolean;
};

function parseArgs(argv: string[]): Args {
  const args: Args = { apply: false };
  for (const raw of argv.slice(2)) {
    if (raw === "--apply") args.apply = true;
    else if (raw === "--dry-run") args.apply = false;
    else if (raw === "--help" || raw === "-h") {
      console.log("Usage: tsx scripts/migrate-global-topics-to-system-workspace.ts [--apply]");
      process.exit(0);
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);

  const legacyRows = await uncheckedPrisma.knowledgeTopic.findMany({
    where: { workspaceId: null },
    select: { id: true, key: true, name: true },
  });

  console.log(
    JSON.stringify({
      event: "topic.migration.plan",
      legacyCount: legacyRows.length,
      apply: args.apply,
    }),
  );

  if (legacyRows.length === 0) {
    console.log(
      JSON.stringify({
        event: "topic.migration.summary",
        repointed: 0,
        promoted: 0,
        deleted: 0,
      }),
    );
    return;
  }

  let repointed = 0;
  let promoted = 0;
  let deleted = 0;

  const run = async (runArgs: { commit: boolean }) => {
    const work = async (tx: typeof uncheckedPrisma) => {
      for (const legacy of legacyRows) {
        const canonical = await tx.knowledgeTopic.findFirst({
          where: { workspaceId: "SYSTEM_WORKSPACE", key: legacy.key },
          select: { id: true, name: true },
        });

        if (canonical) {
          const [qiCount, alCount, sctCount, astCount] = await Promise.all([
            tx.questionnaireItem.count({ where: { topicId: legacy.id } }),
            tx.answerLibraryItem.count({ where: { topicId: legacy.id } }),
            tx.sourceChunkTopic.count({ where: { topicId: legacy.id } }),
            tx.answerSeedingTopicRun.count({ where: { topicId: legacy.id } }),
          ]);

          console.log(
            JSON.stringify({
              event: "topic.migration.repoint",
              legacyId: legacy.id,
              canonicalId: canonical.id,
              key: legacy.key,
              name: legacy.name,
              references: {
                questionnaireItems: qiCount,
                answerLibraryItems: alCount,
                sourceChunkTopics: sctCount,
                answerSeedingTopicRuns: astCount,
              },
              apply: runArgs.commit,
            }),
          );

          if (runArgs.commit) {
            await tx.questionnaireItem.updateMany({
              where: { topicId: legacy.id },
              data: { topicId: canonical.id },
            });
            await tx.answerLibraryItem.updateMany({
              where: { topicId: legacy.id },
              data: { topicId: canonical.id },
            });
            await tx.sourceChunkTopic.updateMany({
              where: { topicId: legacy.id },
              data: { topicId: canonical.id },
            });
            await tx.answerSeedingTopicRun.updateMany({
              where: { topicId: legacy.id },
              data: { topicId: canonical.id },
            });
            await tx.knowledgeTopic.delete({ where: { id: legacy.id } });
            repointed++;
            deleted++;
          }
        } else {
          console.log(
            JSON.stringify({
              event: "topic.migration.promote",
              legacyId: legacy.id,
              key: legacy.key,
              name: legacy.name,
              apply: runArgs.commit,
            }),
          );
          if (runArgs.commit) {
            await tx.knowledgeTopic.update({
              where: { id: legacy.id },
              data: { workspaceId: "SYSTEM_WORKSPACE" },
            });
            promoted++;
          }
        }
      }
    };

    if (runArgs.commit) {
      await uncheckedPrisma.$transaction(async (tx) => work(tx as typeof uncheckedPrisma));
    } else {
      await work(uncheckedPrisma);
    }
  };

  await run({ commit: args.apply });

  console.log(
    JSON.stringify({
      event: "topic.migration.summary",
      repointed,
      promoted,
      deleted,
      apply: args.apply,
    }),
  );

  if (args.apply) {
    const remaining = await uncheckedPrisma.knowledgeTopic.count({ where: { workspaceId: null } });
    console.log(
      JSON.stringify({
        event: "topic.migration.post_invariant",
        remainingNullWorkspaceTopics: remaining,
        ok: remaining === 0,
      }),
    );
  }
}

main()
  .then(() => uncheckedPrisma.$disconnect())
  .catch((err) => {
    console.error(err);
    void uncheckedPrisma.$disconnect();
    process.exit(1);
  });
