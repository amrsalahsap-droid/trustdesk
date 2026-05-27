"use client";

import type { ReactNode } from "react";

/** Shared panel chrome (pair with `ANSWER_SHELL_DETAIL_MAX` or `max-w-md` for nested drawers). */
export const ANSWER_SHELL_PANEL_BASE =
  "glass-panel relative flex h-[100dvh] max-h-[100dvh] w-full flex-col border-l border-white/10 bg-surface-base/95 shadow-2xl animate-in slide-in-from-right duration-500 ease-out overscroll-none";

export const ANSWER_SHELL_DETAIL_MAX = "max-w-3xl";

export const ANSWER_SHELL_Z = {
  detail: 50,
  form: 60,
  historyDrawer: 70,
} as const;

interface AnswerShellProps {
  zIndex: number;
  children: ReactNode;
  onBackdropClick: () => void;
}

export function AnswerShell({ zIndex, children, onBackdropClick }: AnswerShellProps) {
  return (
    <div className="fixed inset-0 flex justify-end overflow-hidden h-[100dvh] max-h-[100dvh]" style={{ zIndex }}>
      <button
        type="button"
        aria-label="Close panel"
        className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm animate-in fade-in duration-300 h-full w-full"
        onClick={onBackdropClick}
      />
      <div className={`${ANSWER_SHELL_PANEL_BASE} ${ANSWER_SHELL_DETAIL_MAX}`}>{children}</div>
    </div>
  );
}
