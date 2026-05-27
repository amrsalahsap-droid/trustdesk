"use client";

interface AnswerOfficialBodyReadProps {
  answerText: string;
}

export function AnswerOfficialBodyRead({ answerText }: AnswerOfficialBodyReadProps) {
  return (
    <section className="space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-text-muted">Official answer</h3>
      <div className="rounded-xl border border-white/5 bg-white/5 p-5 shadow-inner">
        <div className="max-w-prose">
          <p className="text-base leading-relaxed text-text-secondary whitespace-pre-wrap sm:text-[17px]">
            {answerText || "No response content entered yet."}
          </p>
        </div>
      </div>
    </section>
  );
}
