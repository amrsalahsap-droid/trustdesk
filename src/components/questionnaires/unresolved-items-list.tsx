"use client";

import { useMemo, useEffect, type ComponentType } from "react";
import type { ReviewQuestionDTO } from "@/lib/questionnaires/types";
import { cn } from "@/lib/utils";
import {
  CheckIcon,
  TopicIcon,
  SparklesIcon,
  WarningIcon,
  SearchIcon,
  MagicIcon,
  AlertCircleIcon,
  ArrowRightIcon,
} from "@/components/icons";
import { ConfidencePill } from "@/components/ui/confidence-pill";
import { Button } from "@/components/ui/button";
import {
  UNRESOLVED_REASONS,
  UNRESOLVED_REASON_KEYS,
  getUnresolvedReasonMeta,
  type UnresolvedReason,
  type UnresolvedReasonTone,
} from "@/lib/questionnaires/unresolved-reasons";
import {
  CanonicalContradictionListBadge,
  EvidenceConflictListBadge,
  isActiveCanonicalContradiction,
} from "@/components/questionnaires/canonical-contradiction-banner";

interface UnresolvedItemsListProps {
  questions: ReviewQuestionDTO[];
  activeId: string | null;
  selectedIds: Set<string>;
  onSelectRow: (id: string) => void;
  onActivateRow: (id: string) => void;
  onAcceptRow: (id: string) => void;
}

type IconComponent = ComponentType<{ className?: string }>;

// Bias one icon per reason code so frequent reasons have distinctive glyphs;
// fall back to the tone bucket for anything else (including unknown codes).
const REASON_ICON: Partial<Record<UnresolvedReason, IconComponent>> = {
  missing_topic: TopicIcon,
  no_approved_answer: MagicIcon,
  no_evidence: SearchIcon,
  low_quality_draft: WarningIcon,
  low_confidence: SparklesIcon,
  mapping_weakness: WarningIcon,
  matching_failed: AlertCircleIcon,
  pipeline_integrity_guard: AlertCircleIcon,
  pipeline_integrity_guard_backfill: AlertCircleIcon,
};

const TONE_ICON: Record<UnresolvedReasonTone, IconComponent> = {
  warning: WarningIcon,
  info: SearchIcon,
  error: WarningIcon,
  muted: SparklesIcon,
  primary: MagicIcon,
};

const TONE_CARD_CLASS: Record<UnresolvedReasonTone, string> = {
  warning: "text-semantic-warning bg-semantic-warning/10 border-semantic-warning/20",
  info: "text-semantic-info bg-semantic-info/10 border-semantic-info/20",
  error: "text-semantic-error bg-semantic-error/10 border-semantic-error/20",
  muted: "text-text-muted bg-surface-border/30 border-surface-border",
  primary: "text-accent-primary bg-accent-primary/10 border-accent-primary/20",
};

const OTHER_META = {
  label: "Requires Review",
  icon: AlertCircleIcon as IconComponent,
  color: "text-text-muted bg-surface-border/20 border-surface-border/40",
  desc: "Manual verification required.",
};

function lookupGapMeta(reason: string) {
  const meta = getUnresolvedReasonMeta(reason);
  if (!meta) return OTHER_META;
  const icon = REASON_ICON[reason as UnresolvedReason] ?? TONE_ICON[meta.tone];
  return {
    label: meta.label,
    icon,
    color: TONE_CARD_CLASS[meta.tone],
    desc: meta.drawerMessage(null),
  };
}

export function UnresolvedItemsList({
  questions,
  activeId,
  selectedIds,
  onSelectRow,
  onActivateRow,
  onAcceptRow,
}: UnresolvedItemsListProps) {
  const unresolvedItems = useMemo(() => {
    return questions.filter(q => q.type === "question_row" && !q.reviewed);
  }, [questions]);

  // Keyboard navigation for parity (D13-DS-02 refinement)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const currentIndex = unresolvedItems.findIndex((q) => q.id === activeId);
      
      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        const next = unresolvedItems[currentIndex + 1] || unresolvedItems[0];
        if (next) onActivateRow(next.id);
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        const prev = unresolvedItems[currentIndex - 1] || unresolvedItems[unresolvedItems.length - 1];
        if (prev) onActivateRow(prev.id);
      } else if (e.key === "a" && activeId) {
        e.preventDefault();
        onAcceptRow(activeId);
      } else if (e.key === "x" && activeId) {
        e.preventDefault();
        onSelectRow(activeId);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [unresolvedItems, activeId, onActivateRow, onAcceptRow, onSelectRow]);

  const groups = useMemo(() => {
    const g: Record<string, ReviewQuestionDTO[]> = {};
    unresolvedItems.forEach((q) => {
      const reason = q.unresolvedReason && q.unresolvedReason in UNRESOLVED_REASONS ? q.unresolvedReason : "other";
      if (!g[reason]) g[reason] = [];
      g[reason].push(q);
    });
    return g;
  }, [unresolvedItems]);

  const orderedGroupKeys = useMemo(() => {
    const known = UNRESOLVED_REASON_KEYS.filter((k) => groups[k]?.length).sort(
      (a, b) => UNRESOLVED_REASONS[a].groupOrder - UNRESOLVED_REASONS[b].groupOrder,
    );
    return groups.other?.length ? [...known, "other"] : known;
  }, [groups]);

  if (unresolvedItems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center bg-white rounded-2xl border border-dashed border-surface-border/60">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-semantic-success/10 text-semantic-success shadow-inner">
          <CheckIcon className="h-8 w-8" />
        </div>
        <h3 className="text-lg font-bold text-text-primary">All Items Resolved</h3>
        <p className="mt-1 text-sm text-text-muted max-w-xs">
          Great job! There are no pending gaps to triage in this questionnaire.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 overflow-y-auto px-1 py-1 custom-scrollbar space-y-8">
        {orderedGroupKeys.map((reason) => {
          const items = groups[reason] ?? [];
          const meta = reason === "other" ? OTHER_META : lookupGapMeta(reason);
          const Icon = meta.icon;

          return (
            <section key={reason} className="space-y-3">
              <header className="flex items-center justify-between px-2">
                <div className="flex items-center gap-2.5">
                  <div className={cn("flex h-7 w-7 items-center justify-center rounded-lg border shadow-sm", meta.color)}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div>
                    <h4 className="text-[11px] font-black uppercase tracking-widest text-text-primary">{meta.label}</h4>
                    <p className="text-[9px] font-medium text-text-muted">{meta.desc}</p>
                  </div>
                </div>
                <span className="rounded-full bg-surface-border/40 px-2 py-0.5 text-[10px] font-black text-text-muted/70 tabular-nums">
                  {items.length}
                </span>
              </header>

              <div className="grid grid-cols-1 gap-2">
                {items.map((q) => (
                  <div
                    key={q.id}
                    data-item-id={q.id}
                    onClick={() => {
                      if (typeof window !== "undefined" && (window as unknown as { __tdDiag?: boolean }).__tdDiag) {
                        console.warn("review.click", {
                          source: "UnresolvedItemsList",
                          clickedId: q.id,
                          clickedRowNumber: q.rowNumber ?? null,
                          clickedQuestionPreview: (q.question ?? "").slice(0, 40),
                        });
                      }
                      onActivateRow(q.id);
                    }}
                    className={cn(
                      "group relative flex items-start gap-4 rounded-xl border p-4 text-left transition-all duration-200 cursor-pointer",
                      activeId === q.id 
                        ? "border-accent-primary bg-accent-primary/[0.02] ring-1 ring-accent-primary/20 shadow-md" 
                        : "border-surface-border/50 bg-white hover:border-surface-border hover:shadow-sm"
                    )}
                  >
                    {/* Selection Checkbox */}
                    <div className="flex h-5 items-center pt-0.5" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(q.id)}
                        onChange={() => onSelectRow(q.id)}
                        className="h-4 w-4 rounded border-surface-border text-accent-primary focus-ring"
                      />
                    </div>

                    <div className="flex flex-1 flex-col gap-3">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-text-muted tabular-nums">#{q.rowNumber || "?"}</span>
                            {q.topicName && (
                              <div className="flex items-center gap-1 rounded-full bg-surface-border/30 px-2 py-0.5 text-[9px] font-bold text-text-secondary">
                                <TopicIcon className="h-2.5 w-2.5 opacity-60" />
                                {q.topicName}
                              </div>
                            )}
                            <ConfidencePill level={q.confidence || "low"} />
                            {(!q.suggestedAnswerId && (q.suggestedAnswer || q.finalAnswer)) && (
                              <span className="text-[8px] font-black uppercase tracking-widest text-accent-primary/70 bg-accent-primary/5 px-1.5 py-0.5 rounded ring-1 ring-accent-primary/20">
                                AI Drafted
                              </span>
                            )}
                          </div>
                          <p className="line-clamp-2 text-sm font-semibold leading-relaxed text-text-primary group-hover:text-accent-primary transition-colors">
                            {q.question}
                          </p>
                          {(q.finalAnswer || q.suggestedAnswer) && (
                            <div className="flex items-start gap-2 rounded-lg border border-surface-border/30 bg-surface-base/40 px-3 py-2 mt-1">
                              {!q.suggestedAnswerId
                                ? <SparklesIcon className="h-3.5 w-3.5 shrink-0 mt-0.5 text-accent-primary/60" />
                                : <CheckIcon className="h-3.5 w-3.5 shrink-0 mt-0.5 text-semantic-success" />
                              }
                              <p className="line-clamp-2 text-[12px] italic leading-relaxed text-text-secondary/80">
                                {(q.finalAnswer || q.suggestedAnswer).slice(0, 120)}{(q.finalAnswer || q.suggestedAnswer).length > 120 ? "…" : ""}
                              </p>
                            </div>
                          )}
                        </div>

                        <div className="flex flex-col items-end gap-2 shrink-0">
                           {/* Action cluster on hover */}
                           <div className={cn(
                             "flex items-center gap-1.5 transition-all duration-300",
                             activeId === q.id ? "opacity-100" : "opacity-0 translate-x-4 group-hover:opacity-100 group-hover:translate-x-0"
                           )}>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 rounded-full hover:bg-semantic-success/10 hover:text-semantic-success border border-transparent hover:border-semantic-success/20"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onAcceptRow(q.id);
                                }}
                                title="Quick Accept"
                              >
                                <CheckIcon className="h-4 w-4" />
                              </Button>
                              <div className="h-7 w-7 flex items-center justify-center rounded-full bg-accent-primary/5 text-accent-primary border border-accent-primary/10 transition-colors group-hover:bg-accent-primary group-hover:text-white">
                                <ArrowRightIcon className="h-4 w-4" />
                              </div>
                           </div>
                        </div>
                      </div>

                      {/* Footer Signal */}
                      <div className="flex items-center gap-4 pt-1 border-t border-surface-border/30">
                         <div className="flex items-center gap-1.5">
                            <div className={cn(
                              "h-1.5 w-1.5 rounded-full",
                              q.sources.length > 0 ? "bg-semantic-success" : "bg-surface-border"
                            )} />
                            <span className="text-[10px] font-bold text-text-muted/60 uppercase tracking-tight">
                              {q.sources.length} Sources
                            </span>
                         </div>
                         <div className="flex flex-wrap items-center gap-2">
                           {q.status === "conflict" ? <EvidenceConflictListBadge /> : null}
                           {isActiveCanonicalContradiction(q.canonicalContradiction) ? (
                             <CanonicalContradictionListBadge />
                           ) : null}
                         </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>
      
      <div className="mt-4 flex items-center justify-center rounded-lg bg-surface-base/50 p-2 border border-surface-border/40">
         <p className="text-[10px] font-medium text-text-muted italic">
           Tip: Use J/K keys to navigate or click evidence snippets to resolve items.
         </p>
      </div>
    </div>
  );
}
