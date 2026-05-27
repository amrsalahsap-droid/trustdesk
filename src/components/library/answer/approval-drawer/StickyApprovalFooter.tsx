"use client";

import { Button } from "@/components/ui/button";
import { PermissionGuard } from "@/components/auth/permission-guard";
import { Permission } from "@/lib/auth/permissions";
import { canEditAnswerContent, canSubmitForApproval, isWorkspaceAdmin } from "@/lib/auth/governance-actions";

/**
 * DrawerMode - Runtime modes for the detail drawer
 * Note: "edit" mode is intentionally excluded because editing happens in AnswerFormSlideOver,
 * not in the detail drawer. The detail drawer is read-only/review-oriented.
 */
export type DrawerMode = "view" | "review" | "approved" | "archived";

interface StickyApprovalFooterProps {
  onClose: () => void;
  onEdit: () => void;
  onSubmitForReview?: () => void;
  onApproveInternal?: () => void;
  onApproveForExport?: () => void;
  onRequestRevision?: () => void;
  onReject?: () => void;
  onArchive: () => void;
  isLoading: boolean;
  mode: DrawerMode;
  ownerId?: string | null;
  approverId?: string | null;
  userId?: string;
  governanceStatus: string;
  role: any;
  permissions: Permission[];
}

/**
 * StickyApprovalFooter - Unified action footer for answer drawer
 * 
 * Action semantics:
 * - "Save Draft" = persist edits without submitting (DRAFT/REVISION_REQUIRED, owner/editor)
 * - "Submit for Review" = owner sends answer into review workflow (DRAFT/REVISION_REQUIRED → IN_REVIEW)
 * - "Approve for Internal Use" = approver approves for internal only (IN_REVIEW → APPROVED_INTERNAL)
 * - "Approve for Export" = approver approves for customer-facing use (IN_REVIEW → APPROVED_FOR_EXPORT)
 * - "Request Revision" = approver sends back for changes (IN_REVIEW → REVISION_REQUIRED)
 * - "Reject" = approver rejects/archived (DRAFT/IN_REVIEW → ARCHIVED)
 * - "Archive" = owner/admin retires answer (any state → ARCHIVED)
 * - "Edit" = open form to modify content (owner/editor only)
 */
export function StickyApprovalFooter({
  onClose,
  onEdit,
  onSubmitForReview,
  onApproveInternal,
  onApproveForExport,
  onRequestRevision,
  onReject,
  onArchive,
  isLoading,
  mode,
  ownerId,
  approverId,
  userId,
  governanceStatus,
  role,
  permissions,
}: StickyApprovalFooterProps) {
  const isAdmin = isWorkspaceAdmin(role);
  const isOwner = Boolean(userId && ownerId && userId === ownerId);
  const isApprover = Boolean(userId && approverId && userId === approverId);
  
  // Permission checks
  const canEdit = canEditAnswerContent({ role, permissions, userId: userId || "" }, ownerId);
  const canSubmit = canSubmitForApproval({ role, permissions, userId: userId || "" }, ownerId);
  const canApprove = isAdmin || (isApprover && permissions.includes(Permission.APPROVE_ANSWERS));
  const canRequestRevision = isAdmin || (isApprover && (permissions.includes(Permission.REQUIRE_REVISION) || permissions.includes(Permission.APPROVE_ANSWERS)));
  const canArchive = isAdmin || (isOwner && permissions.includes(Permission.EDIT_ANSWERS));

  // Mode-based action availability
  // Note: Edit opens the form slide-over; detail drawer is read-only
  const showEdit = mode !== "archived" && canEdit;
  const showSubmitForReview = (mode === "view") && 
    (governanceStatus === "DRAFT" || governanceStatus === "REVISION_REQUIRED") && 
    canSubmit;
  const showApprovalActions = mode === "review" && governanceStatus === "IN_REVIEW" && canApprove;
  const showRequestRevision = mode === "review" && governanceStatus === "IN_REVIEW" && canRequestRevision;
  const showReject = (mode === "view" || mode === "review") && 
    (governanceStatus === "DRAFT" || governanceStatus === "IN_REVIEW") && 
    (canApprove || canArchive);
  const showArchive = mode !== "archived" && mode !== "approved" && canArchive;

  return (
    <div className="sticky bottom-0 z-20 flex items-center justify-between border-t border-surface-border bg-surface-base p-6 shadow-[0_-4px_12px_rgba(0,0,0,0.05)]">
      <Button
        variant="ghost"
        onClick={onClose}
        className="text-text-muted hover:text-text-primary"
      >
        Close
      </Button>

      <div className="flex items-center gap-3">
        {/* Edit action - opens form slide-over */}
        {showEdit && (
          <Button
            variant="outline"
            onClick={onEdit}
            disabled={isLoading}
          >
            Edit Answer
          </Button>
        )}

        {/* Submit for Review */}
        {showSubmitForReview && onSubmitForReview && (
          <Button
            variant="primary"
            onClick={onSubmitForReview}
            loading={isLoading}
            disabled={isLoading}
            className="px-6 shadow-lg shadow-accent-primary/20"
          >
            Submit for Review
          </Button>
        )}

        {/* Approval Actions */}
        {showApprovalActions && (
          <>
            {onApproveForExport && (
              <Button
                variant="primary"
                onClick={onApproveForExport}
                loading={isLoading}
                disabled={isLoading}
                className="px-6 shadow-lg shadow-semantic-success/20 bg-semantic-success hover:bg-semantic-success/90"
              >
                Approve for Export
              </Button>
            )}
            {onApproveInternal && (
              <Button
                variant="outline"
                onClick={onApproveInternal}
                loading={isLoading}
                disabled={isLoading}
                className="border-semantic-success/30 text-semantic-success hover:bg-semantic-success/10"
              >
                Approve (Internal)
              </Button>
            )}
          </>
        )}

        {/* Request Revision */}
        {showRequestRevision && onRequestRevision && (
          <Button
            variant="outline"
            onClick={onRequestRevision}
            loading={isLoading}
            disabled={isLoading}
            className="border-semantic-warning-border text-semantic-warning hover:bg-semantic-warning/10"
          >
            Request Revision
          </Button>
        )}

        {/* Reject */}
        {showReject && onReject && (
          <Button
            variant="danger"
            onClick={onReject}
            loading={isLoading}
            disabled={isLoading}
          >
            Reject
          </Button>
        )}

        {/* Archive */}
        {showArchive && (
          <Button 
            variant="ghost" 
            className="text-semantic-error hover:bg-semantic-error/10 hover:text-semantic-error" 
            onClick={onArchive}
            disabled={isLoading}
          >
            Archive
          </Button>
        )}
      </div>
    </div>
  );
}
