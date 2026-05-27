"use client";

import { ConfidencePill } from "@/components/ui/confidence-pill";
import type { ParserConfidence } from "@/lib/questionnaires/types";

interface ParseDetectionSummaryProps {
  fileName: string;
  sheetName?: string;
  confidence: ParserConfidence;
  issueCount: number;
  variant?: "default" | "success";
}

export function ParseDetectionSummary({
  fileName,
  sheetName,
  confidence,
  issueCount,
  variant = "default",
}: ParseDetectionSummaryProps) {
  const tone =
    variant === "success"
      ? "border-semantic-success-border bg-semantic-success-bg/30"
      : "border-surface-border bg-surface-panel";

  return (
    <div className={`rounded-lg border px-4 py-3 ${tone}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-text-muted">File / Source</p>
          <p className="truncate text-sm font-semibold text-text-primary">
            {fileName}
            {sheetName ? <span className="text-text-muted font-normal"> → {sheetName}</span> : null}
          </p>
          <p className="mt-1 text-xs text-text-secondary leading-relaxed">
            We analyzed your workbook and selected the best candidate below.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">Parser confidence</p>
            <div className="mt-1">
              <ConfidencePill level={confidence} />
            </div>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">Flags</p>
            <p className="mt-1 text-sm tabular-nums text-text-secondary">{issueCount} note{issueCount === 1 ? "" : "s"}</p>
          </div>
        </div>
      </div>
      <p className="mt-2 text-xs text-text-muted">
        High = strong header match and consistent row shape. Medium or low means you should double-check columns before import.
      </p>
    </div>
  );
}
