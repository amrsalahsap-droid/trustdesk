"use client";

import { CloseIcon } from "@/components/icons";
import type { AnswerDetailVersion } from "@/components/library/library-types";
import { ANSWER_SHELL_Z, ANSWER_SHELL_PANEL_BASE } from "@/components/library/answer/answer-shell";
import { AnswerVersionTimeline } from "@/components/library/answer/answer-version-timeline";

interface AnswerVersionHistoryDrawerProps {
  open: boolean;
  onClose: () => void;
  versions: AnswerDetailVersion[];
  currentVersion: number;
}

export function AnswerVersionHistoryDrawer({
  open,
  onClose,
  versions,
  currentVersion,
}: AnswerVersionHistoryDrawerProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 flex justify-end overflow-hidden h-[100dvh] max-h-[100dvh]"
      style={{ zIndex: ANSWER_SHELL_Z.historyDrawer }}
    >
      <button
        type="button"
        aria-label="Close version history"
        className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onClose}
      />
      <div
        className={`${ANSWER_SHELL_PANEL_BASE} !grid grid-rows-[auto_1fr_auto] max-w-md animate-in slide-in-from-right duration-300`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="answer-version-history-title"
      >
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <h2 id="answer-version-history-title" className="text-sm font-bold text-text-primary">
            Version history
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-text-muted transition-colors hover:bg-white/5 hover:text-text-primary"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>
        <div className="custom-scrollbar overflow-y-auto p-5 min-h-0">
          <AnswerVersionTimeline versions={versions} currentVersion={currentVersion} compact />
        </div>
        <div className="shrink-0 border-t border-white/10 px-5 pt-4 pb-10 bg-surface-panel/50">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-lg border border-white/10 py-2.5 text-sm font-medium text-text-secondary transition-colors hover:bg-white/5"
          >
            Back to answer
          </button>
        </div>
      </div>
    </div>
  );
}
