import { Prisma } from "@prisma/client";

import { prisma, uncheckedPrisma } from "@/lib/db/prisma";
import type { PrismaClient } from "@prisma/client";
import { logger } from "@/lib/logging/logger";
import { computeAnswerEmbedding } from "@/modules/workspaces/intelligence/answer-embedding";
import {
  SUBCONTROLS_BY_TOPIC_KEY,
  getSubControl,
  subControlEmbeddingExtras,
} from "@/modules/knowledge/topics/subcontrol-taxonomy";
import {
  recordAuditEventSafe,
  AUDIT_EVENT_TYPES,
  AUDIT_OBJECT_TYPES,
} from "@/lib/audit";
import { buildGovernanceAuditMetadata } from "@/lib/audit/answer-governance-audit";
import {
  buildGovernedFieldDiff,
  evidenceSnapshotJsonValue,
  governanceCompareFromItem,
  inferChangeKind,
  itemToVersionSnapshot,
  recordAnswerLibraryVersion,
  sortedEvidenceChunkIds,
} from "@/lib/knowledge/answer-version-record";

export interface PromoteDraftsOptions {
  workspaceId: string;
  actorUserId?: string | null;
  topicKey: string;
  subControlKey?: string | null;
  minConfidence?: number;
  dryRun?: boolean;
  maxRows?: number;
  /** When true, use uncheckedPrisma for writes. Only the CLI script passes
   *  this; HTTP callers must stay on the tenant-guarded client. */
  useUncheckedPrisma?: boolean;
}

export interface PromoteDraftsResult {
  requested: number;
  promoted: number;
  skippedBelowConfidence: number;
  skippedMissingEmbeddingRequirements: number;
  dryRun: boolean;
  sample: Array<{ id: string; title: string; subControlKey: string | null }>;
}

/**
 * Bulk promote SEEDED DRAFT AnswerLibraryItems under one topic (optionally
 * scoped to a sub-control) to APPROVED. Refreshes each row's embedding so
 * the matcher sees richer metadata post-promotion, records a version entry
 * with a "bulk promoted" change reason, and emits an audit event per row.
 *
 * Tenant-scoped via the guarded `prisma` client by default. Never writes
 * cross-workspace.
 */
export async function promoteDrafts(opts: PromoteDraftsOptions): Promise<PromoteDraftsResult> {
  const {
    workspaceId,
    actorUserId,
    topicKey,
    subControlKey,
    minConfidence = 0.6,
    dryRun = false,
    maxRows = 50,
    useUncheckedPrisma = false,
  } = opts;

  // Cast to raw PrismaClient so $transaction's callback overload is visible —
  // both the guarded and unchecked clients share the underlying implementation
  // and we always pass explicit workspaceId filters inside the transaction,
  // so tenant scoping stays enforced regardless of which client is used.
  const client = (useUncheckedPrisma ? uncheckedPrisma : prisma) as unknown as PrismaClient;

  if (!SUBCONTROLS_BY_TOPIC_KEY[topicKey]) {
    // Taxonomy-less topics are still promotable (legacy single-answer rows)
    // but we warn so the operator knows what they're looking at.
    logger.info("promote-drafts:no-taxonomy", { workspaceId, topicKey });
  }
  if (subControlKey && !getSubControl(topicKey, subControlKey)) {
    throw new Error(`subControlKey '${subControlKey}' is not a member of taxonomy for topic '${topicKey}'`);
  }

  const topicRow = await uncheckedPrisma.knowledgeTopic.findFirst({
    where: { key: topicKey, workspaceId: { in: [workspaceId, "SYSTEM_WORKSPACE"] } },
    select: { id: true, key: true, name: true, workspaceId: true },
  });
  if (!topicRow) {
    throw new Error(`topic '${topicKey}' not found for workspace ${workspaceId} or SYSTEM_WORKSPACE`);
  }

  const drafts = await (useUncheckedPrisma ? uncheckedPrisma : prisma).answerLibraryItem.findMany({
    where: {
      workspaceId,
      topicId: topicRow.id,
      status: "DRAFT",
      generationScope: "SEEDED",
      ...(subControlKey ? { subControlKey } : {}),
    },
    orderBy: { createdAt: "asc" },
    take: maxRows,
    select: {
      id: true,
      title: true,
      answer: true,
      subControlKey: true,
      subControlLabels: true,
      confidenceScore: true,
      currentVersion: true,
    },
  });

  const sample = drafts.slice(0, 5).map((d) => ({ id: d.id, title: d.title, subControlKey: d.subControlKey }));

  let promoted = 0;
  let skippedBelowConfidence = 0;
  let skippedMissingEmbeddingRequirements = 0;

  if (dryRun) {
    const preview = drafts.filter((d) => (d.confidenceScore ?? 0) >= minConfidence).length;
    return {
      requested: drafts.length,
      promoted: 0,
      skippedBelowConfidence: drafts.length - preview,
      skippedMissingEmbeddingRequirements: 0,
      dryRun: true,
      sample,
    };
  }

  for (const d of drafts) {
    if ((d.confidenceScore ?? 0) < minConfidence) {
      skippedBelowConfidence++;
      continue;
    }

    const subMeta = d.subControlKey ? getSubControl(topicKey, d.subControlKey) : null;
    const embeddingExtras = subMeta
      ? subControlEmbeddingExtras(topicRow.name, subMeta)
      : undefined;
    let nextEmbedding: number[] = [];
    try {
      nextEmbedding = await computeAnswerEmbedding(d.title, d.answer, embeddingExtras);
    } catch (err) {
      logger.warn("promote-drafts:embedding-failed", {
        workspaceId,
        answerId: d.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    try {
      await client.$transaction(async (tx) => {
        const fresh = await tx.answerLibraryItem.findFirst({
          where: { id: d.id, workspaceId },
        });
        if (!fresh) throw new Error("Answer missing during promote");

        const evBefore = await tx.answerEvidence.findMany({
          where: { answerId: d.id, workspaceId },
          select: { chunkId: true, quote: true },
        });
        const beforeSnap = governanceCompareFromItem(fresh, sortedEvidenceChunkIds(evBefore));

        const nextVersion = fresh.currentVersion + 1;
        const updatedItem = await tx.answerLibraryItem.update({
          where: { id: d.id, workspaceId },
          data: {
            status: "APPROVED",
            lastVerified: new Date(),
            currentVersion: nextVersion,
            ...(nextEmbedding.length > 0 ? { embedding: nextEmbedding } : {}),
          },
        });

        const evAfter = await tx.answerEvidence.findMany({
          where: { answerId: d.id, workspaceId },
          select: { chunkId: true, quote: true },
        });
        const finalDiff = buildGovernedFieldDiff(
          beforeSnap,
          governanceCompareFromItem(updatedItem, sortedEvidenceChunkIds(evAfter)),
        );

        await recordAnswerLibraryVersion(tx, {
          workspaceId,
          answerId: d.id,
          versionNumber: nextVersion,
          changedById: actorUserId ?? null,
          changeReason: subControlKey
            ? `Bulk promoted during onboarding review (${topicKey}/${subControlKey}).`
            : `Bulk promoted during onboarding review (${topicKey}).`,
          resetApprovalRequired: false,
          changeDiffJson: finalDiff.length ? finalDiff : null,
          evidenceSnapshotJson: evidenceSnapshotJsonValue(evAfter),
          snapshot: itemToVersionSnapshot(updatedItem),
          changeKind: inferChangeKind({ diff: finalDiff, resetApprovalRequired: false }),
        });
      });
      const nextVersion = d.currentVersion + 1;
      await recordAuditEventSafe({
        workspaceId,
        actorUserId: actorUserId ?? null,
        eventType: AUDIT_EVENT_TYPES.ANSWER_LIBRARY_ITEM_UPDATED,
        objectType: AUDIT_OBJECT_TYPES.ANSWER_LIBRARY_ITEM,
        objectId: d.id,
        metadata: {
          bulkPromote: true,
          topicKey,
          subControlKey: d.subControlKey,
          version: nextVersion,
        },
      });
      await recordAuditEventSafe({
        workspaceId,
        actorUserId: actorUserId ?? null,
        eventType: AUDIT_EVENT_TYPES.ANSWER_LIBRARY_VERSION_RECORDED,
        objectType: AUDIT_OBJECT_TYPES.ANSWER_LIBRARY_ITEM,
        objectId: d.id,
        metadata: {
          ...buildGovernanceAuditMetadata({
            action: "bulk_promote_drafts",
            version: nextVersion,
            source: "promote_drafts",
            changeReason: subControlKey
              ? `Bulk promoted during onboarding review (${topicKey}/${subControlKey}).`
              : `Bulk promoted during onboarding review (${topicKey}).`,
          }),
        },
      });
      promoted++;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        logger.warn("promote-drafts:row-failed", {
          workspaceId,
          answerId: d.id,
          code: err.code,
          message: err.message,
        });
      } else {
        logger.warn("promote-drafts:row-failed", {
          workspaceId,
          answerId: d.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
      skippedMissingEmbeddingRequirements++;
    }
  }

  logger.info("promote-drafts:complete", {
    workspaceId,
    topicKey,
    subControlKey: subControlKey ?? null,
    requested: drafts.length,
    promoted,
    skippedBelowConfidence,
    skippedMissingEmbeddingRequirements,
  });

  return {
    requested: drafts.length,
    promoted,
    skippedBelowConfidence,
    skippedMissingEmbeddingRequirements,
    dryRun: false,
    sample,
  };
}
