"use client";

import { useState } from "react";
import type { EvidenceSnippet } from "@/components/library/library-types";
import { EvidenceSnippetCard } from "@/components/trust/evidence-snippet-card";
import { EvidencePresence } from "@/components/trust/evidence-presence";

function AlertCircleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

import { SparklesIcon } from "@/components/icons";

interface AnswerEvidencePanelProps {
  evidence: EvidenceSnippet[];
  isDraft?: boolean;
}

export function AnswerEvidencePanel({ evidence, isDraft }: AnswerEvidencePanelProps) {
  const [open, setOpen] = useState(isDraft || evidence.length === 0);

  const count = evidence.length;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-text-muted">Supporting evidence</h3>
          {count > 0 ? <EvidencePresence linked count={count} density="sm" /> : null}
        </div>
        {count > 0 ? (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="text-xs font-medium text-accent-primary hover:underline"
          >
            {open ? "Hide" : `Show ${count} source${count === 1 ? "" : "s"}`}
          </button>
        ) : null}
      </div>

      {isDraft && (
        <div className="rounded-xl border border-semantic-warning-border bg-semantic-warning-bg/10 p-4 shadow-sm ring-1 ring-semantic-warning-border/20">
          <div className="flex items-start gap-3">
            <SparklesIcon className="mt-0.5 h-4 w-4 shrink-0 text-semantic-warning" />
            <div className="space-y-1">
              <p className="text-xs font-bold text-semantic-warning-text uppercase tracking-tight">AI Reasoning / Justification</p>
              <p className="text-[11px] leading-relaxed text-text-muted">
                This draft was synthesized from your company documentation. The engine identified these semantic matches as the most relevant evidence for this topic. Review the clips below to ensure accuracy before approving.
              </p>
            </div>
          </div>
        </div>
      )}

      {count === 0 ? (
        <div className="rounded-xl border border-dashed border-white/10 bg-white/5 p-8 text-center transition-colors hover:bg-white/[0.07]">
          <div className="mb-3 flex justify-center">
            <AlertCircleIcon className="h-6 w-6 text-text-muted" />
          </div>
          <p className="mb-1 text-xs font-medium text-text-primary">No source evidence linked</p>
          <p className="text-[10px] leading-relaxed text-text-muted">
            Map this answer to document chunks to strengthen audit defensibility.
          </p>
        </div>
      ) : open ? (
        <div className="space-y-3">
          {evidence.map((snippet, idx) => (
            <EvidenceSnippetCard key={`${snippet.docName}-${idx}`} snippet={snippet} density="default" />
          ))}
        </div>
      ) : (
        <p className="rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2 text-xs text-text-muted">
          {count} source clip{count === 1 ? "" : "s"} linked — expand to review.
        </p>
      )}
    </section>
  );
}
