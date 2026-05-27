"use client";

import type { EvidenceSnippet } from "@/components/library/library-types";
import { EvidenceSnippetCard } from "@/components/trust/evidence-snippet-card";
import { EvidencePresence } from "@/components/trust/evidence-presence";
import { AlertCircleIcon, ShieldCheckIcon, ArrowRightIcon } from "@/components/icons";

interface EvidenceSectionProps {
  evidence: EvidenceSnippet[];
  confidenceScore: number | null;
}

export function EvidenceSection({ evidence, confidenceScore }: EvidenceSectionProps) {
  const count = evidence.length;
  const isHighConfidence = (confidenceScore ?? 0) >= 0.8;

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold uppercase tracking-wider text-text-primary">Supporting Evidence</h3>
          {count > 0 && <EvidencePresence linked count={count} density="sm" />}
        </div>
        {count > 0 && (
          <button className="flex items-center gap-1.5 text-[11px] font-bold text-accent-primary uppercase tracking-tight hover:underline">
            Open Source Viewer
            <ArrowRightIcon className="h-3 w-3" />
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4">
        {count === 0 ? (
          <div className="rounded-xl border border-dashed border-surface-border bg-surface-panel/30 p-8 text-center">
            <div className="mb-3 flex justify-center text-text-muted/40">
              <AlertCircleIcon className="h-8 w-8" />
            </div>
            <p className="text-sm font-bold text-text-primary">No source evidence linked</p>
            <p className="mt-1 text-xs text-text-muted">
              Map this answer to document chunks to strengthen audit defensibility.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
             <div className="flex items-center gap-2 rounded-lg bg-surface-panel/50 px-3 py-2 border border-surface-border">
                {isHighConfidence ? (
                  <ShieldCheckIcon className="h-3.5 w-3.5 text-semantic-success" />
                ) : (
                  <AlertCircleIcon className="h-3.5 w-3.5 text-semantic-warning" />
                )}
                <span className="text-[11px] font-medium text-text-secondary">
                  {isHighConfidence 
                    ? "Verified source matches indicate high audit defensibility." 
                    : "Source matches identified, but manual verification is recommended."}
                </span>
             </div>
             <div className="space-y-3">
                {evidence.map((snippet, idx) => (
                  <EvidenceSnippetCard key={`${snippet.docName}-${idx}`} snippet={snippet} density="default" />
                ))}
             </div>
          </div>
        )}
      </div>
    </section>
  );
}
