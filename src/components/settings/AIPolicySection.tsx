"use client";

import React, { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { 
  ClockIcon, 
  AlertCircleIcon, 
  SparklesIcon, 
  EditIcon,
  ShieldCheckIcon,
  CheckIcon,
  DownloadIcon,
  EyeIcon
} from "@/components/icons";
import { cn } from "@/lib/utils";

interface AIPolicySettings {
  defaultAnswerReviewCadenceDays: number;
  flagAnswerOnEvidenceChange: boolean;
  allowApprovedAnswerBodyEditWithoutReapproval: boolean;
  defaultTone: string;
  allowOwnerSelfApprove: boolean;
  requireApproverExportSafeConfirmation: boolean;
  questionnaireExportStrictBuyerMode: boolean;
}

const ALLOWED_TONES = ["concise", "detailed", "technical", "professional"];

export function AIPolicySection() {
  const [settings, setSettings] = useState<AIPolicySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/workspaces/settings");
        if (res.ok) {
          const data = await res.json();
          setSettings(data.workspace);
        }
      } catch (err) {
        console.error("Failed to load AI policy settings", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function update(delta: Partial<AIPolicySettings>) {
    if (!settings) return;
    
    // Optimistic update
    const previous = settings;
    setSettings({ ...settings, ...delta });
    setSaving(true);
    
    try {
      const res = await fetch("/api/workspaces/settings", {
        method: "PATCH",
        body: JSON.stringify(delta),
      });
      if (res.ok) {
        const data = await res.json();
        setSettings(data.workspace);
        toast({ title: "Policy updated", severity: "success" });
      } else {
        setSettings(previous);
        toast({ title: "Update failed", severity: "error" });
      }
    } catch (err) {
      setSettings(previous);
      toast({ title: "Update failed", severity: "error" });
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="animate-pulse space-y-6">
    <div className="h-40 bg-surface-hover rounded-xl" />
    <div className="h-64 bg-surface-hover rounded-xl" />
  </div>;
  
  if (!settings) return null;

  return (
    <div className="space-y-10 pb-20">
      <section className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-text-primary">Generation Defaults</h2>
            <p className="text-sm text-text-muted">Configure how AI synthesizes and formats library content.</p>
          </div>
          {saving && <span className="text-[10px] font-bold text-accent-primary animate-pulse uppercase tracking-widest">Syncing...</span>}
        </div>

        <Card>
          <CardContent className="p-0 divide-y divide-surface-border">
            <div className="p-6 flex items-start gap-4">
              <div className="h-10 w-10 shrink-0 rounded-lg bg-accent-primary/[0.08] border border-accent-primary/20 flex items-center justify-center text-accent-primary shadow-sm">
                <SparklesIcon className="h-5 w-5" />
              </div>
              <div className="flex-1 space-y-3">
                <div>
                  <p className="text-sm font-bold text-text-primary">Default Answer Tone</p>
                  <p className="text-xs text-text-muted">The baseline writing style used when generating new answers from source documents.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {ALLOWED_TONES.map(tone => (
                    <button
                      key={tone}
                      onClick={() => update({ defaultTone: tone })}
                      className={cn(
                        "px-3 py-1.5 rounded-md text-xs font-medium border transition-all capitalize",
                        settings.defaultTone === tone 
                          ? "bg-accent-primary text-white border-accent-primary shadow-sm" 
                          : "bg-surface-base text-text-secondary border-surface-border hover:border-text-muted"
                      )}
                    >
                      {tone}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-6 flex items-start gap-4">
              <div className="h-10 w-10 shrink-0 rounded-lg bg-surface-hover border border-surface-border flex items-center justify-center text-text-secondary">
                <EyeIcon className="h-5 w-5" />
              </div>
              <div className="flex-1 space-y-1">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-text-primary">Provenance Visibility</p>
                  <span className="text-[9px] font-bold uppercase tracking-widest text-text-muted bg-surface-hover px-2 py-0.5 rounded border">Fixed: Always On</span>
                </div>
                <p className="text-xs text-text-muted max-w-2xl">
                  TrustDesk requires visible source citations for all prepared content to ensure auditability.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-6">
        <div>
          <h2 className="text-xl font-bold text-text-primary">Governance & Review Policy</h2>
          <p className="text-sm text-text-muted">Define the requirements for content approval and periodic review.</p>
        </div>

        <Card>
          <CardContent className="p-0 divide-y divide-surface-border">
            {/* Review Cadence */}
            <div className="p-6 flex items-start gap-4">
              <div className="h-10 w-10 shrink-0 rounded-lg bg-semantic-warning-bg border border-semantic-warning-border flex items-center justify-center text-semantic-warning shadow-sm">
                <ClockIcon className="h-5 w-5" />
              </div>
              <div className="flex-1 space-y-3">
                <div>
                  <p className="text-sm font-bold text-text-primary">Standard Review Cadence</p>
                  <p className="text-xs text-text-muted">Maximum time allowed before an approved answer is flagged for re-validation.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {[90, 180, 365].map(days => (
                    <button
                      key={days}
                      onClick={() => update({ defaultAnswerReviewCadenceDays: days })}
                      className={cn(
                        "px-3 py-1.5 rounded-md text-xs font-medium border transition-all",
                        settings.defaultAnswerReviewCadenceDays === days 
                          ? "bg-accent-primary text-white border-accent-primary shadow-sm" 
                          : "bg-surface-base text-text-secondary border-surface-border hover:border-text-muted"
                      )}
                    >
                      {days} Days
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Approval Workflow */}
            <div className="p-6 flex items-start gap-4">
              <div className="h-10 w-10 shrink-0 rounded-lg bg-semantic-success-bg border border-semantic-success-border flex items-center justify-center text-semantic-success shadow-sm">
                <ShieldCheckIcon className="h-5 w-5" />
              </div>
              <div className="flex-1 space-y-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold text-text-primary">Allow Owner Self-Approval</p>
                    <p className="text-xs text-text-muted">When enabled, assigned owners can approve their own content without a second peer review.</p>
                  </div>
                  <button
                    onClick={() => update({ allowOwnerSelfApprove: !settings.allowOwnerSelfApprove })}
                    className={cn(
                      "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-ring",
                      settings.allowOwnerSelfApprove ? "bg-accent-primary" : "bg-surface-border"
                    )}
                  >
                    <span className={cn(
                      "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                      settings.allowOwnerSelfApprove ? "translate-x-5" : "translate-x-0"
                    )} />
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold text-text-primary">Strict Evidence Monitoring</p>
                    <p className="text-xs text-text-muted">Automatically invalidate approvals if the underlying source document or linked chunk is modified.</p>
                  </div>
                  <button
                    onClick={() => update({ flagAnswerOnEvidenceChange: !settings.flagAnswerOnEvidenceChange })}
                    className={cn(
                      "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-ring",
                      settings.flagAnswerOnEvidenceChange ? "bg-accent-primary" : "bg-surface-border"
                    )}
                  >
                    <span className={cn(
                      "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                      settings.flagAnswerOnEvidenceChange ? "translate-x-5" : "translate-x-0"
                    )} />
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold text-text-primary">Minor Edit Flexibility</p>
                    <p className="text-xs text-text-muted">Allow non-material text corrections (typos, formatting) to APPROVED answers without resetting approval.</p>
                  </div>
                  <button
                    onClick={() => update({ allowApprovedAnswerBodyEditWithoutReapproval: !settings.allowApprovedAnswerBodyEditWithoutReapproval })}
                    className={cn(
                      "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-ring",
                      settings.allowApprovedAnswerBodyEditWithoutReapproval ? "bg-accent-primary" : "bg-surface-border"
                    )}
                  >
                    <span className={cn(
                      "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                      settings.allowApprovedAnswerBodyEditWithoutReapproval ? "translate-x-5" : "translate-x-0"
                    )} />
                  </button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-6">
        <div>
          <h2 className="text-xl font-bold text-text-primary">Export & Disclosure Policy</h2>
          <p className="text-sm text-text-muted">Control how internal content is exposed to external stakeholders.</p>
        </div>

        <Card>
          <CardContent className="p-0 divide-y divide-surface-border">
            <div className="p-6 flex items-start gap-4">
              <div className="h-10 w-10 shrink-0 rounded-lg bg-semantic-info-bg border border-semantic-info-border flex items-center justify-center text-semantic-info shadow-sm">
                <DownloadIcon className="h-5 w-5" />
              </div>
              <div className="flex-1 space-y-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold text-text-primary">Explicit Export Safe-Gate</p>
                    <p className="text-xs text-text-muted">Require approvers to explicitly toggle an "Export Safe" flag after approving the internal answer.</p>
                  </div>
                  <button
                    onClick={() => update({ requireApproverExportSafeConfirmation: !settings.requireApproverExportSafeConfirmation })}
                    className={cn(
                      "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-ring",
                      settings.requireApproverExportSafeConfirmation ? "bg-accent-primary" : "bg-surface-border"
                    )}
                  >
                    <span className={cn(
                      "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                      settings.requireApproverExportSafeConfirmation ? "translate-x-5" : "translate-x-0"
                    )} />
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold text-text-primary">Strict Buyer Mode</p>
                    <p className="text-xs text-text-muted">Omit answers from exports if they contain linked evidence that has not been explicitly approved for external disclosure.</p>
                  </div>
                  <button
                    onClick={() => update({ questionnaireExportStrictBuyerMode: !settings.questionnaireExportStrictBuyerMode })}
                    className={cn(
                      "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-ring",
                      settings.questionnaireExportStrictBuyerMode ? "bg-accent-primary" : "bg-surface-border"
                    )}
                  >
                    <span className={cn(
                      "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                      settings.questionnaireExportStrictBuyerMode ? "translate-x-5" : "translate-x-0"
                    )} />
                  </button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      <div className="flex items-center gap-2 p-4 bg-surface-panel/30 rounded-xl border border-surface-border border-dashed">
         <AlertCircleIcon className="h-5 w-5 text-text-muted" />
         <p className="text-[11px] text-text-muted leading-relaxed">
           <strong>Policy Notice:</strong> Changes to AI and governance policies are applied to all <em>new</em> content immediately. Existing content will retain its current status until its next review cycle or material modification.
         </p>
      </div>
    </div>
  );
}
