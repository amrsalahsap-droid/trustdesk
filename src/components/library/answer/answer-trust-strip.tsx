"use client";

import { ConfidenceTier } from "@/components/trust/confidence-tier";

interface AnswerTrustStripProps {
  confidenceScore: number | null | undefined;
}

/** Model / manual source trust — discrete tier + optional meter (no raw scores). */
export function AnswerTrustStrip({ confidenceScore }: AnswerTrustStripProps) {
  return (
    <section className="rounded-xl border border-white/5 bg-white/[0.03] px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">Source trust</p>
        <ConfidenceTier confidenceScore={confidenceScore} showMeter density="sm" />
      </div>
    </section>
  );
}
