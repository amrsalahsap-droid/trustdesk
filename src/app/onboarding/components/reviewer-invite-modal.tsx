/**
 * Reviewer Invite Modal — onboarding.
 * Persists via POST /api/onboarding/reviewer-invite (workspace membership–scoped).
 */

import { useEffect, useState } from "react";
import {
  SparklesIcon as XMarkIcon,
  UsersIcon as UserPlusIcon,
  EnvelopeIcon,
  CheckIcon as CheckCircleIcon,
  ExclamationTriangleIcon,
} from "@/components/icons";
import { Button } from "@/components/ui/button";
import type { WorkspaceRole } from "@prisma/client";
import { getApiErrorMessageFromBody } from "@/lib/api/error-handler";

export interface ReviewerInviteModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
  recommendationId?: string;
  /** Default workspace role for invitees (Reviewer → CONTRIBUTOR). */
  defaultRole?: WorkspaceRole;
  onInviteSuccess?: () => void | Promise<void>;
  onInviteError?: (error: string) => void;
}

interface InviteFormData {
  email: string;
  role: WorkspaceRole;
  message: string;
}

interface InviteState {
  isLoading: boolean;
  error: string | null;
  success: boolean;
  mailWarning: string | null;
}

const ROLE_CHOICES: { value: WorkspaceRole; label: string; hint: string }[] = [
  {
    value: "CONTRIBUTOR",
    label: "Reviewer",
    hint: "Comment and suggest edits on answers (typical reviewer)",
  },
  {
    value: "APPROVER",
    label: "Approver",
    hint: "Approve or request revisions on governed answers",
  },
  {
    value: "ADMIN",
    label: "Workspace admin",
    hint: "Manage workspace settings and members",
  },
];

export function ReviewerInviteModal({
  isOpen,
  onClose,
  workspaceId,
  recommendationId,
  defaultRole = "CONTRIBUTOR",
  onInviteSuccess,
  onInviteError,
}: ReviewerInviteModalProps) {
  const [formData, setFormData] = useState<InviteFormData>({
    email: "",
    role: defaultRole,
    message: "",
  });

  const [inviteState, setInviteState] = useState<InviteState>({
    isLoading: false,
    error: null,
    success: false,
    mailWarning: null,
  });

  useEffect(() => {
    if (isOpen) {
      setFormData((prev) => ({
        ...prev,
        role: defaultRole,
      }));
    }
  }, [isOpen, defaultRole]);

  const resetForm = () => {
    setFormData({
      email: "",
      role: defaultRole,
      message: "",
    });
    setInviteState({
      isLoading: false,
      error: null,
      success: false,
      mailWarning: null,
    });
  };

  const handleClose = () => {
    if (!inviteState.isLoading) {
      resetForm();
      onClose();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.email.trim()) {
      setInviteState((prev) => ({
        ...prev,
        error: "Email address is required",
      }));
      return;
    }

    setInviteState({
      isLoading: true,
      error: null,
      success: false,
      mailWarning: null,
    });

    try {
      const response = await fetch("/api/onboarding/reviewer-invite", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          workspaceId,
          email: formData.email.trim(),
          role: formData.role,
          personalMessage: formData.message.trim() || undefined,
          recommendationId,
        }),
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        const msg = getApiErrorMessageFromBody(payload);
        throw new Error(msg);
      }

      const mailError = typeof payload.mailError === "string" ? payload.mailError : null;
      const mailSent = payload.mailSent === true;

      setInviteState({
        isLoading: false,
        error: null,
        success: true,
        mailWarning:
          !mailSent && mailError
            ? `Invitation saved, but email could not be sent (${mailError}). Share the invite link from workspace settings if needed.`
            : null,
      });

      await onInviteSuccess?.();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to send invitation";

      setInviteState((prev) => ({
        ...prev,
        isLoading: false,
        error: errorMessage,
      }));

      onInviteError?.(errorMessage);
    }
  };

  const handleInputChange = <K extends keyof InviteFormData>(field: K, value: InviteFormData[K]) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));

    if (inviteState.error) {
      setInviteState((prev) => ({
        ...prev,
        error: null,
      }));
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-text-primary/40 backdrop-blur-md" onClick={handleClose} />
      
      <AppCard variant="hero" className="relative w-full max-w-lg !p-0 overflow-hidden shadow-premium-2xl animate-in zoom-in-95 fade-in duration-300">
        <div className="flex items-center justify-between p-8 border-b border-border-soft bg-surface-base">
          <div className="flex items-center gap-5">
            <div className="h-12 w-12 rounded-2xl bg-intelligence-blue/10 flex items-center justify-center shadow-premium-sm">
              <AppIcon icon={UserPlusIcon} variant="brand" size="sm" />
            </div>
            <div className="space-y-1">
              <AppTypography.HeroTitle className="!text-xl">Invite Reviewer</AppTypography.HeroTitle>
              <AppTypography.BodySm className="opacity-60">
                Add an expert to review trust responses.
              </AppTypography.BodySm>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="h-10 w-10 rounded-full hover:bg-surface-base flex items-center justify-center transition-colors text-text-muted"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="p-8">
          {inviteState.success ? (
            <div className="flex flex-col items-center justify-center py-10 text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="h-20 w-20 rounded-[2rem] bg-trust-green/10 flex items-center justify-center text-trust-green mb-6 shadow-premium-lg">
                <AppIcon icon={CheckCircleIcon} size="lg" />
              </div>
              <AppTypography.SubSection className="text-2xl mb-2">Invitation Active</AppTypography.SubSection>
              <AppTypography.BodySm className="opacity-70 max-w-xs mx-auto mb-8">
                {formData.email} was invited as a <span className="font-black text-text-primary uppercase tracking-widest text-[10px]">{ROLE_CHOICES.find((r) => r.value === formData.role)?.label ?? formData.role}</span>.
              </AppTypography.BodySm>
              
              {inviteState.mailWarning && (
                <div className="mb-8 p-4 bg-warning-amber/5 border border-warning-amber/20 rounded-2xl flex items-start gap-4 text-left">
                  <AppIcon icon={ExclamationTriangleIcon} variant="warning" size="xs" className="mt-0.5" />
                  <AppTypography.BodySm className="!text-warning-amber opacity-90">{inviteState.mailWarning}</AppTypography.BodySm>
                </div>
              )}
              
              <AppButton onClick={handleClose} className="w-full h-14 rounded-2xl shadow-premium-lg">
                Continue Setup
              </AppButton>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-8">
              <div className="space-y-3">
                <AppTypography.Metadata className="opacity-40 uppercase tracking-[0.2em] !text-[9px]">Email Address</AppTypography.Metadata>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none text-text-muted group-focus-within:text-intelligence-blue transition-colors">
                    <AppIcon icon={EnvelopeIcon} size="xs" />
                  </div>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => handleInputChange("email", e.target.value)}
                    placeholder="expert@company.com"
                    className="w-full h-14 pl-14 pr-5 rounded-2xl bg-surface-base border border-border-soft text-sm text-text-primary placeholder:text-text-muted/40 focus:outline-none focus:ring-2 focus:ring-intelligence-blue/20 focus:border-intelligence-blue transition-all shadow-premium-sm"
                    disabled={inviteState.isLoading}
                    autoFocus
                  />
                </div>
              </div>

              <div className="space-y-3">
                <AppTypography.Metadata className="opacity-40 uppercase tracking-[0.2em] !text-[9px]">Role & Permissions</AppTypography.Metadata>
                <div className="space-y-4">
                  {ROLE_CHOICES.map((opt) => (
                    <label 
                      key={opt.value} 
                      className={cn(
                        "flex items-center gap-5 p-5 rounded-2xl border cursor-pointer transition-all hover:bg-surface-base group relative overflow-hidden",
                        formData.role === opt.value ? "border-intelligence-blue bg-intelligence-blue-soft shadow-premium-md" : "border-border-soft bg-surface-base/30"
                      )}
                    >
                      <input
                        type="radio"
                        name="role"
                        className="hidden"
                        checked={formData.role === opt.value}
                        onChange={() => handleInputChange("role", opt.value)}
                      />
                      <div className={cn(
                        "h-5 w-5 rounded-full border-2 flex items-center justify-center transition-all",
                        formData.role === opt.value ? "border-intelligence-blue bg-intelligence-blue" : "border-border-soft group-hover:border-intelligence-blue/50"
                      )}>
                        {formData.role === opt.value && <div className="h-2 w-2 rounded-full bg-white" />}
                      </div>
                      <div className="space-y-1">
                         <AppTypography.SubSection className="!text-sm uppercase tracking-widest !font-black">{opt.label}</AppTypography.SubSection>
                         <AppTypography.BodySm className="opacity-60 !text-[11px]">{opt.hint}</AppTypography.BodySm>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <AppTypography.Metadata className="opacity-40 uppercase tracking-[0.2em] !text-[9px]">Message (Optional)</AppTypography.Metadata>
                <textarea
                  value={formData.message}
                  onChange={(e) => handleInputChange("message", e.target.value)}
                  placeholder="Tell them why you're inviting them..."
                  rows={3}
                  className="w-full p-5 rounded-2xl bg-surface-base border border-border-soft text-sm text-text-primary placeholder:text-text-muted/40 focus:outline-none focus:ring-2 focus:ring-intelligence-blue/20 focus:border-intelligence-blue transition-all shadow-premium-sm resize-none"
                  disabled={inviteState.isLoading}
                />
              </div>

              {inviteState.error && (
                <div className="p-4 bg-error-red/5 border border-error-red/20 rounded-2xl flex items-center gap-4 animate-in shake duration-300">
                  <AppIcon icon={ExclamationTriangleIcon} variant="error" size="xs" />
                  <AppTypography.BodySm className="!text-error-red font-black">{inviteState.error}</AppTypography.BodySm>
                </div>
              )}

              <div className="flex gap-4 pt-4">
                <AppButton 
                  type="button" 
                  variant="outline" 
                  onClick={handleClose} 
                  disabled={inviteState.isLoading} 
                  className="flex-1 h-14 rounded-2xl"
                >
                  Cancel
                </AppButton>
                <AppButton 
                  type="submit" 
                  disabled={inviteState.isLoading || !formData.email.trim()} 
                  className="flex-1 h-14 rounded-2xl shadow-premium-xl bg-accent-primary text-white"
                >
                  {inviteState.isLoading ? (
                    <div className="h-5 w-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <div className="flex items-center gap-3">
                      <AppIcon icon={UserPlusIcon} size="xs" />
                      <span>Send Invitation</span>
                    </div>
                  )}
                </AppButton>
              </div>
            </form>
          )}
        </div>
      </AppCard>
    </div>
  );
}
