"use client";

import React from "react";
import { SlideOver } from "@/components/ui/slide-over";
import { AppTypography, AppBadge, AppCard } from "@/components/ui/app-design-system/primitives";
import { ShieldIcon, LinkIcon, AlertCircleIcon, FileTextIcon, ActivityIcon, ZapIcon } from "@/components/icons";
import { SecurityRiskAreaView } from "@/modules/workspaces/onboarding/vendor-intelligence-types";
import { cn } from "@/lib/utils";

interface RiskDetailsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  risk: SecurityRiskAreaView | null;
}

export function RiskDetailsDrawer({ isOpen, onClose, risk }: RiskDetailsDrawerProps) {
  if (!risk) return null;

  const severityUpper = risk.severity ? risk.severity.toUpperCase() : "MEDIUM";
  
  // Helper to map technical risk key to buyer-friendly label
  const getBuyerFriendlyLabel = (key: string, label: string) => {
    const k = (key || "").toLowerCase();
    const l = (label || "").toLowerCase();
    
    if (k.includes("ai_training") || l.includes("ai training")) return "AI Data Usage Review";
    if (k.includes("tenant_escape") || l.includes("tenant escape") || k.includes("tenant_isolation")) return "Tenant Isolation Review";
    if (k.includes("identity_impersonation") || k.includes("support_visibility") || l.includes("identity impersonation") || l.includes("support impersonation")) return "Support/Admin Access Review";
    if (k.includes("supply_chain") || l.includes("supply chain")) return "Third-Party Dependency Review";
    
    return label;
  };

  const displayLabel = getBuyerFriendlyLabel(risk.key, risk.label);

  return (
    <SlideOver
      isOpen={isOpen}
      onClose={onClose}
      title="Security Risk Review"
      width="md"
    >
      <div className="space-y-8">
        {/* Header Section */}
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className={cn(
              "h-12 w-12 rounded-xl flex items-center justify-center shrink-0",
              severityUpper === "CRITICAL" && "bg-error-red/10 text-error-red",
              severityUpper === "HIGH" && "bg-warning-amber/10 text-warning-amber",
              severityUpper === "MEDIUM" && "bg-amber-500/10 text-amber-600",
              severityUpper === "LOW" && "bg-surface-muted text-text-secondary"
            )}>
              <ShieldIcon className="h-6 w-6" />
            </div>
            <div>
              <AppTypography.SectionTitle className="!text-xl font-black leading-tight">
                {displayLabel}
              </AppTypography.SectionTitle>
              <div className="text-[11px] font-bold text-text-secondary/60 uppercase tracking-wider mt-1">
                Internal Risk Key: {risk.key}
              </div>
            </div>
          </div>
          
          <AppTypography.Body className="text-text-primary">
            {risk.reason}
          </AppTypography.Body>
        </div>

        {/* Status Badges */}
        <div className="grid grid-cols-3 gap-3">
          <StatusMetric 
            label="Impact" 
            value={severityUpper}
            colorClass={
              severityUpper === "CRITICAL" ? "text-error-red" :
              severityUpper === "HIGH" ? "text-warning-amber" :
              severityUpper === "MEDIUM" ? "text-amber-500" : "text-text-secondary"
            }
          />
          <StatusMetric 
            label="Certainty" 
            value={risk.status === "auto_ready" ? "Observed" : risk.status === "review_suggested" ? "Likely" : "Speculative"}
            colorClass={
              risk.status === "auto_ready" ? "text-trust-green" : 
              risk.status === "review_suggested" ? "text-intelligence-blue" : "text-purple-500"
            }
          />
          <StatusMetric 
            label="Evidence Strength" 
            value={risk.evidenceStrength ? risk.evidenceStrength.toUpperCase() : "WEAK"}
            colorClass={
              (risk.evidenceStrength === "strong" || risk.evidenceStrength === "authoritative") ? "text-trust-green" :
              risk.evidenceStrength === "medium" ? "text-warning-amber" : "text-error-red"
            }
          />
        </div>

        {/* Recommended Action */}
        <div className="p-4 rounded-xl border border-intelligence-blue/20 bg-intelligence-blue/[0.02] space-y-2">
          <div className="flex items-center gap-2 text-intelligence-blue">
            <AlertCircleIcon className="h-4 w-4" />
            <span className="text-[10px] font-black uppercase tracking-widest">Recommended Action</span>
          </div>
          <p className="text-sm font-medium text-text-primary leading-relaxed">
            {risk.recommendedNextAction || "Review available evidence and confirm risk applicability"}
          </p>
        </div>

        {/* Mapping & Triggers */}
        <div className="space-y-4">
          <AppTypography.SubSection>Intelligence Mapping</AppTypography.SubSection>
          
          <div className="grid gap-3">
            <MappingRow 
              icon={ActivityIcon} 
              label="Triggering Capabilities" 
              items={risk.triggeringCapabilities} 
              emptyText="No specific capabilities linked"
            />
            <MappingRow 
              icon={ZapIcon} 
              label="Triggering Workflows" 
              items={risk.triggeringWorkflows} 
              emptyText="No specific workflows linked"
            />
            <MappingRow 
              icon={ShieldIcon} 
              label="Related Pillars" 
              items={risk.relatedPillars} 
              emptyText="No related pillars"
            />
            <MappingRow 
              icon={FileTextIcon} 
              label="Related Trust Topics" 
              items={risk.recommendedTopicKeys} 
              emptyText="No related topics"
            />
            <MappingRow 
              icon={AlertCircleIcon} 
              label="Evidence Needs" 
              items={risk.recommendedEvidenceNeeds} 
              emptyText="No missing evidence"
            />
            <MappingRow 
              icon={CheckIcon} 
              label="Governance Tasks" 
              items={risk.relatedGovernanceTasks} 
              emptyText="No related tasks"
            />
          </div>
        </div>

        {/* Evidence Snippets */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <AppTypography.SubSection>Supporting Evidence</AppTypography.SubSection>
            <AppBadge variant="outline" className="text-[9px] uppercase tracking-wider font-black">
              {risk.evidenceRefs?.length || 0} Snippets
            </AppBadge>
          </div>
          
          <div className="space-y-3">
            {risk.evidenceRefs && risk.evidenceRefs.length > 0 ? (
              risk.evidenceRefs.map((ref, idx) => (
                <AppCard key={idx} className="p-4 space-y-3 border-surface-border/50">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-2 text-[11px] font-bold text-intelligence-blue max-w-full overflow-hidden">
                      <LinkIcon className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{ref.title || "Source Document"}</span>
                    </div>
                    {ref.confidence !== undefined && (
                      <span className="text-[10px] font-black text-text-muted shrink-0">
                        {Math.round(ref.confidence * 100)}% Match
                      </span>
                    )}
                  </div>
                  {ref.snippet && (
                    <div className="text-xs text-text-secondary leading-relaxed pl-5 border-l-2 border-surface-border/50 italic">
                      "{ref.snippet}"
                    </div>
                  )}
                  {ref.url && (
                    <a 
                      href={ref.url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-[10px] text-text-muted hover:text-intelligence-blue hover:underline truncate block pl-5"
                    >
                      {ref.url}
                    </a>
                  )}
                </AppCard>
              ))
            ) : (
              <div className="p-6 text-center rounded-xl border border-dashed border-surface-border/50 text-text-muted text-sm font-medium">
                No direct evidence snippets extracted for this risk.
              </div>
            )}
          </div>
        </div>
      </div>
    </SlideOver>
  );
}

// --- Helpers ---

function StatusMetric({ label, value, colorClass }: { label: string; value: string; colorClass: string }) {
  return (
    <div className="p-3 rounded-xl bg-surface-muted/30 border border-surface-border/30 space-y-1">
      <div className="text-[9px] font-black uppercase tracking-wider text-text-muted">
        {label}
      </div>
      <div className={cn("text-xs font-bold uppercase tracking-wide", colorClass)}>
        {value}
      </div>
    </div>
  );
}

function MappingRow({ icon: Icon, label, items, emptyText }: { icon: any; label: string; items?: string[]; emptyText: string }) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-lg border border-surface-border/30 bg-surface-base">
      <div className="mt-0.5 text-text-muted">
        <Icon className="h-4 w-4" />
      </div>
      <div className="space-y-1.5 flex-1">
        <div className="text-[10px] font-black uppercase tracking-wider text-text-secondary">
          {label}
        </div>
        {items && items.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {items.map((item, i) => (
              <span key={i} className="inline-block px-2 py-0.5 rounded text-[10px] font-medium bg-surface-muted text-text-primary border border-surface-border/50">
                {item}
              </span>
            ))}
          </div>
        ) : (
          <div className="text-xs italic text-text-muted">
            {emptyText}
          </div>
        )}
      </div>
    </div>
  );
}

function CheckIcon(props: any) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinelinejoin="round" {...props}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}