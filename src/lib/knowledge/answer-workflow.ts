import type {
  AnswerApprovalScope,
  AnswerGovernanceStatus,
  AnswerLibraryItem,
  AnswerStatus,
  WorkspaceRole,
} from "@prisma/client";
import { Permission } from "@/lib/auth/permissions";
import { isWorkspaceAdmin } from "@/lib/auth/governance-actions";
import { AUDIT_EVENT_TYPES } from "@/lib/audit/audit-event-types";
import { computeNextReviewDueAt, isPastDue } from "@/lib/knowledge/answer-freshness";

export const WORKFLOW_ACTIONS = [
  "submitForApproval",
  "approveInternal",
  "approveForExport",
  "confirmExportSafe",
  "revokeExportSafe",
  "requestRevision",
  "reject",
] as const;

export type WorkflowAction = (typeof WORKFLOW_ACTIONS)[number];

export type WorkflowTransitionResult = {
  governanceStatus: AnswerGovernanceStatus;
  approvalScope: AnswerApprovalScope;
  exportSafe: boolean;
  status: AnswerStatus;
  lastReviewedAt: Date;
  approvedAt: Date | null;
  approvedByUserId: string | null;
  nextReviewDueAt: Date | null;
  expiresAt: Date | null;
  /** Omitted = leave DB unchanged; null = clear; Date = set */
  lastVerified?: Date | null;
  changeReasonSummary: string;
  auditEventType: (typeof AUDIT_EVENT_TYPES)[keyof typeof AUDIT_EVENT_TYPES];
};

export type WorkflowCadenceContext = {
  resolvedCadenceDays: number;
};

export function isEligibleForInternalReuse(item: {
  status: AnswerStatus;
  governanceStatus: AnswerGovernanceStatus;
}): boolean {
  if (item.status === "ARCHIVED") return false;
  if (item.governanceStatus === "APPROVED_INTERNAL" || item.governanceStatus === "APPROVED_FOR_EXPORT") {
    return true;
  }
  if (item.governanceStatus === "EXPIRED" && item.status === "APPROVED") {
    return true;
  }
  // Legacy: approved before governance rollout
  return item.status === "APPROVED" && item.governanceStatus === "DRAFT";
}

export function isEligibleForExportReuse(item: {
  status: AnswerStatus;
  governanceStatus: AnswerGovernanceStatus;
  approvalScope: AnswerApprovalScope;
  exportSafe: boolean;
  nextReviewDueAt?: Date | null;
}, now: Date = new Date()): boolean {
  if (item.status === "ARCHIVED") return false;
  if (item.governanceStatus === "EXPIRED") return false;
  const base =
    item.governanceStatus === "APPROVED_FOR_EXPORT" &&
    item.approvalScope === "EXPORT_ALLOWED" &&
    item.exportSafe === true;
  if (!base) return false;
  if (isPastDue(now, item.nextReviewDueAt)) return false;
  return true;
}

export type WorkflowAuthInput = {
  userId: string;
  role: WorkspaceRole;
  permissions: Permission[];
};

export type WorkflowAnswerSnapshot = Pick<
  AnswerLibraryItem,
  | "governanceStatus"
  | "status"
  | "ownerId"
  | "approverId"
  | "workspaceId"
  | "approvalScope"
  | "exportSafe"
  | "lastReviewedAt"
  | "approvedAt"
  | "approvedByUserId"
  | "nextReviewDueAt"
  | "expiresAt"
>;

export type WorkflowWorkspacePolicy = {
  allowOwnerSelfApprove: boolean;
  /** Default true: approveForExport leaves exportSafe false until confirmExportSafe. */
  requireApproverExportSafeConfirmation?: boolean;
};

function hasPermission(perms: Permission[], p: Permission): boolean {
  return perms.includes(p);
}

export class WorkflowValidationError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "WorkflowValidationError";
    this.code = code;
  }
}

function assertApproverOrAdmin(
  ctx: WorkflowAuthInput,
  answer: WorkflowAnswerSnapshot,
  _workspace: WorkflowWorkspacePolicy,
  actionLabel: string,
  options?: { allowRequireRevision?: boolean },
): void {
  if (isWorkspaceAdmin(ctx.role)) return;
  const canApprove = hasPermission(ctx.permissions, Permission.APPROVE_ANSWERS);
  const canRequireRevisionOnly =
    options?.allowRequireRevision === true && hasPermission(ctx.permissions, Permission.REQUIRE_REVISION);
  if (!canApprove && !canRequireRevisionOnly) {
    throw new WorkflowValidationError("FORBIDDEN", `Missing permission to ${actionLabel}`);
  }
  if (!answer.approverId || answer.approverId !== ctx.userId) {
    throw new WorkflowValidationError("NOT_ASSIGNED_APPROVER", "Only the designated approver or an admin can perform this action");
  }
}

function assertOwnerOrAdmin(ctx: WorkflowAuthInput, answer: WorkflowAnswerSnapshot): void {
  if (isWorkspaceAdmin(ctx.role)) return;
  if (
    !hasPermission(ctx.permissions, Permission.SUBMIT_FOR_APPROVAL) &&
    !hasPermission(ctx.permissions, Permission.EDIT_ANSWERS)
  ) {
    throw new WorkflowValidationError("FORBIDDEN", "Missing permission to submit for approval");
  }
  if (!answer.ownerId || answer.ownerId !== ctx.userId) {
    throw new WorkflowValidationError("NOT_OWNER", "Only the answer owner or an admin can submit for approval");
  }
}

function assertNotSelfApproveWhenDisallowed(
  ctx: WorkflowAuthInput,
  answer: WorkflowAnswerSnapshot,
  workspace: WorkflowWorkspacePolicy,
): void {
  if (!answer.ownerId || answer.ownerId !== ctx.userId) return;
  if (isWorkspaceAdmin(ctx.role)) return;
  if (workspace.allowOwnerSelfApprove) return;
  throw new WorkflowValidationError("SELF_APPROVE_NOT_ALLOWED", "Owners cannot approve their own answers unless workspace policy allows it");
}

/**
 * Validates action and returns the next persisted fields (excluding embedding/version bump — handled in route).
 */
export function applyWorkflowAction(
  action: WorkflowAction,
  answer: WorkflowAnswerSnapshot,
  ctx: WorkflowAuthInput,
  workspace: WorkflowWorkspacePolicy,
  comment?: string | null,
  cadence?: WorkflowCadenceContext | null,
): WorkflowTransitionResult {
  const gov = answer.governanceStatus;
  const trimmedComment = typeof comment === "string" ? comment.trim() : "";
  const commentSuffix = trimmedComment ? ` | comment:${trimmedComment.slice(0, 500)}` : "";
  const cadenceDays = cadence?.resolvedCadenceDays ?? 90;

  switch (action) {
    case "submitForApproval": {
      if (gov !== "DRAFT" && gov !== "REVISION_REQUIRED" && gov !== "EXPIRED") {
        throw new WorkflowValidationError(
          "INVALID_STATE",
          "Can only submit for review from Draft, Revision required, or Expired (renewal)",
        );
      }
      assertOwnerOrAdmin(ctx, answer);
      if (!answer.approverId && !isWorkspaceAdmin(ctx.role)) {
        throw new WorkflowValidationError("NO_APPROVER", "Assign an approver before submitting for review");
      }
      return {
        governanceStatus: "IN_REVIEW",
        approvalScope: "INTERNAL_ONLY",
        exportSafe: false,
        status: "DRAFT",
        lastReviewedAt: new Date(),
        approvedAt: null,
        approvedByUserId: null,
        nextReviewDueAt: null,
        expiresAt: null,
        changeReasonSummary: `Workflow:submitForApproval${commentSuffix}`,
        auditEventType: AUDIT_EVENT_TYPES.ANSWER_SUBMITTED_FOR_REVIEW,
      };
    }
    case "approveInternal": {
      if (gov !== "IN_REVIEW") {
        throw new WorkflowValidationError("INVALID_STATE", "Can only approve internal from In review");
      }
      assertApproverOrAdmin(ctx, answer, workspace, "approve for internal reuse");
      assertNotSelfApproveWhenDisallowed(ctx, answer, workspace);
      const now = new Date();
      const nextReviewDueAt = computeNextReviewDueAt(now, cadenceDays);
      return {
        governanceStatus: "APPROVED_INTERNAL",
        approvalScope: "INTERNAL_ONLY",
        exportSafe: false,
        status: "APPROVED",
        lastReviewedAt: now,
        approvedAt: now,
        approvedByUserId: ctx.userId,
        nextReviewDueAt,
        expiresAt: null,
        lastVerified: now,
        changeReasonSummary: `Workflow:approveInternal${commentSuffix}`,
        auditEventType: AUDIT_EVENT_TYPES.ANSWER_APPROVED_INTERNAL,
      };
    }
    case "approveForExport": {
      if (gov !== "IN_REVIEW") {
        throw new WorkflowValidationError("INVALID_STATE", "Can only approve for export from In review");
      }
      assertApproverOrAdmin(ctx, answer, workspace, "approve for export");
      assertNotSelfApproveWhenDisallowed(ctx, answer, workspace);
      const now = new Date();
      const nextReviewDueAt = computeNextReviewDueAt(now, cadenceDays);
      const requireExplicit = workspace.requireApproverExportSafeConfirmation !== false;
      return {
        governanceStatus: "APPROVED_FOR_EXPORT",
        approvalScope: "EXPORT_ALLOWED",
        exportSafe: requireExplicit ? false : true,
        status: "APPROVED",
        lastReviewedAt: now,
        approvedAt: now,
        approvedByUserId: ctx.userId,
        nextReviewDueAt,
        expiresAt: null,
        lastVerified: now,
        changeReasonSummary: `Workflow:approveForExport${commentSuffix}`,
        auditEventType: AUDIT_EVENT_TYPES.ANSWER_APPROVED_FOR_EXPORT,
      };
    }
    case "confirmExportSafe": {
      if (gov !== "APPROVED_FOR_EXPORT" || answer.approvalScope !== "EXPORT_ALLOWED") {
        throw new WorkflowValidationError(
          "INVALID_STATE",
          "Can only confirm export-safe on answers approved for export (export path)",
        );
      }
      if (answer.exportSafe === true) {
        throw new WorkflowValidationError("INVALID_STATE", "Answer is already marked export-safe");
      }
      assertApproverOrAdmin(ctx, answer, workspace, "confirm export-safe for buyers");
      assertNotSelfApproveWhenDisallowed(ctx, answer, workspace);
      const now = new Date();
      return {
        governanceStatus: "APPROVED_FOR_EXPORT",
        approvalScope: "EXPORT_ALLOWED",
        exportSafe: true,
        status: answer.status,
        lastReviewedAt: answer.lastReviewedAt ?? now,
        approvedAt: answer.approvedAt,
        approvedByUserId: answer.approvedByUserId,
        nextReviewDueAt: answer.nextReviewDueAt,
        expiresAt: answer.expiresAt,
        lastVerified: now,
        changeReasonSummary: `Workflow:confirmExportSafe${commentSuffix}`,
        auditEventType: AUDIT_EVENT_TYPES.ANSWER_EXPORT_SAFE_CONFIRMED,
      };
    }
    case "revokeExportSafe": {
      if (gov !== "APPROVED_FOR_EXPORT" || answer.approvalScope !== "EXPORT_ALLOWED") {
        throw new WorkflowValidationError("INVALID_STATE", "Can only revoke export-safe on export-path answers");
      }
      if (answer.exportSafe !== true) {
        throw new WorkflowValidationError("INVALID_STATE", "Export-safe is not currently set");
      }
      assertApproverOrAdmin(ctx, answer, workspace, "revoke export-safe");
      assertNotSelfApproveWhenDisallowed(ctx, answer, workspace);
      const now = new Date();
      return {
        governanceStatus: "APPROVED_FOR_EXPORT",
        approvalScope: "EXPORT_ALLOWED",
        exportSafe: false,
        status: answer.status,
        lastReviewedAt: answer.lastReviewedAt ?? now,
        approvedAt: answer.approvedAt,
        approvedByUserId: answer.approvedByUserId,
        nextReviewDueAt: answer.nextReviewDueAt,
        expiresAt: answer.expiresAt,
        lastVerified: now,
        changeReasonSummary: `Workflow:revokeExportSafe${commentSuffix}`,
        auditEventType: AUDIT_EVENT_TYPES.ANSWER_EXPORT_SAFE_REVOKED,
      };
    }
    case "requestRevision": {
      if (gov !== "IN_REVIEW") {
        throw new WorkflowValidationError("INVALID_STATE", "Can only request revision from In review");
      }
      assertApproverOrAdmin(ctx, answer, workspace, "request revision", { allowRequireRevision: true });
      const now = new Date();
      return {
        governanceStatus: "REVISION_REQUIRED",
        approvalScope: "INTERNAL_ONLY",
        exportSafe: false,
        status: "DRAFT",
        lastReviewedAt: now,
        approvedAt: null,
        approvedByUserId: null,
        nextReviewDueAt: null,
        expiresAt: null,
        changeReasonSummary: `Workflow:requestRevision${commentSuffix}`,
        auditEventType: AUDIT_EVENT_TYPES.ANSWER_REVISION_REQUESTED,
      };
    }
    case "reject": {
      if (gov !== "IN_REVIEW") {
        throw new WorkflowValidationError("INVALID_STATE", "Can only reject from In review");
      }
      assertApproverOrAdmin(ctx, answer, workspace, "reject");
      const now = new Date();
      return {
        governanceStatus: "REJECTED",
        approvalScope: "INTERNAL_ONLY",
        exportSafe: false,
        status: "ARCHIVED",
        lastReviewedAt: now,
        approvedAt: null,
        approvedByUserId: null,
        nextReviewDueAt: null,
        expiresAt: null,
        lastVerified: null,
        changeReasonSummary: `Workflow:reject${commentSuffix}`,
        auditEventType: AUDIT_EVENT_TYPES.ANSWER_WORKFLOW_REJECTED,
      };
    }
    default:
      throw new WorkflowValidationError("UNKNOWN_ACTION", `Unknown action: ${String(action)}`);
  }
}

export function parseWorkflowAction(body: unknown): WorkflowAction {
  if (!body || typeof body !== "object" || !("action" in body)) {
    throw new WorkflowValidationError("BAD_REQUEST", "Missing action");
  }
  const action = (body as { action?: string }).action;
  if (!action || !WORKFLOW_ACTIONS.includes(action as WorkflowAction)) {
    throw new WorkflowValidationError("BAD_REQUEST", "Invalid action");
  }
  return action as WorkflowAction;
}

export function parseWorkflowComment(body: unknown): string | undefined {
  if (!body || typeof body !== "object" || !("comment" in body)) return undefined;
  const c = (body as { comment?: unknown }).comment;
  if (c == null) return undefined;
  if (typeof c !== "string") return undefined;
  return c;
}
