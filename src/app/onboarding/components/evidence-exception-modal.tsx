import { useEffect, useState } from "react";
import {
  SparklesIcon as XMarkIcon,
  ShieldCheckIcon,
  ExclamationTriangleIcon,
  CheckIcon as CheckCircleIcon,
  AlertCircleIcon as InformationCircleIcon,
} from "@/components/icons";
import { AppCard, AppTypography, AppIcon, AppButton } from "@/components/ui/app-design-system/primitives";
import { cn } from "@/lib/utils";

export interface EvidenceExceptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
  evidenceType: string;
  evidenceTitle: string;
  existingException?: {
    status: "unavailable" | "not_applicable";
    reason: string;
    note: string;
  };
  onSave: (payload: {
    status: "unavailable" | "not_applicable";
    reason: string;
    note: string;
  }) => Promise<void>;
  onRemove?: () => Promise<void>;
}

const REASON_OPTIONS = [
  { value: "Not available yet", label: "Not available yet", hint: "The evidence cannot be obtained or generated at this time.", status: "unavailable" as const },
  { value: "Not applicable", label: "Not applicable", hint: "This security safeguard does not apply to our architecture.", status: "not_applicable" as const },
  { value: "Will provide later", label: "Will provide later", hint: "We will upload this evidence at a future milestone.", status: "unavailable" as const },
  { value: "Replaced by another control", label: "Replaced by another control", hint: "An alternative control offsets the need for this evidence.", status: "unavailable" as const },
  { value: "Other", label: "Other / Custom", hint: "Other unique operational justification or reason.", status: "unavailable" as const },
];

export function EvidenceExceptionModal({
  isOpen,
  onClose,
  evidenceType,
  evidenceTitle,
  existingException,
  onSave,
  onRemove,
}: EvidenceExceptionModalProps) {
  const [selectedReason, setSelectedReason] = useState<string>("");
  const [note, setNote] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize fields on open
  useEffect(() => {
    if (isOpen) {
      if (existingException) {
        setSelectedReason(existingException.reason);
        setNote(existingException.note || "");
      } else {
        setSelectedReason("Not available yet");
        setNote("");
      }
      setError(null);
    }
  }, [isOpen, existingException]);

  if (!isOpen) return null;

  const handleClose = () => {
    if (!isSubmitting && !isRemoving) {
      onClose();
    }
  };

  const handleSave = async () => {
    if (!selectedReason) {
      setError("Please select a reason for the exception.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const selectedOption = REASON_OPTIONS.find((opt) => opt.value === selectedReason);
      const status = selectedOption?.status || "unavailable";

      await onSave({
        status,
        reason: selectedReason,
        note: note.trim(),
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save exception");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemove = async () => {
    if (!onRemove) return;
    setIsRemoving(true);
    setError(null);

    try {
      await onRemove();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove exception");
    } finally {
      setIsRemoving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-6">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-text-primary/45 backdrop-blur-md" onClick={handleClose} />

      {/* Modal Dialog Container */}
      <AppCard
        variant="hero"
        className="relative w-full max-w-xl !p-0 overflow-hidden shadow-premium-2xl animate-in zoom-in-95 fade-in duration-300 border border-white/10"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-8 border-b border-border-soft bg-surface-base">
          <div className="flex items-center gap-5">
            <div className="h-12 w-12 rounded-2xl bg-intelligence-blue/10 flex items-center justify-center shadow-premium-sm text-intelligence-blue">
              <AppIcon icon={ShieldCheckIcon} variant="brand" size="sm" />
            </div>
            <div className="space-y-1">
              <AppTypography.HeroTitle className="!text-xl tracking-tight">
                {existingException ? "Edit Evidence Exception" : "Mark evidence as not available?"}
              </AppTypography.HeroTitle>
              <AppTypography.BodySm className="opacity-60 max-w-sm leading-relaxed">
                {existingException
                  ? `Update the exception justification for ${evidenceTitle}.`
                  : "This will keep the related trust topics in review state. TrustDesk will not auto-approve claims that depend on this evidence."
                }
              </AppTypography.BodySm>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="h-10 w-10 rounded-full hover:bg-surface-base flex items-center justify-center transition-colors text-text-muted hover:text-text-primary"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-8 space-y-6 max-h-[60vh] overflow-y-auto custom-scrollbar">
          {/* Evidence Details Preview */}
          <div className="p-4 bg-surface-muted border border-surface-border rounded-xl space-y-1">
            <span className="text-[10px] font-black text-text-muted uppercase tracking-widest">Selected Evidence Gap</span>
            <p className="text-sm font-black text-text-primary">{evidenceTitle}</p>
          </div>

          {/* Reason Selection */}
          <div className="space-y-3">
            <AppTypography.Metadata className="opacity-40 uppercase tracking-[0.2em] !text-[9px]">Select Justification Reason</AppTypography.Metadata>
            <div className="space-y-3">
              {REASON_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className={cn(
                    "flex items-start gap-4 p-4 rounded-xl border cursor-pointer transition-all hover:bg-surface-base group relative overflow-hidden",
                    selectedReason === opt.value
                      ? "border-intelligence-blue bg-intelligence-blue/[0.02] shadow-premium-sm"
                      : "border-border-soft bg-surface-base/30 hover:border-intelligence-blue/20"
                  )}
                >
                  <input
                    type="radio"
                    name="reason"
                    className="hidden"
                    checked={selectedReason === opt.value}
                    onChange={() => setSelectedReason(opt.value)}
                  />
                  <div
                    className={cn(
                      "mt-0.5 h-4.5 w-4.5 rounded-full border-2 flex items-center justify-center transition-all shrink-0",
                      selectedReason === opt.value ? "border-intelligence-blue bg-intelligence-blue" : "border-border-soft group-hover:border-intelligence-blue/50"
                    )}
                  >
                    {selectedReason === opt.value && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs font-black text-text-primary tracking-tight">{opt.label}</span>
                    <p className="text-[10px] text-text-secondary leading-relaxed opacity-80">{opt.hint}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Notes (Optional) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <AppTypography.Metadata className="opacity-40 uppercase tracking-[0.2em] !text-[9px]">Internal Clarification Notes</AppTypography.Metadata>
              <span className="text-[9px] font-black text-text-muted/65 uppercase tracking-widest bg-surface-muted px-2 py-0.5 rounded-md">Optional</span>
            </div>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Provide a brief explanation or mapping reference for this exception..."
              rows={3}
              className="w-full p-4 rounded-xl bg-surface-base border border-border-soft text-xs text-text-primary placeholder:text-text-muted/40 focus:outline-none focus:ring-2 focus:ring-intelligence-blue/20 focus:border-intelligence-blue transition-all shadow-premium-sm resize-none leading-relaxed"
              disabled={isSubmitting || isRemoving}
            />
          </div>

          {/* Error Display */}
          {error && (
            <div className="p-4 bg-error-red/5 border border-error-red/20 rounded-xl flex items-center gap-4 animate-in shake duration-300">
              <AppIcon icon={ExclamationTriangleIcon} variant="error" size="xs" />
              <AppTypography.BodySm className="!text-error-red font-black text-xs">{error}</AppTypography.BodySm>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-6 border-t border-border-soft bg-surface-base/50 flex items-center justify-between gap-4">
          <div>
            {existingException && onRemove && (
              <AppButton
                onClick={handleRemove}
                disabled={isSubmitting || isRemoving}
                className="h-12 px-6 rounded-xl border border-error-red/20 bg-error-red/5 text-error-red hover:bg-error-red/10 text-xs font-black uppercase tracking-widest transition-all"
              >
                {isRemoving ? (
                  <div className="h-4 w-4 border-2 border-error-red/30 border-t-error-red rounded-full animate-spin" />
                ) : (
                  "Undo Exception"
                )}
              </AppButton>
            )}
          </div>

          <div className="flex items-center gap-3">
            <AppButton
              variant="outline"
              onClick={handleClose}
              disabled={isSubmitting || isRemoving}
              className="h-12 px-6 rounded-xl text-xs font-bold"
            >
              Cancel
            </AppButton>
            <AppButton
              onClick={handleSave}
              disabled={isSubmitting || isRemoving || !selectedReason}
              className="h-12 px-8 rounded-xl shadow-premium-xl bg-intelligence-blue text-white hover:bg-intelligence-blue-hover text-xs font-black uppercase tracking-widest min-w-[140px]"
            >
              {isSubmitting ? (
                <div className="flex items-center gap-2 justify-center">
                  <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Saving...</span>
                </div>
              ) : (
                existingException ? "Save Changes" : "Confirm Exception"
              )}
            </AppButton>
          </div>
        </div>
      </AppCard>
    </div>
  );
}
