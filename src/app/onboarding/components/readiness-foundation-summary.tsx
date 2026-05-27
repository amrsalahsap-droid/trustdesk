"use client";

import React, { useState } from "react";
import { SparklesIcon, ShieldCheckIcon, FileTextIcon, LinkIcon, AlertCircleIcon, ArrowRightIcon, CloseIcon, UploadIcon } from "@/components/icons";
import { AppCard, AppTypography, AppButton } from "@/components/ui/app-design-system/primitives";
import { cn } from "@/lib/utils";

import { SecurityPillar, EvidenceNeed, ResolvedEvidenceNeed } from "@/modules/workspaces/onboarding/vendor-intelligence-types";

interface ReadinessFoundationSummaryProps {
  securityPillarsIdentifiedCount: number;
  autoReadyTopicsCount: number;
  reviewSuggestedTopicsCount: number;
  needsEvidenceTopicsCount: number;
  answerScaffoldsReadyCount: number;
  evidenceNeedsCount: number;
  clarificationTasksCount: number;
  pillars: SecurityPillar[];
  evidenceNeeds?: EvidenceNeed[];
  resolvedEvidenceNeeds?: ResolvedEvidenceNeed[];
  onAddEvidence?: (documentType: string, details?: any) => void;
  completedEvidenceTypes?: string[];
  warnings?: string[];
  systemWarning?: string;
  onInitialize: () => void;
  submitting: boolean;
  disabled: boolean;
  exceptions?: Record<string, { status: "unavailable" | "not_applicable"; reason: string; note: string }>;
  onMarkUnavailable?: (type: string, details?: any) => void;
  onExplorePillar?: (pillarKey: string) => void;
  onExploreEvidenceGap?: (evidenceType: string) => void;
}

export function ReadinessFoundationSummary({
  securityPillarsIdentifiedCount,
  autoReadyTopicsCount,
  reviewSuggestedTopicsCount,
  needsEvidenceTopicsCount,
  answerScaffoldsReadyCount,
  evidenceNeedsCount,
  clarificationTasksCount,
  pillars = [],
  evidenceNeeds = [],
  resolvedEvidenceNeeds = [],
  onAddEvidence,
  completedEvidenceTypes = [],
  warnings = [],
  systemWarning,
  onInitialize,
  submitting,
  disabled,
  exceptions = {},
  onMarkUnavailable,
  onExplorePillar,
  onExploreEvidenceGap,
}: ReadinessFoundationSummaryProps) {
  const hasCriticalWarnings = securityPillarsIdentifiedCount === 0;
  const totalRelevantTopicsCount = autoReadyTopicsCount + reviewSuggestedTopicsCount + needsEvidenceTopicsCount;

  const isAllUnapproved = totalRelevantTopicsCount > 0 && autoReadyTopicsCount === 0;

  const topicsReadyLabel = isAllUnapproved ? "Topics Prepared" : "Topics Ready";
  const topicsReadyCount = isAllUnapproved ? totalRelevantTopicsCount : autoReadyTopicsCount;

  const reviewSuggestedLabel = isAllUnapproved ? "Auto-Approved" : "Suggested Review";
  const reviewSuggestedCount = isAllUnapproved ? 0 : reviewSuggestedTopicsCount;

  const evidenceNeedsLabel = isAllUnapproved ? "Evidence Required" : "Evidence Needs";

  const clarificationLabel = isAllUnapproved ? "Confirmations" : "Clarification";

  // Local state to keep track of dismissed evidence gaps (e.g. marked not available)
  const [dismissedTypes, setDismissedTypes] = useState<string[]>([]);

  const handleDismiss = (type: string) => {
    setDismissedTypes((prev) => [...prev, type]);
  };

  // Helper function to enrich evidence needs with rich procurement impact metadata
  const enrichNeed = (need: EvidenceNeed): {
    title: string;
    relatedPillar: string;
    whyItMatters: string;
    whyItMattersText?: string;
    priority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
    score: number;
    type: string;
  } => {
    const typeLower = need.type.toLowerCase();
    const reasonLower = need.reason.toLowerCase();

    if (typeLower.includes("ai data") || typeLower.includes("ai governance") || typeLower.includes("model governance")) {
      return {
        title: "AI Data Usage Policy",
        relatedPillar: "AI & Model Security",
        whyItMatters: "Enterprise buyers frequently block vendors using AI until policies guarantee customer data is not used for model training without consent.",
        priority: "CRITICAL",
        score: 100,
        type: need.type
      };
    }

    if (typeLower.includes("tenant isolation") || typeLower.includes("container") || typeLower.includes("network-level tenant")) {
      return {
        title: "Tenant Isolation Architecture",
        relatedPillar: "Infrastructure & Cloud Security",
        whyItMatters: "Crucial for multi-tenant SaaS. Lack of tenant isolation architecture diagrams is a major security red flag for enterprise procurement.",
        priority: "CRITICAL",
        score: 95,
        type: need.type
      };
    }

    if (typeLower.includes("connector permission") || typeLower.includes("least privilege") || typeLower.includes("iam policy")) {
      return {
        title: "Connector Permission Guide",
        relatedPillar: "Identity & Access Enforcement",
        whyItMatters: "Enterprise compliance dictates that third-party cloud integrations must follow strict principle of least privilege.",
        priority: "HIGH",
        score: 90,
        type: need.type
      };
    }

    if (typeLower.includes("subprocessor") || typeLower.includes("third-party") || typeLower.includes("vendor management")) {
      return {
        title: "Subprocessor List",
        relatedPillar: "Data Privacy & Handling",
        whyItMatters: "GDPR/CCPA compliance requires strict subprocessor transparency before signing any DPA with enterprise customers.",
        priority: "HIGH",
        score: 85,
        type: need.type
      };
    }

    if (typeLower.includes("data retention") || typeLower.includes("deletion") || typeLower.includes("data disposal")) {
      return {
        title: "Data Retention Policy",
        relatedPillar: "Storage & Sovereignty",
        whyItMatters: "Required to satisfy corporate compliance policies regarding the timely deletion of customer data upon contract termination.",
        priority: "HIGH",
        score: 80,
        type: need.type
      };
    }

    if (typeLower.includes("soc 2") || typeLower.includes("soc2") || typeLower.includes("audit report")) {
      return {
        title: "SOC 2 Type II Report",
        relatedPillar: "Compliance & Audit Readiness",
        whyItMatters: "The baseline trust standard. Most enterprise buyers will not proceed without a current SOC 2 Type II audit report.",
        priority: "HIGH",
        score: 75,
        type: need.type
      };
    }

    if (typeLower.includes("privacy policy") || typeLower.includes("dpa")) {
      return {
        title: "Privacy Policy",
        relatedPillar: "Data Privacy & Handling",
        whyItMatters: "A mandatory public compliance disclosure required to confirm legal data processing frameworks.",
        priority: "HIGH",
        score: 70,
        type: need.type
      };
    }

    if (typeLower.includes("access control") || typeLower.includes("sso") || typeLower.includes("mfa")) {
      return {
        title: "Access Control Policy",
        relatedPillar: "Identity & Access Enforcement",
        whyItMatters: "Demonstrates access controls, SSO, and MFA policies are enforced for all administrative and user roles.",
        priority: "MEDIUM",
        score: 60,
        type: need.type
      };
    }

    if (typeLower.includes("encryption") || typeLower.includes("key management") || typeLower.includes("sensitive data")) {
      return {
        title: "Encryption Policy",
        relatedPillar: "Sensitive Data Protection",
        whyItMatters: "Confirms encryption in transit and at rest standards to protect proprietary and sensitive business records.",
        priority: "MEDIUM",
        score: 50,
        type: need.type
      };
    }

    // Dynamic fallback matching against identified pillars
    let inferredPillarName = "Compliance & Audit Readiness";
    for (const pillar of pillars) {
      if (reasonLower.includes(pillar.title.toLowerCase()) || typeLower.includes(pillar.title.toLowerCase())) {
        inferredPillarName = pillar.title;
        break;
      }
    }

    let priority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" = "MEDIUM";
    let score = 40;
    if (reasonLower.includes("critical") || reasonLower.includes("blocker")) {
      priority = "CRITICAL";
      score = 78;
    } else if (reasonLower.includes("high") || reasonLower.includes("required")) {
      priority = "HIGH";
      score = 65;
    }

    return {
      title: need.type,
      relatedPillar: inferredPillarName,
      whyItMatters: need.reason || "Required to verify operational safeguards and accelerate enterprise security clearance.",
      priority,
      score,
      type: need.type
    };
  };

  const totalGapsCount = resolvedEvidenceNeeds && resolvedEvidenceNeeds.length > 0
    ? resolvedEvidenceNeeds.length
    : (evidenceNeedsCount || evidenceNeeds.length);
  
  // Exclude completed items and exceptions from active blocker needs count
  const exceptionsCount = Object.keys(exceptions).length;
  const dynamicEvidenceNeedsCount = Math.max(0, totalGapsCount - completedEvidenceTypes.length - exceptionsCount);

  // Filter out completed items, enrich, sort by impact score, and take the top 5 (including exceptions but not silently hiding them)
  const topGaps = (resolvedEvidenceNeeds && resolvedEvidenceNeeds.length > 0)
    ? resolvedEvidenceNeeds
        .filter((need) => !completedEvidenceTypes.includes(need.title))
        .map(need => {
          const scoreMap = { CRITICAL: 100, HIGH: 85, MEDIUM: 60, LOW: 40 };
          
          let resolvedPillarName = "Compliance & Audit Readiness";
          if (need.relatedPillars && need.relatedPillars.length > 0) {
            const foundPillar = pillars.find(p => p.key === need.relatedPillars[0]);
            if (foundPillar) {
              resolvedPillarName = foundPillar.title;
            }
          }

          return {
            title: need.title,
            relatedPillar: resolvedPillarName,
            whyItMatters: need.procurementImpact || need.rationaleSummary || need.description,
            priority: need.severity,
            score: scoreMap[need.severity] || 50,
            type: need.title
          };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)
    : (evidenceNeeds || [])
        .filter((need) => !completedEvidenceTypes.includes(need.type))
        .map(enrichNeed)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);

  return (
    <div className="space-y-8">
      <AppCard variant="hero" className="group/teaser !p-8 lg:!p-12 relative overflow-hidden" id="workspace-foundation-card">
        <div className="absolute inset-0 bg-gradient-to-r from-intelligence-blue/[0.03] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
        
        <div className="relative flex flex-col lg:flex-row items-center justify-between gap-12">
          <div className="flex items-start gap-8">
            <div className="h-20 w-20 rounded-[2rem] bg-intelligence-blue/10 flex items-center justify-center text-intelligence-blue ring-1 ring-intelligence-blue/20 rotate-3 group-hover/teaser:rotate-0 transition-transform duration-500 shrink-0 shadow-premium-lg mt-1">
              <SparklesIcon className="h-10 w-10" />
            </div>
            
            <div className="space-y-6">
              <div className="space-y-2">
                <AppTypography.Metadata className="text-intelligence-blue uppercase tracking-[0.2em] !text-[10px] font-black">Workspace Foundation</AppTypography.Metadata>
                <AppTypography.SectionTitle className="!text-3xl !font-black tracking-tight">Readiness Summary</AppTypography.SectionTitle>
                <AppTypography.Body className="max-w-[540px] text-text-secondary leading-relaxed">
                  TrustDesk grouped {totalRelevantTopicsCount} Trust Topics into {pillars.length} Security Pillars. Review these high-level areas before initializing.
                </AppTypography.Body>
              </div>
 
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <FoundationStat label="Pillars" count={securityPillarsIdentifiedCount} icon={ShieldCheckIcon} />
                <FoundationStat label={topicsReadyLabel} count={topicsReadyCount} icon={ShieldCheckIcon} />
                <FoundationStat label={reviewSuggestedLabel} count={reviewSuggestedCount} icon={AlertCircleIcon} color={isAllUnapproved ? "blue" : "amber"} />
                <FoundationStat label={evidenceNeedsLabel} count={dynamicEvidenceNeedsCount} icon={LinkIcon} color="amber" />
                <FoundationStat label={clarificationLabel} count={clarificationTasksCount} icon={AlertCircleIcon} color="amber" />
              </div>
 
              {(warnings.length > 0 || systemWarning || hasCriticalWarnings) && (
                <div className="space-y-3 pt-2">
                  {hasCriticalWarnings && (
                     <WarningItem message="Risk areas detected but no trust topics generated. This may indicate a mapping gap." severity="critical" />
                  )}
                  {warnings.map((w, i) => <WarningItem key={i} message={w} />)}
                  {systemWarning && !warnings.includes(systemWarning) && <WarningItem message={systemWarning} />}
                </div>
              )}
            </div>
          </div>
 
          <div className="flex flex-col items-center gap-4 w-full lg:w-auto">
            <AppButton 
              onClick={onInitialize} 
              disabled={disabled || submitting}
              isLoading={submitting}
              className="w-full lg:w-64 h-14 rounded-2xl shadow-premium-xl bg-intelligence-blue text-white hover:bg-intelligence-blue-hover text-sm font-black uppercase tracking-widest"
            >
              Create Review Workspace
              <ArrowRightIcon className="h-4 w-4 ml-2" />
            </AppButton>
            <div className="flex flex-col items-center gap-1.5 text-center max-w-[280px]">
              <AppTypography.Metadata className="opacity-40 font-medium text-center leading-relaxed">
                Creates review-ready topics. No claims are auto-approved until evidence is added.
              </AppTypography.Metadata>
              <span className="text-[10px] text-text-muted opacity-40 font-semibold text-center leading-normal">
                evidence required before final answers
              </span>
            </div>
          </div>
        </div>
      </AppCard>

      {/* Top Evidence Gaps Section */}
      {topGaps.length > 0 && (
        <div className="space-y-6" id="top-evidence-gaps">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <AppTypography.SectionTitle className="!text-xl !font-black !mb-0 tracking-tight">Top Evidence Gaps</AppTypography.SectionTitle>
                <span className="px-2 py-0.5 rounded-full bg-error-red/10 border border-error-red/20 text-error-red text-[9px] font-black uppercase tracking-widest animate-pulse">
                  Action Required
                </span>
              </div>
              <p className="text-xs text-text-secondary leading-relaxed opacity-85">
                {dynamicEvidenceNeedsCount > topGaps.length
                  ? `Top ${topGaps.length} of ${dynamicEvidenceNeedsCount} evidence gaps blocking enterprise procurement. Upload these to automatically verify your trust posture.`
                  : `Evidence gaps blocking enterprise procurement. Upload these to automatically verify your trust posture.`
                }
              </p>
            </div>
            <span className="text-[11px] font-bold text-text-muted bg-surface-muted border border-surface-border px-3 py-1 rounded-xl">
              {dynamicEvidenceNeedsCount} gaps total
            </span>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {topGaps.map((gap, index) => {
              const priorityColors = {
                CRITICAL: "text-error-red bg-error-red/10 border-error-red/20",
                HIGH: "text-warning-amber bg-warning-amber/10 border-warning-amber/20",
                MEDIUM: "text-intelligence-blue bg-intelligence-blue/10 border-intelligence-blue/20",
                LOW: "text-text-muted bg-surface-muted border-surface-border/50"
              };

              const exception = exceptions[gap.type];

              return (
                <div 
                  key={gap.type} 
                  className={cn(
                    "flex flex-col md:flex-row md:items-start md:justify-between gap-6 p-6 rounded-2xl border transition-all duration-300 hover:shadow-premium-md relative overflow-hidden group/gap",
                    exception
                      ? "border-surface-border bg-surface-muted opacity-85"
                      : (index === 0 
                          ? "border-intelligence-blue/20 bg-intelligence-blue/[0.01] ring-1 ring-intelligence-blue/10 hover:border-intelligence-blue/30" 
                          : "border-surface-border/80 bg-surface-base hover:border-intelligence-blue/20")
                  )}
                >
                  {/* Blocker Rank Indicator for Rank 1 (if not excepted) */}
                  {index === 0 && !exception && (
                    <div className="absolute top-0 left-0 bg-intelligence-blue text-[8px] font-black uppercase tracking-widest text-white px-2.5 py-0.5 rounded-br-lg shadow-sm">
                      Top Blocker
                    </div>
                  )}

                  <div className="space-y-3 flex-1 min-w-0">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className={cn("text-sm font-black tracking-tight", exception ? "text-text-secondary line-through opacity-70" : "text-text-primary")}>
                        {gap.title}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-surface-muted border border-surface-border text-[9px] font-bold text-text-secondary tracking-normal">
                        {gap.relatedPillar}
                      </span>
                      {exception ? (
                        exception.status === "not_applicable" ? (
                          <span className="px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest bg-teal-500/10 border border-teal-500/20 text-teal-500 shrink-0">
                            Marked Not Applicable
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest bg-warning-amber/10 border border-warning-amber/20 text-warning-amber shrink-0">
                            Marked Unavailable
                          </span>
                        )
                      ) : (
                        <span className={cn(
                          "px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border shrink-0",
                          priorityColors[gap.priority]
                        )}>
                          {gap.priority}
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-text-secondary leading-relaxed max-w-3xl">
                      {gap.whyItMatters}
                    </p>

                    {/* Exceptions metadata note rendering */}
                    {exception && (
                      <div className="mt-3 p-3 bg-surface-base border border-surface-border/50 rounded-xl space-y-1.5 animate-in fade-in duration-300">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[9px] font-black uppercase tracking-widest text-text-muted">Justification Details ({exception.reason}):</span>
                        </div>
                        {exception.note ? (
                          <p className="text-[11px] text-text-secondary leading-relaxed italic">&ldquo;{exception.note}&rdquo;</p>
                        ) : (
                          <p className="text-[10px] text-text-muted italic leading-relaxed">No internal note provided.</p>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-3 shrink-0 self-end md:self-start">
                    <AppButton
                      size="sm"
                      onClick={() => onAddEvidence?.(gap.type, gap)}
                      className={cn(
                        "text-[11px] font-black uppercase tracking-widest px-4 h-10 rounded-xl shadow-premium-sm flex items-center gap-2",
                        exception
                          ? "bg-surface-muted border border-surface-border text-text-muted hover:bg-surface-base"
                          : "bg-intelligence-blue text-white hover:bg-intelligence-blue-hover"
                      )}
                    >
                      <UploadIcon className="h-3.5 w-3.5" />
                      Add Evidence
                    </AppButton>
                    <button
                      onClick={() => onMarkUnavailable?.(gap.type, gap)}
                      className={cn(
                        "inline-flex items-center justify-center border text-[11px] font-black uppercase tracking-widest px-4 h-10 rounded-xl transition-all",
                        exception
                          ? "border-intelligence-blue/20 bg-intelligence-blue/[0.02] text-intelligence-blue hover:bg-intelligence-blue/5"
                          : "border-surface-border bg-surface-base hover:bg-surface-muted text-text-secondary"
                      )}
                    >
                      {exception ? "Edit / Undo Exception" : "Mark Not Available"}
                    </button>
                    {onExploreEvidenceGap && (
                      <button
                        type="button"
                        onClick={() => onExploreEvidenceGap(gap.type)}
                        className="inline-flex items-center justify-center border border-intelligence-blue/20 bg-intelligence-blue/[0.02] text-intelligence-blue text-[11px] font-black uppercase tracking-widest px-4 h-10 rounded-xl hover:bg-intelligence-blue/5 transition-all"
                      >
                        Explore Details
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Pillar Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {pillars.map((pillar) => (
          <PillarCard key={pillar.key} pillar={pillar} onExplore={onExplorePillar} />
        ))}
      </div>
    </div>
  );
}

function PillarCard({
  pillar,
  onExplore,
}: {
  pillar: SecurityPillar;
  onExplore?: (pillarKey: string) => void;
}) {
  const statusColors = {
    auto_ready: "text-trust-green bg-trust-green/10 border-trust-green/20",
    evidence_backed: "text-trust-green bg-trust-green/10 border-trust-green/20",
    review_suggested: "text-warning-amber bg-warning-amber/10 border-warning-amber/20",
    needs_evidence: "text-error-red bg-error-red/10 border-error-red/20",
    mixed_evidence: "text-intelligence-blue bg-intelligence-blue/10 border-intelligence-blue/20",
    provisional: "text-purple-500 bg-purple-500/10 border-purple-500/20"
  };

  const statusLabels = {
    auto_ready: "Evidence Backed",
    evidence_backed: "Evidence Backed",
    review_suggested: "Review Suggested",
    needs_evidence: "Needs Evidence",
    mixed_evidence: "Mixed Evidence",
    provisional: "Provisional"
  };

  const pillarType = pillar.pillarType || "canonical";

  const typeBorders = {
    canonical: "border-surface-border",
    inferred: "border-teal-500/30 bg-teal-500/[0.02]",
    provisional: "border-dashed border-amber-500/40 bg-amber-500/[0.01]",
    unresolved: "border-dashed border-rose-500/40 bg-rose-500/[0.01]"
  };

  const typeBadges = {
    canonical: null,
    inferred: "text-teal-500 bg-teal-500/10 border-teal-500/20",
    provisional: "text-amber-500 bg-amber-500/10 border-amber-500/20",
    unresolved: "text-rose-500 bg-rose-500/10 border-rose-500/20"
  };

  const typeLabels = {
    canonical: "Canonical",
    inferred: "Inferred",
    provisional: "Provisional",
    unresolved: "Review Required"
  };

  return (
    <AppCard
      className={cn(
        "p-6 space-y-4 hover:border-intelligence-blue/30 transition-all group duration-500 hover:shadow-premium-lg bg-surface-base border hover:-translate-y-1 relative overflow-hidden",
        onExplore && "cursor-pointer",
        typeBorders[pillarType],
      )}
      onClick={onExplore ? () => onExplore(pillar.key) : undefined}
      role={onExplore ? "button" : undefined}
      tabIndex={onExplore ? 0 : undefined}
      onKeyDown={
        onExplore
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onExplore(pillar.key);
              }
            }
          : undefined
      }
    >
      <div className="flex items-start justify-between relative z-10">
        <div className="space-y-1 w-full">
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2 flex-wrap">
              <AppTypography.SectionTitle className="!text-sm !font-black !mb-0">{pillar.title}</AppTypography.SectionTitle>
              <span className={cn(
                "px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border shrink-0",
                statusColors[pillar.status]
              )}>
                {statusLabels[pillar.status]}
              </span>
              {pillarType !== "canonical" && (
                <span className={cn(
                  "px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border shrink-0",
                  typeBadges[pillarType]
                )}>
                  {typeLabels[pillarType]}
                </span>
              )}
            </div>
          </div>
          <AppTypography.Metadata className="!text-[10px] text-text-muted font-bold uppercase tracking-wider block">
            {pillar.topicKeys.length} Trust Topics
          </AppTypography.Metadata>
        </div>
      </div>

      <AppTypography.Body className="!text-[11px] text-text-secondary leading-relaxed line-clamp-3 min-h-[3rem] relative z-10">
        {pillar.summary}
      </AppTypography.Body>

      {pillar.whyExists && (
        <div className="pt-2 border-t border-surface-border/40 space-y-1 relative z-10">
          <span className="text-[8px] font-black uppercase text-text-muted tracking-wider block">Why Generated</span>
          <p className="text-[10px] leading-relaxed text-text-secondary italic">{pillar.whyExists}</p>
        </div>
      )}

      {pillar.mappingFailedReason && (
        <div className={cn(
          "p-2 rounded border space-y-1 relative z-10",
          pillarType === "unresolved" ? "bg-rose-500/[0.03] border-rose-500/10 text-rose-500" : "bg-amber-500/[0.03] border-amber-500/10 text-amber-500"
        )}>
          <span className="text-[8px] font-black uppercase tracking-wider block">Taxonomy Mapping Review</span>
          <p className="text-[10px] leading-relaxed opacity-90">{pillar.mappingFailedReason}</p>
        </div>
      )}

      <div className="flex items-center justify-between pt-4 border-t border-surface-border/50 relative z-10 mt-auto">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <LinkIcon className="h-3 w-3 text-text-muted group-hover:text-intelligence-blue transition-colors" />
            {pillar.evidenceNeedsCount > 0 ? (
              <span className="text-[10px] font-bold text-text-muted group-hover:text-text-primary transition-colors">{pillar.evidenceNeedsCount} Evidence Needs</span>
            ) : (
              <span className="text-[10px] font-bold text-text-muted group-hover:text-text-primary transition-colors">{pillar.supportingEvidenceCount || 0} Evidence Sources</span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <AlertCircleIcon className="h-3 w-3 text-text-muted group-hover:text-intelligence-blue transition-colors" />
            <span className="text-[10px] font-bold text-text-muted group-hover:text-text-primary transition-colors">{pillar.clarificationTasksCount} Tasks</span>
          </div>
          {pillar.supportingEvidenceCount !== undefined && pillar.supportingEvidenceCount > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="px-1.5 py-0.5 rounded bg-surface-muted text-[8px] font-bold text-text-secondary uppercase">
                {pillar.supportingEvidenceCount} Refs
              </span>
            </div>
          )}
        </div>
        
        {onExplore && (
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-300 translate-x-2 group-hover:translate-x-0">
            <span className="text-[10px] font-black uppercase tracking-widest text-intelligence-blue">View details</span>
            <ArrowRightIcon className="h-3 w-3 text-intelligence-blue" />
          </div>
        )}
      </div>
      
      {/* Subtle background gradient that appears on hover */}
      <div className="absolute inset-0 bg-gradient-to-br from-intelligence-blue/[0.02] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none z-0" />
    </AppCard>
  );
}


function FoundationStat({ label, count, icon: Icon, color = "blue" }: { label: string, count: number, icon: any, color?: "blue" | "amber" }) {
  return (
    <div className="p-4 rounded-2xl bg-surface-base border border-surface-border/50 space-y-3">
      <div className={cn(
        "h-8 w-8 rounded-lg flex items-center justify-center border",
        color === "blue" ? "bg-intelligence-blue/10 text-intelligence-blue border-intelligence-blue/20" : "bg-warning-amber/10 text-warning-amber border-warning-amber/20"
      )}>
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <div className="text-xl font-black text-text-primary">{count}</div>
        <div className="text-[10px] text-text-muted uppercase font-bold tracking-wider">{label}</div>
      </div>
    </div>
  );
}

function WarningItem({ message, severity = "warning" }: { message: string, severity?: "warning" | "critical" }) {
  return (
    <div className={cn(
      "p-3 rounded-xl border flex items-center gap-3 animate-in fade-in slide-in-from-left-2",
      severity === "critical" ? "bg-error-red/5 border-error-red/20 text-error-red" : "bg-warning-amber/5 border-warning-amber/20 text-warning-amber"
    )}>
      <AlertCircleIcon className="h-4 w-4 shrink-0" />
      <span className="text-[11px] font-bold uppercase tracking-wider leading-tight">
        {message}
      </span>
    </div>
  );
}
