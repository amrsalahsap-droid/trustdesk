import { cn } from "@/lib/utils";
import {
  EXPORT_SAFETY_SHORT_LABELS,
  type ExportSafetyTier,
} from "@/lib/knowledge/answer-export-safety";

const TONE: Record<ExportSafetyTier, string> = {
  draft_only: "border-surface-border bg-surface-base text-text-muted",
  approved_internal: "border-semantic-info/30 bg-semantic-info/10 text-semantic-info",
  approved_for_export: "border-semantic-success-border bg-semantic-success-bg text-semantic-success-text",
  restricted: "border-semantic-warning-border bg-semantic-warning/10 text-semantic-warning-text",
  not_approved: "border-semantic-error-border bg-semantic-error-bg text-semantic-error",
};

export function ExportSafetyTierBadge({
  tier,
  className,
  title,
}: {
  tier: ExportSafetyTier;
  className?: string;
  /** Extra tooltip beyond the short label */
  title?: string;
}) {
  const label = EXPORT_SAFETY_SHORT_LABELS[tier];
  const tip =
    title ??
    (tier === "approved_for_export"
      ? "Eligible for buyer-facing questionnaire export when row text matches the library answer."
      : tier === "restricted"
        ? "Not export-safe for buyers, in review, or needs renewal — check governance."
        : EXPORT_SAFETY_SHORT_LABELS[tier]);
  return (
    <span
      title={tip}
      className={cn(
        "inline-flex shrink-0 items-center rounded border px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-tight",
        TONE[tier],
        className,
      )}
    >
      {label}
    </span>
  );
}
