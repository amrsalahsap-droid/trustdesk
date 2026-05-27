interface ProgressBarProps {
  value: number;
  size?: "sm" | "md";
  className?: string;
}

export function ProgressBar({ value, size = "sm", className = "" }: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const h = size === "sm" ? "h-1.5" : "h-2";

  return (
    <div className={`${h} w-full rounded-full bg-surface-border ${className}`}>
      <div
        className={`${h} rounded-full bg-accent-primary transition-all duration-500`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
