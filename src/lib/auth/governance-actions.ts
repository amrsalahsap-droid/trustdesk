import type { AnswerStatus, WorkspaceRole } from "@prisma/client";
import type { WorkflowAction } from "@/lib/knowledge/answer-workflow";
import type { AuthContext } from "@/lib/auth/types";
import { Permission } from "@/lib/auth/permissions";
import { InsufficientRoleError } from "@/lib/auth/errors";
import type { AnswerLibraryPatchBody } from "@/lib/knowledge/answer-library-patch";

/** Subset of {@link AuthContext} safe for client-side capability checks (no membership id required). */
export type GovernanceAuthSlice = Pick<AuthContext, "userId" | "role" | "permissions">;

/**
 * Canonical helper to check if a role has workspace admin privileges.
 * Use this instead of hardcoded `role === "OWNER" || role === "ADMIN"` checks.
 * @param role - The WorkspaceRole to check
 * @returns true if the role is OWNER or ADMIN
 */
export function isWorkspaceAdmin(role: WorkspaceRole): boolean {
  return role === "OWNER" || role === "ADMIN";
}

/**
 * Helper to check if a role has operator-level privileges (admin or operator).
 * Use this instead of hardcoded role checks.
 * @param role - The WorkspaceRole to check
 * @returns true if the role is OWNER, ADMIN, or OPERATOR
 */
export function isOperatorLike(role: WorkspaceRole): boolean {
  return role === "OWNER" || role === "ADMIN" || role === "OPERATOR";
}

/**
 * Checks if the current user context should be restricted to seeing only
 * items explicitly assigned to them.
 */
export function isRestrictedToAssigned(ctx: GovernanceAuthSlice): boolean {
  if (isOperatorLike(ctx.role)) return false;
  return ctx.permissions.includes(Permission.VIEW_ASSIGNED_ONLY);
}

export function canAssignGovernance(ctx: GovernanceAuthSlice): boolean {
  return isWorkspaceAdmin(ctx.role) || ctx.permissions.includes(Permission.DELEGATE_WORK);
}

export function canActAsAnswerOwner(ctx: GovernanceAuthSlice, ownerId: string | null | undefined): boolean {
  if (isWorkspaceAdmin(ctx.role)) return true;
  return Boolean(ownerId && ctx.userId === ownerId);
}

export function canEditAnswerContent(ctx: GovernanceAuthSlice, ownerId: string | null | undefined): boolean {
  if (!ctx.permissions.includes(Permission.EDIT_ANSWERS)) return false;
  return canActAsAnswerOwner(ctx, ownerId);
}

export function canSubmitForApproval(ctx: GovernanceAuthSlice, ownerId: string | null | undefined): boolean {
  if (isWorkspaceAdmin(ctx.role)) return true;
  if (ctx.permissions.includes(Permission.SUBMIT_FOR_APPROVAL)) return true;
  // Owner can submit if they have edit permission
  if (ctx.permissions.includes(Permission.EDIT_ANSWERS) && ownerId && ctx.userId === ownerId) return true;
  return false;
}

export function canSuggestEditsToAnswer(
  ctx: GovernanceAuthSlice,
  governanceStatus: string | null | undefined,
): boolean {
  const g = governanceStatus || "DRAFT";
  if (g !== "DRAFT" && g !== "REVISION_REQUIRED") return false;
  return ctx.permissions.includes(Permission.SUGGEST_EDITS);
}

export function assertAnswerCreate(ctx: AuthContext, initialStatus: AnswerStatus): void {
  if (!ctx.permissions.includes(Permission.EDIT_ANSWERS)) {
    throw new InsufficientRoleError("Creating library answers requires edit permission");
  }
  if (initialStatus === "APPROVED") {
    if (!isWorkspaceAdmin(ctx.role) && !ctx.permissions.includes(Permission.APPROVE_ANSWERS)) {
      throw new InsufficientRoleError("Creating an already-approved answer requires approval permission");
    }
  }
}

export function assertAnswerDelete(ctx: AuthContext, ownerId: string | null | undefined): void {
  if (!ctx.permissions.includes(Permission.EDIT_ANSWERS)) {
    throw new InsufficientRoleError("Deleting answers requires edit permission");
  }
  if (!canActAsAnswerOwner(ctx, ownerId)) {
    throw new InsufficientRoleError("Only the answer owner or a workspace admin can delete this answer");
  }
}

export function assertWorkflowActionPermission(ctx: AuthContext, action: WorkflowAction): void {
  switch (action) {
    case "submitForApproval":
      if (
        isWorkspaceAdmin(ctx.role) ||
        ctx.permissions.includes(Permission.SUBMIT_FOR_APPROVAL) ||
        ctx.permissions.includes(Permission.EDIT_ANSWERS)
      ) {
        return;
      }
      throw new InsufficientRoleError("Missing permission to submit for approval");
    case "requestRevision":
      if (
        isWorkspaceAdmin(ctx.role) ||
        ctx.permissions.includes(Permission.APPROVE_ANSWERS) ||
        ctx.permissions.includes(Permission.REQUIRE_REVISION)
      ) {
        return;
      }
      throw new InsufficientRoleError("Missing permission to request revision");
    case "approveInternal":
    case "approveForExport":
    case "confirmExportSafe":
    case "revokeExportSafe":
    case "reject":
      if (isWorkspaceAdmin(ctx.role) || ctx.permissions.includes(Permission.APPROVE_ANSWERS)) {
        return;
      }
      throw new InsufficientRoleError("Missing permission for this approval action");
    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}

export function assertPromoteDrafts(ctx: AuthContext): void {
  if (isWorkspaceAdmin(ctx.role)) return;
  if (ctx.permissions.includes(Permission.PROMOTE_DRAFTS)) return;
  if (ctx.permissions.includes(Permission.APPROVE_ANSWERS)) return;
  throw new InsufficientRoleError("Insufficient permissions to promote drafts");
}

export function assertQuestionnaireExport(ctx: AuthContext, format: string): void {
  if (!ctx.permissions.includes(Permission.VIEW_ANSWERS)) {
    throw new InsufficientRoleError("Viewing answers is required to export questionnaires");
  }

  if (format === "xlsx") {
    if (!ctx.permissions.includes(Permission.EXPORT_EXTERNAL)) {
      throw new InsufficientRoleError("Exporting final workbooks (XLSX) requires external export permission");
    }
  } else {
    // CSV / Internal
    if (!ctx.permissions.includes(Permission.EXPORT_INTERNAL)) {
      throw new InsufficientRoleError("Exporting internal data (CSV) requires internal export permission");
    }
  }
}

export function assertAnswerGenerate(ctx: AuthContext): void {
  if (ctx.permissions.includes(Permission.RUN_AI_OPERATIONS)) return;
  throw new InsufficientRoleError("AI operations require explicit RUN_AI_OPERATIONS permission");
}

export function assertDocumentManagement(ctx: AuthContext): void {
  if (ctx.permissions.includes(Permission.MANAGE_DOCUMENTS)) return;
  throw new InsufficientRoleError("Managing documents (delete/reprocess) requires manage-documents permission");
}

export function assertQuestionnaireReview(ctx: AuthContext, assigneeId?: string | null): void {
  if (!ctx.permissions.includes(Permission.REVIEW_ROWS)) {
    throw new InsufficientRoleError("Reviewing questionnaire rows requires review-rows permission");
  }

  if (isRestrictedToAssigned(ctx)) {
    if (assigneeId && ctx.userId !== assigneeId) {
      throw new InsufficientRoleError("You can only review items explicitly assigned to you");
    }
  }
}

export function assertQuestionnaireAssign(ctx: AuthContext): void {
  if (ctx.permissions.includes(Permission.ASSIGN_ROWS)) return;
  throw new InsufficientRoleError("Assigning questionnaire rows requires assign-rows permission");
}

export function assertQuestionnaireBulkAction(ctx: AuthContext): void {
  if (ctx.permissions.includes(Permission.BULK_REVIEW_QUESTIONNAIRE)) return;
  throw new InsufficientRoleError("Bulk questionnaire actions require bulk-review-questionnaire permission");
}

export function assertTopicDefaultAssignees(ctx: AuthContext, payloadHasOwnerOrApprover: boolean): void {
  if (!payloadHasOwnerOrApprover) return;
  if (!canAssignGovernance(ctx)) {
    throw new InsufficientRoleError("Assigning topic default owners or approvers requires assign-owners permission");
  }
}

export function assertSubcontrolGovernancePatch(ctx: AuthContext): void {
  if (!canAssignGovernance(ctx)) {
    throw new InsufficientRoleError("Assigning sub-control governance requires assign-owners permission");
  }
}

type AnswerPatchExisting = {
  ownerId: string | null;
  approverId: string | null;
  governanceStatus: string;
  status: AnswerStatus;
};

/**
 * Server-side authorization for PATCH /api/knowledge/answers/[id].
 * Call after loading `existing`; business rules (IN_REVIEW approve via workflow, etc.) stay in the route.
 */
export function assertAnswerPatchAllowed(ctx: AuthContext, existing: AnswerPatchExisting, patch: AnswerLibraryPatchBody): void {
  const { changeReason: _c, ...rest } = patch;
  void _c;
  const patchKeys = (Object.keys(rest) as (keyof typeof rest)[]).filter((k) => rest[k] !== undefined);

  const assignment =
    (patch.ownerId !== undefined && patch.ownerId !== existing.ownerId) ||
    (patch.approverId !== undefined && patch.approverId !== existing.approverId);

  if (assignment && !canAssignGovernance(ctx)) {
    throw new InsufficientRoleError("Cannot change owner or approver assignment");
  }

  const statusChange = patch.status !== undefined && patch.status !== existing.status;
  if (statusChange) {
    const to = patch.status!;
    if (to === "ARCHIVED") {
      const allowed =
        isWorkspaceAdmin(ctx.role) ||
        ctx.permissions.includes(Permission.APPROVE_ANSWERS) ||
        (canActAsAnswerOwner(ctx, existing.ownerId) && ctx.permissions.includes(Permission.EDIT_ANSWERS));
      if (!allowed) {
        throw new InsufficientRoleError("Insufficient permissions to archive this answer");
      }
    } else if (to === "APPROVED") {
      if (!isWorkspaceAdmin(ctx.role) && !ctx.permissions.includes(Permission.APPROVE_ANSWERS)) {
        throw new InsufficientRoleError("Approving requires approval permission");
      }
    } else {
      if (!isWorkspaceAdmin(ctx.role) && !ctx.permissions.includes(Permission.APPROVE_ANSWERS)) {
        throw new InsufficientRoleError("Status changes require approval permission");
      }
    }
  }

  const keysAfterAssign = patchKeys.filter((k) => k !== "ownerId" && k !== "approverId");
  if (keysAfterAssign.length === 0) {
    return;
  }

  const keysNeedingContentRule = statusChange ? keysAfterAssign.filter((k) => k !== "status") : keysAfterAssign;
  if (keysNeedingContentRule.length === 0) {
    return;
  }

  const gov = existing.governanceStatus;
  const suggestEligible = gov === "DRAFT" || gov === "REVISION_REQUIRED";
  const onlyTitleAnswer = keysNeedingContentRule.every((k) => k === "title" || k === "answer");
  if (suggestEligible && onlyTitleAnswer && ctx.permissions.includes(Permission.SUGGEST_EDITS)) {
    return;
  }

  if (keysNeedingContentRule.length === 1 && keysNeedingContentRule[0] === "reviewCadenceDays") {
    const ownerOrAdmin = existing.ownerId === ctx.userId || isWorkspaceAdmin(ctx.role);
    if (!ownerOrAdmin) {
      throw new InsufficientRoleError("Only the answer owner or a workspace admin can change review cadence");
    }
    if (!ctx.permissions.includes(Permission.EDIT_ANSWERS)) {
      throw new InsufficientRoleError("Editing review cadence requires edit permission");
    }
    return;
  }

  if (!ctx.permissions.includes(Permission.EDIT_ANSWERS)) {
    throw new InsufficientRoleError("Editing answers requires edit permission");
  }
  if (!canActAsAnswerOwner(ctx, existing.ownerId)) {
    throw new InsufficientRoleError("Only the answer owner or a workspace admin can edit this answer");
  }
}
