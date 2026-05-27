"use client";

import { Modal } from "@/components/ui/modal";
import { type RecommendedDocument } from "@/modules/workspaces/onboarding/document-recommendation-service";
import { AlertCircleIcon, SparklesIcon, DownloadIcon } from "@/components/icons";

import { AppCard, AppTypography, AppIcon, AppButton, AppBadge } from "@/components/ui/app-design-system/primitives";
import { cn } from "@/lib/utils";

export function DocumentSampleModal({
  doc,
  onClose,
  onDownload,
}: {
  doc: RecommendedDocument | null;
  onClose: () => void;
  onDownload: () => void;
}) {
  if (!doc) return null;

  const isManual = doc.brief?.status === "MANUAL_REVIEW_REQUIRED";
  const tier = doc.templateQuality;
  const isLimitedOutput = tier === "limited" || tier === "manual_required";
  const showTailoredStarter = !isManual && !isLimitedOutput;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-text-primary/40 backdrop-blur-md" onClick={onClose} />
      
      <AppCard variant="hero" className="relative w-full max-w-3xl !p-0 overflow-hidden shadow-premium-2xl animate-in zoom-in-95 fade-in duration-300">
        {/* Header */}
        <div className="flex items-center justify-between p-8 border-b border-surface-border bg-surface-base">
          <div className="flex items-center gap-5">
            <div className="h-12 w-12 rounded-2xl bg-accent-primary/10 flex items-center justify-center shadow-premium-sm">
              <AppIcon icon={SparklesIcon} variant="brand" size="sm" />
            </div>
            <div className="space-y-1">
              <AppTypography.Metadata className="opacity-40 uppercase tracking-[0.2em] !text-[9px]">Knowledge Guide</AppTypography.Metadata>
              <AppTypography.HeroTitle className="!text-xl">{doc.name}</AppTypography.HeroTitle>
            </div>
          </div>
          <button
            onClick={onClose}
            className="h-10 w-10 rounded-full hover:bg-surface-base-hover flex items-center justify-center transition-colors text-text-muted"
          >
            <AppIcon icon={AlertCircleIcon} size="xs" className="rotate-45" />
          </button>
        </div>

        {/* Content */}
        <div className="p-8 space-y-8 max-h-[70vh] overflow-y-auto custom-scrollbar">
          {/* Disclaimer Banner */}
          <div className="p-5 rounded-2xl bg-surface-base border border-surface-border flex gap-4">
            <AppIcon icon={AlertCircleIcon} variant="muted" size="xs" className="mt-0.5" />
            <AppTypography.BodySm className="italic opacity-60 leading-relaxed">
              {isManual
                ? "Note: High-confidence tailoring could not be automated for this document based on the current scan. Manual review is required."
                : isLimitedOutput
                  ? "This preview uses limited or structured tailoring so we do not present generic policy text as fully customized. It is not legal or compliance advice."
                  : "Disclaimer: This is a starter example to help you structure your document. It is not a legal or compliance guarantee."}
            </AppTypography.BodySm>
          </div>

          {/* Intelligence Signals */}
          {doc.templateSignalsUsed && doc.templateSignalsUsed.length > 0 && (
            <div className="space-y-4">
              <AppTypography.Metadata className="opacity-40 uppercase tracking-[0.2em] !text-[9px]">Tailoring Intelligence</AppTypography.Metadata>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {doc.templateSignalsUsed.slice(0, 4).map((s, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-surface-base/30 border border-surface-border/50">
                    <div className="h-1.5 w-1.5 rounded-full bg-accent-primary shadow-[0_0_8px_rgba(37,99,235,0.3)]" />
                    <div className="min-w-0">
                      <p className="text-[9px] font-black uppercase tracking-widest text-text-primary/70 truncate">{s.field}</p>
                      <p className="text-[10px] text-text-muted truncate">{s.value || s.source || "—"}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Preview Section */}
          <div className="space-y-3">
            <AppTypography.Metadata className="opacity-40 uppercase tracking-[0.2em] !text-[9px]">Document Preview</AppTypography.Metadata>
            <div className="relative group">
              <div className="max-h-[40vh] overflow-y-auto custom-scrollbar bg-[#0A0C10] p-8 rounded-2xl border border-white/5 font-mono shadow-premium-lg">
                <pre className="text-[11px] text-white/70 whitespace-pre-wrap leading-relaxed">
                  {doc.tailoredTemplate || doc.libraryMetadata?.sampleText || "No sample available for this document type."}
                </pre>
              </div>
              
              {/* Status Badge */}
              <div className="absolute top-4 right-4 animate-in fade-in zoom-in duration-500">
                {isManual || isLimitedOutput ? (
                  <AppBadge variant="error" className="bg-semantic-warning/10 border-semantic-warning/20 text-semantic-warning shadow-premium-sm backdrop-blur-md">
                    {tier === "limited" ? "Limited Tailoring" : "Manual Starter"}
                  </AppBadge>
                ) : showTailoredStarter ? (
                  <AppBadge variant="success" className="bg-accent-primary/10 border-accent-primary/20 text-accent-primary shadow-premium-sm backdrop-blur-md">
                    AI-Tailored Starter
                  </AppBadge>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-8 border-t border-surface-border bg-surface-base/50 flex flex-col sm:flex-row items-center justify-between gap-6">
          <AppButton
            variant="outline"
            onClick={onDownload}
            className="w-full sm:w-auto h-12 px-6 rounded-xl border-surface-border text-text-muted hover:text-text-primary group"
          >
            <AppIcon icon={DownloadIcon} size="xs" className="group-hover:translate-y-0.5 transition-transform" />
            <span>Download DOCX</span>
          </AppButton>
          
          <AppButton
            onClick={onClose}
            className="w-full sm:w-auto h-14 px-12 rounded-2xl shadow-premium-xl bg-accent-primary text-white"
          >
            I Understand
          </AppButton>
        </div>
      </AppCard>
    </div>
  );
}
