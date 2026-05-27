import { BookIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
  ReviewCanonicalContradictionDTO,
  ReviewCanonicalContradictionHitDTO,
  ReviewQuestionDTO,
} from "@/lib/questionnaires/types";

export type CheckedCanonicalContradiction = Extract<
  ReviewCanonicalContradictionDTO,
  { status: "checked" }
>;

export function isActiveCanonicalContradiction(
  c: ReviewCanonicalContradictionDTO | undefined,
): c is CheckedCanonicalContradiction {
  if (c?.status !== "checked" || c.contradictionFound !== true) return false;
  const st = c.persistence?.resolutionStatus;
  if (st != null && st !== "PENDING") return false;
  return true;
}

/**
 * Human-readable severity label. Exported so the export-blockers card and other
 * contradiction surfaces render the same casing ("Critical" / "High" / ...).
 */
export function severityLabel(severity: string | null | undefined): string {
  if (!severity) return "Unspecified";
  return severity.charAt(0).toUpperCase() + severity.slice(1);
}

/**
 * Tailwind classes for a severity-tinted pill. Exported so the export-blockers card
 * can reuse the exact same severity vocabulary used inside review drawers.
 */
export function severityBadgeClass(severity: string | null | undefined): string {
  switch (severity) {
    case "critical":
      return "bg-rose-950/90 text-white border-rose-800";
    case "high":
      return "bg-rose-700/10 text-rose-900 border-rose-300/80";
    case "medium":
      return "bg-amber-500/10 text-amber-950 border-amber-400/60";
    case "low":
      return "bg-slate-500/10 text-slate-800 border-slate-400/50";
    case "info":
      return "bg-slate-400/10 text-slate-700 border-slate-300/60";
    default:
      return "bg-violet-500/10 text-violet-950 border-violet-300/60";
  }
}

function excerptBlock(label: string, text: string) {
  const trimmed = text?.trim() || "—";
  return (
    <div className="rounded-lg border border-violet-200/60 bg-white/70 px-3 py-2.5 shadow-sm">
      <p className="text-[9px] font-black uppercase tracking-[0.14em] text-violet-700/80">{label}</p>
      <p className="mt-1.5 text-[12px] leading-relaxed text-text-primary/90">{trimmed}</p>
    </div>
  );
}

export interface CanonicalContradictionDrawerBannerProps {
  contradiction: CheckedCanonicalContradiction;
  /** Prefer final answer, else suggested — for context when hits lack excerpts */
  rowAnswerFallback: string;
  className?: string;
  /** Opens resolve flow when persistence shows an open contradiction. */
  onResolveClick?: () => void;
}

/**
 * Enterprise banner: row vs approved library truth. Distinct copy from evidence conflict.
 */
export function CanonicalContradictionDrawerBanner({
  contradiction,
  rowAnswerFallback,
  className,
  onResolveClick,
}: CanonicalContradictionDrawerBannerProps) {
  const primary: ReviewCanonicalContradictionHitDTO | undefined = contradiction.hits[0];
  const rowText =
    primary?.rowExcerpt?.trim() ||
    rowAnswerFallback.trim().slice(0, 500) ||
    "—";
  const canonicalText =
    primary?.canonicalExcerpt?.trim() ||
    contradiction.canonicalAnswerExcerpt?.trim() ||
    "—";

  return (
    <div
      className={cn(
        "rounded-xl border border-violet-300/70 bg-gradient-to-br from-violet-50/95 via-white to-indigo-50/40 p-5 shadow-sm ring-1 ring-inset ring-violet-200/40",
        className,
      )}
      role="region"
      aria-label="Canonical contradiction"
    >
      <div className="flex items-start gap-4">
        <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-violet-600/10 text-violet-800 ring-1 ring-violet-500/20">
          <BookIcon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-bold tracking-tight text-violet-950">Canonical contradiction</p>
            <span
              className={cn(
                "inline-flex rounded-md border px-2 py-0.5 text-[10px] font-black uppercase tracking-wider",
                severityBadgeClass(contradiction.severity),
              )}
            >
              {severityLabel(contradiction.severity)}
            </span>
          </div>
          <p className="text-[13px] font-semibold leading-snug text-violet-950/90">
            {contradiction.reason ||
              contradiction.message ||
              "The row answer does not match the approved policy in your answer library."}
          </p>
          {contradiction.message && contradiction.message !== contradiction.reason ? (
            <p className="text-[12px] leading-relaxed text-text-secondary">{contradiction.message}</p>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            {excerptBlock("Row answer (review)", rowText)}
            {excerptBlock("Approved canonical (library)", canonicalText)}
          </div>
          {contradiction.hits.length > 1 ? (
            <p className="text-[10px] font-medium text-violet-800/70">
              {contradiction.hits.length} rule hits; showing primary excerpts above. Rule pack v
              {contradiction.rulePackVersion}
            </p>
          ) : (
            <p className="text-[10px] font-medium text-violet-800/60">
              Rule pack v{contradiction.rulePackVersion} · detector v{contradiction.detectorVersion}
            </p>
          )}
          {onResolveClick &&
          contradiction.persistence?.resultId &&
          contradiction.persistence.resolutionStatus === "PENDING" ? (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button type="button" size="sm" variant="secondary" onClick={onResolveClick}>
                Resolve…
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** Read-only strip when a mismatch was recorded but already resolved in workflow. */
export function CanonicalContradictionResolvedStrip({
  resolutionStatus,
  className,
}: {
  resolutionStatus: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-slate-200 bg-slate-50/90 px-4 py-3 text-[12px] text-slate-800",
        className,
      )}
      role="status"
    >
      <span className="font-semibold text-slate-900">Library mismatch</span>
      <span className="text-slate-600"> — resolved ({resolutionStatus.replace(/_/g, " ").toLowerCase()}).</span>
    </div>
  );
}

export interface CanonicalContradictionListBadgeProps {
  className?: string;
  title?: string;
}

/** Compact list / table badge — visually distinct from evidence “Conflict” (amber). */
export function CanonicalContradictionListBadge({
  className,
  title = "Row disagrees with the approved canonical answer in your library. Open the drawer for details.",
}: CanonicalContradictionListBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border border-violet-400/50 bg-violet-50 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-violet-900 shadow-sm",
        className,
      )}
      title={title}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-violet-600" aria-hidden />
      Library mismatch
    </span>
  );
}

/** Evidence conflict badge wording stays separate (amber / warning). */
export function EvidenceConflictListBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border border-amber-400/60 bg-amber-50 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-amber-950",
        className,
      )}
      title="Source documents disagree (evidence-level). Not the same as library policy mismatch."
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden />
      Evidence conflict
    </span>
  );
}

export function questionHasEvidenceConflict(q: ReviewQuestionDTO): boolean {
  return q.status === "conflict";
}
