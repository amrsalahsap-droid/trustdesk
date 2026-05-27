"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { ContradictionResolutionStatus } from "@/lib/contradiction/persistence-types";
import { StatusSignal } from "@/components/ui/status-signal";
import {
  AlertCircleIcon,
  ArrowRightIcon,
  CheckIcon,
  RefreshIcon,
  WarningIcon,
} from "@/components/icons";
import { cn } from "@/lib/utils";
import {
  severityBadgeClass,
  severityLabel,
} from "@/components/questionnaires/canonical-contradiction-banner";
import type {
  ExportBlockerRow,
  ExportReadinessVerdict,
} from "@/modules/questionnaires/questionnaire-export-service";

type Gating = ExportBlockerCategory["gating"];

interface ExportBlockersCardProps {
  blockers: ExportBlockerCategory[] | null | undefined;
  /** Called when the user clicks the header refresh control; optional. */
  onRefresh?: () => void;
  /** Visual busy state for the refresh control. */
  isRefreshing?: boolean;
  verdict?: ExportReadinessVerdict;
  className?: string;
}

const KIND_COPY: Record<ExportBlockerKind, { label: string; description: string }> = {
  contradiction: {
    label: "Contradictions",
    description: "Rows that contradict approved canonical answers.",
  },
  non_export_safe_library_answer: {
    label: "Non-export-safe library answers",
    description: "Reviewed rows that mirror library answers not approved for export.",
  },
  export_scope_blocked_suggestion: {
    label: "Non-export-safe suggestions",
    description: "Unresolved rows suggesting library answers not approved for export.",
  },
  stale_suggested_answer: {
    label: "Stale library answers",
    description: "Unresolved rows reusing library answers past their review date.",
  },
  xlsx_unavailable: {
    label: "Excel export unavailable",
    description: "The source workbook cannot be used for high-fidelity export.",
  },
  macro_source: {
    label: "Macro-enabled source",
    description: "Source workbook is macro-enabled; macros will be dropped on export.",
  },
  unanswered_row: {
    label: "Unanswered rows",
    description: "Rows without a reviewed answer. Completeness gate.",
  },
  uncommitted_suggestion: {
    label: "Unreviewed recommendations",
    description: "Rows with prepared answers the reviewer has not accepted.",
  },
  evidence_conflict: {
    description:
      "Rows whose evidence sources disagreed during onboarding — reconcile before export.",
  },
  verified_empty: {
    label: "Verified empty rows",
    description: "Rows explicitly marked as empty by a reviewer.",
  },
  missing_selection_source: {
    label: "Missing selection source",
    description: "Rows with an answer but no recorded selection source.",
  },
};

const UNRESOLVED_REASON_LABEL: Record<string, string> = {
  missing_topic: "Missing topic",
  no_approved_answer: "No approved answer",
  low_confidence: "Low confidence",
  no_evidence: "No evidence",
};

function categoryTone(gating: Gating): "error" | "warning" {
  return gating === "block" ? "error" : "warning";
}

function headerSignalStatus(gating: Gating): {
  label: string;
  severity: "error" | "warning";
} {
  return gating === "block"
    ? { label: "Blocking", severity: "error" }
    : { label: "Needs Review", severity: "warning" };
}

const RESOLUTION_LABEL: Record<ContradictionResolutionStatus, string> = {
  PENDING: "Pending review",
  STALE: "Stale (canonical updated)",
  ACKNOWLEDGED: "Acknowledged",
  RESOLVED_ROW: "Resolved on row",
  RESOLVED_CANONICAL: "Resolved on canonical",
  FALSE_POSITIVE: "Dismissed",
};

function resolutionStatusLabel(
  status: ExportBlockerRow["resolutionStatus"],
): string | null {
  if (!status) return null;
  return RESOLUTION_LABEL[status] ?? null;
}

interface OverallState {
  hasAny: boolean;
  hasBlocking: boolean;
  hasWarnings: boolean;
  blockingRowCount: number;
  warningRowCount: number;
}

function summarize(blockers: ExportBlockerCategory[] | null | undefined): OverallState {
  const list = blockers ?? [];
  let blockingRowCount = 0;
  let warningRowCount = 0;
  let hasBlocking = false;
  let hasWarnings = false;
  for (const c of list) {
    if (c.gating === "block") {
      hasBlocking = true;
      // Count rows when the category is row-oriented, otherwise count the category itself.
      blockingRowCount += c.rows.length > 0 ? c.rows.length : c.count;
    } else {
      hasWarnings = true;
      warningRowCount += c.rows.length > 0 ? c.rows.length : c.count;
    }
  }
  return {
    hasAny: list.length > 0,
    hasBlocking,
    hasWarnings,
    blockingRowCount,
    warningRowCount,
  };
}

function BlockerRowItem({ row }: { row: ExportBlockerRow }) {
  const resolution = resolutionStatusLabel(row.resolutionStatus);
  const severity = row.severity ?? null;
  const unresolvedReasonLabel = row.unresolvedReason
    ? UNRESOLVED_REASON_LABEL[row.unresolvedReason] ?? row.unresolvedReason
    : null;

  return (
    <li className="flex flex-col gap-4 rounded-xl border border-surface-border bg-surface-base/60 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          {row.rowNumber !== null ? (
            <span
              className="inline-flex min-w-[2.25rem] justify-center rounded-md border border-surface-border bg-surface-panel px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-text-secondary"
              aria-label={`Row ${row.rowNumber}`}
            >
              #{row.rowNumber}
            </span>
          ) : null}
          {row.topicName ? (
            <span className="truncate text-[11px] font-semibold uppercase tracking-wide text-text-muted">
              {row.topicName}
            </span>
          ) : null}
          {severity ? (
            <span
              className={cn(
                "inline-flex rounded-md border px-2 py-0.5 text-[10px] font-black uppercase tracking-wider",
                severityBadgeClass(severity),
              )}
            >
              {severityLabel(severity)}
            </span>
          ) : null}
          {resolution ? (
            <span className="inline-flex items-center rounded-full border border-surface-border bg-surface-panel px-2 py-0.5 text-[10px] font-semibold text-text-secondary">
              {resolution}
            </span>
          ) : null}
          {unresolvedReasonLabel ? (
            <span className="inline-flex items-center rounded-full border border-surface-border bg-surface-panel px-2 py-0.5 text-[10px] font-semibold text-text-secondary">
              {unresolvedReasonLabel}
            </span>
          ) : null}
        </div>
        <p className="line-clamp-2 text-sm text-text-primary">{row.questionPreview}</p>
        {row.message ? (
          <p className="line-clamp-2 text-xs text-text-muted">{row.message}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2 self-center">
        <Link
          href={row.reviewDeepLink}
          aria-label={`Open row ${row.rowNumber ?? ""} in review`}
          className="inline-flex h-8 min-w-[72px] items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-surface-border bg-surface-panel px-3 text-[11px] font-bold text-text-primary shadow-sm transition-all hover:bg-surface-hover active:scale-[0.98] focus-ring"
        >
          Open
          <ArrowRightIcon className="h-3 w-3" />
        </Link>
      </div>
    </li>
  );
}

function CategorySection({ category }: { category: ExportBlockerCategory }) {
  const tone = categoryTone(category.gating);
  const headerStatus = headerSignalStatus(category.gating);
  const Icon = tone === "error" ? AlertCircleIcon : WarningIcon;
  const copy = KIND_COPY[category.kind];

  return (
    <section
      className={cn(
        "rounded-2xl border p-6",
        tone === "error"
          ? "border-semantic-error-border bg-semantic-error-bg/60 shadow-[0_0_12px_rgba(220,38,38,0.03)]"
          : "border-semantic-warning-border bg-semantic-warning-bg/60 shadow-[0_0_12px_rgba(217,119,6,0.03)]",
      )}
      aria-labelledby={`blocker-${category.kind}-${category.gating}`}
    >
      <header className="mb-4 flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span
            className={cn(
              "mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-full",
              tone === "error"
                ? "bg-semantic-error/15 text-semantic-error"
                : "bg-semantic-warning/15 text-semantic-warning",
            )}
            aria-hidden="true"
          >
            <Icon className="h-4 w-4" />
          </span>
          <div className="space-y-1">
            <h4
              id={`blocker-${category.kind}-${category.gating}`}
              className="text-sm font-bold text-text-primary"
            >
              {category.title}
            </h4>
            <p className="text-xs text-text-muted">{copy.description}</p>
            <p className="text-xs leading-relaxed text-text-secondary">{category.description}</p>
          </div>
        </div>
        <StatusSignal
          status={{ label: headerStatus.label, severity: headerStatus.severity }}
          variant="subtle"
        />
      </header>
      {category.rows.length > 0 ? (
        <ul className="space-y-2" role="list">
          {category.rows.map((row) => (
            <BlockerRowItem key={`${category.kind}-${category.gating}-${row.questionnaireItemId}`} row={row} />
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function ExportBlockersCard({
  blockers,
  onRefresh,
  isRefreshing,
  verdict,
  className,
}: ExportBlockersCardProps) {
  const summary = summarize(blockers);

  const overallSignal = summary.hasBlocking
    ? { label: "Export blocked", severity: "error" as const }
    : summary.hasWarnings
      ? { label: "Review recommended", severity: "warning" as const }
      : { label: "Ready to export", severity: "success" as const };

  const headerDescription = summary.hasBlocking
    ? `Resolve ${summary.blockingRowCount} blocking issue${summary.blockingRowCount === 1 ? "" : "s"} before export.${
        summary.warningRowCount > 0
          ? ` ${summary.warningRowCount} additional row${summary.warningRowCount === 1 ? "" : "s"} should also be reviewed.`
          : ""
      }`
    : summary.hasWarnings
      ? `Export is allowed, but ${summary.warningRowCount} row${summary.warningRowCount === 1 ? "" : "s"} should be reviewed first.`
      : "All pre-export checks passed for this questionnaire.";

  const refreshButton = onRefresh ? (
    <Button
      size="sm"
      variant="outline"
      onClick={onRefresh}
      disabled={isRefreshing}
      leftIcon={<RefreshIcon className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin")} />}
    >
      {isRefreshing ? "Refreshing" : "Refresh"}
    </Button>
  ) : null;

  return (
    <Card className={cn("space-y-4 rounded-2xl", className)}>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <span>Readiness Details</span>
            <StatusSignal status={overallSignal} variant="subtle" />
          </span>
        }
        description={headerDescription}
        actions={refreshButton}
      />
      <CardContent noPadding>
        {summary.hasAny ? (
          <div className="space-y-8 p-6">
            {summary.hasBlocking && (
              <div className="space-y-4">
                <h4 className="text-[10px] font-bold uppercase tracking-widest text-semantic-error ml-1 opacity-80">Critical Blockers</h4>
                {(blockers ?? [])
                  .filter((c) => c.gating === "block")
                  .map((category) => (
                    <CategorySection key={`${category.kind}-${category.gating}`} category={category} />
                  ))}
              </div>
            )}
            {summary.hasWarnings && (
              <div className="space-y-4 pt-2">
                <h4 className="text-[10px] font-bold uppercase tracking-widest text-semantic-warning ml-1 opacity-80">Review Recommendations</h4>
                {(blockers ?? [])
                  .filter((c) => c.gating === "warn")
                  .map((category) => (
                    <CategorySection key={`${category.kind}-${category.gating}`} category={category} />
                  ))}
              </div>
            )}
          </div>
        ) : verdict === "incomplete" ? (
          <div className="p-6">
            <div
              className="flex items-start gap-4 rounded-2xl border border-semantic-warning-border bg-semantic-warning-bg/60 p-5"
              role="status"
            >
              <span className="mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-full bg-semantic-warning/15 text-semantic-warning">
                <WarningIcon className="h-4 w-4" />
              </span>
              <div className="space-y-1.5">
                <p className="text-sm font-bold text-text-primary">Review in progress</p>
                <p className="text-xs text-text-muted leading-relaxed">
                  No critical contradictions or source issues block export, but some rows have not been verified yet.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-6">
            <div
              className="flex items-start gap-4 rounded-2xl border border-semantic-success-border bg-semantic-success-bg/60 p-5"
              role="status"
            >
              <span className="mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-full bg-semantic-success/15 text-semantic-success">
                <CheckIcon className="h-4 w-4" />
              </span>
              <div className="space-y-1.5">
                <p className="text-sm font-bold text-text-primary">All checks passed</p>
                <p className="text-xs text-text-muted leading-relaxed">
                  No contradictions, missing library approvals, or source issues block export for this questionnaire.
                </p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export { ExportBlockersCard };
