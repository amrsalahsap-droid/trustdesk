"use client";

import { cn } from "@/lib/utils";
import { ArrowRightIcon } from "@/components/icons";
import Link from "next/link";

interface GovernanceActionCardProps {
  title: string;
  count: number;
  description: string;
  actionLabel: string;
  href: string;
  emphasis?: "default" | "warning" | "error" | "success";
  icon?: React.ReactNode;
}

export function GovernanceActionCard({
  title,
  count,
  description,
  actionLabel,
  href,
  emphasis = "default",
  icon,
}: GovernanceActionCardProps) {
  const tones = {
    default: "border-surface-border bg-white text-text-primary hover:border-accent-primary/40 shadow-sm hover:shadow-md",
    warning: "border-semantic-warning-border bg-white text-semantic-warning-text hover:bg-semantic-warning/[0.02] shadow-sm hover:shadow-md ring-1 ring-semantic-warning/5",
    error: "border-semantic-error-border bg-white text-semantic-error hover:bg-semantic-error-bg/20 shadow-sm hover:shadow-md ring-1 ring-semantic-error/5",
    success: "border-semantic-success-border bg-white text-semantic-success hover:bg-semantic-success/[0.02] shadow-sm hover:shadow-md ring-1 ring-semantic-success/5",
  };

  const countTones = {
    default: "text-text-primary",
    warning: "text-semantic-warning",
    error: "text-semantic-error",
    success: "text-semantic-success",
  };

  return (
    <div
      className={cn(
        "group relative flex flex-col justify-between rounded-2xl border p-6 transition-all duration-300 hover:scale-[1.01] hover:shadow-lg hover:border-accent-primary/20",
        tones[emphasis]
      )}
    >
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            {icon && <div className="text-current opacity-70">{icon}</div>}
            <h3 className="text-[11px] font-black uppercase tracking-[0.15em] opacity-80">
              {title}
            </h3>
          </div>
          <span className={cn("text-3xl font-black tabular-nums leading-none", countTones[emphasis])}>
            {count}
          </span>
        </div>
        <p className="text-sm leading-relaxed text-text-secondary pr-4">
          {description}
        </p>
      </div>

      <div className="mt-6">
        <Link
          href={href}
          className={cn(
            "inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider transition-colors",
            emphasis === "default" ? "text-accent-primary" : "text-current"
          )}
        >
          {actionLabel}
          <ArrowRightIcon className="h-3 w-3 transition-transform group-hover:translate-x-1" />
        </Link>
      </div>
      
      {count === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl bg-surface-panel/90 backdrop-blur-[1px] text-center p-4">
          <div className="mb-2 text-xl">✓</div>
          <p className="text-xs font-bold text-text-primary">All clear</p>
          <p className="text-[10px] text-text-muted mt-1">{description.replace("needs", "cleared")}</p>
        </div>
      )}
    </div>
  );
}
