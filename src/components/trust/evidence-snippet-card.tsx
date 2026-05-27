"use client";

import { FileIcon } from "@/components/icons";
import type { EvidenceSnippet } from "@/components/library/library-types";

/** `compact`: list-style clamp. `default`: answer detail. `comfortable`: questionnaire review (larger tap area). */
export type EvidenceSnippetDensity = "compact" | "default" | "comfortable";

interface EvidenceSnippetCardProps {
  snippet: EvidenceSnippet;
  density?: EvidenceSnippetDensity;
  /** Optional keyboard / click handler (e.g. open document). */
  onOpen?: () => void;
}

const clampClass: Record<EvidenceSnippetDensity, string> = {
  compact: "line-clamp-2",
  default: "line-clamp-12", // Increased for D10-US-01 "Reveal full snippet"
  comfortable: "line-clamp-15",
};

const paddingClass: Record<EvidenceSnippetDensity, string> = {
  compact: "p-3",
  default: "p-4",
  comfortable: "min-h-[44px] p-4 sm:p-5",
};

/**
 * Evidence excerpt card: document name, optional page, quoted snippet.
 * Questionnaire review: use density="comfortable"; keep same borders as detail for learnability.
 */
export function EvidenceSnippetCard({ snippet, density = "default", onOpen }: EvidenceSnippetCardProps) {
  const interactive = Boolean(onOpen);
  const clamp = clampClass[density];
  const pad = paddingClass[density];

  return (
    <article
      className={`group relative rounded-xl border border-white/5 bg-white/5 shadow-sm transition-colors hover:border-white/10 hover:bg-white/[0.07] ${pad} ${
        interactive ? "cursor-pointer" : ""
      }`}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={onOpen}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onOpen?.();
              }
            }
          : undefined
      }
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <FileIcon className="h-3.5 w-3.5 shrink-0 text-accent-primary" />
          <span className="truncate text-xs font-semibold text-text-primary">{snippet.docName}</span>
          {snippet.page != null ? (
            <span className="shrink-0 rounded bg-surface-base px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-text-muted ring-1 ring-white/5">
              P. {snippet.page}
            </span>
          ) : null}
        </div>
      </div>
      <div className="relative border-l-2 border-accent-primary/20 pl-3 transition-colors group-hover:border-accent-primary/50">
        <p className={`text-[11px] leading-relaxed text-text-secondary italic sm:text-xs ${clamp}`}>
          &ldquo;{snippet.content}&rdquo;
        </p>
      </div>
    </article>
  );
}
