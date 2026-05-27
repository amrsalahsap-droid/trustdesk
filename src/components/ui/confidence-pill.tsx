const LEVELS = {
  high: { bg: "bg-semantic-success-bg", text: "text-semantic-success", border: "border-semantic-success-border" },
  medium: { bg: "bg-semantic-warning-bg", text: "text-semantic-warning", border: "border-semantic-warning-border" },
  low: { bg: "bg-semantic-error-bg", text: "text-semantic-error", border: "border-semantic-error-border" },
} as const;

export type ConfidenceLevel = keyof typeof LEVELS;

interface ConfidencePillProps {
  level: ConfidenceLevel;
}

export function ConfidencePill({ level }: ConfidencePillProps) {
  const l = LEVELS[level];
  const label = level.charAt(0).toUpperCase() + level.slice(1);
  return (
    <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-medium ${l.bg} ${l.border} ${l.text}`}>
      {label}
    </span>
  );
}
