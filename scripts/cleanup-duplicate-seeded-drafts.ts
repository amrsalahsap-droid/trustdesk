/**
 * One-shot (but idempotent) cleanup for duplicate seeded Answer Library
 * drafts that were inserted before the partial-unique guard introduced
 * by the answer dedupe fingerprint migration.
 *
 *   Usage:
 *     tsx scripts/cleanup-duplicate-seeded-drafts.ts            # dry-run (default)
 *     tsx scripts/cleanup-duplicate-seeded-drafts.ts --apply    # perform the merge
 *     tsx scripts/cleanup-duplicate-seeded-drafts.ts --workspace=<id>
 *
 * Strategy:
 *   1. Backfill `generationScope`, `evidenceFingerprint`, `contentHash`
 *      on every AnswerLibraryItem that still has them NULL / MANUAL.
 *      Scope is promoted to SEEDED iff the row is referenced by an
 *      AnswerSeedingTopicRun; manual creates stay MANUAL.
 *   2. Group non-archived SEEDED rows by
 *      (workspaceId, topicId, evidenceFingerprint, contentHash).
 *   3. For every group of size > 1: pick a canonical row (most evidence
 *      links, then newest updatedAt, then newest id), move evidence /
 *      questionnaire refs to it, archive the losers.
 *
 * Safety:
 *   - Dry-run is the default. `--apply` is required for any writes.
 *   - Evidence moves use updateMany + skipDuplicates-style delete-first
 *     so the partial unique index never trips.
 *   - Version history is left on the loser (we only repoint versions
 *     when doing so does not create a (answerId, versionNumber) clash).
 *   - Re-running is a no-op once groups have collapsed to size 1.
 *   - All merge decisions are logged with before/after ids and counts.
 */

import { PrismaClient } from "@prisma/client";

import { buildSeedDedupeKey } from "../src/modules/workspaces/intelligence/seed-dedupe";

type Args = {
  apply: boolean;
  workspaceId?: string;
};

function parseArgs(argv: string[]): Args {
  const args: Args = { apply: false };
  for (const raw of argv.slice(2)) {
    if (raw === "--apply") args.apply = true;
    else if (raw === "--dry-run") args.apply = false;
    else if (raw.startsWith("--workspace=")) args.workspaceId = raw.slice("--workspace=".length);
    else if (raw === "--help" || raw === "-h") {
      console.log("Usage: tsx scripts/cleanup-duplicate-seeded-drafts.ts [--apply] [--workspace=<id>]");
      process.exit(0);
    }
  }
  return args;
}

type CanonicalCandidate = {
  id: string;
  updatedAt: Date;
  evidenceCount: number;
};

function pickCanonical(candidates: CanonicalCandidate[]): CanonicalCandidate {
  // Richest evidence first, then newest updatedAt, then newest id as tiebreaker.
  return [...candidates].sort((a, b) => {
    if (b.evidenceCount !== a.evidenceCount) return b.evidenceCount - a.evidenceCount;
    const tDelta = b.updatedAt.getTime() - a.updatedAt.getTime();
    if (tDelta !== 0) return tDelta;
    return b.id.localeCompare(a.id);
  })[0];
}

async function backfillFingerprints(prisma: PrismaClient, args: Args): Promise<{ scanned: number; updated: number }> {
  console.log("[backfill] scanning AnswerLibraryItem rows that need fingerprints or scope promotion...");

  const seededAnswerIds = new Set<string>(
    (await prisma.answerSeedingTopicRun.findMany({
      where: args.workspaceId ? { workspaceId: args.workspaceId } : undefined,
      select: { answerLibraryItemId: true },
    }))
      .map((r) => r.answerLibraryItemId)
      .filter((id): id is string => typeof id === "string" && id.length > 0),
  );

  const items = await prisma.answerLibraryItem.findMany({
    where: {
      ...(args.workspaceId ? { workspaceId: args.workspaceId } : {}),
      OR: [
        { evidenceFingerprint: null },
        { contentHash: null },
        // Rows that should be SEEDED but were inserted before the column existed
        // will still have the default MANUAL; upgrade them if a topic run
        // references them.
        { generationScope: "MANUAL", id: { in: Array.from(seededAnswerIds) } },
      ],
    },
    include: {
      evidence: { select: { chunkId: true } },
    },
  });

  let updated = 0;
  for (const item of items) {
    const chunkIds = item.evidence.map((e) => e.chunkId);
    const fingerprint = buildSeedDedupeKey({
      chunkIds,
      title: item.title,
      answer: item.answer,
    });
    const nextScope = seededAnswerIds.has(item.id) ? "SEEDED" : item.generationScope;

    const needsUpdate =
      item.evidenceFingerprint !== fingerprint.evidenceFingerprint ||
      item.contentHash !== fingerprint.contentHash ||
      item.generationScope !== nextScope;

    if (!needsUpdate) continue;

    if (args.apply) {
      await prisma.answerLibraryItem.update({
        where: { id: item.id },
        data: {
          evidenceFingerprint: fingerprint.evidenceFingerprint,
          contentHash: fingerprint.contentHash,
          generationScope: nextScope,
        },
      });
    }
    updated++;
  }

  console.log(
    `[backfill] scanned=${items.length} updated=${updated} mode=${args.apply ? "APPLY" : "DRY-RUN"}`,
  );
  return { scanned: items.length, updated };
}

type DuplicateGroup = {
  workspaceId: string;
  topicId: string;
  evidenceFingerprint: string;
  contentHash: string;
  members: Array<{
    id: string;
    updatedAt: Date;
    evidenceCount: number;
    status: string;
  }>;
};

async function findDuplicateGroups(prisma: PrismaClient, args: Args): Promise<DuplicateGroup[]> {
  const rows = await prisma.answerLibraryItem.findMany({
    where: {
      ...(args.workspaceId ? { workspaceId: args.workspaceId } : {}),
      generationScope: "SEEDED",
      status: { not: "ARCHIVED" },
      evidenceFingerprint: { not: null },
      contentHash: { not: null },
      topicId: { not: null },
    },
    select: {
      id: true,
      workspaceId: true,
      topicId: true,
      evidenceFingerprint: true,
      contentHash: true,
      updatedAt: true,
      status: true,
      _count: { select: { evidence: true } },
    },
  });

  const groups = new Map<string, DuplicateGroup>();
  for (const row of rows) {
    if (!row.topicId || !row.evidenceFingerprint || !row.contentHash) continue;
    const key = `${row.workspaceId}|${row.topicId}|${row.evidenceFingerprint}|${row.contentHash}`;
    const existing = groups.get(key);
    const member = {
      id: row.id,
      updatedAt: row.updatedAt,
      evidenceCount: row._count.evidence,
      status: row.status,
    };
    if (existing) {
      existing.members.push(member);
    } else {
      groups.set(key, {
        workspaceId: row.workspaceId,
        topicId: row.topicId,
        evidenceFingerprint: row.evidenceFingerprint,
        contentHash: row.contentHash,
        members: [member],
      });
    }
  }

  return Array.from(groups.values()).filter((g) => g.members.length > 1);
}

async function mergeGroup(prisma: PrismaClient, group: DuplicateGroup, args: Args): Promise<void> {
  const canonical = pickCanonical(group.members);
  const losers = group.members.filter((m) => m.id !== canonical.id);

  const decision = {
    event: "seed_dedupe_cleanup.merge",
    workspaceId: group.workspaceId,
    topicId: group.topicId,
    evidenceFingerprint: group.evidenceFingerprint,
    contentHash: group.contentHash,
    canonicalId: canonical.id,
    canonicalEvidenceCount: canonical.evidenceCount,
    loserIds: losers.map((l) => l.id),
    loserCount: losers.length,
    mode: args.apply ? "APPLY" : "DRY-RUN",
  };
  console.log(JSON.stringify(decision));

  if (!args.apply) return;

  for (const loser of losers) {
    // 1. Move evidence links to the canonical answer, then drop any that
    //    would collide with the canonical's existing evidence (preserves the
    //    AnswerEvidence (answerId, chunkId) unique index).
    const loserEvidence = await prisma.answerEvidence.findMany({
      where: { answerId: loser.id },
      select: { id: true, chunkId: true },
    });
    const existingChunkIds = new Set(
      (
        await prisma.answerEvidence.findMany({
          where: { answerId: canonical.id },
          select: { chunkId: true },
        })
      ).map((e) => e.chunkId),
    );
    const movable = loserEvidence.filter((e) => !existingChunkIds.has(e.chunkId));
    const droppable = loserEvidence.filter((e) => existingChunkIds.has(e.chunkId));

    if (movable.length > 0) {
      await prisma.answerEvidence.updateMany({
        where: { id: { in: movable.map((e) => e.id) } },
        data: { answerId: canonical.id },
      });
    }
    if (droppable.length > 0) {
      await prisma.answerEvidence.deleteMany({
        where: { id: { in: droppable.map((e) => e.id) } },
      });
    }

    // 2. Repoint questionnaire references at the canonical row so approved
    //    exports keep working.
    await prisma.questionnaireItem.updateMany({
      where: { suggestedAnswerId: loser.id },
      data: { suggestedAnswerId: canonical.id },
    });

    // 3. Move answer versions where the versionNumber does not collide with
    //    canonical's existing history. Colliding versions stay on the loser;
    //    the loser is archived so they remain queryable for audit but hidden.
    const canonicalVersionNumbers = new Set(
      (
        await prisma.answerLibraryItemVersion.findMany({
          where: { answerId: canonical.id },
          select: { versionNumber: true },
        })
      ).map((v) => v.versionNumber),
    );
    const loserVersions = await prisma.answerLibraryItemVersion.findMany({
      where: { answerId: loser.id },
      select: { id: true, versionNumber: true },
    });
    const movableVersions = loserVersions.filter((v) => !canonicalVersionNumbers.has(v.versionNumber));
    if (movableVersions.length > 0) {
      await prisma.answerLibraryItemVersion.updateMany({
        where: { id: { in: movableVersions.map((v) => v.id) } },
        data: { answerId: canonical.id },
      });
    }

    // 4. Archive the loser and append a synthetic version row to the
    //    canonical documenting the merge for audit purposes.
    await prisma.answerLibraryItem.update({
      where: { id: loser.id },
      data: { status: "ARCHIVED" },
    });

    const nextVersionNumber =
      Math.max(0, ...Array.from(canonicalVersionNumbers), ...movableVersions.map((v) => v.versionNumber)) + 1;
    await prisma.answerLibraryItemVersion.create({
      data: {
        workspaceId: group.workspaceId,
        answerId: canonical.id,
        versionNumber: nextVersionNumber,
        status: "DRAFT",
        changeReason: `Merged duplicate seeded draft ${loser.id} via cleanup-duplicate-seeded-drafts`,
      },
    });
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const prisma = new PrismaClient();

  console.log(
    `[cleanup] start mode=${args.apply ? "APPLY" : "DRY-RUN"} workspace=${args.workspaceId ?? "<all>"}`,
  );

  try {
    await backfillFingerprints(prisma, args);

    const groups = await findDuplicateGroups(prisma, args);
    console.log(`[cleanup] duplicate-groups=${groups.length}`);

    for (const group of groups) {
      try {
        await mergeGroup(prisma, group, args);
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        console.error(
          JSON.stringify({
            event: "seed_dedupe_cleanup.skip",
            reason: "merge_failed",
            error,
            workspaceId: group.workspaceId,
            topicId: group.topicId,
            members: group.members.map((m) => m.id),
          }),
        );
      }
    }

    console.log(`[cleanup] done mode=${args.apply ? "APPLY" : "DRY-RUN"}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("[cleanup] fatal", err);
  process.exit(1);
});
