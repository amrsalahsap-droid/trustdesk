import { Button } from "@/components/ui/button";
import { StatusSignal } from "@/components/ui/status-signal";
import { CheckIcon, MagicIcon, TopicIcon, EditIcon, LinkIcon, SparklesIcon, WarningIcon } from "@/components/icons";
import type { ReviewQuestionDTO } from "@/lib/questionnaires/types";
import { OVERRIDE_REASON_LABELS, type OverrideReasonCategoryValue } from "@/lib/knowledge/override-reason";
import { getUnresolvedReasonMeta } from "@/lib/questionnaires/unresolved-reasons";
import { cn } from "@/lib/utils";
import { TopicBadge } from "./topic-badge";
import { getConfidenceSignalKey, getStatusTheme } from "@/lib/questionnaires/signals";
import { ExportSafetyTierBadge } from "@/components/library/export-safety-tier-badge";
import { PermissionGuard } from "@/components/auth/permission-guard";
import { Permission } from "@/lib/auth/permissions";
import {
  CanonicalContradictionListBadge,
  EvidenceConflictListBadge,
  isActiveCanonicalContradiction,
} from "@/components/questionnaires/canonical-contradiction-banner";
import { getRowState } from "@/lib/questionnaires/row-state";

interface ReviewRowProps {
  question: ReviewQuestionDTO;
  isSelected: boolean;
  isActive: boolean;
  onSelect: () => void;
  onActivate: () => void;
  onAccept: () => void;
  isUpdating?: boolean;
}

export function ReviewRow({
  question,
  isSelected,
  isActive,
  onSelect,
  onActivate,
  onAccept,
  isUpdating,
}: ReviewRowProps) {
  const isConflict = question.status === "conflict";
  const hasCanonicalMismatch = isActiveCanonicalContradiction(question.canonicalContradiction);
  const isReviewed = question.reviewed;
  const isHeader = question.type === "section_header";
  const isNote = question.type === "note_or_instruction";
  const isSpacer = question.type === "blank_or_spacer";
  const isOverridden =
    !!question.finalAnswer &&
    !!question.suggestedAnswer &&
    question.finalAnswer !== question.suggestedAnswer;
  
  const state = getRowState(question as any);

  // Imported-vs-suggested divergence badge: only meaningful while the reviewer has
  // not yet made a final-answer selection. Once they pick, the badge disappears
  // because the decision is durable.
  const importedTrimmed = (question.importedAnswer ?? "").trim();
  const suggestedTrimmed = (question.suggestedAnswer ?? "").trim();
  const hasImportedSuggestedDivergence =
    importedTrimmed.length > 0 &&
    suggestedTrimmed.length > 0 &&
    importedTrimmed !== suggestedTrimmed &&
    (question.finalAnswerSelection ?? null) === null &&
    !isReviewed;

  if (isSpacer) {
    return (
      <tr className="bg-surface-base/10 border-y border-surface-border/10 h-8">
        <td className="w-10 px-3 py-2.5" />
        <td className="w-10 px-1 py-2.5">
          {question.rowNumber && (
            <span className="text-[9px] font-bold text-text-muted/30">{question.rowNumber}</span>
          )}
        </td>
        <td colSpan={5} className="px-3 py-2.5">
          <div className="h-0.5 w-12 bg-surface-border/30 rounded-full" />
        </td>
      </tr>
    );
  }

  if (isHeader) {
    return (
      <tr className="bg-surface-base border-y border-surface-border/80">
        <td className="w-10 px-3 py-2.5" />
        <td className="w-10 px-1 py-2.5">
          {question.rowNumber && (
            <span className="text-[9px] font-bold text-text-muted/40 whitespace-nowrap">{question.rowNumber}</span>
          )}
        </td>
        <td colSpan={5} className="px-3 py-2.5 text-center">
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-surface-border/50" />
            <span className="text-[11px] font-black uppercase tracking-[0.2em] text-text-muted/60 whitespace-nowrap">
              {question.question}
            </span>
            <div className="h-px flex-1 bg-surface-border/50" />
          </div>
        </td>
      </tr>
    );
  }

  if (isNote) {
    return (
      <tr className="bg-surface-base/20">
        <td className="w-10 px-3 py-2" />
        <td className="w-10 px-1 py-2">
          {question.rowNumber && (
            <span className="text-[9px] font-bold tabular-nums text-text-muted/30">{question.rowNumber}</span>
          )}
        </td>
        <td colSpan={5} className="px-3 py-2">
          <div className="flex items-baseline gap-2.5">
            <span className="shrink-0 text-[9px] font-bold uppercase tracking-wider text-text-muted/40">Note</span>
            <p className="line-clamp-2 text-[12px] italic leading-relaxed text-text-muted/60">
              {question.question}
            </p>
          </div>
        </td>
      </tr>
    );
  }

  const gapMeta = getUnresolvedReasonMeta(question.unresolvedReason);
  const gapLabel = gapMeta?.label ?? null;
  const gapTone = gapMeta?.tone ?? null;

  if (typeof window !== "undefined" && (window as unknown as { __tdDiag?: boolean }).__tdDiag) {
    console.log("row.render", {
      id: question.id,
      row: question.rowNumber,
      fLen: question.finalAnswer?.length,
      sLen: question.suggestedAnswer?.length,
      reason: question.unresolvedReason,
      isReviewed: question.reviewed
    });
  }

  return (
    <tr
      data-item-id={question.id}
      onClick={onActivate}
      className={cn(
        "group cursor-pointer transition-all duration-300 ease-in-out border-l-4",
        isActive
          ? "bg-accent-primary/[0.04] border-accent-primary shadow-[inset_10px_0_20px_-15px_rgba(29,78,216,0.15)]"
          : question.isAmbiguous && !isReviewed
          ? "border-semantic-warning/60 bg-semantic-warning/[0.02] animate-pulse-subtle"
          : !isReviewed && gapTone === "error"
          ? "border-semantic-error/40 hover:border-semantic-error bg-semantic-error/[0.01]"
          : !isReviewed && gapTone === "warning"
          ? "border-semantic-warning/40 hover:border-semantic-warning bg-semantic-warning/[0.01]"
          : !isReviewed && gapTone === "primary"
          ? "border-accent-primary/40 hover:border-accent-primary bg-accent-primary/[0.01]"
          : !isReviewed && gapTone === "info"
          ? "border-semantic-info/40 hover:border-semantic-info bg-semantic-info/[0.01]"
          : !isReviewed && gapTone === "muted"
          ? "border-surface-border/60 hover:border-surface-border bg-surface-base/20"
          : "border-transparent hover:bg-surface-hover/30 hover:shadow-sm",
        isConflict && !isActive && !isReviewed
          ? "bg-semantic-warning/[0.02] border-semantic-warning/40 animate-pulse-subtle"
          : "",
        hasCanonicalMismatch && !isConflict && !isActive && !isReviewed
          ? "border-l-violet-500/55 bg-violet-500/[0.02] hover:border-l-violet-600/70"
          : "",
        hasCanonicalMismatch && isConflict && !isActive && !isReviewed
          ? "ring-1 ring-inset ring-violet-200/50"
          : "",
      )}
    >
      {/* Checkbox */}
      <td className="w-12 px-4 py-5 align-top" onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onSelect}
          className="mt-1 h-4 w-4 rounded border-surface-border text-accent-primary focus-ring"
        />
      </td>

      {/* Row number */}
      <td className="w-10 px-1 py-5 align-top">
        {question.rowNumber && (
          <span className={cn(
            "text-[10px] font-black tabular-nums tracking-tighter transition-colors",
            isActive ? "text-accent-primary/80 scale-110" : "text-text-muted/40"
          )}>
            {String(question.rowNumber).padStart(2, '0')}
          </span>
        )}
      </td>

      {/* Question + Topic */}
      <td className="px-3 py-5 align-top max-w-[400px]">
        <div className="flex flex-col gap-2">
          <p className={cn(
            "line-clamp-3 text-[14px] font-bold leading-relaxed transition-all tracking-tight",
            isActive ? "text-text-primary" : "text-text-primary/90"
          )}>
            {question.question}
          </p>
          <div className="flex flex-wrap items-center gap-2">
             <TopicBadge 
               topicName={question.topicName} 
               confidence={question.confidence}
               isAmbiguous={question.isAmbiguous}
             />
             {question.suggestedAnswerId && question.linkedAnswerExportTier ? (
               <ExportSafetyTierBadge
                 tier={question.linkedAnswerExportTier}
                 title="Linked library answer export tier (buyer-facing strict export follows export-safe answers)."
               />
             ) : null}
             {isConflict && !isReviewed ? <EvidenceConflictListBadge /> : null}
             {state === "verified_empty" && (
               <span className="inline-flex items-center gap-1 rounded-md border border-surface-border bg-surface-panel px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-text-muted">
                 Verified Empty
               </span>
             )}
             {hasCanonicalMismatch ? <CanonicalContradictionListBadge /> : null}
             {hasImportedSuggestedDivergence ? (
               <span
                 className="inline-flex items-center gap-1 rounded-md border border-semantic-warning-border bg-semantic-warning-bg px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-semantic-warning"
                 title="Imported answer differs from AI suggestion — pick one before reviewing"
               >
                 Imported ≠ suggestion
               </span>
             ) : null}
             {question.isAmbiguous && !isReviewed && (
               <div className="flex flex-col gap-1 rounded-md bg-semantic-warning/5 p-1.5 ring-1 ring-inset ring-semantic-warning/20 animate-in fade-in slide-in-from-left-2 duration-500">
                 <div className="flex items-center gap-1.5">
                   <WarningIcon className="h-2.5 w-2.5 text-semantic-warning" />
                   <span className="text-[9px] font-black uppercase tracking-widest text-semantic-warning">Ambiguity Signal</span>
                 </div>
                 <p className="text-[10px] font-bold text-semantic-warning/80 leading-tight">
                   {question.ambiguityJson?.reason === "competing_topics" ? "Multiple topics matched similarly" : "Competing sub-controls found"}
                 </p>
                 {question.ambiguityJson?.competingTopics && (
                   <div className="flex flex-wrap gap-1 mt-0.5">
                     {question.ambiguityJson.competingTopics.slice(1, 3).map((t, idx) => (
                       <span key={idx} className="text-[8px] font-medium text-semantic-warning/60 italic">
                         vs. {t.name} ({(t.score * 100).toFixed(0)}%)
                       </span>
                     ))}
                   </div>
                 )}
               </div>
             )}
          </div>
        </div>
      </td>

      {/* Suggested Answer */}
      <td className="px-3 py-5 align-top">
        <div className="relative group/answer">
          {question.finalAnswer ? (
            <div className="flex flex-col gap-1.5 transition-all">
              <div className="flex items-start gap-3">
                {!isReviewed && !question.suggestedAnswerId && (
                  <div className={cn(
                    "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg shadow-sm transition-all",
                    isActive ? "bg-accent-primary text-white" : "bg-accent-primary/10 text-accent-primary"
                  )}>
                    <SparklesIcon className="h-3.5 w-3.5" />
                  </div>
                )}
                <div className="flex flex-col gap-1.5 flex-1">
                  <div className="flex items-start gap-2">
                    <p className={cn(
                      "line-clamp-2 text-[13px] text-text-primary leading-relaxed font-medium",
                      !isReviewed && !question.suggestedAnswerId && "font-semibold"
                    )}>
                      {question.finalAnswer}
                    </p>
                    {isOverridden && (
                      <span title="Manually edited" className="shrink-0 mt-0.5 animate-in fade-in duration-500">
                        <EditIcon className="h-3.5 w-3.5 text-accent-primary/60" />
                      </span>
                    )}
                    {question.overrideReasonCategory ? (
                      <span
                        className="shrink-0 rounded border border-accent-primary/30 bg-accent-primary/5 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-tight text-accent-primary"
                        title={question.overrideComment ?? undefined}
                      >
                        {OVERRIDE_REASON_LABELS[question.overrideReasonCategory as OverrideReasonCategoryValue] ??
                          "Override"}
                      </span>
                    ) : null}
                  </div>
                  
                  {/* AI Metadata for Drafts & Finalized Answers */}
                  <div className="flex items-center gap-2">
                    {!isReviewed && !question.suggestedAnswerId && (
                      <span className="text-[9px] font-black uppercase tracking-widest text-accent-primary/70 bg-accent-primary/5 px-1.5 py-0.5 rounded ring-1 ring-accent-primary/20">AI Drafted</span>
                    )}
                    {question.provenance?.answerOrigin && (
                      <span className={cn(
                        "text-[9px] font-black uppercase tracking-widest",
                        isReviewed ? "text-text-muted/30" : "text-text-muted/50"
                      )}>
                        {question.provenance.answerOrigin === "approved_reuse" ? "Library Grounded" :
                         question.provenance.answerOrigin === "subcontrol_synthesis" ? "AI Synthesized" :
                         question.provenance.answerOrigin === "evidence_derived" ? "Evidence Derived" :
                         "Provisional Suggestion"}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              {question.suggestionStatus === "Draft candidate" && !isReviewed && (
                <StatusSignal status="q_draft_discovery" variant="badge" className="mt-1" />
              )}
            </div>
          ) : question.suggestedAnswer ? (
            <div className="flex flex-col gap-2 transition-all group-hover/answer:translate-x-1 duration-300">
              <div className="flex items-start gap-3">
                <div className={cn(
                  "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg transition-colors shadow-sm",
                  question.suggestedAnswerId
                    ? (isActive ? "bg-semantic-success text-white" : "bg-semantic-success/10 text-semantic-success")
                    : (isActive ? "bg-accent-primary text-white" : "bg-accent-primary/10 text-accent-primary")
                )}>
                  {question.suggestedAnswerId
                    ? <CheckIcon className="h-3.5 w-3.5" />
                    : <SparklesIcon className="h-3.5 w-3.5" />
                  }
                </div>
                <div className="flex flex-col gap-1.5">
                  <p className={cn(
                    "line-clamp-2 text-[13px] text-text-primary leading-relaxed font-semibold transition-all duration-500",
                    isUpdating && "opacity-40 blur-[1.5px] grayscale"
                  )}>
                    {question.suggestedAnswer}
                  </p>
                  {isUpdating && (
                    <div className="absolute inset-0 flex items-center justify-center bg-white/10 backdrop-blur-[0.5px] rounded-lg animate-in fade-in duration-500">
                      <div className="flex items-center gap-2 bg-white/90 px-3 py-1.5 rounded-full shadow-lg ring-1 ring-accent-primary/10">
                        <div className="h-2 w-2 rounded-full bg-accent-primary animate-pulse" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-accent-primary">Updating Tone...</span>
                      </div>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    {question.suggestedAnswerId
                      ? <StatusSignal status="q_verified" variant="badge" showIcon={false} className="w-fit" />
                      : <span className="text-[9px] font-black uppercase tracking-widest text-accent-primary/70 bg-accent-primary/5 px-1.5 py-0.5 rounded ring-1 ring-accent-primary/20">AI Drafted</span>
                    }
                    {question.sources.length > 0 && (
                      <div className="flex items-center gap-1 rounded bg-accent-primary/5 px-1.5 py-0.5 ring-1 ring-accent-primary/10">
                        <LinkIcon className="h-2.5 w-2.5 text-accent-primary/70" />
                        <span className="text-[9px] font-black text-accent-primary/80 uppercase tracking-tight">
                          {question.provenance?.answerOrigin === "approved_reuse" ? "Approved Reuse" :
                           question.provenance?.answerOrigin === "subcontrol_synthesis" ? "Synthesized" :
                           question.provenance?.answerOrigin === "evidence_only" ? "Evidence Base" :
                           question.sources.length > 1 ? `${question.sources.length} Sources` : "Grounded"}
                        </span>
                      </div>
                    )}
                    {question.provenance?.answerOrigin && (
                      <span className={cn(
                        "text-[9px] font-bold uppercase tracking-tight",
                        isReviewed ? "text-text-muted/40" : "text-text-muted/60"
                      )}>
                        {question.provenance.answerOrigin === "approved_reuse" ? "Approved answer reused" :
                         question.provenance.answerOrigin === "subcontrol_synthesis" ? "Synthesized from approved sub-controls" :
                         question.provenance.answerOrigin === "evidence_derived" ? "Derived from evidence" :
                         "No trustworthy answer generated"}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : question.suggestionStatus === "Draft candidate available" ? (
            <div className="flex flex-col gap-2 transition-all group-hover/answer:translate-x-1 duration-300">
              <div className="flex items-center gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-semantic-warning/10 text-semantic-warning">
                  <SparklesIcon className="h-3.5 w-3.5" />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[12px] font-bold text-semantic-warning italic tracking-tight">Draft match discovery available...</span>
                  <StatusSignal status="q_draft_discovery" variant="badge" showIcon={false} className="w-fit scale-90 -ml-1" />
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <div className="flex gap-1.5 text-text-muted/30 italic text-[12px]">
                {isReviewed ? "Intentionally Blank" : "No verified match"}
              </div>
            </div>
          )}
        </div>
      </td>

      {/* Confidence */}
      <td className="w-24 px-3 py-5 align-top">
        <div className="flex flex-col gap-1.5 min-w-[100px]">
          <StatusSignal
            status={getConfidenceSignalKey(question.confidence)}
            variant={question.confidence === "high" ? "solid" : "badge"}
          />
          {!isReviewed && gapLabel && (
            <span className={cn(
              "inline-flex w-fit items-center rounded-sm px-1.5 py-0.5 text-[8px] font-black uppercase tracking-widest ring-1 ring-inset whitespace-nowrap",
              gapTone === "primary" ? "bg-accent-primary/5 text-accent-primary ring-accent-primary/20" :
              gapTone === "info" ? "bg-semantic-info/5 text-semantic-info ring-semantic-info/20" :
              gapTone === "error" ? "bg-semantic-error/5 text-semantic-error ring-semantic-error/20" :
              gapTone === "muted" ? "bg-surface-border/20 text-text-muted ring-surface-border" :
              "bg-semantic-warning/5 text-semantic-warning ring-semantic-warning/20"
            )}>
              {gapLabel}
            </span>
          )}
        </div>
      </td>

      {/* Workflow Status */}
      <td className="w-28 px-3 py-5 align-top">
        {(() => {
          const theme = getStatusTheme(question.verificationStatus);
          const hasAnswer = (question.finalAnswer ?? "").trim().length > 0;
          const isMissingSource = question.reviewed && hasAnswer && !question.finalAnswerSelection;

          return (
            <div className="flex flex-col gap-1.5">
              <div className={cn(
                "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wider shadow-sm transition-all border whitespace-nowrap",
                theme.className
              )}>
                {theme.label}
              </div>

              {question.reviewed && question.finalAnswerSelection && (
                <span className="text-[9px] font-bold text-text-muted/60 uppercase tracking-tight px-1">
                  Source: {
                    question.finalAnswerSelection === "imported" ? "Imported" :
                    question.finalAnswerSelection === "suggested" ? "Suggested" :
                    question.finalAnswerSelection === "edited" ? "Edited" :
                    question.finalAnswerSelection === "canonical_aligned" ? "Canonical aligned" :
                    question.finalAnswerSelection
                  }
                </span>
              )}

              {isMissingSource && (
                <span className="inline-flex items-center gap-1 rounded bg-semantic-warning/10 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest text-semantic-warning ring-1 ring-inset ring-semantic-warning/20">
                  <WarningIcon className="h-2.5 w-2.5" />
                  Missing source
                </span>
              )}
            </div>
          );
        })()}
      </td>

      {/* Actions */}
      <td className="w-28 px-3 py-5 align-top" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-2 group-hover:translate-x-0">
          <PermissionGuard permission={Permission.REVIEW_ROWS}>
            {!isReviewed && question.suggestedAnswer && (
              <Button
                variant="outline"
                size="icon"
                onClick={onAccept}
                disabled={hasImportedSuggestedDivergence}
                title={hasImportedSuggestedDivergence ? "Ambiguity detected: you must choose a source in the drawer" : "Quick Accept [A]"}
                className={cn(
                  "h-9 w-9 border-surface-border bg-white shadow-sm transition-all",
                  hasImportedSuggestedDivergence 
                    ? "opacity-40 cursor-not-allowed grayscale" 
                    : "text-text-secondary hover:border-semantic-success-border hover:bg-semantic-success-bg hover:text-semantic-success hover:scale-105"
                )}
              >
                {hasImportedSuggestedDivergence ? (
                   <WarningIcon className="h-4 w-4 text-semantic-warning" />
                ) : (
                   <CheckIcon className="h-4 w-4" />
                )}
              </Button>
            )}
          </PermissionGuard>
          <Button
            variant="ghost"
            size="icon"
            onClick={onActivate}
            title="View Details [J/K]"
            className={cn(
              "h-9 w-9 transition-all hover:scale-110",
              isActive ? "text-accent-primary bg-accent-primary/10" : "text-text-muted hover:text-text-primary"
            )}
          >
            <ArrowRightIcon className="h-4 w-4" />
          </Button>
        </div>
      </td>
    </tr>
  );
}

function ArrowRightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  );
}
