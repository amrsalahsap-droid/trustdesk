"use client";

import type { SourceDocumentRow } from "@/lib/documents/document-display";
import { isDocumentInFlight } from "@/lib/documents/document-display";

interface DocumentsActivityBarProps {
  documents: SourceDocumentRow[];
  lastFetchedAt: Date | null;
  isRefreshing: boolean;
  onRefresh: () => void;
}

export function DocumentsActivityBar({ documents, lastFetchedAt, isRefreshing, onRefresh }: DocumentsActivityBarProps) {
  const active = documents.filter(isDocumentInFlight);
  if (active.length === 0) return null;

  const preview = active.slice(0, 3).map((d) => d.originalName);
  const rest = active.length - preview.length;

  const timeLabel = lastFetchedAt
    ? lastFetchedAt.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : "—";

  return (
    <div className="flex flex-col gap-2 border-b border-surface-border bg-surface-base/40 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
      <div className="min-w-0">
        <p className="text-xs font-medium text-text-primary">
          {active.length} {active.length === 1 ? "file" : "files"} processing
        </p>
        <p className="mt-0.5 truncate text-xs text-text-muted" title={active.map((d) => d.originalName).join(", ")}>
          {preview.join(" · ")}
          {rest > 0 ? ` · +${rest} more` : ""}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-3 text-xs text-text-muted">
        <span>Last checked {timeLabel}</span>
        <button
          type="button"
          onClick={onRefresh}
          disabled={isRefreshing}
          className="font-medium text-accent-primary hover:underline disabled:opacity-50"
        >
          {isRefreshing ? "Refreshing…" : "Refresh"}
        </button>
      </div>
    </div>
  );
}
