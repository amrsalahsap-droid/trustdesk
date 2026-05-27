"use client";

import React, { useState } from "react";
import { ShieldIcon, LinkIcon, FileTextIcon, AlertCircleIcon, ArrowRightIcon } from "@/components/icons";
import { AppCard, AppTypography, AppIcon, AppBadge } from "@/components/ui/app-design-system/primitives";
import { cn } from "@/lib/utils";
import { SecurityRiskAreaView } from "@/modules/workspaces/onboarding/vendor-intelligence-types";
import { RiskDetailsDrawer } from "./risk-details-drawer";

interface ReadinessRiskAreasProps {
  riskAreas: SecurityRiskAreaView[];
  onInspect?: () => void;
  onInspectRisk?: (riskKey: string) => void;
}

export function ReadinessRiskAreas({ riskAreas, onInspect, onInspectRisk }: ReadinessRiskAreasProps) {
  const [selectedRisk, setSelectedRisk] = useState<SecurityRiskAreaView | null>(null);
  const risks = riskAreas || [];

  if (risks.length === 0) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <AppTypography.SectionTitle className="!text-xl font-black">Security Risk Analysis</AppTypography.SectionTitle>
          <AppTypography.Metadata className="opacity-50">Strategic trust gaps identified across enterprise-standard verification domains.</AppTypography.Metadata>
        </div>
        <AppBadge variant="outline" className="h-7 px-3 border-surface-border/50 bg-surface-base text-[10px] font-black uppercase tracking-wider">
          {risks.length} Area{risks.length !== 1 ? 's' : ''} Identified
        </AppBadge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {risks.map((risk, index) => (
          <RiskCard
            key={index}
            risk={risk}
            onInspect={() => setSelectedRisk(risk)}
          />
        ))}
      </div>
      
      <RiskDetailsDrawer 
        isOpen={!!selectedRisk} 
        onClose={() => setSelectedRisk(null)} 
        risk={selectedRisk} 
      />
    </div>
  );
}

function RiskCard({ risk, onInspect }: { risk: SecurityRiskAreaView; onInspect: () => void }) {
  const [showBlastRadius, setShowBlastRadius] = React.useState(false);
  const generatedTopicCount = risk.topicCount;
  const severityUpper = risk.severity ? risk.severity.toUpperCase() : "MEDIUM";
  const evidenceCount = risk.evidenceRefs?.length || 0;

  return (
    <AppCard className="group relative flex flex-col h-full border-surface-border/50 hover:border-intelligence-blue/30 transition-all duration-300">
      <div className="p-6 space-y-5 flex-1">
        <div className="flex items-start justify-between">
          <div className="h-12 w-12 rounded-2xl bg-error-red/5 text-error-red flex items-center justify-center border border-error-red/10 group-hover:scale-110 transition-transform">
            <ShieldIcon className="h-6 w-6" />
          </div>
          <div className="flex flex-col items-end gap-1.5">
             <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-surface-base border border-surface-border/50">
               <FileTextIcon className="h-3 w-3 text-intelligence-blue" />
               <span className="text-[10px] font-black text-text-primary uppercase tracking-tight">{generatedTopicCount} Topics</span>
             </div>
             <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-surface-base border border-surface-border/50">
               <LinkIcon className="h-3 w-3 text-trust-green" />
               <span className="text-[10px] font-black text-text-primary uppercase tracking-tight">{evidenceCount} Evidence</span>
             </div>
          </div>
        </div>

        <div className="space-y-3">
          {(() => {
            const getBuyerFriendlyLabel = (key: string, label: string) => {
              const k = (key || "").toLowerCase();
              const l = (label || "").toLowerCase();
              
              if (k.includes("ai_training") || l.includes("ai training")) {
                return "AI Data Usage Review";
              }
              if (k.includes("tenant_escape") || l.includes("tenant escape") || k.includes("tenant_isolation")) {
                return "Tenant Isolation Review";
              }
              if (k.includes("identity_impersonation") || k.includes("support_visibility") || l.includes("identity impersonation") || l.includes("support impersonation")) {
                return "Support/Admin Access Review";
              }
              if (k.includes("supply_chain") || l.includes("supply chain")) {
                return "Third-Party Dependency Review";
              }
              
              return label;
            };

            const displayLabel = getBuyerFriendlyLabel(risk.key, risk.label);

            return (
              <>
                <AppTypography.SubSection className="!text-base font-black leading-tight min-h-[2.5rem] line-clamp-2">
                  {displayLabel}
                </AppTypography.SubSection>
                {displayLabel !== risk.label && (
                  <div className="text-[10px] font-bold text-text-secondary/60 uppercase tracking-wider -mt-2.5 mb-1.5">
                    Technical Risk: {risk.label}
                  </div>
                )}
              </>
            );
          })()}
          <AppTypography.BodySm className="opacity-70 leading-relaxed">
            {risk.reason}
          </AppTypography.BodySm>
        </div>

        {/* Semantic Badges */}
        <div className="flex flex-wrap gap-2 pt-1 border-t border-surface-border/20">
          {/* Impact Badge */}
          <AppBadge 
            variant="outline" 
            className={cn(
              "h-6 px-2 text-[9px] font-black uppercase tracking-wider rounded-md border shrink-0",
              severityUpper === "CRITICAL" && "bg-error-red/10 border-error-red/20 text-error-red",
              severityUpper === "HIGH" && "bg-warning-amber/10 border-warning-amber/20 text-warning-amber",
              severityUpper === "MEDIUM" && "bg-amber-500/10 border-amber-500/20 text-amber-600",
              severityUpper === "LOW" && "bg-surface-muted border-surface-border text-text-secondary"
            )}
          >
            Impact: {severityUpper}
          </AppBadge>

          {/* Certainty Badge */}
          <AppBadge 
            variant="outline" 
            className={cn(
              "h-6 px-2 text-[9px] font-black uppercase tracking-wider rounded-md border shrink-0",
              risk.status === "auto_ready" && "bg-trust-green/10 border-trust-green/20 text-trust-green",
              risk.status === "review_suggested" && "bg-intelligence-blue/10 border-intelligence-blue/20 text-intelligence-blue",
              (risk.status === "needs_evidence" || !risk.status) && "bg-purple-500/10 border-purple-500/20 text-purple-600"
            )}
          >
            Certainty: {risk.status === "auto_ready" ? "Observed" : risk.status === "review_suggested" ? "Likely" : "Speculative"}
          </AppBadge>

          {/* Evidence Strength Badge */}
          <AppBadge 
            variant="outline" 
            className={cn(
              "h-6 px-2 text-[9px] font-black uppercase tracking-wider rounded-md border shrink-0",
              (risk.evidenceStrength === "strong" || risk.evidenceStrength === "authoritative") && "bg-trust-green/10 border-trust-green/20 text-trust-green",
              risk.evidenceStrength === "medium" && "bg-warning-amber/10 border-warning-amber/20 text-warning-amber",
              (risk.evidenceStrength === "weak" || !risk.evidenceStrength) && "bg-error-red/5 border-error-red/10 text-error-red"
            )}
          >
            Evidence: {risk.evidenceStrength ? risk.evidenceStrength.toUpperCase() : "WEAK"}
          </AppBadge>

          {/* Action Badge */}
          {risk.status !== "auto_ready" && (
            <AppBadge 
              variant="outline" 
              className={cn(
                "h-6 px-2 text-[9px] font-black uppercase tracking-wider rounded-md border shrink-0",
                (risk.status === "needs_evidence" || !risk.status) && "bg-error-red/10 border-error-red/20 text-error-red animate-pulse",
                risk.status === "review_suggested" && "bg-warning-amber/10 border-warning-amber/20 text-warning-amber"
              )}
            >
              Action: {risk.status === "review_suggested" ? "Review Suggested" : "Needs Evidence"}
            </AppBadge>
          )}
        </div>

        {/* Toggle Button for Blast Radius */}
        <button
          type="button"
          onClick={() => setShowBlastRadius(!showBlastRadius)}
          className="w-full flex items-center justify-between py-2 px-3 rounded-lg bg-surface-muted/50 border border-surface-border/30 text-[10px] font-black uppercase tracking-wider text-intelligence-blue hover:bg-intelligence-blue/[0.03] transition-colors cursor-pointer"
        >
          <span className="flex items-center gap-1.5">
            <ShieldIcon className="h-3.5 w-3.5" />
            {showBlastRadius ? "Hide Blast Radius" : "View Blast Radius Analysis"}
          </span>
          <span className="text-[8px]">{showBlastRadius ? "▲" : "▼"}</span>
        </button>

        {showBlastRadius && risk.blastRadius && (
          <div className="pt-4 mt-2 space-y-4 border-t border-surface-border/30 animate-fadeIn">
            {/* Customer Impact Alert */}
            <div className="p-3 rounded-xl bg-error-red/[0.02] border border-error-red/10 space-y-1.5">
              <div className="flex items-center gap-2">
                <AlertCircleIcon className="h-4 w-4 text-error-red shrink-0" />
                <span className="text-[10px] font-black uppercase tracking-widest text-error-red">
                  Procurement Security Assessment
                </span>
              </div>
              <p className="text-[11px] font-medium leading-relaxed text-text-primary">
                {risk.blastRadius.customerImpactSummary}
              </p>
            </div>

            {/* Detailed Exposure Vectors */}
            <div className="space-y-3 pt-2">
              <div className="text-[9px] font-black uppercase tracking-wider text-intelligence-blue mb-1 flex items-center justify-between">
                <span>Blast Radius Scope</span>
              </div>
              
              <div className="grid gap-3">
                <ImpactVector 
                  label="Customer Data Exposure" 
                  value={risk.blastRadius.customerDataExposure || "Not specified"} 
                  labelType="inferred" 
                />
                <ImpactVector 
                  label="Infrastructure Reach" 
                  value={risk.blastRadius.infrastructureReach} 
                  labelType="observed" 
                />
                <ImpactVector 
                  label="Persistence Exposure" 
                  value={risk.blastRadius.persistenceExposure || risk.blastRadius.persistenceImpact} 
                  labelType="observed" 
                />
                <ImpactVector 
                  label="Identity/Support Exposure" 
                  value={risk.blastRadius.identitySupportExposure || risk.blastRadius.tenantImpact} 
                  labelType="needs_confirmation" 
                />
                {risk.blastRadius.possibleCompromiseScenario && (
                  <ImpactVector 
                    label="Possible Compromise Scenario" 
                    value={risk.blastRadius.possibleCompromiseScenario} 
                    labelType="inferred" 
                    isScenario
                  />
                )}
              </div>
            </div>

            {/* Assumptions & Mitigation */}
            {(risk.blastRadius.assumptions?.length > 0 || risk.blastRadius.missingEvidence?.length > 0) && (
              <div className="space-y-3 pt-4 border-t border-surface-border/20">
                <div className="text-[9px] font-black uppercase tracking-wider text-text-muted mb-1">
                  Analysis Context
                </div>
                
                {risk.blastRadius.assumptions && risk.blastRadius.assumptions.length > 0 && (
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-text-primary">Key Assumptions:</span>
                    <ul className="list-disc pl-4 space-y-1">
                      {risk.blastRadius.assumptions.map((item: string, i: number) => (
                        <li key={i} className="text-[11px] text-text-secondary">{item}</li>
                      ))}
                    </ul>
                  </div>
                )}
                
                {risk.blastRadius.missingEvidence && risk.blastRadius.missingEvidence.length > 0 && (
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-error-red">Missing Evidence:</span>
                    <ul className="list-disc pl-4 space-y-1">
                      {risk.blastRadius.missingEvidence.map((item: string, i: number) => (
                        <li key={i} className="text-[11px] text-text-secondary">{item}</li>
                      ))}
                    </ul>
                  </div>
                )}
                
                {risk.blastRadius.mitigationEvidence && risk.blastRadius.mitigationEvidence.length > 0 && (
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-trust-green">Mitigation Evidence:</span>
                    <ul className="list-disc pl-4 space-y-1">
                      {risk.blastRadius.mitigationEvidence.map((item: string, i: number) => (
                        <li key={i} className="text-[11px] text-text-secondary">{item}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="px-6 py-4 border-t border-surface-border/30 bg-surface-base/50 flex items-center justify-between group-hover:bg-intelligence-blue/[0.02] transition-colors">
        <div className="flex items-center gap-2">
           <div className={cn(
             "h-1.5 w-1.5 rounded-full shrink-0",
             severityUpper === "CRITICAL" && "bg-error-red",
             severityUpper === "HIGH" && "bg-warning-amber",
             severityUpper === "MEDIUM" && "bg-amber-500",
             severityUpper === "LOW" && "bg-text-muted"
           )} />
           <span className="text-[10px] font-black uppercase tracking-widest text-text-muted">{severityUpper} Risk Area</span>
        </div>
        <button 
          onClick={onInspect}
          className="text-[10px] font-black uppercase tracking-widest text-intelligence-blue flex items-center gap-1.5 hover:gap-2 transition-all cursor-pointer"
        >
          Review Details
          <ArrowRightIcon className="h-3 w-3" />
        </button>
      </div>
    </AppCard>
  );
}

function ImpactVector({ label, value, labelType, isScenario }: { label: string; value: string; labelType?: "observed" | "inferred" | "needs_confirmation"; isScenario?: boolean }) {
  const getBadgeProps = () => {
    switch (labelType) {
      case "observed": return { text: "Observed", className: "bg-trust-green/10 text-trust-green border-trust-green/20" };
      case "inferred": return { text: "Inferred", className: "bg-intelligence-blue/10 text-intelligence-blue border-intelligence-blue/20" };
      case "needs_confirmation": return { text: "Needs Confirmation", className: "bg-warning-amber/10 text-warning-amber border-warning-amber/20 animate-pulse" };
      default: return null;
    }
  };

  const badge = getBadgeProps();

  return (
    <div className={cn("p-2.5 rounded-lg border", isScenario ? "bg-error-red/[0.02] border-error-red/10" : "bg-surface-muted/30 border-surface-border/20")}>
      <div className="flex items-center justify-between mb-1.5">
        <span className={cn("text-[10px] font-black uppercase tracking-wide", isScenario ? "text-error-red" : "text-text-muted")}>
          {label}
        </span>
        {badge && (
          <span className={cn("px-1.5 py-0.5 rounded border text-[8px] font-black uppercase tracking-wider", badge.className)}>
            {badge.text}
          </span>
        )}
      </div>
      <p className="text-[11px] font-medium text-text-primary leading-relaxed">
        {value}
      </p>
    </div>
  );
}
