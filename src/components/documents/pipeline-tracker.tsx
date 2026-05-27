"use client";

import { CheckIcon, CloseIcon, ClockIcon, RefreshIcon } from "@/components/icons";
import { cn } from "@/lib/utils";
import type { DocumentLifecycle } from "@/lib/documents/document-display";

interface PipelineTrackerProps {
  lifecycle: DocumentLifecycle;
  onRetry?: (stage: "parse" | "seeding") => void;
  className?: string;
}

export function PipelineTracker({ lifecycle, onRetry, className }: PipelineTrackerProps) {
  const { upload, parse, seeding } = lifecycle;

  const stages = [
    { id: "upload", data: upload, label: "Upload" },
    { id: "parse", data: parse, label: "Parsing" },
    { id: "seeding", data: seeding, label: "Seeding" },
  ];

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      {stages.map((stage, idx) => {
        const { variant, label, status } = stage.data;
        const isLast = idx === stages.length - 1;
        const isFailed = variant === "error";
        const isActive = !lifecycle.isTerminal && status !== null && status !== "COMPLETED" && status !== "UPLOADED";

        return (
          <div key={stage.id} className="flex items-center gap-1.5">
            <div 
              className={cn(
                "group relative flex h-7 items-center gap-2 rounded-lg border px-2.5 py-1 transition-all duration-300",
                variant === "ok" ? "border-semantic-success/20 bg-semantic-success/[0.03] text-semantic-success" :
                variant === "error" ? "border-semantic-error/30 bg-semantic-error/[0.03] text-semantic-error" :
                variant === "warning" ? "border-semantic-warning/30 bg-semantic-warning/[0.03] text-semantic-warning" :
                "border-surface-border bg-surface-base text-text-muted opacity-50"
              )}
            >
              {/* Icon / Status */}
              <div className="flex shrink-0 items-center justify-center">
                {variant === "ok" ? (
                  <CheckIcon className="h-3 w-3" />
                ) : variant === "error" ? (
                  <CloseIcon className="h-3 w-3" />
                ) : isActive ? (
                  <div className="h-2 w-2 rounded-full bg-accent-primary animate-pulse" />
                ) : (
                  <div className="h-2 w-2 rounded-full bg-text-muted/30" />
                )}
              </div>

              {/* Label */}
              <span className="text-[10px] font-bold uppercase tracking-wider">{stage.label}</span>

              {/* Actionable Retry Overlay */}
              {isFailed && onRetry && (stage.id === "parse" || stage.id === "seeding") && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRetry(stage.id as "parse" | "seeding");
                  }}
                  className="absolute inset-0 flex items-center justify-center rounded-lg bg-semantic-error text-white opacity-0 transition-opacity group-hover:opacity-100"
                  title={`Retry ${stage.label}`}
                >
                  <RefreshIcon className="h-3 w-3 mr-1" />
                  <span className="text-[9px] font-black uppercase">Retry</span>
                </button>
              )}
            </div>

            {!isLast && (
              <div className="h-px w-2 bg-surface-border" />
            )}
          </div>
        );
      })}
    </div>
  );
}
