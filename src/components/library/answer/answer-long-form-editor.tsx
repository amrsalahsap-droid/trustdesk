"use client";

import { MagicIcon } from "@/components/icons";

interface AnswerLongFormEditorProps {
  value: string;
  onChange: (value: string) => void;
  onDraftWithAi: () => void;
  aiBusy: boolean;
  aiDisabled: boolean;
  error?: string | null;
}

export function AnswerLongFormEditor({
  value,
  onChange,
  onDraftWithAi,
  aiBusy,
  aiDisabled,
  error,
}: AnswerLongFormEditorProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">
          Official response <span className="text-accent-primary">*</span>
        </label>
        <button
          type="button"
          onClick={onDraftWithAi}
          disabled={aiBusy || aiDisabled}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-tight text-accent-primary transition-all hover:bg-accent-primary/5 disabled:opacity-30"
        >
          <MagicIcon className={`h-3 w-3 ${aiBusy ? "animate-pulse" : ""}`} />
          {aiBusy ? "Synthesizing…" : "Draft with AI"}
        </button>
      </div>
      <textarea
        id="answer-field-answer"
        required
        rows={14}
        placeholder="Provide the verified response your organization stands behind…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full resize-y rounded-xl border border-white/10 bg-white/5 p-4 text-sm leading-relaxed text-text-primary placeholder:text-text-muted/50 focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary min-h-[max(320px,40vh)]"
        aria-invalid={error ? "true" : undefined}
        aria-describedby={error ? "answer-body-error" : undefined}
      />
      <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-text-muted">
        {error ? (
          <p id="answer-body-error" className="font-medium text-red-400">
            {error}
          </p>
        ) : (
          <span>{value.length.toLocaleString()} characters</span>
        )}
      </div>
    </div>
  );
}
