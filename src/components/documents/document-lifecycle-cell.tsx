"use client";

import { DocumentLifecycle } from "@/lib/documents/document-display";
import { StatusSignal } from "@/components/ui/status-signal";
import { cn } from "@/lib/utils";

interface DocumentLifecycleCellProps {
  lifecycle: DocumentLifecycle;
  onClick?: () => void;
}

export function DocumentLifecycleCell({ lifecycle, onClick }: DocumentLifecycleCellProps) {
  const { upload, parse, seeding } = lifecycle;

  return (
    <div 
      className="flex cursor-pointer flex-col gap-2 group" 
      onClick={onClick}
      title="Click to view full lifecycle timeline"
    >
      {/* Primary Status Badge */}
      <div className="flex items-center gap-2">
        <StatusSignal 
          status={{ 
            label: lifecycle.activeLabel, 
            severity: lifecycle.activeVariant === "ok" ? "success" : 
                      lifecycle.activeVariant === "error" ? "error" : 
                      lifecycle.activeVariant === "warning" ? "warning" : "info",
            animate: !lifecycle.isTerminal && lifecycle.activeVariant === "neutral"
          }} 
        />
      </div>

      {/* Mini Progress Bar / Indicators */}
      <div className="flex items-center gap-1.5 px-1">
        <StageDot label="U" variant={upload.variant} active={lifecycle.currentStage === "Upload"} />
        <div className="h-px w-3 bg-surface-border" />
        <StageDot label="P" variant={parse.variant} active={lifecycle.currentStage === "Parse"} />
        <div className="h-px w-3 bg-surface-border" />
        <StageDot label="S" variant={seeding.variant} active={lifecycle.currentStage === "Seeding"} />
      </div>

      {/* Hover prompt */}
      <span className="text-[10px] text-text-muted opacity-0 group-hover:opacity-100 transition-opacity">
        View details →
      </span>
    </div>
  );
}

function StageDot({ label, variant, active }: { label: string; variant: string; active?: boolean }) {
  const isOk = variant === "ok";
  const isErr = variant === "error";
  const isWarning = variant === "warning";

  return (
    <div 
      className={cn(
        "flex h-4 w-4 items-center justify-center rounded-full text-[8px] font-bold transition-all",
        isOk ? "bg-semantic-success text-white" :
        isErr ? "bg-semantic-error text-white" :
        isWarning ? "bg-semantic-warning text-white" :
        active ? "bg-accent-primary text-white animate-pulse shadow-[0_0_8px_rgba(29,78,216,0.5)]" :
        "bg-surface-border text-text-muted"
      )}
      title={`${label}: ${variant}`}
    >
      {label}
    </div>
  );
}
