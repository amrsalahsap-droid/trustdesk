"use client";

import { UserIcon, ShieldCheckIcon, CalendarIcon, GlobeIcon, WarningIcon } from "@/components/icons";

import { cn } from "@/lib/utils";
import type { AnswerApprovalScope, AnswerGovernanceStatus } from "@prisma/client";

interface GovernanceSectionProps {
  ownerLabel: string;
  approverLabel: string;
  approvalScope: AnswerApprovalScope;
  governanceStatus: AnswerGovernanceStatus;
  reviewCadence?: number | null;
  nextReviewAt?: string | null;
  exportEligible: boolean;
  overrideReason?: string;
  overrideComment?: string;
  members?: { userId: string; name: string; email: string }[];
  currentOwnerId?: string | null;
  currentApproverId?: string | null;
  onUpdate?: (data: { ownerId?: string | null; approverId?: string | null }) => Promise<void>;
  canManage?: boolean;
}



import { useState } from "react";

export function GovernanceSection({
  ownerLabel,
  approverLabel,
  approvalScope,
  governanceStatus,
  reviewCadence,
  nextReviewAt,
  exportEligible,
  overrideReason,
  overrideComment,
  members = [],
  currentOwnerId,
  currentApproverId,
  onUpdate,
  canManage = false,
}: GovernanceSectionProps) {
  const [updatingField, setUpdatingField] = useState<"owner" | "approver" | null>(null);

  const handleFieldUpdate = async (field: "owner" | "approver", value: string) => {
    if (!onUpdate) return;
    setUpdatingField(field);
    try {
      await onUpdate({
        [field === "owner" ? "ownerId" : "approverId"]: value || null
      });
    } finally {
      setUpdatingField(null);
    }
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold uppercase tracking-wider text-text-primary">Governance & Ownership</h3>
      </div>
      
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <GovDetailItem 
          label="Content Owner" 
          value={ownerLabel} 
          icon={<UserIcon className="h-4 w-4" />}
          members={canManage ? members : undefined}
          currentValue={currentOwnerId || ""}
          onUpdate={(val) => handleFieldUpdate("owner", val)}
          isLoading={updatingField === "owner"}
        />
        <GovDetailItem 
          label="Reviewer / Approver" 
          value={approverLabel} 
          icon={<ShieldCheckIcon className="h-4 w-4" />}
          members={canManage ? members : undefined}
          currentValue={currentApproverId || ""}
          onUpdate={(val) => handleFieldUpdate("approver", val)}
          isLoading={updatingField === "approver"}
        />
        <GovDetailItem 
          label="Approval Scope" 
          value={approvalScope === "EXPORT_ALLOWED" ? "Internal + External (Export)" : "Internal Only"} 
          icon={<GlobeIcon className="h-4 w-4" />} 
        />
        <GovDetailItem 
          label="Next Review Cycle" 
          value={nextReviewAt ? new Date(nextReviewAt).toLocaleDateString() : (reviewCadence ? `${reviewCadence} days` : "Standard")} 
          icon={<CalendarIcon className="h-4 w-4" />} 
        />
      </div>

      {/* ... (Readiness and Override blocks remain the same) */}


      <div className={cn(
        "rounded-xl border p-4 flex items-center justify-between",
        exportEligible ? "border-semantic-success/20 bg-semantic-success/5" : "border-surface-border bg-surface-panel/40"
      )}>
        <div className="flex items-center gap-3">
          <GlobeIcon className={cn("h-5 w-5", exportEligible ? "text-semantic-success" : "text-text-muted")} />
          <div className="space-y-0.5">
            <p className="text-xs font-bold text-text-primary uppercase tracking-tight">Export Readiness</p>
            <p className="text-[11px] text-text-muted">
              {exportEligible 
                ? "Eligible for inclusion in customer questionnaire exports." 
                : "Not currently eligible for external export."}
            </p>
          </div>
        </div>
        <div className={cn(
          "h-2 w-2 rounded-full",
          exportEligible ? "bg-semantic-success animate-pulse" : "bg-text-muted/30"
        )} />
      </div>

      {overrideReason && (
        <div className="rounded-xl border border-accent-primary/20 bg-accent-primary/5 p-4 space-y-2">
          <div className="flex items-center gap-2 text-accent-primary">
            <WarningIcon className="h-4 w-4" />
            <p className="text-xs font-bold uppercase tracking-tight">Manual Override Reason</p>
          </div>

          <p className="text-[11px] font-semibold text-text-primary">{overrideReason}</p>
          {overrideComment && (
            <p className="text-[11px] leading-relaxed text-text-secondary whitespace-pre-wrap italic">
              "{overrideComment}"
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function GovDetailItem({ 
  label, 
  value, 
  icon,
  members,
  currentValue,
  onUpdate,
  isLoading
}: { 
  label: string; 
  value: string; 
  icon: React.ReactNode;
  members?: { userId: string; name: string; email: string }[];
  currentValue?: string;
  onUpdate?: (val: string) => void;
  isLoading?: boolean;
}) {
  const isInteractive = !!members && !!onUpdate;

  return (
    <div className={cn(
      "relative space-y-1.5 rounded-lg border border-surface-border p-3 transition-all",
      isInteractive && "hover:border-accent-primary/40 hover:bg-accent-primary/5 cursor-pointer group"
    )}>
      <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">{label}</p>
      
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-medium text-text-primary">
          <span className="text-text-muted/60">{icon}</span>
          <span className="truncate max-w-[140px]">{value}</span>
        </div>

        {isLoading && (
          <div className="h-3 w-3 animate-spin rounded-full border-2 border-accent-primary border-t-transparent" />
        )}
      </div>

      {isInteractive && (
        <select
          value={currentValue}
          onChange={(e) => onUpdate(e.target.value)}
          disabled={isLoading}
          className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
        >
          <option value="">Unassigned</option>
          {members.map((m) => (
            <option key={m.userId} value={m.userId}>
              {m.name || m.email}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

