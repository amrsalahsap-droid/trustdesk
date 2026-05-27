import { cn } from "@/lib/utils";
import { ArrowRightIcon, ClockIcon, SparklesIcon, FileIcon, EditIcon, AlertCircleIcon } from "@/components/icons";
import { KnowledgeStatusBadge, EvidencePresence, ConfidenceTier } from "@/components/trust";
import { AnswerGovernanceStatusChip } from "@/components/library/answer-governance-status-chip";
import { ExportSafetyTierBadge } from "@/components/library/export-safety-tier-badge";
import type { AnswerBlock } from "@/components/library/library-types";
import { OVERRIDE_REASON_LABELS, type OverrideReasonCategoryValue } from "@/lib/knowledge/override-reason";
import type { AnswerApprovalScope, AnswerGovernanceStatus, AnswerStatus } from "@prisma/client";
import { getAnswerExportSafetyTier } from "@/lib/knowledge/answer-export-safety";

interface LibraryAnswerRowProps {
  block: AnswerBlock;
  onOpen: () => void;
  onEdit?: () => void;
  onSubmitForReview?: () => void;
  selected?: boolean;
  onSelectChange?: (id: string, selected: boolean) => void;
  role?: string;
  currentUserId?: string | null;
  contextOnly?: boolean;
  isSubmitting?: boolean;
}

export function LibraryAnswerRow({
  block,
  onOpen,
  onEdit,
  onSubmitForReview,
  selected,
  onSelectChange,
  role,
  currentUserId,
  contextOnly = false,
  isSubmitting = false,
}: LibraryAnswerRowProps) {
  const isOwner = role === "OWNER";
  const isApprover = role === "APPROVER";

  const exportTier = getAnswerExportSafetyTier({
    status: block.status as AnswerStatus,
    governanceStatus: (block.governanceStatus ?? "DRAFT") as AnswerGovernanceStatus,
    approvalScope: (block.approvalScope ?? "INTERNAL_ONLY") as AnswerApprovalScope,
    exportSafe: block.exportSafe === true,
    nextReviewDueAt: block.nextReviewDueAt ? new Date(block.nextReviewDueAt) : null,
  });

  const isDraftSuggestion = block.status === "DRAFT";
  const ownerLabel = block.ownerUser?.name || block.owner || "Unassigned";
  const initial = (block.ownerUser?.name?.[0] || block.owner?.[0] || "?").toUpperCase();
  const approverName = (block as { approverUser?: { name?: string } }).approverUser?.name;

  const sourceDoc = block.evidence?.[0]?.docName;
  const sourceCount = block.evidence?.length ?? 0;

  const confidence = block.confidenceScore ?? 0;
  const isHighConfidence = confidence >= 0.85;

  const borderClass = isDraftSuggestion
    ? isHighConfidence
      ? "border-l-4 border-l-semantic-success"
      : "border-l-4 border-l-semantic-warning"
    : selected
      ? "border-l-4 border-l-accent-primary"
      : "border-l-4 border-l-transparent hover:border-l-accent-primary/60";

  const freshnessHint = (() => {
    if (block.governanceStatus === "EXPIRED") return { label: "Review overdue", tone: "error" as const };
    if (!block.nextReviewDueAt) return null;
    const due = new Date(block.nextReviewDueAt).getTime();
    if (Number.isNaN(due)) return null;
    const days = Math.ceil((due - Date.now()) / 86400000);
    if (days < 0) return { label: "Past review date", tone: "error" as const };
    if (days <= 14) return { label: `Review due in ${days}d`, tone: "warning" as const };
    return null;
  })();

  const needsRevision = block.governanceStatus === "REVISION_REQUIRED";
  const needsEvidence = !block.hasEvidence || sourceCount === 0;

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className={cn(
        "group relative flex cursor-pointer border-b border-surface-border bg-surface-panel px-6 py-5 transition-all duration-150 hover:bg-surface-hover/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/40 sm:px-7",
        borderClass,
        isDraftSuggestion && "bg-surface-base/60",
        selected && "bg-accent-primary/[0.03]",
        contextOnly && "opacity-70 grayscale-[0.2]",
      )}
    >
      {/* Checkbox */}
      <div className="mr-5 flex shrink-0 items-start pt-1">
        <input
          type="checkbox"
          checked={selected}
          onChange={(e) => {
            e.stopPropagation();
            onSelectChange?.(block.id, e.target.checked);
          }}
          onClick={(e) => e.stopPropagation()}
          className="h-4 w-4 rounded border-surface-border text-accent-primary focus:ring-accent-primary"
        />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between lg:gap-8">
          {/* Primary column: title, preview, source */}
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex items-center gap-3">
              <h3 className="min-w-0 flex-1 truncate text-sm font-bold text-text-primary transition-colors group-hover:text-accent-primary sm:text-base">
                {block.title}
              </h3>
              <div className="flex shrink-0 items-center gap-1.5">
                <span className="rounded bg-surface-base px-1.5 py-0.5 font-mono text-[10px] font-medium text-text-muted tabular-nums">
                  v{block.currentVersion}
                </span>
                <AnswerGovernanceStatusChip governanceStatus={block.governanceStatus} />
              </div>
            </div>

            <p className="line-clamp-2 max-w-3xl text-sm leading-relaxed text-text-secondary">
              {block.answer}
            </p>

            <div className="flex flex-wrap items-center gap-4 pt-1">
              {sourceDoc ? (
                <div className="flex items-center gap-1.5 text-[11px] font-medium text-text-muted">
                  <FileIcon className="h-3.5 w-3.5 shrink-0 opacity-70" />
                  <span className="truncate max-w-[200px]">{sourceDoc}</span>
                  {sourceCount > 1 && (
                    <span className="rounded-full bg-surface-base px-1.5 py-0.5 text-[9px] tabular-nums">
                      +{sourceCount - 1}
                    </span>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-semantic-warning">
                  <AlertCircleIcon className="h-3.5 w-3.5" />
                  No evidence
                </div>
              )}

              <div className="flex items-center gap-1.5">
                <EvidencePresence linked={block.hasEvidence} density="sm" />
                <ConfidenceTier confidenceScore={block.confidenceScore} density="sm" />
              </div>

              {freshnessHint && (
                <span
                  className={cn(
                    "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-tight",
                    freshnessHint.tone === "error"
                      ? "bg-semantic-error-bg text-semantic-error"
                      : "bg-semantic-warning-bg text-semantic-warning",
                  )}
                >
                  {freshnessHint.label}
                </span>
              )}
            </div>
          </div>

          {/* Action Column */}
          <div className="flex shrink-0 flex-row items-center gap-2 lg:flex-col lg:items-end lg:justify-center">
            {isOwner ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit?.() ?? onOpen();
                  }}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-accent-primary/20 bg-accent-primary/5 px-3 text-xs font-bold text-accent-primary transition-colors hover:bg-accent-primary/10"
                >
                  <EditIcon className="h-3.5 w-3.5" />
                  {needsRevision ? "Fix revision" : needsEvidence ? "Add evidence" : "Edit answer"}
                </button>
                {(isHighConfidence || !needsEvidence) && !needsRevision && block.governanceStatus === "DRAFT" && onSubmitForReview && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSubmitForReview();
                    }}
                    disabled={isSubmitting}
                    className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent-primary px-3 text-xs font-bold text-white shadow-sm transition-colors hover:bg-accent-primary-hover disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSubmitting ? (
                      <>
                        <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Submitting...
                      </>
                    ) : (
                      "Submit for Review"
                    )}
                  </button>
                )}
              </div>
            ) : isApprover && block.governanceStatus === "IN_REVIEW" ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpen();
                }}
                className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent-primary px-4 text-xs font-bold text-white shadow-sm transition-colors hover:bg-accent-primary-hover"
              >
                Review & Approve
              </button>
            ) : (
              <ArrowRightIcon
                className="h-5 w-5 text-text-muted/40 transition-colors group-hover:text-accent-primary"
                aria-hidden="true"
              />
            )}

            <div className="hidden lg:block">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted/60">
                {ownerLabel === "Unassigned" ? "Needs Owner" : `Owned by ${ownerLabel}`}
              </span>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

