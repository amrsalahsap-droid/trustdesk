"use client";

import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CheckIcon, SparklesIcon, EditIcon, WarningIcon } from "@/components/icons";
import type { ReviewQuestionDTO } from "@/lib/questionnaires/types";
import { getRowState } from "@/lib/questionnaires/row-state";

type Selection = NonNullable<ReviewQuestionDTO["finalAnswerSelection"]>;

interface AnswerSourcePickerProps {
  question: ReviewQuestionDTO;
  isUpdating?: boolean;
  onUseImported: () => void;
  onUseSuggested: () => void;
  onStartEditing: () => void;
}

const SELECTION_LABEL: Record<Selection, string> = {
  imported: "Imported answer",
  suggested: "AI suggestion",
  edited: "Edited answer",
  canonical_aligned: "Canonical-aligned answer",
};

function normalize(text: string | null | undefined): string {
  return (text ?? "").trim();
}

/**
 * Answer-source picker surfaced inside the review drawer. Renders the three durable
 * answer layers side by side — Imported, AI Suggestion, Final — and forces the
 * reviewer to explicitly pick which source becomes the row's final answer. Prevents
 * the pre-fix behaviour where clicking "Accept" silently overwrote the uploaded
 * manual answer with AI-synthesised text.
 */
export function AnswerSourcePicker({
  question,
  isUpdating,
  onUseImported,
  onUseSuggested,
  onStartEditing,
}: AnswerSourcePickerProps) {
  const imported = normalize(question.importedAnswer);
  const suggested = normalize(question.suggestedAnswer);
  const finalAnswer = normalize(question.finalAnswer);
  const selection = question.finalAnswerSelection ?? null;

  const differs = useMemo(
    () => imported.length > 0 && suggested.length > 0 && imported !== suggested,
    [imported, suggested],
  );

  const state = getRowState(question as any);
  const selectionPill =
    selection && question.reviewed
      ? {
          label: state === "verified_empty" ? "Verified Empty" : `Final answer: ${SELECTION_LABEL[selection]}`,
          tone: "success" as const,
        }
      : {
          label: "Final answer: not selected yet",
          tone: "warning" as const,
        };

  return (
    <section
      className="space-y-3 rounded-xl border border-surface-border/80 bg-surface-panel/60 p-4"
      aria-label="Answer source picker"
    >
      <header className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h3 className="text-[11px] font-black uppercase tracking-widest text-text-muted">
            Provenance & Selection
          </h3>
          <p className="text-[9px] font-medium text-text-muted/60 uppercase tracking-tighter">
            Choose the authoritative source for this row
          </p>
        </div>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold tracking-tight shadow-sm",
            selectionPill.tone === "warning"
              ? "border-semantic-warning-border bg-semantic-warning-bg text-semantic-warning"
              : "border-semantic-success-border bg-semantic-success-bg text-semantic-success",
          )}
          role="status"
        >
          {selectionPill.tone === "warning" ? (
            <WarningIcon className="h-3.5 w-3.5" />
          ) : (
            <CheckIcon className="h-3.5 w-3.5" />
          )}
          {selectionPill.label}
        </span>
      </header>

      {differs ? (
        <p className="rounded-md border border-semantic-warning-border bg-semantic-warning-bg/50 px-3 py-1.5 text-[11px] font-semibold text-semantic-warning">
          Imported answer and AI suggestion differ. Pick which one becomes the final
          answer — nothing is saved as final until you decide.
        </p>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2">
        {question.importedAnswerSource ? (
          <article
            className={cn(
              "flex flex-col gap-2 rounded-lg border p-3",
              selection === "imported"
                ? "border-accent-primary/50 bg-accent-primary/[0.04]"
                : "border-surface-border bg-surface-base/60",
            )}
          >
            <div className="flex items-center justify-between">
              <h4 className="text-[11px] font-black uppercase tracking-widest text-text-muted">
                Imported answer
              </h4>
              {question.importedAnswerSource ? (
                <span className="inline-flex items-center rounded-full border border-surface-border bg-surface-panel px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-text-muted">
                  {question.importedAnswerSource.replace(/_/g, " ")}
                </span>
              ) : null}
            </div>
            <p className="line-clamp-6 whitespace-pre-wrap text-sm text-text-primary">
              {imported || (
                <span className="italic text-text-muted">No answer provided in source.</span>
              )}
            </p>
            <Button
              size="sm"
              variant={selection === "imported" ? "primary" : "outline"}
              onClick={onUseImported}
              disabled={isUpdating}
              leftIcon={<CheckIcon className={cn("h-3.5 w-3.5", selection === "imported" ? "text-white" : "text-text-muted")} />}
              aria-label="Use imported answer"
              className={cn(
                "mt-auto h-8 text-[11px] font-bold transition-all",
                selection === "imported" && "shadow-lg shadow-accent-primary/20 ring-2 ring-accent-primary/10"
              )}
            >
              {selection === "imported" ? "Authoritative Source" : "Use imported answer"}
            </Button>
          </article>
        ) : null}

        {question.suggestedAnswerId || suggested ? (
          <article
            className={cn(
              "flex flex-col gap-2 rounded-lg border p-3",
              selection === "suggested"
                ? "border-accent-primary/50 bg-accent-primary/[0.04]"
                : "border-surface-border bg-surface-base/60",
            )}
          >
            <div className="flex items-center justify-between">
              <h4 className="text-[11px] font-black uppercase tracking-widest text-text-muted">
                AI suggestion
              </h4>
              {question.suggestedAnswerId ? (
                <span className="inline-flex items-center rounded-full border border-surface-border bg-surface-panel px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-text-muted">
                  library-backed
                </span>
              ) : null}
            </div>
            <p className="line-clamp-6 whitespace-pre-wrap text-sm text-text-primary">
              {suggested || <span className="italic text-text-muted">No AI suggestion.</span>}
            </p>
            <Button
              size="sm"
              variant={selection === "suggested" ? "primary" : "outline"}
              onClick={onUseSuggested}
              disabled={isUpdating}
              leftIcon={<SparklesIcon className={cn("h-3.5 w-3.5", selection === "suggested" ? "text-white" : "text-accent-primary")} />}
              aria-label="Use AI suggestion"
              className={cn(
                "mt-auto h-8 text-[11px] font-bold transition-all",
                selection === "suggested" && "shadow-lg shadow-accent-primary/20 ring-2 ring-accent-primary/10"
              )}
            >
              {selection === "suggested" ? "Authoritative Source" : "Use AI suggestion"}
            </Button>
          </article>
        ) : null}
      </div>

      {finalAnswer || selection ? (
        <article className={cn(
          "rounded-lg border p-3 transition-all",
          selection 
            ? "border-semantic-success-border bg-semantic-success-bg/30" 
            : "border-surface-border bg-surface-base/60"
        )}>
          <div className="flex items-center justify-between mb-1.5">
            <h4 className="text-[11px] font-black uppercase tracking-widest text-text-muted">
              Live Final version {selection ? `— From ${SELECTION_LABEL[selection].toLowerCase()}` : ""}
            </h4>
            {selection && (
              <span className="flex h-1.5 w-1.5 rounded-full bg-semantic-success animate-pulse" />
            )}
          </div>
          <p className="line-clamp-6 whitespace-pre-wrap text-sm font-medium text-text-primary">
            {finalAnswer || (
              <span className="italic text-text-muted">
                {selection ? "Intentionally left blank." : "Not selected yet."}
              </span>
            )}
          </p>
        </article>
      ) : null}

      <div>
        <Button
          size="sm"
          variant="outline"
          onClick={onStartEditing}
          disabled={isUpdating}
          leftIcon={<EditIcon className="h-3.5 w-3.5" />}
        >
          Edit final answer
        </Button>
      </div>
    </section>
  );
}
