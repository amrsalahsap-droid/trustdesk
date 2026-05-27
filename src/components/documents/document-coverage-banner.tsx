"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface CoverageReport {
  documentCount: number;
  chunkCount: number;
  classifiedChunkCount: number;
  orphanChunkCount: number;
  orphanChunkPct: number;
  uniqueTopicsWithChunks: number;
  topicsWithApprovedAnswers: number;
  totalApprovedAnswers: number;
  totalDraftAnswers: number;
  missingSubControlCount: number;
  unusedDocuments: Array<{ id: string; fileName: string; chunkCount: number; classifiedChunks: number }>;
}

interface DocumentCoverageBannerProps {
  className?: string;
}

type BannerTone = "healthy" | "caution" | "warning";

function toneFromReport(report: CoverageReport | null): BannerTone {
  if (!report || report.documentCount === 0) return "caution";
  if (report.orphanChunkPct >= 50 || report.topicsWithApprovedAnswers < 3) return "warning";
  if (report.orphanChunkPct >= 20 || report.missingSubControlCount > 0 || report.totalDraftAnswers > 0) return "caution";
  return "healthy";
}

/**
 * Surfaces the upstream "value path" health of a workspace so reviewers can
 * see — before opening any questionnaire — how much of their uploaded
 * evidence is actually indexed and how many library answers are approved.
 *
 * Lives at the top of the documents page. Offers one-click reclassify /
 * reseed so operators can recover from ingestion stalls without leaving
 * the page. Designed to be additive (safe to render even when the coverage
 * API returns an error — the banner stays hidden in that case).
 */
export function DocumentCoverageBanner({ className }: DocumentCoverageBannerProps) {
  const [report, setReport] = useState<CoverageReport | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "refreshing" | "error">("idle");
  const [busyAction, setBusyAction] = useState<null | "reclassify" | "reseed">(null);
  const [lastMessage, setLastMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setStatus((prev) => (prev === "idle" ? "loading" : "refreshing"));
    try {
      const res = await fetch("/api/workspaces/coverage", { cache: "no-store" });
      if (!res.ok) throw new Error(`coverage_failed_${res.status}`);
      const json = (await res.json()) as { report: CoverageReport };
      setReport(json.report);
      setStatus("idle");
    } catch {
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const runAction = useCallback(
    async (action: "reclassify" | "reseed") => {
      setBusyAction(action);
      setLastMessage(null);
      try {
        const res = await fetch("/api/workspaces/coverage", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        });
        if (!res.ok) throw new Error(`action_failed_${res.status}`);
        const json = (await res.json()) as {
          report: CoverageReport;
          documentsReclassified?: number;
          totalMatches?: number;
          created?: number;
          skipped?: number;
        };
        setReport(json.report);
        if (action === "reclassify") {
          setLastMessage(
            `Reclassified ${json.documentsReclassified ?? 0} documents — ${json.totalMatches ?? 0} topic links.`,
          );
        } else {
          setLastMessage(`Seeded ${json.created ?? 0} new draft answers (${json.skipped ?? 0} skipped).`);
        }
      } catch {
        setLastMessage("Action failed. Check server logs and retry.");
      } finally {
        setBusyAction(null);
      }
    },
    [],
  );

  if (status === "loading" && !report) return null;
  if (status === "error") return null;
  if (!report || report.documentCount === 0) return null;

  const tone = toneFromReport(report);
  const toneStyles: Record<BannerTone, string> = {
    healthy: "border-emerald-200/60 bg-white ring-1 ring-emerald-500/5 shadow-sm",
    caution: "border-amber-200/60 bg-white ring-1 ring-amber-500/5 shadow-sm",
    warning: "border-rose-200/60 bg-white ring-1 ring-rose-500/5 shadow-sm",
  };
  const headlineStyles: Record<BannerTone, string> = {
    healthy: "text-emerald-900",
    caution: "text-amber-900",
    warning: "text-rose-900",
  };

  const orphanedCount = report.orphanChunkCount;
  const approvalRate = report.topicsWithApprovedAnswers;

  return (
    <Card className={cn("border", toneStyles[tone], className)}>
      <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
        <div className="flex-1">
          <p className={cn("text-sm font-semibold uppercase tracking-wide", headlineStyles[tone])}>
            Document coverage
          </p>
          <p className="mt-1 text-sm text-text-secondary">
            {report.classifiedChunkCount} of {report.chunkCount} chunks indexed
            {orphanedCount > 0 ? ` · ${orphanedCount} chunks orphaned (${report.orphanChunkPct}%)` : ""}
            {" · "}
            {approvalRate} topics have approved answers
            {report.totalDraftAnswers > 0 ? ` · ${report.totalDraftAnswers} drafts awaiting review` : ""}
            {report.missingSubControlCount > 0
              ? ` · ${report.missingSubControlCount} sub-controls uncovered`
              : ""}
            .
          </p>
          {report.unusedDocuments.length > 0 && (
            <p className="mt-1 text-xs text-text-muted">
              Documents with zero classified chunks: {report.unusedDocuments
                .slice(0, 3)
                .map((d) => d.fileName)
                .join(", ")}
              {report.unusedDocuments.length > 3 ? `, +${report.unusedDocuments.length - 3} more` : ""}
            </p>
          )}
          {lastMessage && <p className="mt-2 text-xs text-text-muted">{lastMessage}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => runAction("reclassify")}
            loading={busyAction === "reclassify"}
            disabled={busyAction !== null}
          >
            Reclassify evidence
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => runAction("reseed")}
            loading={busyAction === "reseed"}
            disabled={busyAction !== null}
          >
            Reseed answers
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
