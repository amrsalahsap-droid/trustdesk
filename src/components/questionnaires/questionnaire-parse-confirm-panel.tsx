"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { ParseDetectionSummary } from "@/components/questionnaires/parse-detection-summary";
import { ParserIssuesList } from "@/components/questionnaires/parser-issues-list";
import { ColumnMappingSelect } from "@/components/questionnaires/column-mapping-select";
import type { QuestionnaireImportPreview } from "@/lib/questionnaires/types";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { buildRowPreview } from "@/modules/questionnaires/spreadsheet-preview";

const EXPLAINER_KEY = "questionnaire-parser-explainer-dismissed";

function DetectionConfidence({ level }: { level?: "high" | "medium" | "low" }) {
  if (!level) return null;
  const label = level.charAt(0).toUpperCase() + level.slice(1);
  const variant = level === "high" ? "ok" : level === "medium" ? "processing" : "warning";
  return <StatusBadge variant={variant} label={label} />;
}

interface QuestionnaireParseConfirmPanelProps {
  jobId: string;
  workspaceId: string | null;
  fileName: string;
  initialPreview: QuestionnaireImportPreview;
  onBack: () => void;
}

export function QuestionnaireParseConfirmPanel({
  jobId,
  workspaceId,
  fileName,
  initialPreview,
  onBack,
}: QuestionnaireParseConfirmPanelProps) {
  const router = useRouter();
  const [preview, setPreview] = useState<QuestionnaireImportPreview>(initialPreview);
  const [sheet, setSheet] = useState(initialPreview.selectedSheet);
  const [headerRow1Based, setHeaderRow1Based] = useState(initialPreview.headerRow1Based);
  const [qCol, setQCol] = useState(initialPreview.questionColIndex);
  const [aCol, setACol] = useState(initialPreview.answerColIndex);
  const [suggestNewColumn, setSuggestNewColumn] = useState(!!initialPreview.suggestNewAnswerColumn);
  const [outputColumnLabel, setOutputColumnLabel] = useState("TrustDesk Suggested Answer");
  const [title, setTitle] = useState(fileName.replace(/\.(csv|xlsx|xls)$/i, ""));
  const [busy, setBusy] = useState(false);
  const [rescanBusy, setRescanBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [explainerOpen, setExplainerOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    try {
      return sessionStorage.getItem(EXPLAINER_KEY) !== "1";
    } catch {
      return true;
    }
  });

  useEffect(() => {
    setPreview(initialPreview);
    setSheet(initialPreview.selectedSheet);
    setHeaderRow1Based(initialPreview.headerRow1Based);
    setQCol(initialPreview.questionColIndex);
    setACol(initialPreview.answerColIndex);
    setSuggestNewColumn(!!initialPreview.suggestNewAnswerColumn);
  }, [initialPreview]);

  const headerRow0 = Math.min(Math.max(0, headerRow1Based - 1), Math.max(0, preview.gridSample.length - 1));
  const headersForRow = preview.gridSample[headerRow0] ?? preview.columnHeaders;

  const columnOptions = useMemo(() => {
    const labels = headersForRow.map((h, i) => ({
      index: i,
      label: h?.trim() ? `${h.trim()} (col ${i + 1})` : `Column ${i + 1}`,
    }));
    return labels.length > 0 ? labels : preview.columnHeaders.map((h, i) => ({ index: i, label: h || `Column ${i + 1}` }));
  }, [headersForRow, preview.columnHeaders]);

  const rowPreview = useMemo(() => {
    return buildRowPreview(preview.gridSample, headerRow0, qCol, aCol, 5);
  }, [preview.gridSample, headerRow0, qCol, aCol]);

  // Trim trailing columns that have no real header and no data in the sample,
  // but always include the Q and A columns.
  const displayColumnCount = useMemo(() => {
    let last = 0;
    for (let c = 0; c < preview.columnHeaders.length; c++) {
      const headerIsReal = !/^Column \d+$/.test(preview.columnHeaders[c] ?? "");
      const hasData = preview.gridSample.some((row) => (row[c] ?? "").trim() !== "");
      if (headerIsReal || hasData) last = c + 1;
    }
    return Math.max(last, qCol + 1, aCol + 1);
  }, [preview.columnHeaders, preview.gridSample, qCol, aCol]);

  const isDirty = useMemo(() => {
    return (
      headerRow1Based !== preview.headerRow1Based ||
      qCol !== preview.questionColIndex ||
      aCol !== preview.answerColIndex ||
      suggestNewColumn !== !!preview.suggestNewAnswerColumn ||
      outputColumnLabel !== "TrustDesk Suggested Answer"
    );
  }, [headerRow1Based, qCol, aCol, preview]);

  const canReset = useMemo(() => {
    if (preview.detectedHeaderRowIndex === undefined) return false;
    return (
      headerRow1Based !== (preview.detectedHeaderRowIndex + 1) ||
      qCol !== preview.detectedQuestionColIndex ||
      aCol !== preview.detectedAnswerColIndex
    );
  }, [headerRow1Based, qCol, aCol, preview]);

  // If confidence is high, we don't show the yellow "Review suggested" banner.
  // We only show it for Medium/Low confidence or if there are blocking errors.
  const hasBlockingError = preview.issues.some((i) => i.severity === "error");
  const hasRiskyIssues = preview.issues.some((i) => i.severity === "warning" || i.severity === "review");
  const reviewRequired = preview.confidence !== "high" || hasRiskyIssues || hasBlockingError;

  const dismissExplainer = useCallback(() => {
    setExplainerOpen(false);
    try {
      sessionStorage.setItem(EXPLAINER_KEY, "1");
    } catch {
      /* ignore */
    }
  }, []);

  async function rescanSheet(nextSheet: string) {
    setRescanBusy(true);
    setError(null);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (workspaceId) headers["x-workspace-id"] = workspaceId;
      const res = await fetch(`/api/questionnaires/import/${jobId}`, {
        method: "POST",
        headers,
        body: JSON.stringify({ selectedSheet: nextSheet }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data?.error?.message === "string" ? data.error.message : "Re-scan failed");
        return;
      }
      if (data.preview) {
        setPreview(data.preview as QuestionnaireImportPreview);
        setSheet((data.preview as QuestionnaireImportPreview).selectedSheet);
        setHeaderRow1Based((data.preview as QuestionnaireImportPreview).headerRow1Based);
        setQCol((data.preview as QuestionnaireImportPreview).questionColIndex);
        setACol((data.preview as QuestionnaireImportPreview).answerColIndex);
      }
    } finally {
      setRescanBusy(false);
    }
  }

  async function updateMapping() {
    setRescanBusy(true);
    setError(null);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (workspaceId) headers["x-workspace-id"] = workspaceId;
      const res = await fetch(`/api/questionnaires/import/${jobId}`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          selectedSheet: sheet,
          headerRow1Based,
          questionColIndex: qCol,
          answerColIndex: aCol
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data?.error?.message === "string" ? data.error.message : "Mapping update failed");
        return;
      }
      if (data.preview) {
        setPreview(data.preview as QuestionnaireImportPreview);
      }
    } finally {
      setRescanBusy(false);
    }
  }

  function resetToDetected() {
    if (preview.detectedHeaderRowIndex !== undefined) {
      setHeaderRow1Based(preview.detectedHeaderRowIndex + 1);
      if (preview.detectedQuestionColIndex !== undefined) setQCol(preview.detectedQuestionColIndex);
      if (preview.detectedAnswerColIndex !== undefined) setACol(preview.detectedAnswerColIndex);
    }
  }

  async function confirmImport() {
    if (qCol === aCol) {
      setError("Question and answer columns must be different.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (workspaceId) headers["x-workspace-id"] = workspaceId;
      const res = await fetch(`/api/questionnaires/import/${jobId}/confirm`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          selectedSheet: sheet,
          headerRow1Based,
          questionColIndex: qCol,
          answerColIndex: aCol,
          suggestNewAnswer: suggestNewColumn,
          outputColumnName: suggestNewColumn ? outputColumnLabel : undefined,
          title: title.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data?.error?.message === "string" ? data.error.message : "Import failed");
        return;
      }
      const qid = data.questionnaireId as string | undefined;
      if (qid) {
        router.push(`/app/questionnaires/${qid}/review`);
      }
    } finally {
      setBusy(false);
    }
  }

  const summaryVariant = preview.confidence === "high" ? "success" : "default";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Verify Structure & Layout"
        description="Verify sheet, header row, and columns before we start AI classification."
        actions={
          <button type="button" onClick={onBack} className="text-sm text-text-muted hover:text-text-secondary">
            ← Different file
          </button>
        }
      />

      <ParseDetectionSummary
        fileName={fileName}
        sheetName={preview.sheetNames.length > 1 ? sheet : undefined}
        confidence={preview.confidence}
        issueCount={preview.issues.length}
        variant={summaryVariant}
      />

      {hasBlockingError ? (
        <div className="rounded-md border border-semantic-error-border bg-semantic-error-bg px-4 py-3 text-sm text-semantic-error flex items-start gap-3">
          <div className="font-bold underline decoration-semantic-error/30 uppercase tracking-tight mt-0.5">Blocker:</div>
          <div>Mapping contains critical errors that prevent import. Please fix below.</div>
        </div>
      ) : reviewRequired ? (
        <div className="rounded-md border border-semantic-warning-border bg-semantic-warning-bg px-4 py-2.5 text-sm text-semantic-warning">
          Review suggested &mdash; the current sheet layout is non-standard and detection confidence is lower than usual.
        </div>
      ) : null}

      {error ? (
        <div className="rounded-md border border-semantic-error-border bg-semantic-error-bg px-3 py-2 text-sm text-semantic-error">
          {error}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4 rounded-lg border border-surface-border bg-surface-panel p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-text-primary">Mapping</h2>
            {canReset && (
              <Button
                variant="outline"
                size="sm"
                onClick={resetToDetected}
                className="h-7 px-2.5 text-[10px] font-semibold bg-surface-base"
              >
                Reset to Detected
              </Button>
            )}
          </div>

          {preview.sheetNames.length > 1 ? (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs font-medium text-text-muted">Workbook sheet</label>
                <DetectionConfidence level={preview.sheetConfidence} />
              </div>
              <select
                className="h-10 w-full rounded-md border border-surface-border bg-surface-base px-3 text-sm font-medium focus:ring-accent-primary"
                value={sheet}
                disabled={rescanBusy}
                onChange={(e) => {
                  const v = e.target.value;
                  setSheet(v);
                  void rescanSheet(v);
                }}
              >
                {preview.sheetNames.map((n) => {
                  const isRec = preview.scoredSheets?.[0]?.name === n;
                  return (
                    <option key={n} value={n}>
                      {n} {isRec ? "(Recommended)" : ""}
                    </option>
                  );
                })}
              </select>
              <p className="text-[10px] text-text-muted italic">
                TrustDesk detected this sheet as the most likely questionnaire. You can change this if we picked the wrong one.
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-text-muted">Source sheet</label>
              <div className="flex h-10 w-full items-center rounded-md border border-surface-border bg-surface-base/50 px-3 text-sm font-medium text-text-secondary italic">
                {sheet} (Single sheet source)
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs font-medium text-text-muted">Header row (1-based)</label>
              <DetectionConfidence level={preview.headerConfidence} />
            </div>
            <input
              type="number"
              min={1}
              max={preview.rowCount}
              className="h-10 w-full rounded-md border border-surface-border bg-surface-base px-3 text-sm tabular-nums"
              value={headerRow1Based}
              onChange={(e) => setHeaderRow1Based(Number(e.target.value) || 1)}
            />
            <p className="text-xs text-text-muted">First row of real column titles (max {preview.rowCount} in scan sample).</p>
            {preview.headerConfidence === "low" && (
              <p className="text-[10px] font-medium text-semantic-warning">
                We&apos;re not entirely sure this is the header row. Please check the &quot;Sheet Layout&quot; to confirm.
              </p>
            )}
          </div>

          <ColumnMappingSelect
            label={
              <div className="flex items-center justify-between gap-2 w-full">
                <span>Question column</span>
                <DetectionConfidence level={preview.questionConfidence} />
              </div>
            }
            value={qCol}
            options={columnOptions}
            onChange={setQCol}
          />
          {preview.questionConfidence === "low" && (
            <p className="text-[10px] font-medium text-semantic-warning -mt-3">
              We&apos;re not entirely sure this column contains questions. Please verify.
            </p>
          )}

           <ColumnMappingSelect
            label={
              <div className="flex items-center justify-between gap-2 w-full">
                <div className="flex items-center gap-2">
                  <span>Answer column</span>
                  {preview.suggestNewAnswerColumn && (
                    <StatusBadge variant="neutral" label="Recommended New" />
                  )}
                </div>
                <DetectionConfidence level={preview.answerConfidence} />
              </div>
            }
            disabled={suggestNewColumn}
            value={aCol}
            options={columnOptions}
            onChange={setACol}
          />

          <div className="flex items-center gap-3 pt-1">
             <label className="flex items-center gap-2 cursor-pointer group">
               <input
                 type="checkbox"
                 className="h-4 w-4 rounded border-surface-border text-accent-primary focus:ring-accent-primary"
                 checked={suggestNewColumn}
                 onChange={(e) => setSuggestNewColumn(e.target.checked)}
               />
               <span className="text-xs font-semibold text-text-secondary group-hover:text-text-primary transition-colors">
                 Create new output column
               </span>
             </label>
          </div>

          {suggestNewColumn && (
            <div className="space-y-2 rounded-md border border-accent-primary/20 bg-accent-primary/5 p-3 animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="space-y-1.5">
                <label
                  htmlFor="output-column-label"
                  className="text-[11px] font-bold uppercase tracking-wider text-accent-primary cursor-pointer"
                >
                  New Column Label
                </label>
                <input
                  id="output-column-label"
                  type="text"
                  placeholder="TrustDesk Suggested Answer"
                  className="h-9 w-full rounded-md border border-accent-primary/20 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-primary/50 transition-shadow"
                  value={outputColumnLabel}
                  onChange={(e) => setOutputColumnLabel(e.target.value)}
                />
              </div>
              <p className="text-[10px] text-text-secondary italic">
                A new column with this name will be prepared for generated responses.
              </p>
            </div>
          )}

          {!suggestNewColumn && preview.answerConfidence === "low" && (
            <p className="text-[10px] font-medium text-semantic-warning -mt-3">
              This column might not be for answers. Please verify in the &quot;Sheet Layout&quot;.
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2 py-2">
            {isDirty && (
              <Button size="sm" isLoading={rescanBusy} onClick={() => void updateMapping()}>
                Apply Custom Mapping
              </Button>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-text-muted">Questionnaire title</label>
            <input
              type="text"
              className="h-10 w-full rounded-md border border-surface-border bg-surface-base px-3 text-sm"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-4 rounded-lg border border-surface-border bg-surface-panel p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-text-primary">What we detected</h2>
            {explainerOpen ? (
              <button type="button" className="text-xs text-text-muted hover:text-text-secondary" onClick={dismissExplainer}>
                Dismiss
              </button>
            ) : (
              <button type="button" className="text-xs text-accent-primary hover:underline" onClick={() => setExplainerOpen(true)}>
                Show
              </button>
            )}
          </div>
          {explainerOpen ? (
            <ul className="list-inside list-disc space-y-1 text-sm text-text-secondary">
              {preview.explainerBullets.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
          ) : null}

          <ParserIssuesList issues={preview.issues} />
        </div>
      </div>

      {/* Full-width sheet layout preview */}
      <div className="rounded-lg border border-surface-border bg-surface-panel p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-text-primary">Sheet Layout</h3>
          <div className="flex items-center gap-4 text-[11px] text-text-muted">
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-sm bg-accent-primary/25 border border-accent-primary/40" />
              Question column
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-sm bg-indigo-500/20 border border-indigo-500/30" />
              Answer column
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-sm bg-accent-primary/15 border border-accent-primary/30" />
              Header row
            </span>
          </div>
        </div>

        <div className="overflow-auto rounded-lg border border-surface-border bg-surface-base shadow-inner max-h-[520px]">
          <table className="w-full text-left border-collapse">
            <colgroup>
              <col style={{ minWidth: "3rem", width: "3rem" }} />
              {preview.columnHeaders.slice(0, displayColumnCount).map((_, idx) => (
                <col key={idx} style={{ minWidth: "160px" }} />
              ))}
            </colgroup>
            <thead className="sticky top-0 z-10 bg-surface-panel border-b border-surface-border">
              <tr>
                <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-text-muted text-center border-r border-surface-border w-12">
                  #
                </th>
                {preview.columnHeaders.slice(0, displayColumnCount).map((h, idx) => {
                  const isQ = idx === qCol;
                  const isA = !suggestNewColumn && idx === aCol;
                  return (
                    <th
                      key={idx}
                      className={`px-3 py-2.5 text-xs font-semibold text-left border-r border-surface-border last:border-r-0 ${isQ ? "bg-accent-primary/15 text-accent-primary" : isA ? "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400" : "text-text-muted"}`}
                    >
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-1">
                          {isQ && (
                            <span className="shrink-0 text-[9px] bg-accent-primary text-white px-1.5 py-0.5 rounded-sm font-bold leading-none">Q</span>
                          )}
                          {isA && (
                            <span className="shrink-0 text-[9px] bg-indigo-500 text-white px-1.5 py-0.5 rounded-sm font-bold leading-none">A</span>
                          )}
                        </div>
                        <span className="truncate max-w-[180px]" title={h || `Column ${idx + 1}`}>
                          {h || `Column ${idx + 1}`}
                        </span>
                        <span className="text-[9px] text-text-muted font-normal">#{idx + 1}</span>
                      </div>
                    </th>
                  );
                })}
                {suggestNewColumn && (
                   <th className="px-3 py-2.5 text-xs font-semibold text-left border-r border-surface-border last:border-r-0 bg-indigo-500/15 text-indigo-600 dark:text-indigo-400">
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-1">
                          <span className="shrink-0 text-[9px] bg-indigo-500 text-white px-1.5 py-0.5 rounded-sm font-bold leading-none">A</span>
                        </div>
                        <span className="truncate max-w-[180px]" title={outputColumnLabel}>
                          {outputColumnLabel}
                        </span>
                        <span className="text-[9px] text-text-muted font-normal">Virtual Column</span>
                      </div>
                   </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border text-xs">
              {preview.gridSample.slice(0, 20).map((rowData, rIdx) => {
                const r1Based = rIdx + 1;
                const isHeader = r1Based === headerRow1Based;
                return (
                  <tr
                    key={rIdx}
                    className={`transition-colors ${isHeader ? "bg-accent-primary/10" : "hover:bg-surface-panel/50"}`}
                  >
                    <td
                      className={`px-2 py-2 text-center border-r border-surface-border whitespace-nowrap ${isHeader ? "font-bold text-accent-primary" : "text-text-muted"}`}
                    >
                      {isHeader ? (
                        <div className="flex flex-col items-center leading-tight">
                          <span>{r1Based}</span>
                          <span className="text-[8px] uppercase font-bold tracking-wide">HDR</span>
                        </div>
                      ) : (
                        r1Based
                      )}
                    </td>
                    {rowData.slice(0, displayColumnCount).map((cell, cIdx) => {
                      const isQCol = cIdx === qCol;
                      const isACol = !suggestNewColumn && cIdx === aCol;
                      return (
                        <td
                          key={cIdx}
                          title={cell}
                          className={[
                            "px-3 py-2 border-r border-surface-border last:border-r-0 truncate max-w-[280px]",
                            isHeader ? "font-medium text-text-primary" : "text-text-secondary",
                            isQCol && isHeader ? "bg-accent-primary/25" : isQCol ? "bg-accent-primary/8" : "",
                            isACol && isHeader ? "bg-indigo-500/20" : isACol ? "bg-indigo-500/8" : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                        >
                          {cell}
                        </td>
                      );
                    })}
                    {suggestNewColumn && (
                      <td className={`px-3 py-2 border-r border-surface-border last:border-r-0 truncate max-w-[280px] bg-indigo-500/5 italic text-text-muted/60 ${isHeader ? "bg-indigo-500/10 font-medium" : ""}`}>
                        {isHeader ? outputColumnLabel : "(Suggested results will go here)"}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <p className="text-[11px] text-text-muted italic">
          Showing up to 20 rows &middot; Scroll horizontally to see all columns &middot; Hover a cell for full text
        </p>
      </div>

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pt-4 border-t border-surface-border">
        <div className="max-w-md space-y-2">
          <h4 className="text-[10px] font-bold text-text-muted uppercase tracking-wider">What happens next?</h4>
          <p className="text-xs text-text-secondary leading-relaxed">
            TrustDesk will analyze every row, classify responses, and search your library for verified answers. You'll be able to review and edit everything in the next step.
          </p>
          <div className="flex items-center gap-2 rounded-md bg-semantic-success-bg/30 px-2 py-1.5 border border-semantic-success-border/20">
            <svg className="h-3.5 w-3.5 text-semantic-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-7.618 3.04m15.236 0L21 12a9 9 0 01-9 9 9 9 0 01-9-9l1.382-6.016" />
            </svg>
            <span className="text-[11px] font-semibold text-semantic-success-text">
              Overwrite Safety: We preserve existing answers and only fill blank cells.
            </span>
          </div>
        </div>
        <Button
          disabled={qCol === aCol}
          isLoading={busy}
          onClick={() => void confirmImport()}
          className="min-w-[180px] shadow-lg shadow-accent-primary/10"
        >
          Confirm &amp; Continue
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3 pt-2">
        <Button
          variant="outline"
          isLoading={rescanBusy}
          onClick={() => void rescanSheet(sheet)}
        >
          Re-scan sheet
        </Button>
        <Link href="/app/questionnaires" className="text-sm font-medium text-text-muted hover:text-text-secondary transition-colors">
          Cancel
        </Link>
      </div>
    </div>
  );
}
