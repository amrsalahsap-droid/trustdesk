import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { buildAuthContext } from "@/lib/auth/build-context";
import { recordAuditEventSafe, AUDIT_EVENT_TYPES, AUDIT_OBJECT_TYPES } from "@/lib/audit";
import { buildGovernanceAuditMetadata, governanceAuditSnapshot } from "@/lib/audit/answer-governance-audit";
import { handleApiError } from "@/lib/api/error-handler";
import { reconcileContradictionsForCanonicalAnswer } from "@/lib/questionnaires/reconcile-questionnaire-item-contradiction";
import { 
  recordAnswerLibraryVersion, 
  itemToVersionSnapshot, 
  VERSION_CHANGE_KIND, 
  evidenceSnapshotJsonValue 
} from "@/lib/knowledge/answer-version-record";

export async function POST(request: Request) {
  try {
    const ctx = await buildAuthContext(request);
    const { workspaceId, userId } = ctx;
    const body = await request.json();
    const { answerIds, action, value } = body;

    if (!Array.isArray(answerIds) || answerIds.length === 0) {
      return NextResponse.json({ error: "Missing or empty answerIds" }, { status: 400 });
    }

    const items = await prisma.answerLibraryItem.findMany({
      where: {
        id: { in: answerIds },
        workspaceId,
      },
    });

    if (items.length === 0) {
      return NextResponse.json({ error: "No matching items found" }, { status: 404 });
    }

    const results = await prisma.$transaction(async (tx) => {
      const updatedItems = [];
      
      for (const item of items) {
        let updateData: any = {
          updatedAt: new Date(),
        };
        let changeReason = "Bulk update";

        switch (action) {
          case "assign_owner":
            updateData.ownerId = value || null;
            changeReason = `Bulk assigned owner to ${value || "none"}`;
            break;
          case "assign_approver":
            updateData.approverId = value || null;
            changeReason = `Bulk assigned approver to ${value || "none"}`;
            break;
          case "approve_internal":
            updateData.governanceStatus = "APPROVED_INTERNAL";
            updateData.approvalScope = "INTERNAL_ONLY";
            updateData.status = "APPROVED";
            updateData.lastVerified = new Date();
            changeReason = "Bulk approved (internal)";
            break;
          case "approve_for_export":
            updateData.governanceStatus = "APPROVED_FOR_EXPORT";
            updateData.approvalScope = "EXPORT_ALLOWED";
            updateData.exportSafe = true;
            updateData.status = "APPROVED";
            updateData.lastVerified = new Date();
            changeReason = "Bulk approved (export)";
            break;
          case "request_revision":
            updateData.governanceStatus = "REVISION_REQUIRED";
            changeReason = "Bulk requested revision";
            break;
          case "mark_for_review":
            updateData.governanceStatus = "IN_REVIEW";
            changeReason = "Bulk marked for review";
            break;
          default:
            throw new Error(`Invalid action: ${action}`);
        }

        const updated = await tx.answerLibraryItem.update({
          where: { id: item.id },
          data: {
            ...updateData,
            currentVersion: { increment: 1 },
          },
          include: {
            topic: true,
            ownerUser: { select: { id: true, name: true } },
            approverUser: { select: { id: true, name: true } },
          },
        });

        // Record version
        await recordAnswerLibraryVersion(tx, {
          workspaceId,
          answerId: updated.id,
          versionNumber: updated.currentVersion,
          changedById: userId,
          changeReason,
          resetApprovalRequired: false,
          changeDiffJson: null,
          evidenceSnapshotJson: evidenceSnapshotJsonValue([]),
          snapshot: itemToVersionSnapshot(updated),
          changeKind: VERSION_CHANGE_KIND.SYSTEM,
        });

        updatedItems.push(updated);
      }
      return updatedItems;
    });

    // Audit log
    for (const item of results) {
      await recordAuditEventSafe({
        workspaceId,
        actorUserId: userId,
        eventType: AUDIT_EVENT_TYPES.ANSWER_LIBRARY_ITEM_UPDATED,
        objectType: AUDIT_OBJECT_TYPES.ANSWER_LIBRARY_ITEM,
        objectId: item.id,
        metadata: {
          title: item.title,
          action,
          ...buildGovernanceAuditMetadata({
            action: "update",
            after: governanceAuditSnapshot(item),
            source: "bulk_api",
          }),
        },
      });
    }

    for (const item of results) {
      await reconcileContradictionsForCanonicalAnswer({
        workspaceId,
        answerId: item.id,
        actorUserId: userId,
      });
    }

    return NextResponse.json({ success: true, count: results.length });
  } catch (error) {
    console.error("api:knowledge:answers:bulk:failed", error);
    return handleApiError(error);
  }
}
