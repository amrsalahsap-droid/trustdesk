import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { buildAuthContext } from "@/lib/auth/build-context";
import { handleApiError } from "@/lib/api/error-handler";
import { Permission } from "@/lib/auth/permissions";
import { isOperatorLike } from "@/lib/auth/governance-actions";
import type { AuthContext } from "@/lib/auth/types";
import {
  canViewQueueCount,
  countQuestionnaireExportMirrorBlocks,
  prismaWhereForQueue,
} from "@/lib/knowledge/governance-queues";
import { GOVERNANCE_QUEUE_IDS, type GovernanceQueueId } from "@/lib/knowledge/governance-shared";

async function gatedCount(ctx: AuthContext, queueId: GovernanceQueueId, now: Date): Promise<number> {
  if (!ctx.permissions.includes(Permission.VIEW_ANSWERS)) return 0;
  if (!canViewQueueCount(queueId, ctx)) return 0;
  return prisma.answerLibraryItem.count({ where: prismaWhereForQueue(queueId, ctx, now) });
}

/**
 * Lightweight counts for library governance / freshness queue bars and governance hub.
 */
export async function GET(request: Request) {
  try {
    const ctx = await buildAuthContext(request);
    const now = new Date();

    if (!ctx.permissions.includes(Permission.VIEW_ANSWERS)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const countPromises = GOVERNANCE_QUEUE_IDS.map((id) => gatedCount(ctx, id, now));
    const [
      my_owned,
      my_approvals,
      my_stale_owned,
      my_revision_required,
      my_contributions,
      overdue_approvals,
      unowned,
      no_approver,
      stale_legacy_lastVerified,
      freshness_expired,
      freshness_due_soon,
      freshness_needs_review,
      drafts_awaiting_approval,
      export_blocked,
      override_canonical_review,
      operator_library_blockers,
    ] = await Promise.all(countPromises);

    // Operator-like access: admin/operator role OR explicit permission
    const canOp = isOperatorLike(ctx.role) || ctx.permissions.includes(Permission.ASSIGN_OWNERS);

    const [
      pendingInvites,
      recentAuditEvents,
      answersNeedingEvidence,
      blockedExports,
    ] = await Promise.all([
      prisma.workspaceInvitation.count({
        where: { workspaceId: ctx.workspaceId, status: "PENDING" },
      }),
      prisma.auditEvent.count({
        where: { 
          workspaceId: ctx.workspaceId, 
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } 
        },
      }),
      prisma.answerLibraryItem.count({
        where: {
          workspaceId: ctx.workspaceId,
          evidenceRequired: true,
          evidence: { none: {} },
          status: { not: "ARCHIVED" },
        },
      }),
      prisma.exportJob.count({
        where: { workspaceId: ctx.workspaceId, status: "failed" },
      }),
    ]);

    const operatorQuestionnaireExportMirrorBlocks = canOp
      ? await countQuestionnaireExportMirrorBlocks(ctx.workspaceId, now)
      : 0;

    const my_assignments = await prisma.questionnaireItem.count({
      where: {
        workspaceId: ctx.workspaceId,
        assigneeId: ctx.userId,
        reviewed: false,
      },
    });

    return NextResponse.json({
      my_owned,
      my_approvals,
      my_assignments,
      pendingInvites,
      recentAuditEvents,
      answersNeedingEvidence,
      blockedExports,
      my_stale_owned,
      my_revision_required,
      my_contributions,
      overdue_approvals,
      unowned,
      no_approver,
      stale_legacy_lastVerified,
      freshness: {
        expired: freshness_expired,
        due_soon: freshness_due_soon,
        needs_review: freshness_needs_review,
      },
      drafts_awaiting_approval,
      export_blocked,
      override_canonical_review,
      operatorLibraryBlockers: operator_library_blockers,
      operatorQuestionnaireExportMirrorBlocks,
    });
  } catch (error) {
    console.error("api:knowledge:answers:governance-counts:failed", error);
    return handleApiError(error);
  }
}
