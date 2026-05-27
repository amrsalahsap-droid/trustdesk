"use client";

import { SparklesIcon, CloseIcon } from "@/components/icons";
import { cn } from "@/lib/utils";

interface ProcessingBannerProps {
  isVisible: boolean;
  onDismiss: () => void;
  count: number;
}

export function ProcessingBanner({ isVisible, onDismiss, count }: ProcessingBannerProps) {
  if (!isVisible) return null;

  return (
    <div className="relative mb-6 overflow-hidden rounded-2xl border border-accent-primary/20 bg-accent-primary/[0.03] p-5 shadow-sm backdrop-blur-sm animate-in fade-in slide-in-from-top-4 duration-500">
      {/* Background Animated Gradient */}
      <div className="absolute inset-0 -z-10 bg-gradient-to-r from-accent-primary/[0.05] via-transparent to-transparent opacity-50" />
      
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-primary/10 text-accent-primary shadow-inner">
            <SparklesIcon className="h-5 w-5 animate-pulse" />
          </div>
          
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-text-primary">
              Indexing in progress
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-text-muted">
              <span className="font-semibold text-accent-primary">{count} {count === 1 ? 'file is' : 'files are'}</span> being parsed in the background. Status updates are available in the Documents list below.
            </p>
          </div>
        </div>

        <button
          onClick={onDismiss}
          className="rounded-full p-1.5 text-text-muted transition-colors hover:bg-black/5 hover:text-text-primary"
          aria-label="Dismiss notification"
        >
          <CloseIcon className="h-4 w-4" />
        </button>
      </div>

      {/* Progress Track */}
      <div className="mt-4 h-1 w-full overflow-hidden rounded-full bg-accent-primary/10">
        <div className="h-full w-full origin-left animate-progress-indeterminate rounded-full bg-accent-primary shadow-[0_0_8px_rgba(29,78,216,0.4)]" />
      </div>
    </div>
  );
}
