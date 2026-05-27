"use client";

import { CloseIcon } from "@/components/icons";
import { KnowledgeStatusBadge } from "@/components/trust/knowledge-status-badge";
import { formatAnswerUpdated } from "@/components/library/answer/answer-format";
import { cn } from "@/lib/utils";

interface AnswerIdentityBandProps {
  topicName: string;
  title: string;
  status: string;
  ownerLabel: string;
  ownerInitial: string;
  hasOwner: boolean;
  updatedAtRaw: string | Date | null | undefined;
  currentVersion: number;
  confidenceScore: number | null;
  governanceStatus?: string;
  onClose: () => void;
}

export function AnswerIdentityBand({
  topicName,
  title,
  status,
  ownerLabel,
  ownerInitial,
  hasOwner,
  updatedAtRaw,
  currentVersion,
  confidenceScore,
  governanceStatus,
  onClose,
}: AnswerIdentityBandProps) {
  const isAiSuggested = confidenceScore !== null;
  const isHighConfidence = (confidenceScore ?? 0) >= 0.85;
  const isModified = currentVersion > 1; // D10-US-04: If we have multiple versions but still draft
  const isApproved = governanceStatus === "APPROVED_INTERNAL" || governanceStatus === "APPROVED_FOR_EXPORT";
  const { absolute, relative } = formatAnswerUpdated(updatedAtRaw);
  const statusNorm = (status || "DRAFT").toUpperCase();
  const draftBanner = statusNorm === "DRAFT";

  return (
    <div className="sticky top-0 z-10 border-b border-white/10 bg-surface-base/95 backdrop-blur-sm">
      <div className="p-6 pb-4">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-accent-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-accent-primary">
                {topicName || "Topic"}
              </span>
              <KnowledgeStatusBadge status={status} />
            </div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-text-muted">Official knowledge answer</p>
            <h2 className="text-xl font-bold leading-tight text-text-primary sm:text-2xl">{title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-full p-1.5 text-text-muted transition-colors hover:bg-white/5 hover:text-text-primary"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-white/5 pt-3 text-sm text-text-secondary">
          <div className="flex min-w-0 items-center gap-2">
            <div
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold ${
                hasOwner
                  ? "border-accent-primary/20 bg-accent-primary/20 text-accent-primary"
                  : "border-white/10 bg-white/5 text-text-muted"
              }`}
            >
              {ownerInitial}
            </div>
            <span className={`min-w-0 truncate ${hasOwner ? "font-medium text-text-primary" : "italic text-text-muted"}`}>
              {ownerLabel}
            </span>
          </div>
          <span className="tabular-nums text-xs text-text-muted" title={absolute}>
            Updated {relative ? `${relative} · ` : ""}
            {absolute}
          </span>
          <span className="text-xs font-semibold tabular-nums text-accent-primary">v{currentVersion || 1}</span>
        </div>

        {isAiSuggested && !isApproved ? (
          <p className="mt-3 text-[11px] text-text-muted">
            <span className={cn(
              "font-bold uppercase tracking-tight",
              isHighConfidence ? "text-semantic-success" : "text-semantic-warning"
            )}>
              {isHighConfidence ? "High-Confidence Suggestion" : "Review Required"}
            </span>
            {" · "}
            {isModified ? (
              <span className="italic">Refined by workspace user from AI original.</span>
            ) : (
              <span>Synthesized from document evidence. Verify and approve for your library.</span>
            )}
          </p>
        ) : null}
      </div>

      {draftBanner ? (
        <div className="border-t border-semantic-warning-border bg-semantic-warning-bg px-6 py-2.5 text-xs text-semantic-warning">
          Draft — not treated as approved library content until you mark it approved.
        </div>
      ) : null}
    </div>
  );
}
