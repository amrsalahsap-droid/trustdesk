"use client";

import React, { useEffect, useState } from "react";
import { SlideOver } from "@/components/ui/slide-over";
import {
  AppBadge,
  AppButton,
  AppInput,
  AppLabel,
  AppTypography,
} from "@/components/ui/app-design-system/primitives";
import { ArrowRightIcon } from "@/components/icons";
import { cn } from "@/lib/utils";
import type { RemediationTarget } from "../onboarding-review-interactions";
import type {
  GovernanceRemediationStatus,
  GovernanceTaskRemediationRecord,
} from "@/modules/workspaces/onboarding/governance-remediation-types";

const STATUS_LABELS: Record<GovernanceRemediationStatus, string> = {
  open: "Open",
  evidence_added: "Evidence Added",
  confirmed: "Confirmed",
  not_applicable: "Not Applicable",
  assigned: "Assigned",
};

const STATUS_VARIANT: Record<
  GovernanceRemediationStatus,
  "warning" | "success" | "muted" | "brand"
> = {
  open: "warning",
  evidence_added: "brand",
  confirmed: "success",
  not_applicable: "muted",
  assigned: "muted",
};

export interface RemediationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  task: RemediationTarget | null;
  remediation?: GovernanceTaskRemediationRecord | null;
  isSaving?: boolean;
  onAddEvidence: (task: RemediationTarget) => void;
  onMarkNotApplicable: (note?: string) => Promise<void>;
  onConfirmManually: (note?: string) => Promise<void>;
  onAssignOwner: (owner: string, note?: string) => Promise<void>;
  onSetDueDate: (dueDate: string, note?: string) => Promise<void>;
  onAddNote: (note: string) => Promise<void>;
}

export function RemediationDrawer({
  isOpen,
  onClose,
  task,
  remediation,
  isSaving = false,
  onAddEvidence,
  onMarkNotApplicable,
  onConfirmManually,
  onAssignOwner,
  onSetDueDate,
  onAddNote,
}: RemediationDrawerProps) {
  const [ownerInput, setOwnerInput] = useState("");
  const [dueDateInput, setDueDateInput] = useState("");
  const [noteInput, setNoteInput] = useState("");
  const [activeForm, setActiveForm] = useState<
    "owner" | "due_date" | "note" | "not_applicable" | "confirm" | null
  >(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && task) {
      setOwnerInput(remediation?.owner ?? "");
      setDueDateInput(remediation?.dueDate ?? "");
      setNoteInput(remediation?.note ?? "");
      setActiveForm(null);
      setError(null);
    }
  }, [isOpen, task, remediation]);

  if (!task) return null;

  const status: GovernanceRemediationStatus = remediation?.status ?? "open";

  const runAction = async (fn: () => Promise<void>) => {
    setError(null);
    try {
      await fn();
      setActiveForm(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    }
  };

  return (
    <SlideOver isOpen={isOpen} onClose={onClose} title="Remediate Control" width="lg">
      <div className="space-y-8">
        <div className="flex flex-wrap items-center gap-3">
          <AppBadge variant={STATUS_VARIANT[status]} className="text-[10px] font-black uppercase tracking-widest">
            {STATUS_LABELS[status]}
          </AppBadge>
          <AppBadge
            variant={task.priority === "CRITICAL" ? "error" : "warning"}
            className="text-[10px] font-black uppercase tracking-widest"
          >
            {task.priority} Priority
          </AppBadge>
          {task.relatedPillar && (
            <span className="text-[10px] font-bold text-text-secondary/60 uppercase tracking-widest">
              {task.relatedPillar}
            </span>
          )}
        </div>

        <div className="space-y-2">
          <AppTypography.SectionTitle className="!text-xl font-black tracking-tight">
            {task.title}
          </AppTypography.SectionTitle>
          <AppTypography.BodySm className="text-text-secondary leading-relaxed">
            {task.description}
          </AppTypography.BodySm>
        </div>

        <DetailBlock label="Why This Matters" value={task.whyItMatters} />
        <DetailBlock label="Procurement Impact" value={task.procurementBlockerImpact} highlight />
        <DetailBlock label="Expected Unlock" value={task.whatItUnlocks} />

        {task.relatedRisks && task.relatedRisks.length > 0 && (
          <div className="space-y-2">
            <div className="text-[10px] font-black text-text-secondary/70 uppercase tracking-wider">
              Related Risks
            </div>
            <div className="flex flex-wrap gap-2">
              {task.relatedRisks.map((risk) => (
                <AppBadge key={risk} variant="muted" className="text-[9px]">
                  {risk}
                </AppBadge>
              ))}
            </div>
          </div>
        )}

        {task.requestedEvidence && task.requestedEvidence.length > 0 && (
          <div className="space-y-2">
            <div className="text-[10px] font-black text-text-secondary/70 uppercase tracking-wider">
              Requested Evidence
            </div>
            <ul className="space-y-1.5 text-sm text-text-secondary">
              {task.requestedEvidence.map((ev) => (
                <li key={ev} className="flex items-center gap-2 font-medium">
                  <span className="h-1.5 w-1.5 rounded-full bg-warning-amber shrink-0" />
                  {ev}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex items-center justify-between rounded-xl border border-success-emerald/20 bg-success-emerald/5 px-4 py-3">
          <span className="text-[10px] font-black text-success-emerald/70 uppercase tracking-widest">
            Est. Confidence Boost
          </span>
          <span className="text-lg font-black text-success-emerald">+{task.confidenceDelta ?? 0}%</span>
        </div>

        {task.sourceRationale && <DetailBlock label="Source Rationale" value={task.sourceRationale} />}

        {(remediation?.owner || remediation?.dueDate) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-xl border border-surface-border/50 bg-surface-subtle/30 p-4">
            {remediation.owner && <AppMetaInline label="Owner" value={remediation.owner} />}
            {remediation.dueDate && <AppMetaInline label="Due Date" value={remediation.dueDate} />}
          </div>
        )}

        {remediation?.auditHistory && remediation.auditHistory.length > 0 && (
          <div className="space-y-3">
            <div className="text-[10px] font-black text-text-secondary/70 uppercase tracking-wider">
              Audit History
            </div>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {[...remediation.auditHistory].reverse().slice(0, 8).map((entry, idx) => (
                <div
                  key={`${entry.timestamp}-${idx}`}
                  className="rounded-lg border border-surface-border/40 bg-surface-subtle/20 px-3 py-2 text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-text-primary capitalize">
                      {entry.action.replace(/_/g, " ")}
                    </span>
                    <span className="text-text-muted shrink-0">
                      {new Date(entry.timestamp).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-text-secondary mt-0.5">
                    Status → {STATUS_LABELS[entry.status]}
                    {entry.note ? ` · ${entry.note}` : ""}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeForm && (
          <div className="space-y-3 rounded-xl border border-intelligence-blue/20 bg-intelligence-blue/5 p-4">
            {activeForm === "owner" && (
              <>
                <AppLabel>Assign owner</AppLabel>
                <AppInput
                  value={ownerInput}
                  onChange={(e) => setOwnerInput(e.target.value)}
                  placeholder="e.g. security@company.com"
                />
              </>
            )}
            {activeForm === "due_date" && (
              <>
                <AppLabel>Due date</AppLabel>
                <AppInput
                  type="date"
                  value={dueDateInput}
                  onChange={(e) => setDueDateInput(e.target.value)}
                />
              </>
            )}
            {(activeForm === "note" ||
              activeForm === "not_applicable" ||
              activeForm === "confirm") && (
              <>
                <AppLabel>
                  {activeForm === "not_applicable"
                    ? "Reason (optional)"
                    : activeForm === "confirm"
                      ? "Confirmation note (optional)"
                      : "Note"}
                </AppLabel>
                <textarea
                  className="w-full min-h-[80px] rounded-xl border border-surface-border bg-surface-base px-3 py-2 text-sm text-text-primary"
                  value={noteInput}
                  onChange={(e) => setNoteInput(e.target.value)}
                  placeholder="Add context for the audit trail..."
                />
              </>
            )}
            <div className="flex gap-2 justify-end">
              <AppButton variant="outline" size="sm" onClick={() => setActiveForm(null)} disabled={isSaving}>
                Cancel
              </AppButton>
              <AppButton
                size="sm"
                isLoading={isSaving}
                onClick={() => {
                  if (activeForm === "owner") {
                    return runAction(() => onAssignOwner(ownerInput.trim(), noteInput.trim() || undefined));
                  }
                  if (activeForm === "due_date") {
                    return runAction(() => onSetDueDate(dueDateInput, noteInput.trim() || undefined));
                  }
                  if (activeForm === "note") {
                    if (!noteInput.trim()) {
                      setError("Note is required");
                      return;
                    }
                    return runAction(() => onAddNote(noteInput.trim()));
                  }
                  if (activeForm === "not_applicable") {
                    return runAction(() => onMarkNotApplicable(noteInput.trim() || undefined));
                  }
                  if (activeForm === "confirm") {
                    return runAction(() => onConfirmManually(noteInput.trim() || undefined));
                  }
                }}
              >
                Save
              </AppButton>
            </div>
          </div>
        )}

        {error && <p className="text-xs font-medium text-error-red">{error}</p>}

        <div className="space-y-2 pt-2 border-t border-surface-border/50">
          <div className="text-[10px] font-black text-text-secondary/70 uppercase tracking-wider mb-3">
            Actions
          </div>
          <ActionRow
            label="Add Evidence"
            description="Upload documentation to satisfy this control"
            onClick={() => onAddEvidence(task)}
            disabled={isSaving}
            primary
          />
          <ActionRow
            label="Mark Not Applicable"
            description="Control does not apply to your environment"
            onClick={() => {
              setNoteInput("");
              setActiveForm("not_applicable");
            }}
            disabled={isSaving || status === "not_applicable"}
          />
          <ActionRow
            label="Confirm Manually"
            description="Attest this control without uploading evidence"
            onClick={() => {
              setNoteInput("");
              setActiveForm("confirm");
            }}
            disabled={isSaving || status === "confirmed"}
          />
          <ActionRow
            label="Assign Owner"
            description="Delegate remediation responsibility"
            onClick={() => setActiveForm("owner")}
            disabled={isSaving}
          />
          <ActionRow
            label="Set Due Date"
            description="Track remediation deadline"
            onClick={() => setActiveForm("due_date")}
            disabled={isSaving}
          />
          <ActionRow
            label="Add Note"
            description="Append context to the audit trail"
            onClick={() => {
              setNoteInput("");
              setActiveForm("note");
            }}
            disabled={isSaving}
          />
        </div>
      </div>
    </SlideOver>
  );
}

function DetailBlock({
  label,
  value,
  highlight,
}: {
  label: string;
  value?: string;
  highlight?: boolean;
}) {
  if (!value) return null;
  return (
    <div className="space-y-1.5">
      <div className="text-[10px] font-black text-text-secondary/70 uppercase tracking-wider">{label}</div>
      <AppTypography.BodySm
        className={cn(
          "leading-relaxed font-medium",
          highlight ? "text-text-secondary border-l-2 border-error-red/30 pl-3" : "text-text-secondary",
        )}
      >
        {value}
      </AppTypography.BodySm>
    </div>
  );
}

function AppMetaInline({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[9px] font-black text-text-secondary/60 uppercase tracking-widest">{label}</div>
      <div className="text-sm font-bold text-text-primary mt-0.5">{value}</div>
    </div>
  );
}

function ActionRow({
  label,
  description,
  onClick,
  disabled,
  primary,
}: {
  label: string;
  description: string;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "w-full flex items-center justify-between gap-4 rounded-xl border px-4 py-3 text-left transition-all",
        primary
          ? "border-text-primary/20 bg-text-primary text-surface-base hover:bg-warning-amber hover:text-text-primary hover:border-warning-amber/30"
          : "border-surface-border/60 bg-surface-subtle/20 hover:border-warning-amber/30 hover:bg-warning-amber/5",
        disabled && "opacity-50 cursor-not-allowed",
      )}
    >
      <div>
        <div className={cn("text-xs font-black uppercase tracking-widest", !primary && "text-text-primary")}>
          {label}
        </div>
        <p
          className={cn(
            "text-[11px] mt-0.5 font-medium",
            primary ? "text-surface-base/80" : "text-text-secondary",
          )}
        >
          {description}
        </p>
      </div>
      <ArrowRightIcon className={cn("h-4 w-4 shrink-0", primary ? "text-surface-base" : "text-text-muted")} />
    </button>
  );
}
