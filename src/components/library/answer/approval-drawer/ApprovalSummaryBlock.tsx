"use client";

import { SparklesIcon, AlertCircleIcon, ShieldCheckIcon } from "@/components/icons";
import { cn } from "@/lib/utils";

interface ApprovalSummaryBlockProps {
  status: string;
  governanceStatus: string;
  confidenceScore: number | null;
  currentVersion: number;
  isModified: boolean;
  overrideReason?: string;
}

export function ApprovalSummaryBlock({
  status,
  governanceStatus,
  confidenceScore,
  currentVersion,
  isModified,
  overrideReason,
}: ApprovalSummaryBlockProps) {
  const isDraft = status === "DRAFT";
  const isApproved = governanceStatus === "APPROVED_INTERNAL" || governanceStatus === "APPROVED_FOR_EXPORT";
  const isHighConfidence = (confidenceScore ?? 0) >= 0.85;
  const isInReview = governanceStatus === "IN_REVIEW";

  if (isApproved) {
    return (
      <div className="rounded-xl border border-semantic-success/20 bg-semantic-success/5 p-4 flex items-start gap-3">
        <ShieldCheckIcon className="h-5 w-5 text-semantic-success shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="text-xs font-bold text-semantic-success uppercase tracking-tight">Verified Content</p>
          <p className="text-xs leading-relaxed text-text-secondary">
            This answer is approved and verified. It is active in the library and available for use in automated responses.
          </p>
        </div>
      </div>
    );
  }

  if (isInReview) {
    return (
      <div className="rounded-xl border border-accent-primary/20 bg-accent-primary/5 p-4 flex items-start gap-3">
        <AlertCircleIcon className="h-5 w-5 text-accent-primary shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="text-xs font-bold text-accent-primary uppercase tracking-tight">Pending Approval</p>
          <p className="text-xs leading-relaxed text-text-secondary">
            This content is currently in the formal review queue. Review the evidence and metadata below to make an approval decision.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn(
      "rounded-xl border p-4 flex items-start gap-3",
      isHighConfidence ? "border-semantic-success/20 bg-semantic-success/5" : "border-semantic-warning/20 bg-semantic-warning/5"
    )}>
      {isHighConfidence ? (
        <SparklesIcon className="h-5 w-5 text-semantic-success shrink-0 mt-0.5" />
      ) : (
        <AlertCircleIcon className="h-5 w-5 text-semantic-warning shrink-0 mt-0.5" />
      )}
      <div className="space-y-1">
        <p className={cn(
          "text-xs font-bold uppercase tracking-tight",
          isHighConfidence ? "text-semantic-success" : "text-semantic-warning"
        )}>
          {isHighConfidence ? "AI Generated Draft" : "Review Required"}
        </p>
        <p className="text-xs leading-relaxed text-text-secondary">
          {isModified ? (
            <span>This is a draft refined by a workspace user. Review and approve to finalize for library use.</span>
          ) : (
            <span>This answer was synthesized from document evidence. It is not treated as approved library content until explicitly approved.</span>
          )}
        </p>
      </div>
    </div>
  );
}
