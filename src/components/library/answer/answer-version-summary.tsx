"use client";

import type { AnswerDetailVersion } from "@/components/library/library-types";
import { formatAnswerUpdated } from "@/components/library/answer/answer-format";

interface AnswerVersionSummaryProps {
  currentVersion: number;
  versions: AnswerDetailVersion[];
  updatedAtRaw: string | Date | null | undefined;
  onOpenHistory: () => void;
}

export function AnswerVersionSummary({
  currentVersion,
  versions,
  updatedAtRaw,
  onOpenHistory,
}: AnswerVersionSummaryProps) {
  const priorCount = versions.filter((v) => v.versionNumber !== currentVersion).length;
  const { relative } = formatAnswerUpdated(updatedAtRaw);

  return (
    <section className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 text-sm text-text-secondary">
          <span className="font-semibold text-text-primary">Version {currentVersion || 1}</span>
          {relative ? <span className="text-text-muted"> · {relative}</span> : null}
          <span className="text-text-muted">
            {" · "}
            {priorCount === 0 ? "No prior versions" : `${priorCount} prior version${priorCount === 1 ? "" : "s"}`}
          </span>
        </div>
        <button
          type="button"
          onClick={onOpenHistory}
          className="shrink-0 rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-text-primary transition-colors hover:bg-white/5"
        >
          Version history
        </button>
      </div>
    </section>
  );
}
