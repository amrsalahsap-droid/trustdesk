"use client";

import { useState } from "react";
import { Permission } from "@/lib/auth/permissions";
import { isWorkspaceAdmin } from "@/lib/auth/governance-actions";
import type { WorkflowAction } from "@/lib/knowledge/answer-workflow";
import type { WorkspaceRole } from "@prisma/client";


function hasPermission(permissions: Permission[], p: Permission): boolean {
  return permissions.includes(p);
}

interface AnswerWorkflowActionsProps {
  answerId: string;
  workspaceId: string;
  governanceStatus: string | undefined | null;
  approvalScope?: string | null;
  exportSafe?: boolean | null;
  ownerId: string | null | undefined;
  approverId: string | null | undefined;
  userId: string;
  role: WorkspaceRole;
  permissions: Permission[];
  onSuccess: () => void;
}

export function AnswerWorkflowActions({
  answerId,
  workspaceId,
  governanceStatus,
  approvalScope,
  exportSafe,
  ownerId,
  approverId,
  userId,
  role,
  permissions,
  onSuccess,
}: AnswerWorkflowActionsProps) {
  const [busy, setBusy] = useState(false);
  const [comment, setComment] = useState("");

  const gov = governanceStatus || "DRAFT";
  const admin = isWorkspaceAdmin(role);
  const isOwner = Boolean(ownerId && ownerId === userId);
  const isApprover = Boolean(approverId && approverId === userId);

  const canSubmit =
    (gov === "DRAFT" || gov === "REVISION_REQUIRED") &&
    (admin ||
      (isOwner &&
        (hasPermission(permissions, Permission.SUBMIT_FOR_APPROVAL) ||
          hasPermission(permissions, Permission.EDIT_ANSWERS))));

  const canApprovePath =
    gov === "IN_REVIEW" &&
    (admin || (isApprover && hasPermission(permissions, Permission.APPROVE_ANSWERS)));

  const canRequestRevision =
    gov === "IN_REVIEW" &&
    (admin ||
      (isApprover &&
        (hasPermission(permissions, Permission.REQUIRE_REVISION) ||
          hasPermission(permissions, Permission.APPROVE_ANSWERS))));

  const scope = approvalScope ?? "INTERNAL_ONLY";
  const safe = exportSafe === true;
  const canExportSafeActions =
    gov === "APPROVED_FOR_EXPORT" &&
    scope === "EXPORT_ALLOWED" &&
    (admin || (isApprover && hasPermission(permissions, Permission.APPROVE_ANSWERS)));

  async function runAction(action: WorkflowAction) {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/knowledge/answers/${answerId}/workflow`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-workspace-id": workspaceId,
        },
        body: JSON.stringify({
          action,
          ...(comment.trim() ? { comment: comment.trim() } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        window.alert((data as { error?: string }).error || "Action failed");
        return;
      }
      setComment("");
      onSuccess();
    } finally {
      setBusy(false);
    }
  }

  if (!canSubmit && !canApprovePath && !canRequestRevision && !canExportSafeActions) return null;

  return (
    <div className="rounded-xl border border-surface-border bg-surface-panel/40 p-5 space-y-4 shadow-sm">
      <div className="space-y-1">
        <h3 className="text-sm font-bold uppercase tracking-wider text-text-primary">Review Workflow</h3>
        <p className="text-[11px] text-text-muted leading-relaxed">
          Move this answer through the formal governance cycle. Your decision and comments will be permanently recorded in the audit trail.
        </p>
      </div>

      <div className="space-y-2">
        <label className="text-[10px] font-bold uppercase tracking-wider text-text-muted block">Approval Note (Optional)</label>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Explain your decision or suggest specific changes..."
          rows={3}
          className="w-full rounded-lg border border-surface-border bg-surface-base px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary transition-all"
        />
        <p className="text-[10px] italic text-text-muted">This note is stored in the immutable audit history for this answer.</p>
      </div>

      <div className="flex flex-wrap gap-3 pt-1">
        {canSubmit && (
          <button
            type="button"
            disabled={busy}
            onClick={() => runAction("submitForApproval")}
            className="rounded-lg bg-accent-primary px-4 py-2 text-xs font-bold text-white shadow-md shadow-accent-primary/20 hover:bg-accent-primary-hover active:scale-95 transition-all disabled:opacity-50"
          >
            {busy ? "Processing..." : "Submit for Approval"}
          </button>
        )}
        {canApprovePath && (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => runAction("approveForExport")}
              className="rounded-lg bg-semantic-success px-4 py-2 text-xs font-bold text-white shadow-md shadow-semantic-success/20 hover:bg-semantic-success/90 active:scale-95 transition-all disabled:opacity-50"
            >
              {busy ? "..." : "Approve for Export"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => runAction("approveInternal")}
              className="rounded-lg border border-semantic-success/30 bg-semantic-success/10 px-4 py-2 text-xs font-bold text-semantic-success hover:bg-semantic-success/20 active:scale-95 transition-all disabled:opacity-50"
            >
              Approve (Internal Only)
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => runAction("reject")}
              className="rounded-lg border border-semantic-error-border bg-semantic-error-bg/20 px-4 py-2 text-xs font-bold text-semantic-error hover:bg-semantic-error-bg active:scale-95 transition-all disabled:opacity-50"
            >
              Reject Draft
            </button>
          </>
        )}
        {canRequestRevision && (
          <button
            type="button"
            disabled={busy}
            onClick={() => runAction("requestRevision")}
            className="rounded-lg border border-semantic-warning-border bg-semantic-warning/10 px-4 py-2 text-xs font-bold text-semantic-warning hover:bg-semantic-warning/20 active:scale-95 transition-all disabled:opacity-50"
          >
            Request Revision
          </button>
        )}
        {canExportSafeActions && !safe && (
          <button
            type="button"
            disabled={busy}
            onClick={() => runAction("confirmExportSafe")}
            className="rounded-lg border border-semantic-success/40 bg-semantic-success/15 px-4 py-2 text-xs font-bold text-semantic-success hover:bg-semantic-success/25 active:scale-95 transition-all disabled:opacity-50"
          >
            Mark Export-Safe
          </button>
        )}
        {canExportSafeActions && safe && (
          <button
            type="button"
            disabled={busy}
            onClick={() => runAction("revokeExportSafe")}
            className="rounded-lg border border-surface-border bg-surface-base px-4 py-2 text-xs font-bold text-text-secondary hover:bg-surface-hover active:scale-95 transition-all disabled:opacity-50"
          >
            Revoke Export-Safe
          </button>
        )}
      </div>

      {canApprovePath && (
        <div className="rounded-lg bg-surface-base p-3 text-[10px] leading-relaxed text-text-muted border border-surface-border">
          <p className="font-bold uppercase tracking-tight mb-1 text-text-primary">Decision Impact</p>
          <ul className="list-disc pl-4 space-y-1">
            <li><strong>Approve for Export:</strong> Makes this answer available for all customer-facing questionnaires.</li>
            <li><strong>Approve (Internal):</strong> Active in library but restricted from buyer-facing exports.</li>
            <li><strong>Reject:</strong> Archives this draft and removes it from active library view.</li>
          </ul>
        </div>
      )}
    </div>
  );

}
