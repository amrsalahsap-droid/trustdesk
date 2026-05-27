"use client";

import { useEffect } from "react";
import { AlertCircleIcon, RefreshCwIcon, BuildingIcon } from "@/components/icons";
import Link from "next/link";
import { AppCard, AppTypography, AppIcon, AppButton } from "@/components/ui/app-design-system/primitives";

interface ErrorBoundaryProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Error boundary for the onboarding flow.
 * Prevents infinite blank screens by showing a clear recoverable error state.
 */
export default function OnboardingError({ error, reset }: ErrorBoundaryProps) {
  useEffect(() => {
    // Log error details in dev for debugging
    console.error("[Onboarding Error]", {
      message: error.message,
      digest: error.digest,
      stack: error.stack,
    });
  }, [error]);

  const isDatabaseError = 
    error.message?.includes("P1000") || 
    error.message?.includes("database") ||
    error.message?.includes("Authentication failed");

  const isNetworkError = 
    error.message?.includes("fetch") ||
    error.message?.includes("network") ||
    error.message?.includes("ECONNREFUSED");

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-base px-6">
      <AppCard variant="hero" className="w-full max-w-lg shadow-premium-2xl animate-in zoom-in-95 fade-in duration-500 !p-12">
        <div className="flex flex-col items-center text-center space-y-8">
          <div className="flex h-20 w-20 items-center justify-center rounded-[2rem] bg-semantic-error/10 border border-semantic-error/20 text-semantic-error shadow-premium-lg">
            <AppIcon icon={AlertCircleIcon} size="lg" />
          </div>

          <div className="space-y-3">
            <AppTypography.HeroTitle className="!text-2xl">Something went wrong</AppTypography.HeroTitle>
            <AppTypography.BodySm className="text-lg opacity-60">
              We encountered an unexpected error while preparing your onboarding workspace.
            </AppTypography.BodySm>
          </div>

          {/* Dev-only error details */}
          {process.env.NODE_ENV === "development" && (
            <div className="w-full p-6 bg-surface-base/50 rounded-2xl border border-surface-border/50 text-left space-y-4">
              <AppTypography.Metadata className="opacity-40 uppercase tracking-[0.2em] !text-[9px]">
                Diagnostic Intel (Dev Only)
              </AppTypography.Metadata>
              <div className="space-y-2">
                <p className="text-[11px] font-mono text-semantic-error break-all leading-relaxed opacity-80">
                  {error.message}
                </p>
                {isDatabaseError && (
                  <div className="flex items-center gap-3 pt-2">
                     <div className="h-1.5 w-1.5 rounded-full bg-semantic-warning animate-pulse" />
                     <p className="text-[10px] text-semantic-warning font-black uppercase tracking-widest">
                       Database connection failed. Verify local Postgres status.
                     </p>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-4 w-full pt-4">
            <AppButton
              onClick={reset}
              className="flex-1 h-14 rounded-2xl bg-accent-primary text-white shadow-premium-xl"
            >
              <AppIcon icon={RefreshCwIcon} size="xs" />
              <span>Try Again</span>
            </AppButton>
            <Link href="/" className="flex-1">
              <AppButton
                variant="outline"
                className="w-full h-14 rounded-2xl border-surface-border text-text-muted"
              >
                <AppIcon icon={BuildingIcon} size="xs" />
                <span>Go Home</span>
              </AppButton>
            </Link>
          </div>
        </div>
      </AppCard>
    </div>
  );
}
