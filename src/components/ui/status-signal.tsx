"use client";

import { 
  CheckIcon, 
  WarningIcon, 
  AlertCircleIcon, 
  ClockIcon, 
  SparklesIcon 
} from "@/components/icons";
import { cn } from "@/lib/utils";

export type SignalSeverity = "success" | "warning" | "error" | "info" | "neutral";

export type SignalConfig = {
  label: string;
  severity: SignalSeverity;
  icon?: React.ComponentType<{ className?: string }>;
  animate?: boolean;
};

const CONFIGS: Record<string, SignalConfig> = {
  // Document statuses
  "doc_queued": { label: "Queued", severity: "neutral", icon: ClockIcon },
  "doc_processing": { label: "Processing", severity: "info", animate: true },
  "doc_ready": { label: "Ready", severity: "success", icon: CheckIcon },
  "doc_failed": { label: "Failed", severity: "error", icon: AlertCircleIcon },

  // Answer statuses
  "ans_draft": { label: "Draft", severity: "neutral" },
  "ans_approved": { label: "Approved", severity: "success", icon: CheckIcon },
  "ans_archived": { label: "Archived", severity: "neutral" },
  "ans_low_confidence": { label: "Low Confidence", severity: "warning", icon: WarningIcon },

  // Questionnaire statuses
  "q_pending": { label: "Pending", severity: "neutral" },
  "q_conflict": { label: "Conflict", severity: "warning", icon: WarningIcon },
  "q_missing": { label: "Missing", severity: "error", icon: AlertCircleIcon },
  "q_reviewed": { label: "Reviewed", severity: "success", icon: CheckIcon },
  "q_in_review": { label: "In Review", severity: "info", icon: SparklesIcon },
  "q_alt_selected": { label: "Alt Selected", severity: "info", icon: SparklesIcon },
  "q_unresolved": { label: "Unresolved", severity: "warning", icon: AlertCircleIcon },
  "q_provisional": { label: "Provisional", severity: "info", icon: SparklesIcon },

  // Match Confidence Tiers (D9-DS-02)
  "conf_high": { label: "High", severity: "success", icon: CheckIcon },
  "conf_medium": { label: "Medium", severity: "info", icon: SparklesIcon },
  "conf_low": { label: "Low", severity: "warning", icon: WarningIcon },
  "conf_unresolved": { label: "Unresolved", severity: "error", icon: AlertCircleIcon },

  // D11-US-01: Trust Signals
  "q_verified": { label: "Verified Match", severity: "success", icon: CheckIcon },
  "q_draft_discovery": { label: "Draft Discovery", severity: "warning", icon: SparklesIcon },
};

const SEVERITY_STYLES: Record<SignalSeverity, string> = {
  success: "bg-semantic-success-bg border-semantic-success-border text-semantic-success",
  warning: "bg-semantic-warning-bg border-semantic-warning-border text-semantic-warning",
  error: "bg-semantic-error-bg border-semantic-error-border text-semantic-error",
  info: "bg-semantic-info-bg border-semantic-info-border text-semantic-info",
  neutral: "bg-surface-base border-surface-border text-text-secondary",
};

const SOLID_SEVERITY_STYLES: Record<SignalSeverity, string> = {
  success: "bg-semantic-success border-semantic-success text-white shadow-sm",
  warning: "bg-semantic-warning border-semantic-warning text-white shadow-sm",
  error: "bg-semantic-error border-semantic-error text-white shadow-sm",
  info: "bg-accent-primary border-accent-primary text-white shadow-sm",
  neutral: "bg-text-secondary border-text-secondary text-white shadow-sm",
};

const DOT_STYLES: Record<SignalSeverity, string> = {
  success: "bg-semantic-success",
  warning: "bg-semantic-warning",
  error: "bg-semantic-error",
  info: "bg-semantic-info shadow-[0_0_8px_rgba(29,78,216,0.4)]",
  neutral: "bg-text-muted",
};

interface StatusSignalProps {
  status: keyof typeof CONFIGS | SignalConfig;
  variant?: "badge" | "dot-only" | "subtle" | "solid";
  className?: string;
  showIcon?: boolean;
}

export function StatusSignal({
  status,
  variant = "badge",
  className,
  showIcon = true,
}: StatusSignalProps) {
  const config = typeof status === "string" ? CONFIGS[status] : status;
  
  if (!config) {
    console.warn(`StatusSignal: Unknown status "${status}"`);
    return null;
  }

  const { label, severity, icon: Icon, animate } = config;
  
  const severityStyle = variant === "solid" 
    ? SOLID_SEVERITY_STYLES[severity] 
    : SEVERITY_STYLES[severity];

  const dotStyle = DOT_STYLES[severity];

  if (variant === "dot-only") {
    return (
      <div 
        className={cn("flex items-center gap-2", className)}
        role="status"
        aria-label={label}
      >
        <span className={cn(
          "h-2 w-2 rounded-full",
          dotStyle,
          animate && "animate-pulse"
        )} aria-hidden="true" />
        <span className="text-xs font-medium text-text-secondary">{label}</span>
      </div>
    );
  }

  return (
    <span 
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-bold tracking-tight transition-all",
        severityStyle,
        className
      )}
      role="status"
      aria-label={label}
    >
      {showIcon && Icon ? (
        <Icon className={cn("h-3.5 w-3.5", animate && "animate-pulse")} aria-hidden="true" />
      ) : (
        <span className={cn(
          "h-1.5 w-1.5 rounded-full",
          variant === "solid" ? "bg-white" : dotStyle,
          animate && "animate-pulse"
        )} aria-hidden="true" />
      )}
      {label}
    </span>
  );
}
