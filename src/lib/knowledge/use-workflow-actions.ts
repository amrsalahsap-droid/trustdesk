"use client";

import { useState, useCallback } from "react";
import { Permission } from "@/lib/auth/permissions";
import { isWorkspaceAdmin } from "@/lib/auth/governance-actions";

export interface WorkflowActionsContext {
  userId: string;
  role: string;
  permissions: Permission[];
}

export interface AnswerWorkflowState {
  id: string;
  governanceStatus: string;
  status: string;
  ownerId: string | null;
  approverId: string | null;
}

export interface WorkflowActionResult {
  success: boolean;
  error?: string;
  newStatus?: string;
  newGovernanceStatus?: string;
}

export type WorkflowActionType = 
  | "submitForApproval"
  | "approveInternal"
  | "approveForExport"
  | "requestRevision"
  | "reject"
  | "archive";

export interface WorkflowActionConfig {
  action: WorkflowActionType;
  label: string;
  variant: "primary" | "outline" | "danger" | "ghost";
  show: boolean;
  disabled: boolean;
  loading: boolean;
}

/**
 * Centralized workflow action permissions
 * Single source of truth for who can do what based on state + role + ownership
 */
export function calculateWorkflowActions(
  answer: AnswerWorkflowState,
  ctx: WorkflowActionsContext,
): {
  canEdit: boolean;
  canSubmitForReview: boolean;
  canApproveInternal: boolean;
  canApproveForExport: boolean;
  canRequestRevision: boolean;
  canReject: boolean;
  canArchive: boolean;
} {
  const isAdmin = isWorkspaceAdmin(ctx.role);
  const isOwner = Boolean(ctx.userId && answer.ownerId && ctx.userId === answer.ownerId);
  const isApprover = Boolean(ctx.userId && answer.approverId && ctx.userId === answer.approverId);
  
  const gov = answer.governanceStatus;
  const hasEditPermission = ctx.permissions.includes(Permission.EDIT_ANSWERS);
  const hasSubmitPermission = ctx.permissions.includes(Permission.SUBMIT_FOR_APPROVAL);
  const hasApprovePermission = ctx.permissions.includes(Permission.APPROVE_ANSWERS);
  const hasRevisionPermission = ctx.permissions.includes(Permission.REQUIRE_REVISION);

  // Can edit content: must have edit permission AND be owner/admin
  const canEdit = hasEditPermission && (isOwner || isAdmin);

  // Can submit for review: must be in DRAFT/REVISION_REQUIRED and be owner/admin with permission
  const canSubmitForReview = 
    (gov === "DRAFT" || gov === "REVISION_REQUIRED") &&
    (isAdmin || ((isOwner || hasSubmitPermission) && hasEditPermission));

  // Can approve: must be in IN_REVIEW and be assigned approver or admin
  const canApprove = gov === "IN_REVIEW" && (isAdmin || (isApprover && hasApprovePermission));

  // Can request revision: same conditions as approve, or has REQUIRE_REVISION permission
  const canRequestRevision = 
    gov === "IN_REVIEW" && 
    (isAdmin || (isApprover && (hasApprovePermission || hasRevisionPermission)));

  // Can reject: can approve OR (owner can reject their own draft)
  const canReject = 
    (gov === "DRAFT" && (isAdmin || isOwner)) ||
    (gov === "IN_REVIEW" && canApprove);

  // Can archive: admin or owner with edit permission (except when already archived)
  const canArchive = answer.status !== "ARCHIVED" && (isAdmin || (isOwner && hasEditPermission));

  return {
    canEdit,
    canSubmitForReview,
    canApproveInternal: canApprove,
    canApproveForExport: canApprove,
    canRequestRevision,
    canReject,
    canArchive,
  };
}

/**
 * Hook for managing workflow actions with loading states and error handling
 */
export function useWorkflowActions(
  answer: AnswerWorkflowState | null,
  ctx: WorkflowActionsContext | null,
  workspaceId: string,
  onSuccess?: () => void,
) {
  const [pendingAction, setPendingAction] = useState<WorkflowActionType | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastSuccess, setLastSuccess] = useState<string | null>(null);

  const clearFeedback = useCallback(() => {
    setLastError(null);
    setLastSuccess(null);
  }, []);

  const executeAction = useCallback(async (
    action: WorkflowActionType,
    comment?: string,
  ): Promise<WorkflowActionResult> => {
    if (!answer || !ctx) {
      return { success: false, error: "No answer selected" };
    }

    setPendingAction(action);
    setLastError(null);
    setLastSuccess(null);

    try {
      // Map action to API endpoint and payload
      let endpoint: string;
      let method: string;
      let body: Record<string, unknown>;

      switch (action) {
        case "submitForApproval":
          endpoint = `/api/knowledge/answers/${answer.id}/workflow`;
          method = "POST";
          body = { action: "submitForApproval", comment: comment || "Submitted for review" };
          break;
        case "approveInternal":
          endpoint = `/api/knowledge/answers/${answer.id}/workflow`;
          method = "POST";
          body = { action: "approveInternal", comment: comment || "Approved for internal use" };
          break;
        case "approveForExport":
          endpoint = `/api/knowledge/answers/${answer.id}/workflow`;
          method = "POST";
          body = { action: "approveForExport", comment: comment || "Approved for export" };
          break;
        case "requestRevision":
          endpoint = `/api/knowledge/answers/${answer.id}/workflow`;
          method = "POST";
          body = { action: "requestRevision", comment: comment || "Revision requested" };
          break;
        case "reject":
          endpoint = `/api/knowledge/answers/${answer.id}/workflow`;
          method = "POST";
          body = { action: "reject", comment: comment || "Rejected" };
          break;
        case "archive":
          endpoint = `/api/knowledge/answers/${answer.id}`;
          method = "PATCH";
          body = { status: "ARCHIVED", changeReason: "Archived by user" };
          break;
        default:
          return { success: false, error: "Unknown action" };
      }

      const res = await fetch(endpoint, {
        method,
        headers: {
          "Content-Type": "application/json",
          "x-workspace-id": workspaceId,
        },
        body: JSON.stringify(body),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const errorMsg = (data as { error?: string }).error || `${action} failed`;
        setLastError(errorMsg);
        return { success: false, error: errorMsg };
      }

      const successMsg = getSuccessMessage(action);
      setLastSuccess(successMsg);
      onSuccess?.();
      
      return { 
        success: true, 
        newStatus: data.item?.status,
        newGovernanceStatus: data.item?.governanceStatus,
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Network error";
      setLastError(errorMsg);
      return { success: false, error: errorMsg };
    } finally {
      setPendingAction(null);
    }
  }, [answer, ctx, workspaceId, onSuccess]);

  const isLoading = (action: WorkflowActionType) => pendingAction === action;
  const isAnyLoading = pendingAction !== null;

  return {
    executeAction,
    isLoading,
    isAnyLoading,
    lastError,
    lastSuccess,
    clearFeedback,
    pendingAction,
  };
}

function getSuccessMessage(action: WorkflowActionType): string {
  switch (action) {
    case "submitForApproval": return "Submitted for review";
    case "approveInternal": return "Approved for internal use";
    case "approveForExport": return "Approved for export";
    case "requestRevision": return "Revision requested";
    case "reject": return "Answer rejected";
    case "archive": return "Answer archived";
    default: return "Action completed";
  }
}
