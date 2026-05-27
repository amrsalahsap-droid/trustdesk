import { cn } from "@/lib/utils";

const GOVERNANCE_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  IN_REVIEW: "In review",
  APPROVED_INTERNAL: "Approved (internal)",
  APPROVED_FOR_EXPORT: "Approved (export)",
  REVISION_REQUIRED: "Revision required",
  REJECTED: "Rejected",
  EXPIRED: "Expired",
  ARCHIVED: "Archived",
};

export function AnswerGovernanceStatusChip({
  governanceStatus,
  className,
}: {
  governanceStatus?: string | null;
  className?: string;
}) {
  const g = governanceStatus || "DRAFT";
  const label = GOVERNANCE_LABELS[g] || g.replace(/_/g, " ");

  const tone =
    g === "APPROVED_FOR_EXPORT"
      ? "bg-semantic-success/10 text-semantic-success-text border-semantic-success-border"
      : g === "APPROVED_INTERNAL"
        ? "bg-accent-primary/10 text-accent-primary border-accent-primary/20"
        : g === "IN_REVIEW"
          ? "bg-semantic-info/10 text-semantic-info border-semantic-info/20"
          : g === "REVISION_REQUIRED"
            ? "bg-semantic-warning/10 text-semantic-warning border-semantic-warning-border"
            : g === "EXPIRED"
              ? "bg-semantic-error-bg/80 text-semantic-error border-semantic-error-border"
              : g === "REJECTED"
                ? "bg-semantic-error-bg text-semantic-error border-semantic-error-border"
                : "bg-surface-panel text-text-muted border-surface-border";

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-tight",
        tone,
        className,
      )}
    >
      {label}
    </span>
  );
}
