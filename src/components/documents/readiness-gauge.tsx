"use client";

import { cn } from "@/lib/utils";

interface ReadinessGaugeProps {
  score: number; // 0 to 1
  className?: string;
  size?: "sm" | "md";
}

export function ReadinessGauge({ score, className, size = "md" }: ReadinessGaugeProps) {
  const percentage = Math.round(score * 100);
  
  // Color logic
  const color = 
    percentage >= 90 ? "text-semantic-success" :
    percentage >= 50 ? "text-accent-primary" :
    percentage > 0 ? "text-semantic-warning" :
    "text-text-muted";

  const trackColor = 
    percentage >= 90 ? "bg-semantic-success/20" :
    percentage >= 50 ? "bg-accent-primary/20" :
    percentage > 0 ? "bg-semantic-warning/20" :
    "bg-surface-border";

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div className={cn(
        "relative rounded-full",
        size === "md" ? "h-10 w-10" : "h-8 w-8",
        trackColor
      )}>
        {/* Simple SVG circle could go here, but for a clean look let's use a centered text indicator for now */}
        <div className="absolute inset-0 flex items-center justify-center">
            <span className={cn(
                "font-black tracking-tighter",
                size === "md" ? "text-[11px]" : "text-[9px]",
                color
            )}>
                {percentage}%
            </span>
        </div>
      </div>
      <div className="flex flex-col">
        <span className="text-[10px] font-bold uppercase tracking-tight text-text-muted">Readiness</span>
        <span className={cn(
            "text-[9px] font-medium leading-none",
            color
        )}>
            {percentage === 100 ? "Fully Indexed" : percentage >= 50 ? "Sufficient" : percentage > 0 ? "Incomplete" : "Pending Analysis"}
        </span>
      </div>
    </div>
  );
}
