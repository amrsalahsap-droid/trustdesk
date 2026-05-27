"use client";

import { CloseIcon, ShieldCheckIcon, UserIcon, ClockIcon, LayersIcon } from "@/components/icons";
import { KnowledgeStatusBadge } from "@/components/trust/knowledge-status-badge";
import type { AnswerStatus } from "@prisma/client";
import { formatAnswerUpdated } from "@/components/library/answer/answer-format";

import { cn } from "@/lib/utils";
import { AnswerGovernanceStatusChip } from "@/components/library/answer-governance-status-chip";

interface ApprovalDrawerHeaderProps {
  topicName: string;
  title: string;
  status: AnswerStatus;
  governanceStatus: string;

  ownerLabel: string;
  approverLabel?: string;
  updatedAtRaw: string | Date | null | undefined;
  currentVersion: number;
  confidenceScore: number | null;
  evidenceCount: number;
  onClose: () => void;
}

export function ApprovalDrawerHeader({
  topicName,
  title,
  status,
  governanceStatus,
  ownerLabel,
  approverLabel,
  updatedAtRaw,
  currentVersion,
  confidenceScore,
  evidenceCount,
  onClose,
}: ApprovalDrawerHeaderProps) {
  const { absolute, relative } = formatAnswerUpdated(updatedAtRaw);

  return (
    <div className="sticky top-0 z-20 border-b border-surface-border bg-surface-base/95 p-6 pb-5 backdrop-blur-md">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-accent-primary/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-accent-primary border border-accent-primary/20">
              {topicName || "Topic"}
            </span>
            <AnswerGovernanceStatusChip governanceStatus={governanceStatus} />
          </div>
          <h2 className="text-xl font-bold leading-tight text-text-primary sm:text-2xl tracking-tight">{title}</h2>
          
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] font-medium text-text-muted">
            <div className="flex items-center gap-1.5">
              <ClockIcon className="h-3.5 w-3.5" />
              <span>{relative ? `${relative} · ` : ""}{absolute}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <LayersIcon className="h-3.5 w-3.5" />
              <span className="text-accent-primary font-bold">v{currentVersion || 1}</span>
            </div>
          </div>
        </div>
        
        <button
          type="button"
          onClick={onClose}
          className="group flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-surface-border transition-all hover:bg-surface-hover hover:border-text-muted/20"
          aria-label="Close drawer"
        >
          <CloseIcon className="h-5 w-5 text-text-muted transition-colors group-hover:text-text-primary" />
        </button>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
        <MetadataCard label="Status" value={<KnowledgeStatusBadge status={status} />} />
        <MetadataCard 
          label="Owner" 
          value={ownerLabel} 
          icon={<UserIcon className="h-3.5 w-3.5" />} 
          tone={ownerLabel === "Unassigned" ? "muted" : "default"}
        />
        <MetadataCard 
          label="Approver" 
          value={approverLabel || "Unassigned"} 
          icon={<ShieldCheckIcon className="h-3.5 w-3.5" />}
          tone={!approverLabel ? "muted" : "default"}
        />
        <MetadataCard label="Evidence" value={`${evidenceCount} source${evidenceCount === 1 ? "" : "s"}`} />
        <MetadataCard 
          label="Confidence" 
          value={confidenceScore !== null ? `${Math.round(confidenceScore * 100)}%` : "N/A"} 
          tone={confidenceScore && confidenceScore >= 0.8 ? "success" : "default"}
        />
      </div>
    </div>
  );
}

function MetadataCard({ label, value, icon, tone = "default" }: { label: string; value: React.ReactNode; icon?: React.ReactNode; tone?: "default" | "muted" | "success" | "warning" }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-surface-border bg-surface-panel/40 p-3 shadow-sm transition-colors hover:bg-surface-panel/60">
      <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">{label}</span>
      <div className={cn(
        "flex items-center gap-1.5 text-xs font-semibold truncate",
        tone === "muted" && "italic text-text-muted",
        tone === "success" && "text-semantic-success",
        tone === "warning" && "text-semantic-warning",
        tone === "default" && "text-text-primary"
      )}>
        {icon}
        <span className="truncate">{value}</span>
      </div>
    </div>
  );
}
