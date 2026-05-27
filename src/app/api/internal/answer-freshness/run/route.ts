import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { recordAuditEventSafe, AUDIT_OBJECT_TYPES } from "@/lib/audit";
import { AUDIT_EVENT_TYPES } from "@/lib/audit/audit-event-types";
import {
  buildGovernanceAuditMetadata,
  governanceAuditSnapshot,
  type GovernanceAuditFlat,
} from "@/lib/audit/answer-governance-audit";
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
 * Secured batch job: mark approved answers whose nextReviewDueAt has passed
 * as EXPIRED and downgrade export flags. Call with Authorization: Bearer $CRON_SECRET.
 */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 8) {
    return NextResponse.json(
      { error: { code: "NOT_CONFIGURED", message: "Set CRON_SECRET in the environment" } },
      { status: 503 },
    );
  }
  const auth = request.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Invalid cron secret" } }, { status: 401 });
  }

  const now = new Date();
  const candidates = await prisma.answerLibraryItem.findMany({
    where: {
      governanceStatus: { in: ["APPROVED_INTERNAL", "APPROVED_FOR_EXPORT"] },
      nextReviewDueAt: { not: null, lt: now },
      status: { not: "ARCHIVED" },
    },
    select: { id: true, workspaceId: true },
  });

  let updated = 0;
  for (const row of candidates) {
    try {
      const auditInfo = await prisma.$transaction(async (tx) => {
        const fresh = await tx.answerLibraryItem.findFirst({
          where: { id: row.id, workspaceId: row.workspaceId },
        });
        if (!fresh) return null;
        if (fresh.governanceStatus !== "APPROVED_INTERNAL" && fresh.governanceStatus !== "APPROVED_FOR_EXPORT") {
          return null;
        }
        if (!fresh.nextReviewDueAt || fresh.nextReviewDueAt >= now) return null;

        const beforeGov: GovernanceAuditFlat = governanceAuditSnapshot({
          governanceStatus: fresh.governanceStatus,
          approvalScope: fresh.approvalScope,
          exportSafe: fresh.exportSafe,
          status: fresh.status,
          nextReviewDueAt: fresh.nextReviewDueAt,
          reviewCadenceDays: fresh.reviewCadenceDays,
          ownerId: fresh.ownerId,
          approverId: fresh.approverId,
        });

        const evRows = await tx.answerEvidence.findMany({
          where: { answerId: fresh.id, workspaceId: row.workspaceId },
          select: { chunkId: true, quote: true },
        });
        const beforeIds = sortedEvidenceChunkIds(evRows);
        const beforeSnap = governanceCompareFromItem(fresh, beforeIds);

        const nextVersion = fresh.currentVersion + 1;
        const updatedItem = await tx.answerLibraryItem.update({
          where: { id: row.id, workspaceId: row.workspaceId },
          data: {
            governanceStatus: "EXPIRED",
            approvalScope: "INTERNAL_ONLY",
            exportSafe: false,
            expiresAt: now,
            currentVersion: nextVersion,
          },
        });

        const finalDiff = buildGovernedFieldDiff(
          beforeSnap,
          governanceCompareFromItem(updatedItem, beforeIds),
        );

        await recordAnswerLibraryVersion(tx, {
          workspaceId: row.workspaceId,
          answerId: row.id,
          versionNumber: nextVersion,
          changedById: null,
          changeReason: "System: review cadence lapsed",
          resetApprovalRequired: false,
          changeDiffJson: finalDiff.length ? finalDiff : null,
          evidenceSnapshotJson: evidenceSnapshotJsonValue(evRows),
          snapshot: itemToVersionSnapshot(updatedItem),
          changeKind: VERSION_CHANGE_KIND.SYSTEM,
        });

        const afterGov: GovernanceAuditFlat = governanceAuditSnapshot({
          governanceStatus: updatedItem.governanceStatus,
          approvalScope: updatedItem.approvalScope,
          exportSafe: updatedItem.exportSafe,
          status: updatedItem.status,
          nextReviewDueAt: updatedItem.nextReviewDueAt,
          reviewCadenceDays: updatedItem.reviewCadenceDays,
          ownerId: updatedItem.ownerId,
          approverId: updatedItem.approverId,
        });

        return { beforeGov, afterGov, nextVersion };
      });

      if (!auditInfo) continue;

      await recordAuditEventSafe({
        workspaceId: row.workspaceId,
        actorUserId: null,
        eventType: AUDIT_EVENT_TYPES.ANSWER_REVIEW_CADENCE_LAPSED,
        objectType: AUDIT_OBJECT_TYPES.ANSWER_LIBRARY_ITEM,
        objectId: row.id,
        metadata: {
          ...buildGovernanceAuditMetadata({
            action: "review_due_passed",
            source: "cron",
            changeReason: "System: review cadence lapsed (governance EXPIRED)",
            before: auditInfo.beforeGov,
            after: auditInfo.afterGov,
          }),
          transitionedAt: now.toISOString(),
        },
      });

      await recordAuditEventSafe({
        workspaceId: row.workspaceId,
        actorUserId: null,
        eventType: AUDIT_EVENT_TYPES.ANSWER_LIBRARY_VERSION_RECORDED,
        objectType: AUDIT_OBJECT_TYPES.ANSWER_LIBRARY_ITEM,
        objectId: row.id,
        metadata: {
          ...buildGovernanceAuditMetadata({
            action: "review_due_passed",
            version: auditInfo.nextVersion,
            source: "cron",
            changeReason: "System: review cadence lapsed",
          }),
        },
      });
      updated += 1;
    } catch {
      /* continue other rows */
    }
  }

  return NextResponse.json({ updated, scanned: candidates.length });
}
