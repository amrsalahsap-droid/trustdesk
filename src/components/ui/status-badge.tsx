const VARIANTS = {
  ok: {
    dot: "bg-semantic-success",
    text: "text-semantic-success",
    border: "border-semantic-success-border",
    bg: "bg-semantic-success-bg",
  },
  warning: {
    dot: "bg-semantic-warning",
    text: "text-semantic-warning",
    border: "border-semantic-warning-border",
    bg: "bg-semantic-warning-bg",
  },
  error: {
    dot: "bg-semantic-error",
    text: "text-semantic-error",
    border: "border-semantic-error-border",
    bg: "bg-semantic-error-bg",
  },
  neutral: {
    dot: "bg-text-muted",
    text: "text-text-secondary",
    border: "border-surface-border",
    bg: "bg-surface-base",
  },
  processing: {
    dot: "bg-semantic-info",
    text: "text-semantic-info",
    border: "border-semantic-info-border",
    bg: "bg-semantic-info-bg",
  },
} as const;

export type StatusVariant = keyof typeof VARIANTS;

interface StatusBadgeProps {
  variant: StatusVariant;
  label: string;
}

export function StatusBadge({ variant, label }: StatusBadgeProps) {
  const v = VARIANTS[variant];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${v.bg} ${v.border} ${v.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${v.dot}`} />
      {label}
    </span>
  );
}
