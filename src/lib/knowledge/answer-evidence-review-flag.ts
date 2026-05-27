import { prisma } from "@/lib/db/prisma";
import { recordAuditEventSafe, AUDIT_EVENT_TYPES, AUDIT_OBJECT_TYPES } from "@/lib/audit";
import { buildGovernanceAuditMetadata, governanceAuditSnapshot } from "@/lib/audit/answer-governance-audit";
import {
  buildGovernedFieldDiff,
  evidenceSnapshotJsonValue,
  governanceCompareFromItem,
  itemToVersionSnapshot,
  recordAnswerLibraryVersion,
  sortedEvidenceChunkIds,
  VERSION_CHANGE_KIND,
} from "@/lib/knowledge/answer-version-record";

/**
 * When workspace policy is enabled, moves an approved answer to REVISION_REQUIRED
 * after evidence linkage changes (create/delete).
 */
export async function flagAnswerForEvidenceChangeIfNeeded(params: {
  workspaceId: string;
  answerId: string;
}): Promise<void> {
  const [ws, answer] = await Promise.all([
    prisma.workspace.findUnique({
      where: { id: params.workspaceId },
      select: { flagAnswerOnEvidenceChange: true },
    }),
    prisma.answerLibraryItem.findFirst({
      where: { id: params.answerId, workspaceId: params.workspaceId },
    }),
  ]);

  if (!ws?.flagAnswerOnEvidenceChange || !answer) return;
  const g = answer.governanceStatus;
  if (g !== "APPROVED_INTERNAL" && g !== "APPROVED_FOR_EXPORT") return;

  const outcome = await prisma.$transaction(async (tx) => {
    const fresh = await tx.answerLibraryItem.findFirst({
      where: { id: params.answerId, workspaceId: params.workspaceId },
    });
    if (!fresh) return null;
    if (fresh.governanceStatus !== "APPROVED_INTERNAL" && fresh.governanceStatus !== "APPROVED_FOR_EXPORT") {
      return null;
    }

    const evRows = await tx.answerEvidence.findMany({
      where: { answerId: fresh.id, workspaceId: params.workspaceId },
      select: { chunkId: true, quote: true },
    });
    const beforeSnap = governanceCompareFromItem(fresh, sortedEvidenceChunkIds(evRows));
    const beforeGov = governanceAuditSnapshot(fresh);

    const nextVersion = fresh.currentVersion + 1;
    const now = new Date();
    const updatedItem = await tx.answerLibraryItem.update({
      where: { id: params.answerId, workspaceId: params.workspaceId },
      data: {
        governanceStatus: "REVISION_REQUIRED",
        approvalScope: "INTERNAL_ONLY",
        exportSafe: false,
        status: "DRAFT",
        currentVersion: nextVersion,
        approvedAt: null,
        approvedByUserId: null,
        nextReviewDueAt: null,
        expiresAt: null,
        lastReviewedAt: now,
      },
    });

    const finalDiff = buildGovernedFieldDiff(
      beforeSnap,
      governanceCompareFromItem(updatedItem, sortedEvidenceChunkIds(evRows)),
    );

    await recordAnswerLibraryVersion(tx, {
      workspaceId: params.workspaceId,
      answerId: params.answerId,
      versionNumber: nextVersion,
      changedById: null,
      changeReason: "System: linked evidence changed — review required",
      resetApprovalRequired: true,
      changeDiffJson: finalDiff.length ? finalDiff : null,
      evidenceSnapshotJson: evidenceSnapshotJsonValue(evRows),
      snapshot: itemToVersionSnapshot(updatedItem),
      changeKind: VERSION_CHANGE_KIND.EVIDENCE,
    });

    return {
      nextVersion,
      beforeGov,
      afterGov: governanceAuditSnapshot(updatedItem),
    };
  });

  if (!outcome) return;

  await recordAuditEventSafe({
    workspaceId: params.workspaceId,
    actorUserId: null,
    eventType: AUDIT_EVENT_TYPES.ANSWER_EVIDENCE_CHANGE_FLAGGED,
    objectType: AUDIT_OBJECT_TYPES.ANSWER_LIBRARY_ITEM,
    objectId: params.answerId,
    metadata: {
      source: "evidence_mutation",
      version: outcome.nextVersion,
      ...buildGovernanceAuditMetadata({
        action: "evidence_change_flag",
        before: outcome.beforeGov,
        after: outcome.afterGov,
      }),
    },
  });

  await recordAuditEventSafe({
    workspaceId: params.workspaceId,
    actorUserId: null,
    eventType: AUDIT_EVENT_TYPES.ANSWER_LIBRARY_VERSION_RECORDED,
    objectType: AUDIT_OBJECT_TYPES.ANSWER_LIBRARY_ITEM,
    objectId: params.answerId,
    metadata: {
      ...buildGovernanceAuditMetadata({
        action: "evidence_change_flag",
        version: outcome.nextVersion,
        source: "evidence_review_policy",
        changeReason: "System: linked evidence changed — review required",
        before: outcome.beforeGov,
        after: outcome.afterGov,
      }),
    },
  });
}
