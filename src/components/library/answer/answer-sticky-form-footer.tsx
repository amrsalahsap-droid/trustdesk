"use client";

interface AnswerStickyFormFooterProps {
  onCancel: () => void;
  submitLabel: string;
  isSubmitting: boolean;
  saveDisabled?: boolean;
}

export function AnswerStickyFormFooter({
  onCancel,
  submitLabel,
  isSubmitting,
  saveDisabled,
}: AnswerStickyFormFooterProps) {
  return (
    <div className="shrink-0 flex items-center justify-end gap-3 border-t border-white/10 bg-surface-base/95 px-6 pt-5 pb-10 backdrop-blur-sm">
      <button
        type="button"
        className="rounded-lg border border-white/10 px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-white/5"
        onClick={onCancel}
      >
        Cancel
      </button>
      <button
        type="submit"
        disabled={isSubmitting || saveDisabled}
        className="flex items-center gap-2 rounded-lg bg-accent-primary px-6 py-2 text-sm font-semibold text-white shadow-xl shadow-accent-primary/20 transition-all hover:bg-accent-primary-hover active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100"
      >
        {isSubmitting ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : null}
        <span>{submitLabel}</span>
      </button>
    </div>
  );
}
