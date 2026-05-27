"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  ArrowLeftIcon,
  CheckIcon,
  DownloadIcon,
  FileIcon,
  TopicIcon,
  WarningIcon,
  AlertCircleIcon,
} from "@/components/icons";
import { cn } from "@/lib/utils";
import { StatusBanner } from "@/components/ui/status-banner";
import { useToast } from "@/components/ui/toast";
import { getApiErrorMessageFromBody } from "@/lib/api/error-handler";
import { ExportBlockersCard } from "@/components/questionnaires/export-blockers-card";
import type { ExportBlockerCategory } from "@/modules/questionnaires/questionnaire-export-service";

type ExportFormat = "xlsx" | "csv";

export type ExportReadinessVerdict = "ready" | "ready_with_warnings" | "needs_review" | "incomplete" | "blocked";

export interface ExportSummary {
  verdict: ExportReadinessVerdict;
  title: string;
  message: string;
  blockerCount: number;
  warningCount: number;
  canExport: boolean;
}

interface Readiness {
  xlsxAvailable: boolean;
  csvAvailable: boolean;
  originalFileName: string | null;
  reason: string | null;
  macroSource: boolean;
  formatNotice: string | null;
  sheetNames: string[];
  targetSheetName: string | null;
  counts: {
    total: number;
    reviewed: number;
    unresolved: number;
  };
  totalQuestions: number;
  readyQuestions: number;
  answeredReadyQuestions: number;
  unansweredQuestions: number;
  suggestedButUnconfirmedQuestions: number;
  verifiedEmptyQuestions: number;
  blockedQuestions: number;
  warningQuestions: number;
  completenessPercentage: number;
  canExport: boolean;
  readinessLabel: ExportReadinessVerdict;
  summary: ExportSummary;
  exportScopeBlockedSuggestions?: number;
  exportScopeNotice?: string | null;
  staleSuggestedAnswerCount?: number;
  staleSuggestedAnswerNotice?: string | null;
  questionnaireExportStrictBuyerMode?: boolean;
  reviewedRowsBackedByExportSafeLibrary?: number;
  reviewedRowsBackedByNonExportLibrary?: number;
  reviewedRowsCustomOrNoLibraryLink?: number;
  buyerExportNotice?: string | null;
  contradictionExportBlocked?: boolean;
  contradictionBlockingRowCount?: number;
  contradictionWarningRowCount?: number;
  contradictionExportNotice?: string | null;
  contradictionExportWarnNotice?: string | null;
  questionnaireExportContradictionMediumPolicy?: "WARN" | "BLOCK";
  questionnaireExportUnansweredPolicy?: "IGNORE" | "WARN" | "BLOCK";
  questionnaireExportMinReviewedPercent?: number | null;
  completenessExportBlocked?: boolean;
  unansweredRowCount?: number;
  uncommittedSuggestionRowCount?: number;
  evidenceConflictRowCount?: number;
  blockers?: ExportBlockerCategory[];
}

interface LastExport {
  fileName: string;
  format: ExportFormat;
  sizeBytes: number;
  includedUnresolved: boolean;
}

export default function ExportPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const id = typeof params?.id === "string" ? params.id : "";

  const [title, setTitle] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [isRefreshingReadiness, setIsRefreshingReadiness] = useState(false);

  const [format, setFormat] = useState<ExportFormat>("xlsx");
  const [includeUnresolved, setIncludeUnresolved] = useState(false);
  /** When true, export omits strict buyer gating (internal-only linked text may appear). */
  const [relaxedBuyerExport, setRelaxedBuyerExport] = useState(false);
  const [lastExport, setLastExport] = useState<LastExport | null>(null);

  useEffect(() => {
    async function fetchData() {
      if (!id) return;
      try {
        const [reviewRes, readinessRes] = await Promise.all([
          fetch(`/api/questionnaires/${id}/review`),
          fetch(`/api/questionnaires/${id}/export/readiness`),
        ]);

        if (reviewRes.ok) {
          const data = await reviewRes.json();
          setTitle(data.questionnaire?.title || "Questionnaire");
        }

        if (readinessRes.ok) {
          const data = (await readinessRes.json()) as Readiness;
          setReadiness(data);
          if (!data.xlsxAvailable && data.csvAvailable) {
            setFormat("csv");
          }
        } else {
          const body = await readinessRes.json().catch(() => ({}));
          toast({
            severity: "error",
            title: "Couldn't load export readiness",
            message: getApiErrorMessageFromBody(body),
          });
        }
      } catch (err) {
        console.error("Failed to load questionnaire summary", err);
        toast({
          severity: "error",
          title: "Couldn't load questionnaire",
          message: err instanceof Error ? err.message : "Unknown error",
        });
      } finally {
        setLoading(false);
      }
    }
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const refreshReadiness = async () => {
    if (!id || isRefreshingReadiness) return;
    setIsRefreshingReadiness(true);
    try {
      const res = await fetch(`/api/questionnaires/${id}/export/readiness`, {
        cache: "no-store",
      });
      if (res.ok) {
        const data = (await res.json()) as Readiness;
        setReadiness(data);
      } else {
        const body = await res.json().catch(() => ({}));
        toast({
          severity: "error",
          title: "Couldn't refresh export readiness",
          message: getApiErrorMessageFromBody(body),
        });
      }
    } catch (err) {
      toast({
        severity: "error",
        title: "Couldn't refresh export readiness",
        message: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setIsRefreshingReadiness(false);
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const parseFileName = (contentDisposition: string | null, fallback: string): string => {
    if (!contentDisposition) return fallback;
    const starMatch = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
    if (starMatch) {
      try {
        return decodeURIComponent(starMatch[1].trim());
      } catch {
        // fallthrough
      }
    }
    const plainMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
    if (plainMatch) return plainMatch[1].trim();
    return fallback;
  };

  const handleExport = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const strictParam =
        relaxedBuyerExport && (readiness?.questionnaireExportStrictBuyerMode ?? true)
          ? "&strictBuyerExport=false"
          : "";
      const res = await fetch(
        `/api/questionnaires/${id}/export?format=${format}&includeUnresolved=${includeUnresolved}${strictParam}`,
      );

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast({
          severity: "error",
          title: "Export failed",
          message: getApiErrorMessageFromBody(body),
          persistent: true,
        });
        return;
      }

      const blob = await res.blob();
      const fileName = parseFileName(
        res.headers.get("content-disposition"),
        `${title || "questionnaire"}.${format}`,
      );

      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      setTimeout(() => URL.revokeObjectURL(url), 1000);

      setLastExport({
        fileName,
        format,
        sizeBytes: blob.size,
        includedUnresolved: includeUnresolved,
      });

      toast({
        severity: "success",
        title: "Draft handoff prepared",
        message: "Verified answers have been meticulously injected.",
      });
    } catch (err) {
      toast({
        severity: "error",
        title: "Export failed",
        message: err instanceof Error ? err.message : "Unknown error",
        persistent: true,
      });
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-base">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent-primary border-t-transparent" />
      </div>
    );
  }

  const counts = {
    total: readiness?.totalQuestions ?? 0,
    ready: readiness?.readyQuestions ?? 0,
    answered: readiness?.answeredReadyQuestions ?? 0,
    unanswered: readiness?.unansweredQuestions ?? 0,
    unconfirmed: readiness?.suggestedButUnconfirmedQuestions ?? 0,
    verifiedEmpty: readiness?.verifiedEmptyQuestions ?? 0,
  };
  const verdict = readiness?.readinessLabel ?? "incomplete";
  const canExport = readiness?.canExport ?? false;
  const xlsxAvailable = readiness?.xlsxAvailable ?? false;
  const csvAvailable = readiness?.csvAvailable ?? true;

  return (
    <div className="min-h-screen bg-surface-base text-text-primary selection:bg-accent-primary/10">
      <header className="sticky top-0 z-10 border-b border-surface-border bg-surface-panel/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6 lg:px-8">
          <div className="flex items-center gap-4">
            <Link
              href={`/app/questionnaires/${id}/review`}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-surface-border bg-surface-panel transition-colors hover:bg-surface-hover"
            >
              <ArrowLeftIcon className="h-4 w-4" />
            </Link>
            <div>
              <h1 className="text-sm font-medium text-text-primary">Handoff Preparation</h1>
              <p className="text-[11px] text-text-muted">{title}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              className="h-9 min-w-[132px] shrink-0 whitespace-nowrap rounded-lg text-xs font-bold"
              onClick={() => router.push(`/app/questionnaires/${id}/review`)}
            >
              Back to Review
            </Button>
            <Button
              className="h-9 min-w-[160px] shrink-0 gap-2 whitespace-nowrap px-4 text-xs font-bold bg-accent-primary hover:bg-accent-primary-hover rounded-lg shadow-sm"
              onClick={handleExport}
              loading={exporting}
              disabled={!canExport}
              leftIcon={<DownloadIcon className="h-3.5 w-3.5" />}
            >
              Download Handoff
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8 lg:px-8">
        <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-6 lg:col-span-1">
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold tracking-tight">Handoff Readiness & Integrity</h2>
                {verdict === "ready" ? (
                  <div className="flex items-center gap-1.5 rounded-full bg-[#10b981]/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[#10b981]">
                    <CheckIcon className="h-3 w-3" />
                    Ready for Handoff
                  </div>
                ) : verdict === "ready_with_warnings" ? (
                  <div className="flex items-center gap-1.5 rounded-full bg-[#3b82f6]/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[#3b82f6]">
                    <CheckIcon className="h-3 w-3" />
                    Ready with Warnings
                  </div>
                ) : verdict === "blocked" ? (
                  <div className="flex items-center gap-1.5 rounded-full bg-[#ef4444]/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[#ef4444]">
                    <AlertCircleIcon className="h-3 w-3" />
                    Export Blocked
                  </div>
                ) : verdict === "needs_review" ? (
                  <div className="flex items-center gap-1.5 rounded-full bg-[#f59e0b]/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[#f59e0b]">
                    <AlertCircleIcon className="h-3 w-3" />
                    Needs Review
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 rounded-full bg-[#f59e0b]/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[#f59e0b]">
                    <WarningIcon className="h-3 w-3" />
                    Review in Progress
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Card className="rounded-2xl">
                  <CardContent className="p-6 text-center">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Total</p>
                    <p className="mt-2 text-2xl font-semibold text-text-primary">{counts.total}</p>
                  </CardContent>
                </Card>
                <Card className="rounded-2xl">
                  <CardContent className="p-6 text-center">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-600">Ready</p>
                    <p className="mt-2 text-2xl font-semibold text-emerald-600">{counts.ready}</p>
                  </CardContent>
                </Card>
                <Card className="rounded-2xl">
                  <CardContent className="p-6 text-center">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-amber-600">Pending</p>
                    <p className="mt-2 text-2xl font-semibold text-amber-600">{counts.unanswered + counts.unconfirmed}</p>
                  </CardContent>
                </Card>
                <Card className="rounded-2xl">
                  <CardContent className="p-6 text-center">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Verified Empty</p>
                    <p className="mt-2 text-2xl font-semibold text-text-secondary">{counts.verifiedEmpty}</p>
                  </CardContent>
                </Card>
              </div>

              {readiness?.summary && (
                <StatusBanner
                  severity={
                    verdict === "ready"
                      ? "success"
                      : verdict === "ready_with_warnings"
                      ? "info"
                      : verdict === "blocked"
                      ? "error"
                      : "warning"
                  }
                  title={readiness.summary.title}
                  message={readiness.summary.message}
                />
              )}

              <ExportBlockersCard
                blockers={readiness?.blockers}
                onRefresh={refreshReadiness}
                isRefreshing={isRefreshingReadiness}
                verdict={verdict}
              />

              {(readiness?.reviewedRowsBackedByNonExportLibrary ?? 0) > 0 && (
                <div className="rounded-xl border border-surface-border bg-surface-panel p-4 text-xs text-text-secondary">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Reviewed rows vs library export</p>
                  <ul className="mt-2 space-y-1.5">
                    <li>
                      Export-safe library match:{" "}
                      <span className="font-semibold text-emerald-600">
                        {readiness?.reviewedRowsBackedByExportSafeLibrary ?? 0}
                      </span>
                    </li>
                    <li>
                      Still using non-export-safe library text:{" "}
                      <span className="font-semibold text-amber-600">
                        {readiness?.reviewedRowsBackedByNonExportLibrary ?? 0}
                      </span>
                    </li>
                    <li>
                      Custom / no library link:{" "}
                      <span className="font-semibold text-text-primary">
                        {readiness?.reviewedRowsCustomOrNoLibraryLink ?? 0}
                      </span>
                    </li>
                  </ul>
                </div>
              )}

              {counts.verifiedEmpty > 0 && (
                <div className="rounded-xl border border-accent-primary/20 bg-accent-primary/5 p-5">
                  <div className="flex gap-4">
                    <AlertCircleIcon className="h-5 w-5 shrink-0 text-accent-primary" />
                    <div className="space-y-1">
                      <p className="text-xs font-bold uppercase tracking-widest text-accent-primary">
                        Verified Empty Disclosure
                      </p>
                      <p className="text-xs leading-relaxed text-text-secondary">
                        <span className="font-semibold text-text-primary">{counts.verifiedEmpty} row(s)</span> have been explicitly marked as empty by a reviewer. 
                        These will be left blank in the export to preserve the original structural intent.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </section>

            {xlsxAvailable &&
              readiness?.sheetNames &&
              readiness.sheetNames.length > 0 &&
              format === "xlsx" && (
              <section className="space-y-4">
                <h3 className="text-sm font-medium text-text-muted ml-1">Source workbook structure</h3>
                <Card className="rounded-2xl">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between mb-6">
                      <p className="text-[11px] font-bold uppercase tracking-widest text-text-muted">
                        {readiness.originalFileName ?? "Source file"}
                      </p>
                      <p className="text-[10px] text-text-muted/60">
                        {readiness.sheetNames.length} sheet{readiness.sheetNames.length === 1 ? "" : "s"} preserved
                      </p>
                    </div>
                    <ul className="space-y-3">
                      {readiness.sheetNames.map((name) => {
                        const isTarget = name === readiness.targetSheetName;
                        return (
                          <li
                            key={name}
                            className={cn(
                              "flex items-center justify-between gap-3 rounded-xl border px-4 py-3",
                              isTarget
                                ? "border-accent-primary/40 bg-accent-primary/5"
                                : "border-surface-border bg-surface-panel",
                            )}
                          >
                            <div className="flex items-center gap-2">
                              <span
                                className={cn(
                                  "flex h-2 w-2 rounded-full",
                                  isTarget ? "bg-accent-primary" : "bg-text-muted/20",
                                )}
                              />
                              <span className={cn("text-xs font-medium", isTarget ? "text-text-primary" : "text-text-secondary")}>
                                {name}
                              </span>
                            </div>
                            <span
                              className={cn(
                                "text-[10px] font-bold uppercase tracking-widest",
                                isTarget ? "text-accent-primary" : "text-text-muted/60",
                              )}
                            >
                              {isTarget ? "Answers written here" : "Preserved as-is"}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </CardContent>
                </Card>
              </section>
            )}

            <section className="space-y-5">
              <h3 className="text-sm font-semibold text-text-primary">Final Format</h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => xlsxAvailable && setFormat("xlsx")}
                  disabled={!xlsxAvailable}
                  title={!xlsxAvailable ? (readiness?.reason ?? undefined) : undefined}
                  className={cn(
                    "group relative flex min-h-[132px] flex-col items-start rounded-2xl border p-6 transition-all text-left",
                    !xlsxAvailable && "opacity-50 cursor-not-allowed",
                    format === "xlsx" && xlsxAvailable
                      ? "border-accent-primary bg-accent-primary/5 ring-1 ring-accent-primary"
                      : "border-surface-border bg-surface-panel hover:border-surface-border/50 hover:bg-surface-hover",
                  )}
                >
                  <div
                    className={cn(
                      "mb-4 flex h-10 w-10 items-center justify-center rounded-xl transition-colors",
                      format === "xlsx" && xlsxAvailable
                        ? "bg-accent-primary text-white shadow-sm"
                        : "bg-surface-base text-text-muted border border-surface-border group-hover:text-text-primary group-hover:border-text-primary/20",
                    )}
                  >
                    <FileIcon className="h-5 w-5" />
                  </div>
                  <p className="text-sm font-bold text-text-primary tracking-tight">Microsoft Excel (.xlsx)</p>
                  <p className="mt-2 text-[11px] leading-relaxed text-text-muted">
                    Opens your original workbook, preserves every sheet and column, and writes only
                    the approved answers into the target sheet.
                  </p>
                  {format === "xlsx" && xlsxAvailable && (
                    <div className="absolute right-6 top-6 h-4 w-4 rounded-full bg-accent-primary flex items-center justify-center">
                      <CheckIcon className="h-2.5 w-2.5 text-white" />
                    </div>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setFormat("csv")}
                  className={cn(
                    "group relative flex min-h-[132px] flex-col items-start rounded-2xl border p-6 transition-all text-left",
                    format === "csv"
                      ? "border-accent-primary bg-accent-primary/5 ring-1 ring-accent-primary"
                      : "border-surface-border bg-surface-panel hover:border-surface-border/50 hover:bg-surface-hover",
                  )}
                >
                  <div
                    className={cn(
                      "mb-4 flex h-10 w-10 items-center justify-center rounded-xl transition-colors",
                      format === "csv" 
                        ? "bg-accent-primary text-white shadow-sm" 
                        : "bg-surface-base text-text-muted border border-surface-border group-hover:text-text-primary group-hover:border-text-primary/20",
                    )}
                  >
                    <TopicIcon className="h-5 w-5" />
                  </div>
                  <p className="text-sm font-bold text-text-primary tracking-tight">Comma Separated (.csv)</p>
                  <p className="mt-2 text-[11px] leading-relaxed text-text-muted">
                    Lean, universal format. Best for re-importing into other GRC tools.
                  </p>
                  {format === "csv" && (
                    <div className="absolute right-6 top-6 h-4 w-4 rounded-full bg-accent-primary flex items-center justify-center">
                      <CheckIcon className="h-2.5 w-2.5 text-white" />
                    </div>
                  )}
                </button>
              </div>
            </section>

            {lastExport && (
              <section className="space-y-6">
                <div className="flex items-center gap-2 px-1">
                  <h3 className="text-sm font-medium text-text-muted">Handoff Summary</h3>
                  <div className="h-px flex-1 bg-surface-border" />
                </div>
                
                <Card className="rounded-2xl border-emerald-500/20 bg-emerald-500/5 p-8 relative overflow-hidden">
                  <div className="absolute right-0 top-0 h-32 w-32 translate-x-16 -translate-y-16 rounded-full bg-emerald-500/10 blur-3xl" />
                  
                  <div className="relative flex flex-col gap-8">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-5">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-600">
                          <CheckIcon className="h-6 w-6" />
                        </div>
                        <div>
                          <p className="text-lg font-semibold text-text-primary">Draft Prepared Successfully</p>
                          <p className="text-xs text-text-muted mt-1">
                            {lastExport.fileName} • {formatBytes(lastExport.sizeBytes)}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          className="h-9 px-4 text-xs font-medium text-text-secondary hover:text-text-primary"
                          onClick={() => router.push("/app/questionnaires")}
                        >
                          Finish
                        </Button>
                        <Button
                          className="h-9 gap-2 px-5 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white"
                          onClick={handleExport}
                          loading={exporting}
                          leftIcon={<DownloadIcon className="h-3.5 w-3.5" />}
                        >
                          Download Again
                        </Button>
                      </div>
                    </div>

                    <div className="grid gap-6 md:grid-cols-2">
                      <div className="space-y-4 rounded-2xl border border-surface-border bg-surface-panel p-6">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Draft Content Coverage</p>
                        <div className="space-y-3">
                          <div className="flex items-end justify-between text-xs">
                            <span className="text-text-secondary">Approved answers written</span>
                            <span className="font-bold text-text-primary">{counts.reviewed}</span>
                          </div>
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-base">
                            <div 
                              className="h-full bg-emerald-500 transition-all duration-1000" 
                              style={{ width: `${(counts.reviewed / counts.total) * 100}%` }}
                            />
                          </div>
                          <div className="flex items-center justify-between text-[10px] text-text-muted">
                            <span>{counts.total} total rows processed</span>
                            <span>{Math.round((counts.reviewed / counts.total) * 100)}% complete</span>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-4 rounded-2xl border border-surface-border bg-surface-panel p-6">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Data Integrity Report</p>
                        <ul className="space-y-2.5">
                          <li className="flex items-center gap-2 text-xs text-text-secondary">
                            <div className="h-1 w-1 rounded-full bg-emerald-500" />
                            <span>{counts.reviewed > 0 ? "Approved content injected into target sheet" : "No approved answers to write"}</span>
                          </li>
                          <li className="flex items-center gap-2 text-xs text-text-secondary">
                            <div className="h-1 w-1 rounded-full bg-text-muted/30" />
                            <span>{counts.unresolved} unresolved rows preserved as-is</span>
                          </li>
                          <li className="flex items-center gap-2 text-xs text-text-secondary">
                            <div className="h-1 w-1 rounded-full bg-text-muted/30" />
                            <span>{readiness?.sheetNames.length ?? 0} total sheets preserved with 100% fidelity</span>
                          </li>
                        </ul>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-accent-primary/20 bg-accent-primary/5 p-6">
                      <div className="flex gap-4">
                        <AlertCircleIcon className="h-6 w-6 shrink-0 text-accent-primary" />
                        <div className="space-y-4">
                          <div>
                            <p className="text-xs font-bold uppercase tracking-widest text-accent-primary">Handoff Review Checklist</p>
                            <p className="text-xs text-text-secondary mt-2 leading-relaxed">
                              This export serves as a <span className="text-text-primary font-medium">Draft Handoff</span>. 
                              TrustDesk ensures structural integrity and precise data injection, but final context 
                              should be verified within Excel before stakeholder delivery.
                            </p>
                          </div>
                          
                          <div className="grid gap-3 sm:grid-cols-2">
                            {[
                              "Open in Microsoft Excel",
                              "Confirm top-vertical text alignment",
                              "Verify multi-sheet formatting stays intact",
                              "Sanitize proprietary internal cell notes"
                            ].map((step, i) => (
                              <div key={i} className="flex items-center gap-2 text-[11px] text-text-muted">
                                <div className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-surface-border text-[9px]">
                                  {i + 1}
                                </div>
                                {step}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>
              </section>
            )}
          </div>

          <div className="space-y-6 xl:sticky xl:top-8 self-start">
            <Card className="rounded-2xl p-6">
              <h3 className="mb-6 text-sm font-bold uppercase tracking-wider text-text-muted">Handoff Strategy</h3>

              <div className="space-y-5">
                <div className="flex items-start gap-3">
                  <div className="flex h-5 items-center">
                    <input
                      id="include-unresolved"
                      type="checkbox"
                      checked={includeUnresolved}
                      onChange={(e) => setIncludeUnresolved(e.target.checked)}
                      className="h-4 w-4 rounded border-surface-border bg-surface-panel text-accent-primary ring-offset-surface-base focus:ring-accent-primary"
                    />
                  </div>
                  <div className="text-sm">
                    <label htmlFor="include-unresolved" className="font-medium text-text-primary">
                      Include unresolved recommendations
                    </label>
                    <p className="text-xs leading-relaxed text-text-muted mt-1.5">
                      By default, unresolved rows are exported as <span className="font-medium text-text-secondary">blank</span> so nothing
                      unverified reaches the customer. Opt in to include AI-suggested answers for rows that haven't been
                      manually verified.
                    </p>
                  </div>
                </div>

                {(readiness?.questionnaireExportStrictBuyerMode ?? true) && (
                  <>
                    <div className="h-px bg-surface-border" />
                    <div className="flex items-start gap-3">
                      <div className="flex h-5 items-center">
                        <input
                          id="relaxed-buyer-export"
                          type="checkbox"
                          checked={relaxedBuyerExport}
                          onChange={(e) => setRelaxedBuyerExport(e.target.checked)}
                          className="h-4 w-4 rounded border-surface-border bg-surface-panel text-accent-primary ring-offset-surface-base focus:ring-accent-primary"
                        />
                      </div>
                      <div className="text-sm">
                        <label htmlFor="relaxed-buyer-export" className="font-medium text-text-primary">
                          Relaxed buyer export (not recommended)
                        </label>
                        <p className="text-xs leading-relaxed text-text-muted mt-1.5">
                          Workspace default hides reviewed cells that still mirror library text when that library answer is
                          not export-safe. Enable this only if you intentionally need that text in the handoff file.
                        </p>
                      </div>
                    </div>
                  </>
                )}

                <div className="rounded-2xl border border-accent-primary/20 bg-accent-primary/5 p-6 mt-4">
                  <div className="flex gap-3">
                    <AlertCircleIcon className="h-5 w-5 shrink-0 text-accent-primary" />
                    <div className="space-y-2">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-accent-primary">
                        Non-Destructive Export
                      </p>
                      <p className="text-[11px] leading-relaxed text-text-secondary">
                        TrustDesk writes approved answers into the{" "}
                        <span className="font-semibold text-text-primary">original</span> spreadsheet you uploaded.
                        Unreviewed rows are left untouched, preserving any content the customer already provided.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="pt-4">
                  <Button
                    className="w-full h-11 gap-2 whitespace-nowrap text-[13px] font-bold bg-accent-primary hover:bg-accent-primary-hover shadow-sm rounded-xl"
                    onClick={handleExport}
                    loading={exporting}
                    disabled={!canExport}
                    leftIcon={<DownloadIcon className="h-4 w-4" />}
                  >
                    {exporting ? "Generating..." : "Download Handoff"}
                  </Button>
                  {!canExport && (
                    <p className="mt-3 text-[10px] text-center text-amber-600 font-bold uppercase tracking-wider">
                      Critical blockers detected
                    </p>
                  )}
                </div>
              </div>
            </Card>

            <div className="flex flex-col gap-2 p-1">
              <p className="text-[10px] text-text-muted uppercase tracking-widest font-bold">Security Notice</p>
              <p className="text-[10px] text-text-muted leading-relaxed">
                Exports contain your workspace's proprietary trust data. Share only with authorized external parties.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
