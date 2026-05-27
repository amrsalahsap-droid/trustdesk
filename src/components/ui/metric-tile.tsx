import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type MetricTileTrend = {
  direction: "up" | "down" | "flat";
  label: string;
};

interface MetricTileProps {
  label: string;
  value: string | number;
  subtitle?: string;
  hint?: string;
  icon?: ReactNode;
  trend?: MetricTileTrend;
  href?: string;
  linkLabel?: string;
  emphasis?: "default" | "warning" | "critical" | "success";
  visualWeight?: "primary" | "secondary";
}

function TrendGlyph({ direction }: { direction: MetricTileTrend["direction"] }) {
  if (direction === "up") {
    return (
      <span className="text-semantic-success" aria-hidden>
        ↑
      </span>
    );
  }
  if (direction === "down") {
    return (
      <span className="text-semantic-error" aria-hidden>
        ↓
      </span>
    );
  }
  return (
    <span className="text-text-muted" aria-hidden>
      →
    </span>
  );
}

export function MetricTile({
  label,
  value,
  subtitle,
  hint,
  icon,
  trend,
  href,
  linkLabel,
  emphasis = "default",
  visualWeight = "secondary",
}: MetricTileProps) {
  // Visual hierarchy: shell styles based on emphasis
  const getShellStyles = () => {
    const baseStyles = "rounded-2xl bg-white p-6 shadow-sm transition-all duration-300 hover:shadow-md hover:translate-y-[-2px]";
    switch (emphasis) {
      case "critical":
        return cn(baseStyles, "border border-rose-200 ring-1 ring-rose-500/5 hover:border-rose-300");
      case "warning":
        return cn(baseStyles, "border border-amber-200 ring-1 ring-amber-500/5 hover:border-amber-300");
      case "success":
        return cn(baseStyles, "border border-emerald-200 ring-1 ring-emerald-500/5 hover:border-emerald-300");
      default:
        return visualWeight === "primary"
          ? cn(baseStyles, "border border-surface-border ring-1 ring-black/5 hover:border-accent-primary/20")
          : cn(baseStyles, "border border-surface-border hover:border-accent-primary/20");
    }
  };

  // Visual hierarchy: value styles based on emphasis
  const getValueClass = () => {
    switch (emphasis) {
      case "critical":
        return "text-3xl font-bold tabular-nums text-rose-600 tracking-tight";
      case "warning":
        return "text-3xl font-bold tabular-nums text-amber-600 tracking-tight";
      case "success":
        return "text-3xl font-bold tabular-nums text-emerald-600 tracking-tight";
      default:
        return visualWeight === "primary"
          ? "text-3xl font-bold tabular-nums text-text-primary tracking-tight"
          : "text-2xl font-bold tabular-nums text-text-primary tracking-tight";
    }
  };

  // Visual hierarchy: label styles
  const getLabelClass = () => {
    switch (emphasis) {
      case "critical":
        return "text-xs font-semibold uppercase tracking-wide text-rose-600";
      case "warning":
        return "text-xs font-semibold uppercase tracking-wide text-amber-600";
      case "success":
        return "text-xs font-semibold uppercase tracking-wide text-emerald-600";
      default:
        return "text-xs font-medium uppercase tracking-wide text-text-muted";
    }
  };

  // Visual hierarchy: icon styles
  const getIconClass = () => {
    switch (emphasis) {
      case "critical":
        return "text-rose-500";
      case "warning":
        return "text-amber-500";
      case "success":
        return "text-emerald-500";
      default:
        return visualWeight === "primary" ? "text-accent-primary" : "text-text-muted";
    }
  };

  const Wrapper = href ? Link : "div";
  const wrapperProps = href ? { href, className: "block cursor-pointer" } : { className: "" };

  return (
    <Wrapper {...wrapperProps}>
      <div className={getShellStyles()}>
        <div className="flex items-start justify-between gap-2">
          <p className={getLabelClass()}>{label}</p>
          {icon && <div className={getIconClass()}>{icon}</div>}
        </div>
        <p className={`mt-2 ${getValueClass()}`}>{value}</p>
        {subtitle && <p className="mt-1 text-sm text-text-secondary">{subtitle}</p>}
        {hint && <p className="mt-1.5 text-xs leading-snug text-text-muted">{hint}</p>}
        {trend && (
          <p className="mt-1.5 flex items-center gap-1.5 text-xs text-text-muted">
            <TrendGlyph direction={trend.direction} />
            <span>{trend.label}</span>
          </p>
        )}
        {linkLabel && (
          <p className="mt-3 pt-2 border-t border-surface-border">
            <span className="text-xs font-medium text-accent-primary hover:underline">
              {linkLabel} →
            </span>
          </p>
        )}
      </div>
    </Wrapper>
  );
}
