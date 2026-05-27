"use client";

import { useState, useEffect } from "react";
import { ReviewRow } from "./review-row";
import type { ReviewQuestionDTO } from "@/lib/questionnaires/types";
import {
  TONE_TEXT_CLASS,
  UNRESOLVED_REASONS,
  UNRESOLVED_REASON_KEYS,
  getUnresolvedReasonMeta,
  type UnresolvedReason,
} from "@/lib/questionnaires/unresolved-reasons";
import { cn } from "@/lib/utils";

interface ReviewTableProps {
  questions: ReviewQuestionDTO[];
  activeId: string | null;
  selectedIds: Set<string>;
  onSelectRow: (id: string) => void;
  onSelectAll: () => void;
  onActivateRow: (id: string) => void;
  onAcceptRow: (id: string) => void;
  filter?: string;
  isUpdating?: boolean;
  updatingIds?: Set<string>;
}

export function ReviewTable({
  questions,
  activeId,
  selectedIds,
  onSelectRow,
  onSelectAll,
  onActivateRow,
  onAcceptRow,
  filter = "all",
  isUpdating,
  updatingIds = new Set(),
}: ReviewTableProps) {
  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const currentIndex = questions.findIndex((q) => q.id === activeId);
      
      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        const next = questions[currentIndex + 1] || questions[0];
        if (next) onActivateRow(next.id);
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        const prev = questions[currentIndex - 1] || questions[questions.length - 1];
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
  }, [questions, activeId, onActivateRow, onAcceptRow, onSelectRow]);

  const selectableQuestions = questions.filter((q) => q.type === "question_row");
  const allSelected = selectableQuestions.length > 0 && selectedIds.size === selectableQuestions.length;

  const isGroupedView = filter === "all" || filter === "pending";

  const renderQuestions = () => {
    if (!isGroupedView) {
      return questions.map((q) => (
        <ReviewRow
          key={q.id}
          question={q}
          isSelected={selectedIds.has(q.id)}
          isActive={activeId === q.id}
          onSelect={() => onSelectRow(q.id)}
          onActivate={() => {
            // Behind window.__tdDiag so it only fires when the operator
            // has opted in via localStorage.__tdDiag = "1". No behaviour
            // change; lets us diff the clicked identity against the
            // drawer's resolved identity.
            if (typeof window !== "undefined" && (window as unknown as { __tdDiag?: boolean }).__tdDiag) {
              console.warn("review.click", {
                source: "ReviewTable",
                clickedId: q.id,
                clickedRowNumber: q.rowNumber ?? null,
                clickedQuestionPreview: (q.question ?? "").slice(0, 40),
              });
            }
            onActivateRow(q.id);
          }}
          onAccept={() => onAcceptRow(q.id)}
          isUpdating={isUpdating || updatingIds.has(q.id)}
        />
      ));
    }

    // Grouping Logic — initialize one bucket per registered reason plus the
    // catch-all "other" bucket so rows without a known unresolvedReason still
    // have a home (reviewed / non-question / unknown-code rows).
    const groups: Record<string, ReviewQuestionDTO[]> = {
      ...Object.fromEntries(UNRESOLVED_REASON_KEYS.map((k) => [k, [] as ReviewQuestionDTO[]])),
      other: [] as ReviewQuestionDTO[],
    };

    questions.forEach((q) => {
      if (typeof window !== "undefined" && (window as unknown as { __tdDiag?: boolean }).__tdDiag) {
        console.log("table.row-data", {
          id: q.id,
          row: q.rowNumber,
          sLen: q.suggestedAnswer?.length,
          fLen: q.finalAnswer?.length,
          status: q.verificationStatus,
          reason: q.unresolvedReason,
          type: q.type
        });
      }
      if (q.type !== "question_row") {
        groups.other.push(q);
        return;
      }
      const reason = q.unresolvedReason;
      if (!reason || q.reviewed) {
        groups.other.push(q);
      } else if (reason in UNRESOLVED_REASONS) {
        groups[reason as UnresolvedReason].push(q);
      } else {
        // Unknown reason code — matcher is ahead of the UI; bucket into
        // "other" rather than silently dropping the row from the view.
        groups.other.push(q);
      }
    });

    const orderedKeys = [
      ...[...UNRESOLVED_REASON_KEYS].sort(
        (a, b) => UNRESOLVED_REASONS[a].groupOrder - UNRESOLVED_REASONS[b].groupOrder,
      ),
      "other",
    ];

    return orderedKeys.flatMap((key) => {
      const items = groups[key] ?? [];
      if (items.length === 0) return [];

      const rows = items.map((q) => (
        <ReviewRow
          key={q.id}
          question={q}
          isSelected={selectedIds.has(q.id)}
          isActive={activeId === q.id}
          onSelect={() => onSelectRow(q.id)}
          onActivate={() => {
            if (typeof window !== "undefined" && (window as unknown as { __tdDiag?: boolean }).__tdDiag) {
              console.warn("review.click", {
                source: "ReviewTable(grouped)",
                groupKey: key,
                clickedId: q.id,
                clickedRowNumber: q.rowNumber ?? null,
                clickedQuestionPreview: (q.question ?? "").slice(0, 40),
              });
            }
            onActivateRow(q.id);
          }}
          onAccept={() => onAcceptRow(q.id)}
        />
      ));

      if (key === "other" && items.length > 0 && items.every((i) => i.reviewed)) return rows;

      const meta = getUnresolvedReasonMeta(key);
      const cat = meta
        ? { label: meta.groupLabel, action: meta.groupAction, color: TONE_TEXT_CLASS[meta.tone] }
        : { label: "General Review Required", action: "Review items manually", color: "text-text-muted" };

      return [
        <tr key={`header-${key}`} className="sticky top-[56px] z-20 bg-surface-base/95 backdrop-blur-sm border-y border-surface-border/40 selection:bg-transparent">
          <td colSpan={7} className="px-6 py-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className={cn("text-[11px] font-black uppercase tracking-widest", cat.color)}>{cat.label}</span>
                <span className="h-1 w-1 rounded-full bg-surface-border" />
                <span className="text-[10px] font-bold text-text-muted/60">{items.length} items</span>
              </div>
              <div className="flex items-center gap-1.5 opacity-60">
                 <span className="text-[9px] font-bold uppercase tracking-widest text-text-muted">Next Step:</span>
                 <span className="text-[10px] font-medium text-text-secondary">{cat.action}</span>
              </div>
            </div>
          </td>
        </tr>,
        ...rows
      ];
    });
  };
  return (
    <div className="relative flex flex-col h-full rounded-2xl border border-surface-border bg-surface-base shadow-lg overflow-hidden">
      <div className="flex-1 overflow-auto custom-scrollbar">
        <table className="w-full text-left text-sm border-collapse min-w-[900px]">
          <thead className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-surface-border/80 shadow-sm transition-all">
            <tr>
              <th className="w-12 px-4 py-4">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={onSelectAll}
                  className="h-4 w-4 rounded border-surface-border text-accent-primary focus-ring"
                />
              </th>
              <th className="w-10 px-1 py-4 text-[10px] font-black uppercase tracking-[0.15em] text-text-muted/60">#</th>
              <th className="px-3 py-4 text-[10px] font-black uppercase tracking-[0.15em] text-text-muted/60">Classification</th>
              <th className="px-3 py-4 text-[10px] font-black uppercase tracking-[0.15em] text-text-muted/60">Subject & Matched Strategy</th>
              <th className="w-24 px-3 py-4 text-[10px] font-black uppercase tracking-[0.15em] text-text-muted/60">Signal</th>
              <th className="w-28 px-3 py-4 text-[10px] font-black uppercase tracking-[0.15em] text-text-muted/60">Status</th>
              <th className="w-28 px-3 py-4 text-[10px] font-black uppercase tracking-[0.15em] text-text-muted/60">Verification</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-border/60">
            {renderQuestions()}
          </tbody>
        </table>
        
        {questions.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-surface-base border border-surface-border">
              <span className="text-xl">🔍</span>
            </div>
            <p className="text-sm font-semibold text-text-primary">No matching items</p>
            <p className="mt-1 text-xs text-text-muted">Adjust your filters to see more results.</p>
          </div>
        )}
      </div>

      {/* Keyboard Shortcuts Footer - D9-DS-01 Command Bar */}
      <div className="flex items-center justify-between border-t border-surface-border bg-surface-base/80 backdrop-blur-sm px-6 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.02)]">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-2">
             <div className="h-1.5 w-1.5 rounded-full bg-accent-primary animate-pulse" />
             <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-text-muted/80">Command shortcuts</h4>
          </div>
          <div className="flex items-center gap-6 text-[10px] font-bold text-text-muted/60">
            <span className="flex items-center gap-2 group cursor-help"><kbd className="flex h-5 min-w-5 items-center justify-center rounded border border-surface-border bg-white p-1 text-[11px] font-black text-text-primary shadow-sm group-hover:border-accent-primary group-hover:text-accent-primary transition-colors">J</kbd> NEXT</span>
            <span className="flex items-center gap-2 group cursor-help"><kbd className="flex h-5 min-w-5 items-center justify-center rounded border border-surface-border bg-white p-1 text-[11px] font-black text-text-primary shadow-sm group-hover:border-accent-primary group-hover:text-accent-primary transition-colors">K</kbd> PREVIOUS</span>
            <span className="flex items-center gap-2 group cursor-help"><kbd className="flex h-5 min-w-5 items-center justify-center rounded border border-surface-border bg-white p-1 text-[11px] font-black text-text-primary shadow-sm group-hover:border-accent-primary group-hover:text-accent-primary transition-colors">A</kbd> QUICK ACCEPT</span>
            <span className="flex items-center gap-2 group cursor-help"><kbd className="flex h-5 min-w-5 items-center justify-center rounded border border-surface-border bg-white p-1 text-[11px] font-black text-text-primary shadow-sm group-hover:border-accent-primary group-hover:text-accent-primary transition-colors">X</kbd> MULTI-SELECT</span>
          </div>
        </div>
        <div className="text-[11px] text-text-muted/70 font-bold tracking-tight bg-accent-primary/5 px-3 py-1 rounded-full border border-accent-primary/10 transition-all hover:bg-accent-primary/10">
          <span className="text-accent-primary mr-1">Pro Tip:</span> Press <kbd className="font-black text-accent-primary">Enter</kbd> to open selected evidence.
        </div>
      </div>
    </div>
  );
}
