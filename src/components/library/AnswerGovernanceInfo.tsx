"use client";

import { useState } from "react";
import { UserIcon, ShieldCheckIcon, EditIcon, CheckIcon, CloseIcon } from "@/components/icons";

interface GovernanceUser {
  id: string;
  name: string | null;
  email: string;
}

interface MemberOption {
  userId: string;
  name: string;
  email: string;
}

interface AnswerGovernanceInfoProps {
  owner?: GovernanceUser | null;
  approver?: GovernanceUser | null;
  approvedBy?: GovernanceUser | null;
  className?: string;
  /** When provided, renders edit controls for reassignment */
  canEdit?: boolean;
  members?: MemberOption[];
  onSave?: (ownerId: string | null, approverId: string | null) => Promise<void>;
  onCancel?: () => void;
  initialEditing?: boolean;
}


export function AnswerGovernanceInfo({
  owner,
  approver,
  approvedBy,
  className = "",
  canEdit = false,
  members = [],
  onSave,
  onCancel,
  initialEditing = false,
}: AnswerGovernanceInfoProps) {
  const [editing, setEditing] = useState(initialEditing);
  const [pendingOwnerId, setPendingOwnerId] = useState<string>(owner?.id ?? "");
  const [pendingApproverId, setPendingApproverId] = useState<string>(approver?.id ?? "");
  const [saving, setSaving] = useState(false);


  const startEdit = () => {
    setPendingOwnerId(owner?.id ?? "");
    setPendingApproverId(approver?.id ?? "");
    setEditing(true);
  };

  const cancelEdit = () => setEditing(false);

  const handleSave = async () => {
    if (!onSave) return;
    setSaving(true);
    try {
      await onSave(pendingOwnerId || null, pendingApproverId || null);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  if (editing && canEdit) {
    return (
      <div className={`rounded-xl border border-accent-primary/20 bg-accent-primary/5 p-4 space-y-4 ${className}`}>
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-wider text-accent-primary">Reassign Ownership</span>
          <button
            type="button"
            onClick={cancelEdit}
            className="rounded-full p-1 text-text-muted hover:bg-surface-hover hover:text-text-primary transition-colors"
          >
            <CloseIcon className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-text-muted">
              <UserIcon className="h-3 w-3 text-accent-primary" />
              Owner
            </label>
            <select
              value={pendingOwnerId}
              onChange={(e) => setPendingOwnerId(e.target.value)}
              className="h-9 w-full rounded-lg border border-surface-border bg-surface-base px-2 text-xs text-text-primary focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary"
            >
              <option value="">Unassigned</option>
              {members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.name || m.email}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-text-muted">
              <ShieldCheckIcon className="h-3 w-3 text-semantic-info" />
              Approver
            </label>
            <select
              value={pendingApproverId}
              onChange={(e) => setPendingApproverId(e.target.value)}
              className="h-9 w-full rounded-lg border border-surface-border bg-surface-base px-2 text-xs text-text-primary focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary"
            >
              <option value="">Unassigned</option>
              {members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.name || m.email}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={cancelEdit}
            className="rounded-lg border border-surface-border px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-hover"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent-primary px-4 py-1.5 text-xs font-bold text-white shadow-sm transition-all hover:bg-accent-primary-hover disabled:opacity-50"
          >
            {saving ? (
              <div className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <CheckIcon className="h-3 w-3" />
            )}
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    );
  }

  const hasAny = owner || approver || approvedBy;

  return (
    <div className={`space-y-2 ${className}`}>
      {hasAny && (
        <div className="flex flex-wrap gap-3">
          {owner && (
            <div className="flex items-center gap-1.5 px-2 py-1 bg-accent-primary/5 rounded-md border border-accent-primary/10">
              <UserIcon className="h-3.5 w-3.5 text-accent-primary" />
              <span className="text-[10px] text-text-muted uppercase tracking-tight font-bold">Owner</span>
              <span className="text-xs font-semibold text-text-primary">{owner.name || owner.email}</span>
            </div>
          )}
          {!owner && (
            <div className="flex items-center gap-1.5 px-2 py-1 bg-surface-panel rounded-md border border-surface-border border-dashed">
              <UserIcon className="h-3.5 w-3.5 text-text-muted/50" />
              <span className="text-xs italic text-text-muted/60">No owner</span>
            </div>
          )}

          {approver && (
            <div className="flex items-center gap-1.5 px-2 py-1 bg-semantic-info/5 rounded-md border border-semantic-info/10">
              <ShieldCheckIcon className="h-3.5 w-3.5 text-semantic-info" />
              <span className="text-[10px] text-text-muted uppercase tracking-tight font-bold">Approver</span>
              <span className="text-xs font-semibold text-text-primary">{approver.name || approver.email}</span>
            </div>
          )}
          {!approver && (
            <div className="flex items-center gap-1.5 px-2 py-1 bg-surface-panel rounded-md border border-surface-border border-dashed">
              <ShieldCheckIcon className="h-3.5 w-3.5 text-text-muted/50" />
              <span className="text-xs italic text-text-muted/60">No approver</span>
            </div>
          )}

          {approvedBy && (
            <div className="flex items-center gap-1.5 px-2 py-1 bg-semantic-success/5 rounded-md border border-semantic-success/10">
              <CheckIcon className="h-3.5 w-3.5 text-semantic-success" />
              <span className="text-[10px] text-text-muted uppercase tracking-tight font-bold">Approved by</span>
              <span className="text-xs font-semibold text-text-primary">{approvedBy.name || approvedBy.email}</span>
            </div>
          )}

          {canEdit && (
            <button
              type="button"
              onClick={startEdit}
              className="flex items-center gap-1 rounded-md border border-surface-border px-2 py-1 text-[10px] font-bold uppercase tracking-tight text-text-muted transition-colors hover:border-accent-primary/30 hover:bg-accent-primary/5 hover:text-accent-primary"
            >
              <EditIcon className="h-3 w-3" />
              Reassign
            </button>
          )}
        </div>
      )}

      {!hasAny && canEdit && (
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2 py-1 bg-surface-panel rounded-md border border-surface-border border-dashed">
            <UserIcon className="h-3.5 w-3.5 text-text-muted/50" />
            <span className="text-xs italic text-text-muted/60">No owner assigned</span>
          </div>
          <div className="flex items-center gap-1.5 px-2 py-1 bg-surface-panel rounded-md border border-surface-border border-dashed">
            <ShieldCheckIcon className="h-3.5 w-3.5 text-text-muted/50" />
            <span className="text-xs italic text-text-muted/60">No approver assigned</span>
          </div>
          <button
            type="button"
            onClick={startEdit}
            className="flex items-center gap-1 rounded-md border border-accent-primary/20 bg-accent-primary/5 px-2 py-1 text-[10px] font-bold uppercase tracking-tight text-accent-primary transition-colors hover:bg-accent-primary/10"
          >
            <EditIcon className="h-3 w-3" />
            Assign
          </button>
        </div>
      )}
    </div>
  );
}
