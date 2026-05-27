"use client";

import { 
  CheckIcon, 
  WarningIcon, 
  AlertCircleIcon, 
  CloseIcon,
  SearchIcon
} from "@/components/icons";
import { cn } from "@/lib/utils";
import type { SignalSeverity } from "./status-signal";

interface StatusBannerProps {
  severity: SignalSeverity;
  title: string;
  message?: string;
  action?: React.ReactNode;
  onClose?: () => void;
  className?: string;
}

const SEVERITY_CONFIG = {
  success: {
    bg: "bg-semantic-success-bg",
    border: "border-semantic-success-border",
    text: "text-semantic-success",
    icon: CheckIcon,
  },
  warning: {
    bg: "bg-semantic-warning-bg",
    border: "border-semantic-warning-border",
    text: "text-semantic-warning",
    icon: WarningIcon,
  },
  error: {
    bg: "bg-semantic-error-bg",
    border: "border-semantic-error-border",
    text: "text-semantic-error",
    icon: AlertCircleIcon,
  },
  info: {
    bg: "bg-semantic-info-bg",
    border: "border-semantic-info-border",
    text: "text-semantic-info",
    icon: SearchIcon,
  },
  neutral: {
    bg: "bg-surface-base",
    border: "border-surface-border",
    text: "text-text-secondary",
    icon: SearchIcon,
  },
};

export function StatusBanner({
  severity,
  title,
  message,
  action,
  onClose,
  className,
}: StatusBannerProps) {
  const config = SEVERITY_CONFIG[severity] || SEVERITY_CONFIG.neutral;
  const Icon = config.icon;

  return (
    <div className={cn(
      "relative flex items-start gap-4 rounded-lg border p-4 shadow-sm transition-all animate-in fade-in slide-in-from-top-2 duration-300",
      config.bg,
      config.border,
      className
    )}>
      <div className={cn("mt-0.5 rounded-full bg-white/50 p-1.5 shadow-sm", config.text)}>
        <Icon className="h-4.5 w-4.5" />
      </div>

      <div className="flex-1 space-y-1">
        <h4 className={cn("text-sm font-bold leading-none", config.text)}>
          {title}
        </h4>
        {message && (
          <p className="text-sm leading-relaxed text-text-secondary opacity-90">
            {message}
          </p>
        )}
        {action && (
          <div className="pt-2">
            {action}
          </div>
        )}
      </div>

      {onClose && (
        <button
          onClick={onClose}
          className="rounded-md p-1 text-text-muted hover:bg-black/5 transition-all"
        >
          <CloseIcon className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
