"use client";

import React, { useState } from "react";
import { AppCard, AppTypography, AppBadge } from "@/components/ui/app-design-system/primitives";
import { cn } from "@/lib/utils";
import { 
  SparklesIcon, 
  ShieldCheckIcon,
  SearchIcon,
  EyeIcon,
  DatabaseIcon,
  LinkIcon,
  LockIcon,
  ArrowRightIcon
} from "@/components/icons";
import { OperationalWorkflowView } from "@/modules/workspaces/onboarding/vendor-intelligence-types";

interface ReadinessOperationalWorkflowsProps {
  workflows: OperationalWorkflowView[];
}

export function ReadinessOperationalWorkflows({ workflows }: ReadinessOperationalWorkflowsProps) {
  const [activeTab, setActiveTab] = useState<string>(workflows[0]?.id || "");

  if (!workflows || workflows.length === 0) return null;

  const currentWf = workflows.find(w => w.id === activeTab) || workflows[0];

  const getWorkflowIcon = (type: string) => {
    switch (type) {
      case "cloud_scanning":
        return SearchIcon;
      case "sensitive_data_discovery":
        return EyeIcon;
      case "ai_enrichment":
        return SparklesIcon;
      case "connector_authorization":
        return LockIcon;
      case "export_generation":
        return DatabaseIcon;
      case "monitoring":
        return ShieldCheckIcon;
      case "audit_logging":
        return LinkIcon;
      default:
        return ShieldCheckIcon;
    }
  };

  const IconComponent = getWorkflowIcon(currentWf.type);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <AppTypography.SectionTitle className="!text-2xl font-black tracking-tight text-text-primary flex items-center gap-2">
          Operational Workflow Intelligence
        </AppTypography.SectionTitle>
        <AppTypography.Metadata className="opacity-60 text-xs">
          Interactive modeling of identified platform behaviors, data flows, and active integrations grounded in discovered evidence.{" "}
          <span className="text-intelligence-blue font-semibold cursor-help underline decoration-dotted ml-1" title="Workflow confidence reflects certainty in this specific inferred workflow, not overall domain intelligence coverage.">
            Workflow confidence reflects certainty in this specific inferred workflow, not overall domain intelligence coverage.
          </span>
        </AppTypography.Metadata>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Sidebar Tabs */}
        <div className="lg:col-span-4 space-y-2">
          {workflows.map((wf) => {
            const WfIcon = getWorkflowIcon(wf.type);
            const isActive = wf.id === currentWf.id;
            return (
              <button
                key={wf.id}
                onClick={() => setActiveTab(wf.id)}
                className={cn(
                  "w-full text-left p-4 rounded-xl border transition-all duration-200 flex items-center gap-3.5 group relative overflow-hidden",
                  isActive 
                    ? "bg-surface-base border-intelligence-blue/30 shadow-md" 
                    : "bg-surface-subtle/40 border-surface-border/40 hover:bg-surface-base hover:border-surface-border/80"
                )}
              >
                {isActive && (
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-intelligence-blue" />
                )}
                <div className={cn(
                  "h-8 w-8 rounded-lg flex items-center justify-center shrink-0 border transition-all",
                  isActive 
                    ? "bg-intelligence-blue/10 border-intelligence-blue/20 text-intelligence-blue" 
                    : "bg-surface-subtle border-surface-border/60 text-text-secondary group-hover:text-text-primary"
                )}>
                  <WfIcon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className={cn(
                    "text-xs font-black truncate uppercase tracking-wide",
                    isActive ? "text-intelligence-blue" : "text-text-primary"
                  )}>
                    {wf.title}
                  </div>
                  <div className="text-[10px] text-text-secondary/60 font-semibold uppercase tracking-wider cursor-help" title="Workflow confidence reflects certainty in this specific inferred workflow, not overall domain intelligence coverage.">
                    {wf.evidenceStrength} Evidence · {Math.round(wf.confidence * 100)}% Conf
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Workflow Detail Display Card */}
        <AppCard className="lg:col-span-8 p-6 bg-surface-base border-surface-border/50 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-48 h-48 rounded-full blur-[80px] pointer-events-none bg-intelligence-blue/5 opacity-[0.03] group-hover:opacity-[0.05] transition-opacity duration-300" />
          
          <div className="space-y-6 relative z-10">
            {/* Title & Stats */}
            <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <AppBadge variant="info" className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 border bg-intelligence-blue/10 border-intelligence-blue/20 text-intelligence-blue">
                    {currentWf.type.replace("_", " ")} WORKFLOW
                  </AppBadge>
                  <AppBadge variant="outline" className={cn(
                    "text-[9px] font-black uppercase tracking-wider px-2 py-0.5 border",
                    currentWf.evidenceStrength === "strong" 
                      ? "bg-success-emerald/10 border-success-emerald/20 text-success-emerald" 
                      : "bg-warning-amber/10 border-warning-amber/20 text-warning-amber"
                  )}>
                    {currentWf.evidenceStrength} evidence
                  </AppBadge>
                </div>
                <AppTypography.SectionTitle className="!text-xl font-black tracking-tight text-text-primary">
                  {currentWf.title}
                </AppTypography.SectionTitle>
              </div>

              <div className="shrink-0 flex items-center gap-2.5 bg-intelligence-blue/5 border border-intelligence-blue/10 rounded-xl px-3 py-1.5 cursor-help" title="Workflow confidence reflects certainty in this specific inferred workflow, not overall domain intelligence coverage.">
                <span className="text-xs font-black text-intelligence-blue/80">
                  {currentWf.evidenceStrength === "strong" 
                    ? `Confirmed Workflow · Grounded · ${Math.round(currentWf.confidence * 100)}% confidence`
                    : currentWf.evidenceStrength === "weak"
                      ? `Inferred Workflow · Needs confirmation · ${Math.round(currentWf.confidence * 100)}% confidence`
                      : `Draft Workflow Model · Inferred · ${Math.round(currentWf.confidence * 100)}% confidence`
                  }
                </span>
              </div>
            </div>

            <p className="text-sm text-text-secondary leading-relaxed font-medium">
              {currentWf.summary}
            </p>

            <hr className="border-surface-border/40" />

            {/* Timeline Steps */}
            <div className="space-y-4">
              <div className="text-[10px] font-black text-text-secondary/60 uppercase tracking-widest">Operational Execution Steps</div>
              <div className="relative border-l border-surface-border/80 ml-3.5 pl-6 space-y-5 py-1">
                {currentWf.steps.map((step, idx) => {
                  // Determine step state based on evidence strength
                  let stepStatus: "Confirmed" | "Inferred" | "Needs Confirmation" = "Inferred";
                  let badgeColor = "bg-intelligence-blue/10 text-intelligence-blue border-intelligence-blue/20";
                  
                  if (currentWf.evidenceStrength === "strong") {
                    stepStatus = "Confirmed";
                    badgeColor = "bg-success-emerald/10 text-success-emerald border-success-emerald/20";
                  } else if (currentWf.evidenceStrength === "weak") {
                    stepStatus = "Needs Confirmation";
                    badgeColor = "bg-warning-amber/10 text-warning-amber border-warning-amber/20";
                  } else {
                    stepStatus = "Inferred";
                    badgeColor = "bg-intelligence-blue/10 text-intelligence-blue border-intelligence-blue/20";
                  }

                  // Safe phrasing for inferred workflows (OAuth, database integrations, etc.)
                  let displayStep = step;
                  if (stepStatus !== "Confirmed") {
                    if (displayStep.toLowerCase().includes("delegates") || displayStep.toLowerCase().includes("authorizes")) {
                      displayStep = "Platform is inferred to request cloud authorization or secure integration capabilities.";
                    } else if (displayStep.toLowerCase().includes("establishes secure database") || displayStep.toLowerCase().includes("initiates secure")) {
                      displayStep = "Platform is inferred to initiate a secure database/bucket API connection utilizing customer-configured credentials.";
                    } else if (displayStep.toLowerCase().includes("credentials are encrypted") || displayStep.toLowerCase().includes("tokens securely saved")) {
                      displayStep = "Credentials/tokens are inferred to be secured via standard envelope encryption models.";
                    } else if (displayStep.toLowerCase().includes("llm subprocessor") || displayStep.toLowerCase().includes("third-party llm")) {
                      displayStep = "Data is inferred to be processed by third-party model inference engines under compliance safeguards.";
                    }
                  }

                  return (
                    <div key={idx} className="relative group/step">
                      {/* Timeline Node */}
                      <div className="absolute -left-[31px] top-0.5 h-4 w-4 rounded-full border-2 border-surface-border bg-surface-base flex items-center justify-center group-hover/step:border-intelligence-blue transition-colors duration-200">
                        <div className="h-1.5 w-1.5 rounded-full bg-text-secondary/40 group-hover/step:bg-intelligence-blue transition-colors duration-200" />
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-black text-text-secondary/40 uppercase tracking-wider">Step {idx + 1}</span>
                          <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wide scale-95 origin-left", badgeColor)}>
                            {stepStatus}
                          </span>
                        </div>
                        <p className="text-xs font-semibold text-text-primary leading-relaxed">
                          {displayStep}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <hr className="border-surface-border/40" />

            {/* Data & Access Model */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-xl bg-surface-subtle/30 border border-surface-border/40 space-y-1.5">
                <div className="text-[9px] font-black text-text-secondary/60 uppercase tracking-widest flex items-center gap-1.5">
                  <DatabaseIcon className="h-3 w-3 text-intelligence-blue" />
                  Data Interaction
                </div>
                <p className="text-xs text-text-secondary font-medium leading-relaxed">
                  {currentWf.dataInteraction}
                </p>
              </div>

              <div className="p-4 rounded-xl bg-surface-subtle/30 border border-surface-border/40 space-y-1.5">
                <div className="text-[9px] font-black text-text-secondary/60 uppercase tracking-widest flex items-center gap-1.5">
                  <LockIcon className="h-3 w-3 text-intelligence-blue" />
                  Access Model
                </div>
                <p className="text-xs text-text-secondary font-medium leading-relaxed">
                  {currentWf.accessModel}
                </p>
              </div>

              <div className="p-4 rounded-xl bg-surface-subtle/30 border border-surface-border/40 space-y-1.5">
                <div className="text-[9px] font-black text-text-secondary/60 uppercase tracking-widest flex items-center gap-1.5">
                  <ShieldCheckIcon className="h-3 w-3 text-intelligence-blue" />
                  Persistence Behavior
                </div>
                <p className="text-xs text-text-secondary font-medium leading-relaxed">
                  {currentWf.persistenceBehavior}
                </p>
              </div>
            </div>

            {/* Procurement Implications & Concerns */}
            <div className="p-4 rounded-xl bg-error-red/5 border border-error-red/10 space-y-3">
              <div className="text-[10px] font-black text-error-red/80 uppercase tracking-widest">
                Procurement Implications & Concerns
              </div>
              <ul className="space-y-1 text-xs text-text-secondary font-medium">
                {currentWf.procurementConcerns.map((concern, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-error-red/60 mt-1.5 shrink-0" />
                    <span>{concern}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Related Risks & Evidence Requirements */}
            <div className="flex flex-col sm:flex-row justify-between gap-4 pt-2 text-xs">
              <div className="space-y-2">
                <div className="text-[9px] font-black text-text-secondary/50 uppercase tracking-widest">Related Risks</div>
                <div className="flex flex-wrap gap-2">
                  {currentWf.relatedRisks.map((risk, index) => (
                    <AppBadge key={index} variant="outline" className="text-[9px] font-bold uppercase tracking-wider py-0.5 px-2 bg-surface-subtle border-surface-border/50 text-text-secondary">
                      {risk}
                    </AppBadge>
                  ))}
                </div>
              </div>

              <div className="space-y-2 sm:text-right">
                <div className="text-[9px] font-black text-text-secondary/50 uppercase tracking-widest">Related Evidence Requirements</div>
                <div className="flex flex-wrap sm:justify-end gap-2">
                  {currentWf.relatedEvidenceNeeds.map((need, index) => (
                    <AppBadge key={index} variant="warning" className="text-[9px] font-bold uppercase tracking-wider py-0.5 px-2 bg-warning-amber/10 border-warning-amber/20 text-warning-amber">
                      {need}
                    </AppBadge>
                  ))}
                </div>
              </div>
            </div>

          </div>
        </AppCard>
      </div>
    </div>
  );
}
