"use client";

import React from "react";
import { AppButton, AppTypography } from "@/components/ui/app-design-system/primitives";
import { RefreshCwIcon, EditIcon, CloseIcon } from "@/components/icons";

export interface ReanalyzeConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  domain: string;
  onReanalyzeSameDomain: () => void;
  onChangeDomain: () => void;
}

export function ReanalyzeConfirmationModal({
  isOpen,
  onClose,
  domain,
  onReanalyzeSameDomain,
  onChangeDomain,
}: ReanalyzeConfirmationModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-surface-base/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-surface-base border border-surface-border rounded-2xl shadow-premium-xl overflow-hidden animate-in slide-in-from-bottom-4 zoom-in-95 duration-300">
        <div className="p-6 space-y-6">
          <div className="flex justify-between items-start gap-4">
            <div className="space-y-1.5">
              <AppTypography.SectionTitle className="!text-xl font-black tracking-tight">
                Re-analyze Domain
              </AppTypography.SectionTitle>
              <AppTypography.BodySm className="text-text-secondary leading-relaxed">
                Do you want to run a fresh scan on <strong>{domain}</strong> or analyze a completely different company?
              </AppTypography.BodySm>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 -mr-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-subtle transition-colors"
            >
              <XIcon className="h-5 w-5" />
            </button>
          </div>

          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={onReanalyzeSameDomain}
              className="w-full flex items-center gap-4 p-4 rounded-xl border border-intelligence-blue/20 bg-intelligence-blue/5 hover:bg-intelligence-blue/10 hover:border-intelligence-blue/30 transition-all text-left"
            >
              <div className="h-10 w-10 shrink-0 rounded-full bg-intelligence-blue/10 flex items-center justify-center">
                <RefreshCwIcon className="h-5 w-5 text-intelligence-blue" />
              </div>
              <div>
                <div className="text-sm font-bold text-white">Re-analyze {domain}</div>
                <div className="text-[11px] text-text-secondary mt-0.5">Run a fresh scan. Existing data will be preserved until the new scan completes.</div>
              </div>
            </button>

            <button
              type="button"
              onClick={onChangeDomain}
              className="w-full flex items-center gap-4 p-4 rounded-xl border border-surface-border bg-surface-subtle/20 hover:bg-surface-subtle/40 transition-all text-left"
            >
              <div className="h-10 w-10 shrink-0 rounded-full bg-surface-base border border-surface-border flex items-center justify-center">
                <EditIcon className="h-4 w-4 text-text-muted" />
              </div>
              <div>
                <div className="text-sm font-bold text-text-primary">Change Domain</div>
                <div className="text-[11px] text-text-secondary mt-0.5">Clear current results and start over with a different website.</div>
              </div>
            </button>
          </div>

          <div className="pt-2 flex justify-end">
            <AppButton variant="outline" onClick={onClose} className="px-6 border-surface-border text-text-secondary hover:text-text-primary">
              Cancel
            </AppButton>
          </div>
        </div>
      </div>
    </div>
  );
}
