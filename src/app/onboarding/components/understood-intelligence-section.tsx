"use client";

import React, { useMemo } from "react";
import { 
  BuildingIcon, 
  ShieldCheckIcon, 
  LayoutIcon,
  LinkIcon,
  CloudIcon,
  ActivityIcon,
  ShieldIcon,
  AlertCircleIcon,
  PackageIcon,
  CheckIcon
} from "@/components/icons";
import { cn } from "@/lib/utils";
import { 
  type Capability, 
  type ProcurementRiskArea, 
  type DataInteractionModel,
  type Signal
} from "@/modules/workspaces/onboarding/website-analysis-service";
import { AppCard, AppTypography, AppIcon, AppSection, AppMetaLabel } from "@/components/ui/app-design-system/primitives";

interface UnderstoodIntelligenceSectionProps {
  signals: {
    businessDomain?: Signal<string>;
    productLines?: Signal<string[]>;
    solutionCategories?: Signal<string[]>;
    structuredCapabilities?: Signal<Capability[]>;
    deploymentComponents?: Signal<string[]>;
    dataInteractionModel?: Signal<DataInteractionModel>;
    procurementRiskAreas?: Signal<ProcurementRiskArea[]>;
  };
  onEdit: (field: string) => void;
}

export function UnderstoodIntelligenceSection({ signals, onEdit }: UnderstoodIntelligenceSectionProps) {
  const hasIntelligence = !!(
    signals.businessDomain?.value || 
    (signals.structuredCapabilities?.value?.length ?? 0) > 0 ||
    (signals.procurementRiskAreas?.value?.length ?? 0) > 0
  );

  if (!hasIntelligence) return null;

  return (
    <div className="layout-section-gap-xl animate-in fade-in slide-in-from-bottom-4 duration-1000 delay-150">
      
      {/* 1. Prepared Questionnaire Areas (Risk Areas) */}
      {signals.procurementRiskAreas?.value && signals.procurementRiskAreas.value.length > 0 && (
        <AppSection 
          title="Procurement Risk Areas"
          description="Based on your technical posture, security reviewers will likely prioritize these control domains during your next assessment."
          icon={ShieldIcon}
        >
           <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {signals.procurementRiskAreas.value.map(risk => {
              const status = risk.status || "needs_evidence";
              const evidenceStrength = risk.evidenceStrength || "weak";
              const confidencePercentage = Math.round(risk.confidence * 100);

              return (
                <AppCard key={risk.key} variant="section" hover className="!p-8 flex flex-col layout-stack-gap-sm relative overflow-hidden group/risk border border-border-soft hover:border-intelligence-blue/20 transition-all duration-300">
                   <div className="flex items-center justify-between">
                      <AppTypography.SubSection className="!text-lg font-black tracking-tight group-hover/risk:text-intelligence-blue transition-colors uppercase">
                        {risk.key.replace(/_/g, ' ')}
                      </AppTypography.SubSection>
                      <div className={cn(
                        "h-2.5 w-2.5 rounded-full shadow-[0_0_12px_rgba(37,99,235,0.4)]",
                        status === "auto_ready" ? "bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.4)]" :
                        status === "review_suggested" ? "bg-blue-500 shadow-[0_0_12px_rgba(59,130,246,0.4)]" :
                        "bg-amber-500 shadow-[0_0_12px_rgba(245,158,11,0.4)]"
                      )} />
                   </div>
                   
                   <div className="flex flex-wrap gap-2 pt-1 pb-2">
                      {/* Severity Badge */}
                      <span className={cn(
                        "px-2.5 py-1 rounded text-[10px] font-black uppercase tracking-wider border shrink-0",
                        risk.severity === "CRITICAL" && "bg-rose-500/10 text-rose-600 border-rose-500/20",
                        risk.severity === "HIGH" && "bg-orange-500/10 text-orange-600 border-orange-500/20",
                        risk.severity === "MEDIUM" && "bg-amber-500/10 text-amber-600 border-amber-500/20",
                        risk.severity === "LOW" && "bg-slate-500/10 text-slate-600 border-slate-500/20"
                      )}>
                        Potential Impact: {risk.severity}
                      </span>
 
                      {/* Certainty Badge */}
                      <span className={cn(
                        "px-2.5 py-1 rounded text-[10px] font-black uppercase tracking-wider border shrink-0",
                        status === "auto_ready" && "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
                        status === "review_suggested" && "bg-blue-500/10 text-blue-600 border-blue-500/20",
                        status === "needs_evidence" && "bg-amber-500/10 text-amber-600 border-amber-500/20"
                      )}>
                        {status === "auto_ready" ? "Evidence Signal Found" :
                         status === "review_suggested" ? "Likely / Review Needed" :
                         "Needs Evidence"}
                      </span>
                   </div>

                   {/* Rationale (Why it was detected) */}
                   <div className="space-y-1">
                     <AppTypography.Metadata className="text-text-muted uppercase font-bold tracking-wider !text-[9px]">Detection Rationale</AppTypography.Metadata>
                     <AppTypography.BodySm className="text-text-secondary leading-relaxed font-medium">
                       {risk.reason}
                     </AppTypography.BodySm>
                   </div>

                   {/* Metrics: Confidence & Evidence Strength */}
                   <div className="grid grid-cols-2 gap-4 py-3 border-y border-border-soft/40 my-1">
                     <div className="space-y-0.5">
                       <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Confidence Score</span>
                       <div className="text-sm font-black text-text-primary">{confidencePercentage}%</div>
                     </div>
                     <div className="space-y-0.5">
                       <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Evidence Quality</span>
                       <div className="text-sm font-black text-text-primary capitalize">{evidenceStrength}</div>
                     </div>
                   </div>

                   {/* Supporting Signals */}
                   {risk.triggeringSignals && risk.triggeringSignals.length > 0 && (
                     <div className="space-y-1.5 pt-1">
                        <AppTypography.Metadata className="text-text-muted uppercase font-bold tracking-wider !text-[9px]">Supporting Capabilities</AppTypography.Metadata>
                         <div className="flex flex-wrap gap-1.5">
                          {risk.triggeringSignals.map(cap => (
                             <span key={cap} className="px-2 py-0.5 bg-border-soft/30 hover:bg-border-soft/60 transition-colors rounded text-[10px] font-semibold text-text-secondary">
                               {cap.replace(/_/g, ' ')}
                             </span>
                          ))}
                         </div>
                     </div>
                   )}

                   {/* Missing Evidence */}
                   {risk.recommendedEvidenceNeeds && risk.recommendedEvidenceNeeds.length > 0 && (
                     <div className="space-y-2 pt-3 border-t border-border-soft/20 mt-2 bg-amber-500/5 -mx-8 px-8 py-4 border-b -mb-8">
                        <AppTypography.Metadata className="text-warning-amber uppercase font-bold tracking-wider !text-[9px]">Required Verification Documents</AppTypography.Metadata>
                        <div className="space-y-1.5">
                          {risk.recommendedEvidenceNeeds.map(need => (
                            <div key={need} className="flex items-start gap-2 text-[11px] text-text-secondary font-medium">
                              <div className="h-1 w-1 rounded-full bg-warning-amber/70 mt-1.5 shrink-0" />
                              <span>{need}</span>
                            </div>
                          ))}
                        </div>
                     </div>
                   )}
                </AppCard>
              );
            })}
          </div>
        </AppSection>
      )}

      {/* 2. Product & Capability Understanding */}
      {/* 2. Product & Capability Understanding */}
      <AppSection
        title="Capability Intelligence"
        description="A semantic extraction of your product's security-relevant features and deployment architecture."
        icon={PackageIcon}
      >
        <div className="grid grid-cols-1 min-[800px]:grid-cols-2 min-[1100px]:grid-cols-4 gap-6">
           
            <IntelligenceCard icon={BuildingIcon}
             label="Business Domain"
             value={signals.businessDomain?.value}
             signal={signals.businessDomain}
             onEdit={() => onEdit("businessDomain")}
             variant="premium"
           />
           
            <IntelligenceCard icon={PackageIcon}
             label="Product Lines"
             values={signals.productLines?.value}
             signal={signals.productLines}
             onEdit={() => onEdit("productLines")}
             variant="premium"
           />
           
            <IntelligenceCard icon={LayoutIcon}
             label="Market Category"
             values={signals.solutionCategories?.value}
             signal={signals.solutionCategories}
             onEdit={() => onEdit("solutionCategories")}
             variant="premium"
           />
           
            <IntelligenceCard icon={CloudIcon}
             label="Primary Deployment"
             values={signals.deploymentComponents?.value}
             signal={signals.deploymentComponents}
             onEdit={() => onEdit("deploymentComponents")}
             variant="premium"
           />
         </div>

        {signals.structuredCapabilities?.value && signals.structuredCapabilities.value.length > 0 && (() => {
          const strongCaps = signals.structuredCapabilities.value.filter(c => c.confidenceLabel === "Strong");
          const mediumCaps = signals.structuredCapabilities.value.filter(c => c.confidenceLabel === "Medium");
          const reviewCaps = signals.structuredCapabilities.value.filter(c => c.confidenceLabel === "Weak" || c.confidenceLabel === "Speculative");

          return (
            <div className="space-y-12 pt-10 border-t border-border-soft/50">
              <div className="flex items-center justify-between">
                <AppTypography.Metadata className="text-text-muted font-bold tracking-widest !text-[10px] uppercase">
                  Extracted Security Capabilities
                </AppTypography.Metadata>
                <ReviewMarker confidence={signals.structuredCapabilities.confidence} />
              </div>

              <div className="space-y-8">
                {/* 1. Strong Evidence Group */}
                {strongCaps.length > 0 && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 shadow-[0_0_8px_rgba(16,185,129,0.1)]">
                        Strong Evidence ({strongCaps.length})
                      </span>
                      <div className="h-px bg-emerald-500/10 flex-1" />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {strongCaps.map(cap => (
                        <CapabilityItem key={cap.key} cap={cap} statusColor="bg-emerald-500" badgeStyle="bg-emerald-500/10 text-emerald-600 border-emerald-500/20" />
                      ))}
                    </div>
                  </div>
                )}

                {/* 2. Detected / Medium Group */}
                {mediumCaps.length > 0 && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-blue-500/10 text-blue-600 border border-blue-500/20">
                        Detected ({mediumCaps.length})
                      </span>
                      <div className="h-px bg-blue-500/10 flex-1" />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {mediumCaps.map(cap => (
                        <CapabilityItem key={cap.key} cap={cap} statusColor="bg-blue-500" badgeStyle="bg-blue-500/10 text-blue-600 border-blue-500/20" />
                      ))}
                    </div>
                  </div>
                )}

                {/* 3. Needs Review Group */}
                {reviewCaps.length > 0 && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-amber-500/10 text-amber-600 border border-amber-500/20 shadow-[0_0_8px_rgba(245,158,11,0.05)]">
                        Needs Review ({reviewCaps.length})
                      </span>
                      <div className="h-px bg-amber-500/10 flex-1" />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {reviewCaps.map(cap => (
                        <CapabilityItem key={cap.key} cap={cap} statusColor="bg-amber-500" badgeStyle="bg-amber-500/10 text-amber-600 border-amber-500/20" />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })()}
      </AppSection>

       {/* 3. Operational Security Model */}
      {signals.dataInteractionModel?.value && (
        <AppSection
          title="Operational Model"
          description="Core behaviors identified within your technical architecture that drive data privacy and sovereignty requirements."
          icon={ActivityIcon}
        >
           <AppCard variant="section" className="!p-8 md:!p-10 lg:!p-12">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-y-10 gap-x-10 lg:gap-x-12">
               <DataPoint label="Customer Data Access" active={signals.dataInteractionModel.value.accessesCustomerData} description="Identified mechanisms for data retrieval from customer-owned environments." />
               <DataPoint label="Sensitive Processing" active={signals.dataInteractionModel.value.processesSensitiveData} description="Evidence of PII, financial, or other high-sensitivity data handling." />
               <DataPoint label="Persistent Storage" active={signals.dataInteractionModel.value.storesCustomerData} description="Indication of persistent storage of customer-originated data sets." />
               <DataPoint label="Infrastructure Scanning" active={signals.dataInteractionModel.value.scansInfrastructure} description="Capabilities for analyzing customer cloud or network assets." />
               <DataPoint label="Cloud Native Interop" active={signals.dataInteractionModel.value.integratesWithCloudProviders} description="Active connectors or native cloud provider service integrations." />
               <DataPoint label="AI & ML Pipeline" active={signals.dataInteractionModel.value.usesAIOnCustomerData} description="Utilization of LLMs or machine learning on customer-supplied data." />
            </div>
          </AppCard>
        </AppSection>
      )}
    </div>
  );
}

function DataPoint({ label, active, description }: { label: string, active: boolean, description?: string }) {
  return (
    <div className="flex items-start gap-4 group/dp min-w-0">
      <AppIcon 
        icon={CheckIcon} 
        filled 
        variant={active ? "success" : "muted"} 
        size="xs" 
        className={cn("transition-all duration-500 mt-0.5", !active && "opacity-20")}
      />
      <div className="space-y-1.5 flex-1 min-w-0">
        <AppTypography.SubSection className={cn(
          "text-sm font-black tracking-tight transition-colors line-clamp-2 leading-snug",
          active ? "text-text-primary" : "text-text-muted/50"
        )} title={label}>
          {label}
        </AppTypography.SubSection>
        {description && (
          <AppTypography.BodySm className={cn(
            "text-[11px] lg:text-xs leading-relaxed transition-colors line-clamp-2",
            active ? "text-text-secondary" : "text-text-muted/30"
          )} title={description}>
            {description}
          </AppTypography.BodySm>
        )}
      </div>
    </div>
  );
}

 function IntelligenceCard({ icon, label, value, values, signal, onEdit, variant }: { 
  icon: React.ElementType, 
  label: string, 
  value?: string, 
  values?: string[],
  signal?: Signal<any>,
  onEdit: () => void,
  variant?: "standard" | "premium"
}) {
  const isWeak = (signal?.confidence ?? 1) < 0.6;
  const isPremium = variant === "premium";

  const displayContent = useMemo(() => {
    if (values && values.length > 0) {
      const displayCount = 2;
      const visible = values.slice(0, displayCount).join(", ");
      const moreCount = values.length - displayCount;
      return moreCount > 0 ? `${visible} +${moreCount} more` : visible;
    }
    return value;
  }, [value, values]);

  if (!displayContent) return null;

  return (
    <AppCard 
      variant={isPremium ? "section" : "compact"} 
      hover 
      className={cn(
        "!p-6 relative group border-border-soft/40 transition-all duration-300",
        isPremium && "bg-white/50 hover:bg-white hover:shadow-premium-md"
      )}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
           <div className={cn(
             "h-7 w-7 rounded-lg flex items-center justify-center transition-colors",
             isPremium ? "bg-intelligence-blue/5 text-intelligence-blue" : "bg-surface-base text-text-muted"
           )}>
             <AppIcon icon={icon} size="xs" />
           </div>
           <AppTypography.Metadata className="text-text-muted !text-[10px] uppercase tracking-widest">{label}</AppTypography.Metadata>
        </div>
         <div className="flex items-center gap-3">
            {isWeak && (
              <div className="h-1.5 w-1.5 rounded-full bg-warning-amber animate-pulse" title="Review Needed" />
            )}
            <button onClick={onEdit} className="opacity-0 group-hover:opacity-100 text-[10px] font-black uppercase tracking-widest text-intelligence-blue hover:underline transition-all">Edit</button>
         </div>
      </div>
      <AppTypography.SubSection 
        className="!text-sm leading-tight line-clamp-2 break-words" 
        title={values ? values.join(", ") : value}
      >
        {displayContent}
      </AppTypography.SubSection>
            {/* Mini Citation - Row based */}
        {signal?.citations && signal.citations.length > 0 && (
          <div className="mt-3 flex items-center gap-2 opacity-40 group-hover:opacity-80 transition-opacity">
            <AppIcon icon={LinkIcon} size="xs" variant="ghost" className="text-intelligence-blue" />
            <AppTypography.Metadata className="truncate lowercase tracking-normal !text-[10px]">
               {(() => {
                 try {
                   return new URL(signal.citations[0].pageUrl).hostname;
                 } catch {
                   return signal.citations[0].pageUrl;
                 }
               })()}
            </AppTypography.Metadata>
          </div>
        )}
    </AppCard>
  );
}



function ReviewMarker({ confidence }: { confidence?: number }) {
  const conf = confidence ?? 1;
  if (conf >= 0.8) return null;
  
  return (
    <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-warning-amber/10 border border-warning-amber/20">
      <AppIcon icon={AlertCircleIcon} size="xs" variant="warning" ghost />
      <span className="text-[10px] font-black text-warning-amber uppercase tracking-tighter">Provisional — check evidence</span>
    </div>
  );
}

function CapabilityItem({ cap, statusColor, badgeStyle }: { cap: Capability; statusColor: string; badgeStyle: string }) {
  const [isOpen, setIsOpen] = React.useState(false);

  return (
    <div className="rounded-2xl border border-border-soft bg-white/50 p-6 shadow-premium-sm hover:shadow-premium-md hover:bg-white transition-all duration-300 flex flex-col justify-between">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={cn("h-2 w-2 rounded-full shrink-0", statusColor)} />
            <h4 className="text-sm font-black tracking-tight text-text-primary truncate">{cap.label}</h4>
          </div>
          <span className={cn("px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border shrink-0", badgeStyle)}>
            {cap.confidenceLabel || "Weak"}
          </span>
        </div>
        <p className="text-xs font-medium leading-relaxed text-text-secondary line-clamp-3">
          {cap.snippet || "No direct snippet citation available."}
        </p>
      </div>

      <div className="mt-4 pt-3 border-t border-border-soft/40 flex items-center justify-between text-[10px] font-bold text-text-muted">
        <div className="flex items-center gap-4">
          <div>
            Score: <span className="text-text-primary">{Math.round(cap.confidence * 100)}%</span>
          </div>
          {cap.authorityScore !== undefined && cap.authorityScore > 0 && (
            <div>
              Authority: <span className="text-text-primary">{cap.authorityScore}/100</span>
            </div>
          )}
        </div>
        
        {cap.sourceUrl && !cap.sourceUrl.startsWith("profile://") && (
          <button 
            onClick={() => setIsOpen(!isOpen)}
            className="text-[9px] font-black uppercase tracking-widest text-intelligence-blue hover:underline transition-all flex items-center gap-1"
          >
            {isOpen ? "Hide Source" : "View Source"}
          </button>
        )}
      </div>

      {isOpen && cap.sourceUrl && (
        <div className="mt-3 p-3 bg-surface-base rounded-xl border border-border-soft/30 space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
          <div className="flex items-center justify-between text-[9px]">
            <span className="font-black text-text-primary/60 uppercase tracking-wider">Direct Evidence Citation</span>
            <a 
              href={cap.sourceUrl} 
              target="_blank" 
              rel="noreferrer" 
              className="text-intelligence-blue hover:underline font-bold truncate max-w-[180px]"
            >
              {(() => {
                try {
                  const urlObj = new URL(cap.sourceUrl);
                  return urlObj.pathname === "/" ? urlObj.hostname : urlObj.pathname;
                } catch {
                  return cap.sourceUrl;
                }
              })()}
            </a>
          </div>
          <blockquote className="text-[11px] leading-relaxed text-text-secondary italic pl-3.5 border-l-2 border-border-soft/60">
            "{cap.snippet || cap.rationale}"
          </blockquote>
        </div>
      )}
    </div>
  );
}




