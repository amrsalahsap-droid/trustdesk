"use client";

import React, { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { 
  DownloadIcon, 
  FileTextIcon, 
  CheckIcon, 
  AlertCircleIcon,
  ShieldCheckIcon,
  EyeIcon,
  ActivityIcon,
  HelpCircleIcon
} from "@/components/icons";
import { cn } from "@/lib/utils";

interface ExportSettings {
  exportIncludeEvidence: boolean;
  exportIncludeProvenance: boolean;
  exportFormatDefault: string;
  exportUnresolvedBehavior: string;
  questionnaireExportStrictBuyerMode: boolean;
  /** WARN: medium contradictions warn only; BLOCK: they also block questionnaire export. */
  questionnaireExportContradictionMediumPolicy?: "WARN" | "BLOCK";
  requireApproverExportSafeConfirmation: boolean;
  exportFontFamily: string;
  exportFontSize: number;
  exportBoldHeaders: boolean;
  exportVerticalTop: boolean;
  exportWrapText: boolean;
  exportOutputColumnName: string;
  exportAutoMoveNotesToEnd: boolean;
}

export function ExportDefaultsSection() {
  const [settings, setSettings] = useState<ExportSettings | null>(null);
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
        console.error("Failed to load export settings", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function update(delta: Partial<ExportSettings>) {
    if (!settings) return;
    
    const previous = settings;
    setSettings({ ...settings, ...delta });
    setSaving(true);
    
    try {
      const res = await fetch("/api/workspaces/settings", {
        method: "PATCH",
        body: JSON.stringify(delta),
      });
      if (res.ok) {
        toast({ title: "Export defaults updated", severity: "success" });
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
            <h2 className="text-xl font-bold text-text-primary">Questionnaire Export Policy</h2>
            <p className="text-sm text-text-muted">Define the default behavior and safety gates for buyer-ready exports.</p>
          </div>
          {saving && <span className="text-[10px] font-bold text-accent-primary animate-pulse uppercase tracking-widest">Syncing...</span>}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="border-surface-border">
            <CardContent className="p-6 space-y-6">
              <div className="flex items-start gap-3">
                <div className="h-9 w-9 rounded-lg bg-accent-primary/[0.08] border border-accent-primary/20 flex items-center justify-center text-accent-primary shadow-sm">
                  <DownloadIcon className="h-4.5 w-4.5" />
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-bold text-text-primary">Default Format</h3>
                  <p className="text-xs text-text-muted">The preferred file type for generated questionnaires.</p>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                {["xlsx", "csv", "json"].map(format => (
                  <button
                    key={format}
                    onClick={() => update({ exportFormatDefault: format })}
                    className={cn(
                      "flex-1 py-2 rounded-lg border text-xs font-bold transition-all uppercase tracking-wider",
                      settings.exportFormatDefault === format 
                        ? "bg-accent-primary border-accent-primary text-white shadow-md shadow-accent-primary/20" 
                        : "bg-surface-base border-surface-border text-text-secondary hover:border-text-muted"
                    )}
                  >
                    {format}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border-surface-border">
            <CardContent className="p-6 space-y-6">
              <div className="flex items-start gap-3">
                <div className="h-9 w-9 rounded-lg bg-semantic-warning-bg border border-semantic-warning-border flex items-center justify-center text-semantic-warning shadow-sm">
                  <HelpCircleIcon className="h-4.5 w-4.5" />
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-bold text-text-primary">Unresolved Rows</h3>
                  <p className="text-xs text-text-muted">How to handle questions that have not been explicitly reviewed.</p>
                </div>
              </div>
              
              <select 
                className="w-full rounded-lg border border-surface-border bg-surface-base px-3 py-2 text-sm outline-none focus:border-accent-primary transition-all"
                value={settings.exportUnresolvedBehavior}
                onChange={(e) => update({ exportUnresolvedBehavior: e.target.value })}
              >
                <option value="leave_blank">Leave Blank (Recommended)</option>
                <option value="use_ai_draft">Include AI Draft (Unverified)</option>
                <option value="exclude_row">Exclude Entire Row</option>
              </select>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="space-y-6">
        <div>
          <h2 className="text-xl font-bold text-text-primary">Formatting & Layout</h2>
          <p className="text-sm text-text-muted">Ensure exports look professional and match your corporate identity.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="border-surface-border">
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center gap-2 text-text-primary mb-2">
                <FileTextIcon className="h-4 w-4 text-accent-primary" />
                <span className="text-sm font-bold">Injected Column Name</span>
              </div>
              <input 
                type="text"
                className="w-full rounded-lg border border-surface-border bg-surface-base px-3 py-2 text-sm outline-none focus:border-accent-primary transition-all"
                placeholder="e.g. TrustDesk Answer"
                value={settings.exportOutputColumnName}
                onChange={(e) => update({ exportOutputColumnName: e.target.value })}
              />
              <p className="text-[10px] text-text-muted italic">Used when the system adds a new column to an existing sheet.</p>
            </CardContent>
          </Card>

          <Card className="border-surface-border">
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center gap-2 text-text-primary mb-2">
                <span className="text-sm font-bold">Typography</span>
              </div>
              <div className="flex gap-2">
                <select 
                  className="flex-1 rounded-lg border border-surface-border bg-surface-base px-3 py-2 text-sm outline-none focus:border-accent-primary transition-all"
                  value={settings.exportFontFamily}
                  onChange={(e) => update({ exportFontFamily: e.target.value })}
                >
                  {["Calibri", "Arial", "Helvetica", "Verdana", "Tahoma", "Trebuchet MS"].map(f => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
                <input 
                  type="number"
                  className="w-20 rounded-lg border border-surface-border bg-surface-base px-3 py-2 text-sm outline-none focus:border-accent-primary transition-all"
                  value={settings.exportFontSize}
                  onChange={(e) => update({ exportFontSize: parseInt(e.target.value) })}
                />
              </div>
              <p className="text-[10px] text-text-muted italic">Calibri 11pt is the standard Excel default.</p>
            </CardContent>
          </Card>

          <Card className="border-surface-border">
            <CardContent className="p-6 space-y-4">
               <div className="flex items-center justify-between">
                 <span className="text-sm font-bold text-text-primary">Bold Headers</span>
                 <button
                    onClick={() => update({ exportBoldHeaders: !settings.exportBoldHeaders })}
                    className={cn(
                      "relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out",
                      settings.exportBoldHeaders ? "bg-accent-primary" : "bg-surface-border"
                    )}
                  >
                    <span className={cn(
                      "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                      settings.exportBoldHeaders ? "translate-x-5" : "translate-x-0"
                    )} />
                  </button>
               </div>
               <div className="flex items-center justify-between">
                 <span className="text-sm font-bold text-text-primary">Vertical Align Top</span>
                 <button
                    onClick={() => update({ exportVerticalTop: !settings.exportVerticalTop })}
                    className={cn(
                      "relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out",
                      settings.exportVerticalTop ? "bg-accent-primary" : "bg-surface-border"
                    )}
                  >
                    <span className={cn(
                      "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                      settings.exportVerticalTop ? "translate-x-5" : "translate-x-0"
                    )} />
                  </button>
               </div>
               <div className="flex items-center justify-between">
                 <span className="text-sm font-bold text-text-primary">Wrap Long Text</span>
                 <button
                    onClick={() => update({ exportWrapText: !settings.exportWrapText })}
                    className={cn(
                      "relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out",
                      settings.exportWrapText ? "bg-accent-primary" : "bg-surface-border"
                    )}
                  >
                    <span className={cn(
                      "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                      settings.exportWrapText ? "translate-x-5" : "translate-x-0"
                    )} />
                  </button>
               </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="space-y-6">
        <div>
          <h2 className="text-xl font-bold text-text-primary">Content Inclusion</h2>
          <p className="text-sm text-text-muted">Control the level of detail shared with external stakeholders by default.</p>
        </div>

        <Card className="border-surface-border overflow-hidden">
          <CardContent className="p-0 divide-y divide-surface-border">
            <div className="p-6 flex items-center justify-between gap-6">
              <div className="flex items-start gap-4">
                <div className="h-10 w-10 shrink-0 rounded-xl bg-surface-hover border border-surface-border flex items-center justify-center text-text-secondary">
                  <FileTextIcon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-bold text-text-primary">Include Evidence Quotes</p>
                  <p className="text-xs text-text-muted max-w-md">Include specific verbatim quotes from source documents in the export file.</p>
                </div>
              </div>
              <button
                onClick={() => update({ exportIncludeEvidence: !settings.exportIncludeEvidence })}
                className={cn(
                  "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-ring",
                  settings.exportIncludeEvidence ? "bg-accent-primary" : "bg-surface-border"
                )}
              >
                <span className={cn(
                  "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                  settings.exportIncludeEvidence ? "translate-x-5" : "translate-x-0"
                )} />
              </button>
            </div>

            <div className="p-6 flex items-center justify-between gap-6">
              <div className="flex items-start gap-4">
                <div className="h-10 w-10 shrink-0 rounded-xl bg-surface-hover border border-surface-border flex items-center justify-center text-text-secondary">
                  <EyeIcon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-bold text-text-primary">Include Provenance Names</p>
                  <p className="text-xs text-text-muted max-w-md">List the names of source documents (e.g. "Security Policy 2024") next to each answer.</p>
                </div>
              </div>
              <button
                onClick={() => update({ exportIncludeProvenance: !settings.exportIncludeProvenance })}
                className={cn(
                  "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-ring",
                  settings.exportIncludeProvenance ? "bg-accent-primary" : "bg-surface-border"
                )}
              >
                <span className={cn(
                  "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                  settings.exportIncludeProvenance ? "translate-x-5" : "translate-x-0"
                )} />
              </button>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-6">
        <div>
          <h2 className="text-xl font-bold text-text-primary">Safety Gates</h2>
          <p className="text-sm text-text-muted">Enforce compliance checks before allowing data to leave the platform.</p>
        </div>

        <Card className="border-surface-border bg-accent-primary/[0.01]">
          <CardContent className="p-0 divide-y divide-surface-border">
            <div className="p-6 flex items-start gap-4">
              <div className="h-10 w-10 shrink-0 rounded-lg bg-semantic-success-bg border border-semantic-success-border flex items-center justify-center text-semantic-success shadow-sm">
                <ShieldCheckIcon className="h-5 w-5" />
              </div>
              <div className="flex-1 space-y-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold text-text-primary">Mandatory Export-Safe Flag</p>
                    <p className="text-xs text-text-muted">Rows cannot be exported unless an approver has explicitly marked them as "Export Safe".</p>
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
                    <p className="text-sm font-bold text-text-primary">Strict Buyer Disclosure Mode</p>
                    <p className="text-xs text-text-muted">Hide answers in exports if they link to evidence from internal-only documents.</p>
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

                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold text-text-primary">Block exports on medium contradictions</p>
                    <p className="text-xs text-text-muted">
                      Critical and high always block until resolved. When this is off, medium-severity open contradictions warn only; when on, they block export like high severity.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      update({
                        questionnaireExportContradictionMediumPolicy:
                          (settings.questionnaireExportContradictionMediumPolicy ?? "WARN") === "BLOCK"
                            ? "WARN"
                            : "BLOCK",
                      })
                    }
                    className={cn(
                      "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-ring",
                      (settings.questionnaireExportContradictionMediumPolicy ?? "WARN") === "BLOCK"
                        ? "bg-accent-primary"
                        : "bg-surface-border",
                    )}
                  >
                    <span
                      className={cn(
                        "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                        (settings.questionnaireExportContradictionMediumPolicy ?? "WARN") === "BLOCK"
                          ? "translate-x-5"
                          : "translate-x-0",
                      )}
                    />
                  </button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-6">
        <div>
          <h2 className="text-xl font-bold text-text-primary">Behavioral Orchestration</h2>
          <p className="text-sm text-text-muted">Automate cleanup and organization of the resulting file.</p>
        </div>

        <Card className="border-surface-border">
          <CardContent className="p-6 flex items-center justify-between gap-6">
            <div className="flex items-start gap-4">
              <div className="h-10 w-10 shrink-0 rounded-xl bg-surface-hover border border-surface-border flex items-center justify-center text-text-secondary">
                <ActivityIcon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-bold text-text-primary">Auto-move Internal Notes</p>
                <p className="text-xs text-text-muted max-w-md">Identify "Notes" or "Comments" columns and move them to the final position in the sheet. This prevents internal-only remarks from sitting in the middle of data.</p>
              </div>
            </div>
            <button
              onClick={() => update({ exportAutoMoveNotesToEnd: !settings.exportAutoMoveNotesToEnd })}
              className={cn(
                "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-ring",
                settings.exportAutoMoveNotesToEnd ? "bg-accent-primary" : "bg-surface-border"
              )}
            >
              <span className={cn(
                "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                settings.exportAutoMoveNotesToEnd ? "translate-x-5" : "translate-x-0"
              )} />
            </button>
          </CardContent>
        </Card>
      </section>

      <div className="flex items-center gap-3 p-4 bg-surface-panel/30 rounded-xl border border-surface-border border-dashed">
         <div className="h-8 w-8 shrink-0 rounded-full bg-surface-hover flex items-center justify-center text-text-muted border border-surface-border">
           <DownloadIcon className="h-4 w-4" />
         </div>
         <p className="text-[11px] text-text-muted leading-relaxed">
           <strong>Pro Tip:</strong> Export defaults can be overridden on a per-job basis during the final export step. These settings define the "safe start" for all new export tasks.
         </p>
      </div>
    </div>
  );
}
