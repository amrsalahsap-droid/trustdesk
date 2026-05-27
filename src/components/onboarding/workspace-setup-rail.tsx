"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CheckIcon } from "@/components/icons";
import { useOnboardingStatus } from "@/hooks/use-onboarding-status";
import {
  deriveOnboardingSteps,
  workspaceSetupContextSubline,
  type WorkspaceSetupContext,
} from "@/lib/onboarding/workspace-setup";

export interface WorkspaceSetupRailProps {
  context: WorkspaceSetupContext;
  /** sessionStorage key fragment; full key used as `${key}` — default includes `context`. */
  dismissStorageKey?: string;
  className?: string;
  /** When current step is upload and user is on Documents, open upload modal instead of navigating away. */
  onUploadPrimaryClick?: () => void;
  /** Strip outer chrome when nested inside another bordered surface (e.g. Documents card). */
  variant?: "default" | "embedded";
}

const primaryBtnClass =
  "inline-flex shrink-0 items-center justify-center rounded-md bg-accent-primary px-3 py-1.5 text-xs font-medium text-white shadow-sm transition-colors hover:bg-accent-primary-hover";

export function WorkspaceSetupRail({
  context,
  dismissStorageKey,
  className = "",
  onUploadPrimaryClick,
  variant = "default",
}: WorkspaceSetupRailProps) {
  const storageKey = dismissStorageKey ?? `workspace-setup-rail-dismissed-${context}`;
  const [dismissed, setDismissed] = useState(false);
  const { status, loading } = useOnboardingStatus();

  useEffect(() => {
    try {
      if (typeof window !== "undefined" && sessionStorage.getItem(storageKey) === "1") {
        setDismissed(true);
      }
    } catch {
      /* ignore */
    }
  }, [storageKey]);

  if (dismissed || loading || !status) return null;

  const derived = deriveOnboardingSteps(status);
  if (derived.allComplete || !derived.nextAction) return null;

  const next = derived.nextAction;
  const useUploadHandler =
    context === "documents" && next.id === "upload" && typeof onUploadPrimaryClick === "function";

  function dismiss() {
    try {
      sessionStorage.setItem(storageKey, "1");
    } catch {
      /* ignore */
    }
    setDismissed(true);
  }

  const shell =
    variant === "embedded"
      ? `border-0 bg-transparent shadow-none rounded-none ${className}`.trim()
      : `rounded-lg border border-surface-border bg-surface-panel shadow-sm ${className}`.trim();

  return (
    <div className={shell} role="region" aria-label="Workspace setup">
      <div className="flex flex-col gap-4 border-b border-surface-border bg-surface-base/40 px-4 py-3 sm:px-5 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <h2 className="text-sm font-semibold text-text-primary">Reach first value</h2>
            {derived.currentStepNumber != null && (
              <span className="text-xs tabular-nums text-text-muted">
                Step {derived.currentStepNumber} of {derived.visibleCount}
              </span>
            )}
          </div>
          <p className="text-xs leading-relaxed text-text-secondary">{workspaceSetupContextSubline(context)}</p>
          <div className="h-1 max-w-md overflow-hidden rounded-full bg-surface-border">
            <div
              className="h-full rounded-full bg-accent-primary transition-all duration-500"
              style={{ width: `${derived.progressPercent}%` }}
            />
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-stretch gap-2 sm:flex-row sm:items-center">
          {useUploadHandler ? (
            <button type="button" onClick={onUploadPrimaryClick} className={primaryBtnClass}>
              {next.primaryCtaLabel}
            </button>
          ) : (
            <Link href={next.href} className={primaryBtnClass}>
              {next.primaryCtaLabel}
            </Link>
          )}
          <button
            type="button"
            onClick={dismiss}
            className="rounded-md border border-transparent px-3 py-1.5 text-xs font-medium text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary"
          >
            Dismiss
          </button>
        </div>
      </div>

      <div className="space-y-2 px-4 py-3 sm:px-5">
        <p className="text-sm font-medium text-text-primary">{next.headline}</p>
        <p className="text-xs leading-relaxed text-text-muted">{next.supportingLine}</p>

        <div className="flex flex-wrap gap-2 pt-1" aria-label="Setup steps">
          {derived.steps.map((step) => (
            <div
              key={step.id}
              className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                step.done
                  ? "border-semantic-success-border bg-semantic-success-bg text-semantic-success"
                  : step.current
                    ? "border-accent-primary/40 bg-accent-primary/10 text-text-primary"
                    : step.blocked
                      ? "cursor-not-allowed border-surface-border bg-surface-base/50 text-text-muted opacity-60"
                      : "border-surface-border bg-surface-base text-text-secondary"
              }`}
              title={step.blocked ? "Complete the previous step first" : undefined}
            >
              {step.done ? <CheckIcon className="h-3.5 w-3.5 shrink-0" /> : <span className="h-3.5 w-3.5 shrink-0 rounded-full border border-surface-border" />}
              <span>{step.pillLabel}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
