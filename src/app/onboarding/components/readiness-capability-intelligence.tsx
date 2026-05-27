"use client";

import React, { useState } from "react";
import { SparklesIcon, LayoutIcon, DatabaseIcon, LockIcon, LayersIcon, ShieldCheckIcon, GlobeIcon } from "@/components/icons";
import { AppCard, AppTypography, AppIcon, AppBadge } from "@/components/ui/app-design-system/primitives";
import { cn } from "@/lib/utils";
import { CapabilityView } from "@/modules/workspaces/onboarding/vendor-intelligence-types";
import { findCanonicalCapability } from "@/modules/workspaces/onboarding/capability-registry";

// Self-contained icons to prevent import friction
function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function ChevronUpIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="18 15 12 9 6 15" />
    </svg>
  );
}

function ExternalLinkIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2 2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

interface ReadinessCapabilityIntelligenceProps {
  businessDomain?: string;
  productType?: string;
  marketCategory?: string;
  deployment?: string;
  capabilities: CapabilityView[];
  onExploreEvidence?: (capabilityKey: string, evidenceUrl?: string) => void;
}

export function ReadinessCapabilityIntelligence({
  businessDomain,
  productType,
  marketCategory,
  deployment,
  capabilities,
  onExploreEvidence,
}: ReadinessCapabilityIntelligenceProps) {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <AppTypography.SectionTitle className="!text-xl font-black">Technical Security Capabilities</AppTypography.SectionTitle>
        <AppTypography.Metadata className="opacity-50">Inferred security and compliance capabilities discovered from public digital footprint.</AppTypography.Metadata>
      </div>

      <div className="grid grid-cols-1 gap-8">
        {/* Capabilities List */}
        <AppCard className="p-6 space-y-4 bg-surface-base border-surface-border/50">
           <div className="flex items-center justify-between mb-2">
              <AppTypography.Metadata className="text-[10px] font-black uppercase tracking-widest text-intelligence-blue">Security-Relevant Capabilities</AppTypography.Metadata>
             <span className="text-[10px] font-bold text-text-muted">{capabilities.length} Features Found</span>
           </div>
           
           <div className="space-y-3">
             {capabilities.map((cap, i) => (
               <CapabilityItem key={i} cap={cap} onExploreEvidence={onExploreEvidence} />
             ))}
           </div>
        </AppCard>
      </div>
    </div>
  );
}

function CapabilityItem({
  cap,
  onExploreEvidence,
}: {
  cap: CapabilityView;
  onExploreEvidence?: (capabilityKey: string, evidenceUrl?: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const refs = cap.evidenceRefs || [];
  const strengthUpper = cap.evidenceStrength ? cap.evidenceStrength.toUpperCase() : "NEEDS REVIEW";
  const canonicalDef = findCanonicalCapability(cap.key);
  const relatedRisks = canonicalDef?.impliedRiskAreas || [];
  const relatedTrustTopics = canonicalDef?.impliedTrustTopics || [];
  const relatedWorkflows = ["Vendor Security Assessment"];

  return (
    <div className={cn(
      "p-4 rounded-2xl border transition-all duration-300 bg-surface-base/30",
      isOpen 
        ? "border-intelligence-blue/40 bg-surface-base/60 shadow-premium-sm" 
        : "border-surface-border/30 hover:border-intelligence-blue/20"
    )}>
      {/* Closed / Interactive Header */}
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between gap-4 cursor-pointer select-none"
      >
        <div className="flex items-center gap-4 min-w-0">
          <div className={cn(
            "h-10 w-10 rounded-xl flex items-center justify-center shrink-0 border transition-all duration-300",
            isOpen 
              ? "bg-intelligence-blue/10 border-intelligence-blue/20 text-intelligence-blue" 
              : "bg-intelligence-blue/5 border-intelligence-blue/10 text-text-secondary"
          )}>
            <ShieldCheckIcon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="text-[13px] font-black text-text-primary uppercase tracking-tight flex items-center gap-2">
              {cap.label}
            </div>
            <div className="text-[10px] text-text-muted opacity-70 font-bold uppercase tracking-tight mt-0.5">
              {refs.length} Source{refs.length !== 1 ? 's' : ''} · {cap.evidenceAuthority || "Marketing Source"}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <AppBadge 
            variant="outline" 
            className={cn(
              "text-[9px] font-black uppercase tracking-widest border px-2.5 h-6 rounded-md bg-surface-base",
              (strengthUpper === "STRONG" || strengthUpper === "AUTHORITATIVE") && "text-trust-green border-trust-green/20",
              strengthUpper === "DETECTED" && "text-intelligence-blue border-intelligence-blue/20",
              (strengthUpper === "NEEDS REVIEW" || strengthUpper === "NEEDS_REVIEW") && "text-warning-amber border-warning-amber/20"
            )}
          >
            {strengthUpper}
          </AppBadge>
          <div className="text-text-muted opacity-60 hover:opacity-100 transition-opacity">
            {isOpen ? <ChevronUpIcon className="h-4 w-4" /> : <ChevronDownIcon className="h-4 w-4" />}
          </div>
        </div>
      </div>

      {/* Expandable Details Drawer */}
      {isOpen && (
        <div className="mt-4 pt-4 border-t border-surface-border/30 space-y-4 text-left animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="text-[9px] text-text-muted uppercase font-black tracking-widest mb-1.5">Evidence Authority</div>
              <div className="text-xs font-bold text-text-primary flex items-center gap-1.5">
                <GlobeIcon className="h-3.5 w-3.5 text-intelligence-blue" />
                <span className="text-intelligence-blue font-black uppercase tracking-tight">{cap.evidenceAuthority || "Marketing Source"}</span>
              </div>
            </div>
            <div>
              <div className="text-[9px] text-text-muted uppercase font-black tracking-widest mb-1.5">Defensibility Evidence</div>
              <div className="text-xs font-black text-text-primary uppercase tracking-tight">
                {refs.length > 0 ? `${refs.length} Verified Citations` : "No Technical Evidence Grounded"}
              </div>
            </div>
          </div>
          
          <div>
            <div className="text-[9px] text-text-muted uppercase font-black tracking-widest mb-1.5">Confidence Reason</div>
            <div className="p-3 rounded-xl bg-surface-muted/50 border border-surface-border/30 text-xs text-text-primary font-medium leading-relaxed">
              {cap.confidenceReason || "Capability inferred from general business model attributes."}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t border-surface-border/20">
            <div>
              <div className="text-[8px] text-text-muted uppercase font-black tracking-widest mb-1.5">Related Workflows</div>
              <div className="flex flex-wrap gap-1.5">
                {relatedWorkflows.length > 0 ? relatedWorkflows.map(w => (
                  <span key={w} className="px-1.5 py-0.5 rounded bg-surface-muted border border-surface-border text-[9px] text-text-secondary">{w}</span>
                )) : <span className="text-[9px] text-text-muted italic">None</span>}
              </div>
            </div>
            <div>
              <div className="text-[8px] text-text-muted uppercase font-black tracking-widest mb-1.5">Related Risks</div>
              <div className="flex flex-wrap gap-1.5">
                {relatedRisks.length > 0 ? relatedRisks.map(r => (
                  <span key={r} className="px-1.5 py-0.5 rounded bg-error-red/5 border border-error-red/10 text-error-red text-[9px]">{r}</span>
                )) : <span className="text-[9px] text-text-muted italic">None</span>}
              </div>
            </div>
            <div>
              <div className="text-[8px] text-text-muted uppercase font-black tracking-widest mb-1.5">Trust Topics</div>
              <div className="flex flex-wrap gap-1.5">
                {relatedTrustTopics.length > 0 ? relatedTrustTopics.map(t => (
                  <span key={t} className="px-1.5 py-0.5 rounded bg-intelligence-blue/5 border border-intelligence-blue/10 text-intelligence-blue text-[9px]">{t}</span>
                )) : <span className="text-[9px] text-text-muted italic">None</span>}
              </div>
            </div>
          </div>

          {refs.length > 0 && (
            <div className="space-y-2.5">
              <div className="text-[9px] text-text-muted uppercase font-black tracking-widest">Source Reference Trail</div>
              <div className="space-y-3">
                 {refs.map((ref, idx) => {
                    const lowerUrl = ref.url.toLowerCase();
                    const isDocOrSecurity = lowerUrl.includes("docs") || lowerUrl.includes("security") || lowerUrl.includes("trust");
                    const isMarketing = lowerUrl.includes("product") || lowerUrl.includes("features") || lowerUrl.includes("marketing") || (!isDocOrSecurity && lowerUrl.split("/").length <= 4);
                    
                    const sourceMessage = isDocOrSecurity 
                      ? "High-authority evidence."
                      : (isMarketing ? "Product-page signal — useful but not control evidence." : "Standard reference source.");

                    return (
                      <div key={idx} className="p-3.5 rounded-xl border border-surface-border/20 bg-surface-base/80 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-black uppercase tracking-tight text-text-primary truncate max-w-[70%]">
                            {ref.title || "Product Evidence Page"}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              onExploreEvidence
                                ? onExploreEvidence(cap.key, ref.url)
                                : window.open(ref.url, "_blank", "noopener,noreferrer")
                            }
                            className="text-[9px] font-black uppercase tracking-widest text-intelligence-blue flex items-center gap-1 hover:underline cursor-pointer"
                          >
                            {onExploreEvidence ? "Explore in Explorer" : "Inspect Source"}
                            <ExternalLinkIcon className="h-3 w-3" />
                          </button>
                        </div>
                        
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-[9px] font-bold text-text-muted">Source URL:</span>
                          <a href={ref.url} target="_blank" rel="noopener noreferrer" className="text-[9px] text-intelligence-blue hover:underline truncate max-w-[200px]">{ref.url}</a>
                        </div>

                        {ref.snippet && (
                          <div className="pl-3 border-l-2 border-intelligence-blue/30 text-xs italic text-text-secondary leading-relaxed font-serif bg-surface-base/30 py-1.5 pr-2 rounded-r-md">
                            "{ref.snippet}"
                          </div>
                        )}

                        <div className={cn(
                          "px-2.5 py-1.5 rounded-lg text-[10px] font-medium border",
                          isDocOrSecurity ? "bg-trust-green/5 border-trust-green/20 text-trust-green" : 
                          (isMarketing ? "bg-warning-amber/5 border-warning-amber/20 text-warning-amber" : "bg-surface-muted border-surface-border text-text-secondary")
                        )}>
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold uppercase tracking-tight text-[9px] opacity-70">Source Value:</span>
                            {sourceMessage}
                          </div>
                        </div>

                        {/* Dynamic Evidence Authority Assessment */}
                        {ref.authority && (
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5 pt-2 border-t border-surface-border/10 text-[10px]">
                            <div className="space-y-0.5">
                              <span className="text-[8px] font-black uppercase tracking-wide text-text-muted">Source Type</span>
                              <p className="font-bold text-text-primary uppercase tracking-tight">{ref.authority.sourceType}</p>
                            </div>
                            <div className="space-y-0.5">
                              <span className="text-[8px] font-black uppercase tracking-wide text-text-muted">Authority Level</span>
                              <div>
                                <span className={cn(
                                  "inline-block px-1.5 py-0.25 rounded text-[8px] font-black uppercase tracking-wide",
                                  ref.authority.authorityLevel === "AUTHORITATIVE" && "bg-trust-green/10 text-trust-green",
                                  ref.authority.authorityLevel === "HIGH" && "bg-intelligence-blue/10 text-intelligence-blue",
                                  ref.authority.authorityLevel === "MEDIUM" && "bg-warning-amber/10 text-warning-amber",
                                  ref.authority.authorityLevel === "LOW" && "bg-error-red/10 text-error-red"
                                )}>
                                  {ref.authority.authorityLevel}
                                </span>
                              </div>
                            </div>
                            <div className="space-y-0.5">
                              <span className="text-[8px] font-black uppercase tracking-wide text-text-muted">Confidence Impact</span>
                              <div>
                                <span className={cn(
                                  "font-black tracking-tight",
                                  ref.authority.confidenceImpact.startsWith("-") ? "text-error-red" : "text-trust-green"
                                )}>
                                  {ref.authority.confidenceImpact}
                                </span>
                              </div>
                            </div>
                            <div className="col-span-2 md:col-span-3 space-y-0.5 pt-0.5">
                              <span className="text-[8px] font-black uppercase tracking-wide text-text-muted">Validation Posture</span>
                              <p className="text-text-secondary leading-normal font-medium">
                                <span className="font-bold text-text-primary">{ref.authority.evidenceQuality}: </span>
                                {ref.authority.whyTrusted}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ProfileItem({ label, value, icon: Icon }: { label: string, value: string, icon: any }) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-8 w-8 rounded-lg bg-surface-base border border-surface-border/50 flex items-center justify-center text-text-muted">
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <div className="text-[10px] text-text-muted uppercase font-bold tracking-wider">{label}</div>
        <div className="text-xs font-black text-text-primary uppercase tracking-tight">{value}</div>
      </div>
    </div>
  );
}
