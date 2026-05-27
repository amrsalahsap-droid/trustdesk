"use client";

import { useState } from "react";
import type { ParseIssue } from "@/lib/questionnaires/types";
import { WarningIcon, AlertCircleIcon } from "@/components/icons";

const MAX_VISIBLE = 3;

function severityStyles(severity: ParseIssue["severity"]) {
  switch (severity) {
    case "error":
      return "border-semantic-error-border bg-semantic-error-bg text-semantic-error shadow-sm";
    case "warning":
      return "border-semantic-warning-border bg-semantic-warning-bg text-semantic-warning";
    case "review":
      return "border-indigo-200 bg-indigo-50/50 text-indigo-700 dark:border-indigo-800 dark:bg-indigo-900/20 dark:text-indigo-300";
    default:
      return "border-surface-border bg-surface-base text-text-secondary";
  }
}

function SeverityIcon({ severity, className }: { severity: ParseIssue["severity"]; className?: string }) {
  switch (severity) {
    case "error":
    case "warning":
      return <WarningIcon className={className} />;
    case "review":
      return <AlertCircleIcon className={className} />;
    default:
      return null;
  }
}

const SEVERITY_ORDER: Record<ParseIssue["severity"], number> = {
  error: 0,
  warning: 1,
  review: 2,
  info: 3,
};

interface ParserIssuesListProps {
  issues: ParseIssue[];
}

export function ParserIssuesList({ issues }: ParserIssuesListProps) {
  const [expanded, setExpanded] = useState(false);
  
  // Final UI-layer filter for legacy issues from stale cache/db
  const filteredIssues = issues
    .filter(i => 
      i.title !== "Multiple sheets" && 
      i.title !== "Empty answer cells" &&
      !i.detail.includes("other tabs were not merged")
    )
    .sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 99) - (SEVERITY_ORDER[b.severity] ?? 99));

  if (filteredIssues.length === 0) return null;

  const visible = expanded ? filteredIssues : filteredIssues.slice(0, MAX_VISIBLE);
  const hidden = filteredIssues.length - MAX_VISIBLE;

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">Possible issues</p>
      <ul className="space-y-2">
        {visible.map((issue, i) => (
          <li
            key={`${issue.title}-${i}`}
            className={`rounded-lg border px-3 py-2.5 text-sm transition-all ${severityStyles(issue.severity)}`}
          >
            <div className="flex items-start gap-2.5">
              <SeverityIcon severity={issue.severity} className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="space-y-0.5">
                <p className="font-semibold leading-tight">{issue.title}</p>
                <p className="text-[11px] leading-relaxed opacity-90">{issue.detail}</p>
              </div>
            </div>
          </li>
        ))}
      </ul>
      {!expanded && hidden > 0 ? (
        <button type="button" onClick={() => setExpanded(true)} className="text-xs font-medium text-accent-primary hover:underline">
          Show all ({issues.length})
        </button>
      ) : null}
    </div>
  );
}
