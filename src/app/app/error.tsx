"use client";

import { useEffect } from "react";
import { AlertCircleIcon, RefreshCwIcon, LogOutIcon } from "@/components/icons";
import Link from "next/link";

interface ErrorBoundaryProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Error boundary for the app shell.
 * Prevents infinite blank screens by showing a clear recoverable error state.
 */
export default function AppError({ error, reset }: ErrorBoundaryProps) {
  useEffect(() => {
    console.error("[App Error]", {
      message: error.message,
      digest: error.digest,
      stack: error.stack,
    });
  }, [error]);

  const isDatabaseError = 
    error.message?.includes("P1000") || 
    error.message?.includes("database") ||
    error.message?.includes("Authentication failed") ||
    error.message?.includes("prisma");

  const isAuthError = 
    error.message?.includes("Authentication") ||
    error.message?.includes("Unauthorized") ||
    error.message?.includes("NoWorkspaceAccessError");

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-base px-4">
      <div className="w-full max-w-md rounded-2xl bg-surface-panel border border-surface-border shadow-xl p-8">
        <div className="flex flex-col items-center text-center space-y-5">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-500/10 border border-rose-500/20">
            <AlertCircleIcon className="h-8 w-8 text-rose-600 dark:text-rose-400" />
          </div>

          <div className="space-y-2">
            <h1 className="text-xl font-semibold text-text-primary">
              Application Error
            </h1>
            <p className="text-sm text-text-secondary">
              We encountered an error while loading the application.
            </p>
          </div>

          {/* Dev-only error details */}
          {process.env.NODE_ENV === "development" && (
            <div className="w-full p-3 bg-surface-base rounded-lg border border-surface-border text-left">
              <p className="text-xs font-medium text-text-muted uppercase tracking-wider mb-2">
                Error Details (dev only)
              </p>
              <p className="text-xs font-mono text-rose-600 break-all">
                {error.message}
              </p>
              {isDatabaseError && (
                <div className="mt-2 text-xs text-amber-600 space-y-1">
                  <p>Database connection failed.</p>
                  <p>Check your DATABASE_URL in .env file.</p>
                </div>
              )}
              {isAuthError && (
                <p className="mt-2 text-xs text-amber-600">
                  Authentication or workspace resolution failed.
                </p>
              )}
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3 w-full">
            <button
              onClick={reset}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-accent-primary text-white text-sm font-medium hover:bg-accent-primary-hover transition-colors"
            >
              <RefreshCwIcon className="h-4 w-4" />
              Try again
            </button>
            <Link
              href="/api/auth/logout"
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-surface-base-hover text-text-secondary text-sm font-medium hover:bg-surface-border transition-colors"
            >
              <LogOutIcon className="h-4 w-4" />
              Sign out
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
