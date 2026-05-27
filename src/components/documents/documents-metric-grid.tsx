"use client";

import { Card } from "@/components/ui/card";
import { 
  GridIcon, 
  ActivityIcon, 
  SparklesIcon, 
  WarningIcon,
  CheckIcon
} from "@/components/icons";
import { cn } from "@/lib/utils";

interface DocumentsMetricGridProps {
  metrics: {
    total: number;
    ready: number;
    processing: number;
    failed: number;
    readinessScore: number;
    evidenceCount: number;
  };
  isLoading?: boolean;
}

export function DocumentsMetricGrid({ metrics, isLoading }: DocumentsMetricGridProps) {
  const cards = [
    {
      label: "Knowledge Readiness",
      value: `${Math.round(metrics.readinessScore * 100)}%`,
      subline: `${metrics.ready} of ${metrics.total} docs indexed`,
      icon: CheckIcon,
      color: "text-semantic-success",
      bg: "bg-semantic-success/10",
    },
    {
       label: "Process Throughput",
       value: metrics.processing.toString(),
       subline: "Active pipeline jobs",
       icon: ActivityIcon,
       color: "text-accent-primary",
       bg: "bg-accent-primary/10",
       pulse: metrics.processing > 0,
    },
    {
       label: "Evidence Volume",
       value: metrics.evidenceCount.toString(),
       subline: "Extracted Knowledge Chunks",
       icon: GridIcon,
       color: "text-accent-primary",
       bg: "bg-surface-base",
    },
    {
       label: "Pipeline Health",
       value: metrics.failed > 0 ? `${metrics.failed} Failed` : "Healthy",
       subline: metrics.failed > 0 ? "Requires recovery action" : "All stages operational",
       icon: metrics.failed > 0 ? WarningIcon : SparklesIcon,
       color: metrics.failed > 0 ? "text-semantic-error" : "text-semantic-success",
       bg: metrics.failed > 0 ? "bg-semantic-error/10" : "bg-semantic-success/10",
    }
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card, idx) => (
        <Card key={idx} className="relative overflow-hidden border-surface-border bg-white p-6 shadow-sm transition-all hover:shadow-md">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-text-muted">{card.label}</p>
              <h3 className={cn("mt-1 text-2xl font-black tracking-tighter", card.color)}>
                {isLoading ? "..." : card.value}
              </h3>
              <p className="mt-1 text-[11px] font-medium text-text-secondary">{card.subline}</p>
            </div>
            <div className={cn("rounded-xl p-2.5 ring-1 ring-black/[0.03]", card.bg)}>
              <card.icon className={cn("h-5 w-5", card.color, card.pulse && "animate-pulse")} />
            </div>
          </div>
          
          {/* Decorative background element */}
          <div className="absolute -bottom-2 -right-2 opacity-[0.03]">
             <card.icon className="h-16 w-16" />
          </div>
        </Card>
      ))}
    </div>
  );
}
