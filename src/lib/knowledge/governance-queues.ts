import type { Prisma, WorkspaceRole } from "@prisma/client";
import type { AuthContext } from "@/lib/auth/types";
import { Permission } from "@/lib/auth/permissions";
import { isWorkspaceAdmin, isOperatorLike } from "@/lib/auth/governance-actions";
import { prismaWhereForExportSafetyTier, reviewedRowUsesSuggestedLibraryText } from "@/lib/knowledge/answer-export-safety";
import { isEligibleForExportReuse } from "@/lib/knowledge/answer-workflow";
import { prisma } from "@/lib/db/prisma";

export { 
  GOVERNANCE_QUEUE_IDS, 
  type GovernanceQueueId, 
  isGovernanceQueueId, 
  isLibraryCrossTopicGovernanceFilter 
} from "./governance-shared";

function hasPermission(ctx: AuthContext, p: Permission): boolean {
  return ctx.permissions.includes(p);
}

/** Whether the caller may list answers for this queue (server-side gate). */
export function canAccessQueueList(queueId: GovernanceQueueId, ctx: AuthContext): boolean {
  if (!hasPermission(ctx, Permission.VIEW_ANSWERS)) return false;

  if (queueId === "my_owned" || queueId === "my_stale_owned" || queueId === "my_revision_required" || queueId === "my_contributions") {
    return true; // scoped to self in prismaWhere
  }
  if (queueId === "my_approvals" || queueId === "overdue_approvals") {
    // Use permission-based check first, fallback to admin role
    return hasPermission(ctx, Permission.APPROVE_ANSWERS) || isWorkspaceAdmin(ctx.role);
  }
  if (queueId === "drafts_awaiting_approval") {
    return (
      isOperatorLike(ctx.role) ||
      hasPermission(ctx, Permission.ASSIGN_OWNERS) ||
      hasPermission(ctx, Permission.APPROVE_ANSWERS)
    );
  }
  if (
    queueId === "unowned" ||
    queueId === "no_approver" ||
    queueId === "export_blocked" ||
    queueId === "override_canonical_review" ||
    queueId === "operator_library_blockers"
  ) {
    return isOperatorLike(ctx.role) || hasPermission(ctx, Permission.ASSIGN_OWNERS);
  }
  if (queueId === "stale_legacy_lastVerified") {
    return isOperatorLike(ctx.role) || hasPermission(ctx, Permission.ASSIGN_OWNERS);
  }
  if (queueId === "freshness_expired" || queueId === "freshness_due_soon" || queueId === "freshness_needs_review") {
    return true;
  }
  return false;
}

/** Whether counts for this queue should be included for the user (dashboard / bar). */
export function canViewQueueCount(queueId: GovernanceQueueId, ctx: AuthContext): boolean {
  return canAccessQueueList(queueId, ctx);
}

function baseWorkspace(workspaceId: string): Prisma.AnswerLibraryItemWhereInput {
  return { workspaceId, status: { not: "ARCHIVED" } };
}

/**
 * Prisma where for library list/count. Caller must still enforce workspaceId from auth.
 * Personal queues always scope to ctx.userId (admins do not impersonate via this API).
 */
export function prismaWhereForQueue(
  queueId: GovernanceQueueId,
  ctx: AuthContext,
  now: Date = new Date(),
): Prisma.AnswerLibraryItemWhereInput {
  const b = baseWorkspace(ctx.workspaceId);
  const horizon = new Date(now.getTime());
  horizon.setUTCDate(horizon.getUTCDate() + 14);

  switch (queueId) {
    case "my_owned":
      return { ...b, ownerId: ctx.userId };
    case "my_approvals":
      return { ...b, approverId: ctx.userId, governanceStatus: "IN_REVIEW" };
    case "my_stale_owned":
      return {
        ...b,
        ownerId: ctx.userId,
        OR: [
          { governanceStatus: "EXPIRED" },
          {
            governanceStatus: { in: ["APPROVED_INTERNAL", "APPROVED_FOR_EXPORT"] },
            nextReviewDueAt: { not: null, lt: now },
          },
          {
            status: "APPROVED",
            governanceStatus: "DRAFT",
            nextReviewDueAt: { not: null, lt: now },
          },
        ],
      };
    case "my_revision_required":
      return { ...b, ownerId: ctx.userId, governanceStatus: "REVISION_REQUIRED" };
    case "my_contributions":
      return {
        ...b,
        versions: {
          some: {
            changedById: ctx.userId,
          },
        },
      };
    case "overdue_approvals": {
      const sevenDaysAgo = new Date(now.getTime());
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      return {
        ...b,
        governanceStatus: "IN_REVIEW",
        updatedAt: { lt: sevenDaysAgo },
      };
    }
    case "unowned":
      return { ...b, ownerId: null };
    case "no_approver":
      return { ...b, approverId: null };
    case "stale_legacy_lastVerified": {
      const ninetyDaysAgo = new Date(now);
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
      return { ...b, lastVerified: { lt: ninetyDaysAgo } };
    }
    case "freshness_expired":
      return {
        ...b,
        OR: [
          { governanceStatus: "EXPIRED" },
          {
            governanceStatus: { in: ["APPROVED_INTERNAL", "APPROVED_FOR_EXPORT"] },
            nextReviewDueAt: { not: null, lt: now },
          },
          {
            status: "APPROVED",
            governanceStatus: "DRAFT",
            nextReviewDueAt: { not: null, lt: now },
          },
        ],
      };
    case "freshness_due_soon":
      return {
        ...b,
        governanceStatus: { in: ["APPROVED_INTERNAL", "APPROVED_FOR_EXPORT"] },
        nextReviewDueAt: { not: null, gte: now, lte: horizon },
      };
    case "freshness_needs_review":
      return {
        ...b,
        OR: [
          { governanceStatus: { in: ["IN_REVIEW", "REVISION_REQUIRED", "EXPIRED"] } },
          {
            governanceStatus: { in: ["APPROVED_INTERNAL", "APPROVED_FOR_EXPORT"] },
            nextReviewDueAt: { not: null, lt: now },
          },
          {
            status: "APPROVED",
            governanceStatus: "DRAFT",
            nextReviewDueAt: { not: null, lt: now },
          },
        ],
      };
    case "drafts_awaiting_approval":
      return { ...b, governanceStatus: "IN_REVIEW" };
    case "export_blocked":
      return { ...b, ...prismaWhereForExportSafetyTier("restricted") };
    case "override_canonical_review":
      return {
        ...b,
        overrideReasonCategory: { not: null },
        overrideScope: "REQUEST_CANONICAL_UPDATE",
      };
    case "operator_library_blockers":
      return { ...prismaWhereLibraryOperatorBlockers(ctx.workspaceId) };
  }
}

/** Library answers in governance states that typically block automation / handoff clarity. */
export function prismaWhereLibraryOperatorBlockers(
  workspaceId: string,
): Prisma.AnswerLibraryItemWhereInput {
  return {
    workspaceId,
    status: { not: "ARCHIVED" },
    governanceStatus: { in: ["IN_REVIEW", "REVISION_REQUIRED", "EXPIRED"] },
  };
}

/**
 * Reviewed questionnaire rows that still mirror library text but the linked answer is not export-eligible.
 */
export async function countQuestionnaireExportMirrorBlocks(
  workspaceId: string,
  now: Date = new Date(),
): Promise<number> {
  const items = await prisma.questionnaireItem.findMany({
    where: {
      workspaceId,
      type: "question_row",
      reviewed: true,
      suggestedAnswerId: { not: null },
    },
    select: {
      suggestedAnswerId: true,
      finalAnswer: true,
      suggestedAnswer: true,
    },
  });
  const linkedIds = [
    ...new Set(
      items
        .map((i) => i.suggestedAnswerId)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  ];
  if (linkedIds.length === 0) return 0;
  const answers = await prisma.answerLibraryItem.findMany({
    where: { workspaceId, id: { in: linkedIds } },
    select: {
      id: true,
      status: true,
      governanceStatus: true,
      approvalScope: true,
      exportSafe: true,
      nextReviewDueAt: true,
    },
  });
  const elig = new Map(answers.map((a) => [a.id, isEligibleForExportReuse(a, now)]));
  let n = 0;
  for (const row of items) {
    if (!row.suggestedAnswerId) continue;
    if (
      !reviewedRowUsesSuggestedLibraryText({
        finalAnswer: row.finalAnswer,
        suggestedAnswer: row.suggestedAnswer,
      })
    ) {
      continue;
    }
    if (!elig.get(row.suggestedAnswerId)) n += 1;
  }
  return n;
}
