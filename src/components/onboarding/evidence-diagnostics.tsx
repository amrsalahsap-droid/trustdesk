"use client";

import { useState } from "react";
import {
  CheckIcon,
  AlertCircleIcon,
  WarningIcon,
  ShieldIcon,
  BuildingIcon,
  FileTextIcon,
  SparklesIcon, // Using instead of StarIcon
  ChevronDownIcon,
  HelpCircleIcon, // Using instead of InfoIcon
  ClockIcon,
  GlobeIcon,
  LockIcon,
} from "@/components/icons";
import { cn } from "@/lib/utils";

// Types for evidence diagnostics
export type EvidenceStrength = "strong" | "medium" | "limited" | "weak" | "unknown";
export type BlockReason = "blocked" | "rate_limited" | "server_error" | "dns_error" | "timeout" | "no_content";

export interface DomainEvidenceSummary {
  pagesAttempted: number;
  /** Layer 1: pages that returned HTTP 200 + valid content-type. */
  pagesFetched: number;
  /**
   * Layer 3: pages that produced at least one structured evidence block.
   * When present, the UI should prefer this over pagesFetched for inference-related messaging.
   */
  pagesEvidenced?: number;
  highValuePagesFound: number;
  securityLegalPagesFound: number;
  totalUsefulChars: number;
  observedFieldCount?: number;
  groundedSignalCount?: number;
  capReason?: string | null;
  issues: Array<{
    type: "error" | "warning" | "info" | "blocking";
    message: string;
    url?: string;
  }>;
  blockReason?: BlockReason;
  durationMs: number;
  placeholderPages?: number;
  recoveredRenderedPages?: number;
  trueEvidencePages?: number;
}

export interface FieldEvidence {
  fieldKey: string;
  fieldName: string;
  strength: EvidenceStrength;
  category?: "OBSERVED" | "DERIVED" | "HYPOTHESIZED" | "UNKNOWN";
  supportScore: number;
  evidenceCoverage: number;
  topCandidate?: {
    value: string;
    confidenceBand: string;
    reasons: string[];
  };
  isConflicted: boolean;
  evidenceRefs: Array<{
    sourceUrl: string;
    pageType: string;
    snippet: string;
    signalType: string;
  }>;
}

export interface EvidenceDiagnosticsProps {
  domainSummary: DomainEvidenceSummary;
  fieldEvidence: FieldEvidence[];
  onAddEvidence?: () => void;
  onTryAnotherUrl?: () => void;
  onContinueManually?: () => void;
}

/**
 * Enhanced evidence diagnostics component with field-level evidence strength indicators
 */
/**
 * Advanced intelligence diagnostics component.
 * Provides transparency into the crawling and inference machinery for expert review.
 */
export function EvidenceDiagnostics({
  domainSummary,
  fieldEvidence,
  onAddEvidence,
  onTryAnotherUrl,
  onContinueManually,
}: EvidenceDiagnosticsProps) {
  return (
    <div className="space-y-16 py-8">
      {/* 1. Crawl Coverage & Health */}
      <section className="space-y-6">
        <div className="flex flex-col gap-2">
           <div className="flex items-center gap-2">
              <GlobeIcon className="h-4 w-4 text-accent-primary/60" />
              <h3 className="text-sm font-black uppercase tracking-widest text-text-primary font-display">Crawl Coverage & Health</h3>
           </div>
           <p className="text-xs text-text-muted max-w-2xl leading-relaxed">
             <span className="font-bold text-text-secondary">Why this matters:</span> The depth of the crawl determines the grounding density. If high-value pages like security portals or product docs are missed, intelligence quality may degrade.
           </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
           <MetricBox label="Fetch Success" value={`${Math.round((domainSummary.pagesFetched / domainSummary.pagesAttempted) * 100)}%`} subValue={`${domainSummary.pagesFetched}/${domainSummary.pagesAttempted} pages`} />
           <MetricBox label="Content Density" value={domainSummary.totalUsefulChars < 1000 ? `${domainSummary.totalUsefulChars} B` : `${Math.round(domainSummary.totalUsefulChars / 1024)} KB`} subValue="Processed tokens" />
           <MetricBox label="Crawl Duration" value={`${(domainSummary.durationMs / 1000).toFixed(1)}s`} subValue="End-to-end" />
           <MetricBox label="HTTP Status" value={domainSummary.blockReason ? "Degraded" : "Optimal"} subValue={domainSummary.blockReason || "No blocks detected"} variant={domainSummary.blockReason ? "warning" : "success"} />
        </div>

        {domainSummary.issues.length > 0 && (
          <div className="rounded-2xl border border-surface-border bg-surface-panel p-4 space-y-3">
             <p className="text-[10px] font-black uppercase tracking-widest text-text-muted">Diagnostic Events</p>
             <div className="space-y-2">
               {domainSummary.issues.map((issue, i) => (
                 <div key={i} className="flex items-start gap-3 text-xs">
                   <div className={cn("mt-1 h-1.5 w-1.5 rounded-full shrink-0", 
                     issue.type === 'error' || issue.type === 'blocking' ? "bg-amber-500" : "bg-blue-400"
                   )} />
                   <span className="text-text-secondary">{issue.message}</span>
                 </div>
               ))}
             </div>
          </div>
        )}
      </section>

      {/* 2. Intelligence Extraction Quality */}
      <section className="space-y-6">
        <div className="flex flex-col gap-2">
           <div className="flex items-center gap-2">
              <SparklesIcon className="h-4 w-4 text-accent-primary/60" />
              <h3 className="text-sm font-black uppercase tracking-widest text-text-primary font-display">Extraction Intelligence</h3>
           </div>
           <p className="text-xs text-text-muted max-w-2xl leading-relaxed">
             <span className="font-bold text-text-secondary">Why this matters:</span> Not all pages are equal. We prioritize pages with high semantic density (Security centers, DPAs, Feature docs) to extract authoritative trust signals.
           </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
           <MetricBox label="High-Value Hits" value={String(domainSummary.highValuePagesFound)} subValue="Authority pages" />
           <MetricBox label="Grounded Signals" value={String(domainSummary.groundedSignalCount || 0)} subValue="Citation-backed facts" />
           <MetricBox label="JS Recovery" value={String(domainSummary.recoveredRenderedPages || 0)} subValue="Rendered pages" />
        </div>
      </section>

      {/* 3. Confidence Reasoning */}
      <section className="space-y-6">
        <div className="flex flex-col gap-2">
           <div className="flex items-center gap-2">
              <ShieldIcon className="h-4 w-4 text-accent-primary/60" />
              <h3 className="text-sm font-black uppercase tracking-widest text-text-primary font-display">Confidence Reasoning</h3>
           </div>
           <p className="text-xs text-text-muted max-w-2xl leading-relaxed">
             <span className="font-bold text-text-secondary">Why this matters:</span> TrustDesk calculates a confidence score based on evidence strength, source authority, and signal consistency.
           </p>
        </div>

        <div className="rounded-2xl border border-surface-border bg-white p-6 shadow-premium-sm">
           <table className="w-full text-left text-xs">
              <thead>
                 <tr className="border-b border-surface-border text-[10px] font-black uppercase tracking-widest text-text-muted">
                    <th className="pb-3 pr-4">Reasoning Factor</th>
                    <th className="pb-3 pr-4">Score / Status</th>
                    <th className="pb-3">Impact on Intelligence</th>
                 </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                  <tr>
                     <td className="py-4 font-bold text-text-primary">Source Authority</td>
                     <td className="py-4">
                        <div className="flex items-center gap-2 text-emerald-600">
                           <div className="h-1 w-1 rounded-full bg-current" />
                           <span className="font-black uppercase tracking-widest text-[10px]">High</span>
                        </div>
                     </td>
                     <td className="py-4 text-text-muted">Prioritized domain-owned pages over generic meta-tags.</td>
                  </tr>
                  <tr>
                     <td className="py-4 font-bold text-text-primary">Signal Consistency</td>
                     <td className="py-4">
                        <div className="flex items-center gap-2 text-emerald-600">
                           <div className="h-1 w-1 rounded-full bg-current" />
                           <span className="font-black uppercase tracking-widest text-[10px]">Optimal</span>
                        </div>
                     </td>
                     <td className="py-4 text-text-muted">Multiple pages confirm the same capabilities and domain.</td>
                  </tr>
                  {domainSummary.capReason && (
                    <tr className="bg-amber-500/[0.02]">
                       <td className="py-4 font-bold text-amber-700">Intelligence Cap</td>
                       <td className="py-4">
                          <div className="flex items-center gap-2 text-amber-700">
                             <div className="h-1 w-1 rounded-full bg-current" />
                             <span className="font-black uppercase tracking-widest text-[10px]">Applied</span>
                          </div>
                       </td>
                       <td className="py-4 text-amber-700/80">{domainSummary.capReason}</td>
                    </tr>
                  )}
              </tbody>
           </table>
        </div>
      </section>

      {/* 4. Field-Level Evidence Ledger */}
      <section className="space-y-6">
        <div className="flex flex-col gap-2">
           <div className="flex items-center gap-2">
              <FileTextIcon className="h-4 w-4 text-accent-primary/60" />
              <h3 className="text-sm font-black uppercase tracking-widest text-text-primary font-display">Field-Level Evidence Ledger</h3>
           </div>
           <p className="text-xs text-text-muted max-w-2xl leading-relaxed">
             <span className="font-bold text-text-secondary">Why this matters:</span> This is the ground truth. Every data point in your Trust Profile is linked to specific snippets discovered during the analysis.
           </p>
        </div>

        <div className="space-y-4">
          {fieldEvidence.map((field) => (
            <FieldLedgerItem key={field.fieldKey} field={field} />
          ))}
        </div>
      </section>

      {/* Manual Intervention Options (Muted) */}
      {(domainSummary.blockReason || calculateDomainStrength(domainSummary) === 'weak') && (
        <section className="pt-8 border-t border-surface-border">
           <div className="rounded-3xl border border-amber-500/10 bg-amber-500/[0.02] p-8 flex flex-col sm:flex-row items-center justify-between gap-6">
              <div className="space-y-2">
                 <h4 className="text-base font-bold text-amber-800 font-display">Limited Evidence Recovery</h4>
                 <p className="text-sm text-amber-700/70 max-w-md">The crawl was partially restricted. You can improve precision by providing missing document links.</p>
              </div>
              <div className="flex gap-3">
                 <button onClick={onAddEvidence} className="px-6 py-2.5 rounded-xl bg-amber-500 text-white font-bold text-xs uppercase tracking-widest hover:bg-amber-600 transition-colors shadow-premium-lg">Add Sources</button>
                 <button onClick={onContinueManually} className="px-6 py-2.5 rounded-xl bg-white border border-amber-500/20 text-amber-700 font-bold text-xs uppercase tracking-widest hover:bg-amber-50/50 transition-colors">Continue Anyway</button>
              </div>
           </div>
        </section>
      )}
    </div>
  );
}

function MetricBox({ label, value, subValue, variant }: { label: string; value: string; subValue: string; variant?: "success" | "info" | "warning" | "default" }) {
  return (
    <div className="rounded-xl border border-surface-border bg-white p-5 flex flex-col items-center text-center space-y-1 shadow-premium-sm transition-all hover:shadow-premium-md">
      <p className="text-metadata text-[9px] mb-1">{label}</p>
      <p className={cn(
        "text-2xl font-black font-display tracking-tight",
        variant === "success" ? "text-emerald-600" :
        variant === "warning" ? "text-amber-600" :
        variant === "info" ? "text-blue-600" : "text-text-primary"
      )}>{value}</p>
      <p className="text-[9px] font-bold text-text-muted opacity-70 uppercase tracking-tighter">{subValue}</p>
    </div>
  );
}

function FieldLedgerItem({ field }: { field: FieldEvidence }) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="compact-tile compact-tile-hover group/ledger flex-col items-stretch gap-0 p-0 overflow-hidden">
      <div className="p-4 flex items-center justify-between">
         <div className="flex items-center gap-4 min-w-0">
            <div className={cn("h-2 w-2 rounded-full", 
               field.strength === 'strong' ? "bg-emerald-500" : 
               field.strength === 'medium' ? "bg-blue-500" : "bg-amber-500"
            )} />
            <div className="min-w-0">
               <p className="text-sm font-bold text-text-primary truncate">{field.fieldName}</p>
               <p className="text-[10px] text-text-muted font-bold uppercase tracking-widest">{field.topCandidate?.value || "Unset"}</p>
            </div>
         </div>

         <div className="flex items-center gap-6">
            <div className="hidden md:flex items-center gap-6 text-metadata text-[9px]">
               <div className="flex flex-col items-end">
                  <span className="opacity-60">Confidence</span>
                  <span className="text-text-primary">{field.supportScore}%</span>
               </div>
               <div className="flex flex-col items-end">
                  <span className="opacity-60">Sources</span>
                  <span className="text-text-primary">{field.evidenceRefs.length}</span>
               </div>
            </div>
            <button 
              onClick={() => setIsExpanded(!isExpanded)}
              className="h-8 w-8 rounded-lg border border-surface-border flex items-center justify-center hover:bg-surface-base transition-colors"
            >
               <ChevronDownIcon className={cn("h-3.5 w-3.5 text-text-muted transition-transform", isExpanded && "rotate-180")} />
            </button>
         </div>
      </div>

      {isExpanded && (
        <div className="px-4 pb-4 animate-in fade-in slide-in-from-top-2 duration-300">
           <div className="space-y-3 pt-4 border-t border-surface-border/50">
              {field.evidenceRefs.map((ref, idx) => (
                 <div key={idx} className="rounded-lg bg-surface-base border border-surface-border/30 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                       <span className="text-[9px] font-black uppercase tracking-widest text-text-primary opacity-60">{ref.pageType}</span>
                       <span className="text-[9px] font-bold text-text-muted underline truncate max-w-[200px] opacity-70 hover:opacity-100 transition-opacity">
                         {new URL(ref.sourceUrl).pathname}
                       </span>
                    </div>
                   <blockquote className="text-[11px] text-text-secondary italic leading-relaxed border-l border-surface-border/60 pl-3">
                      "{ref.snippet}"
                   </blockquote>
                </div>
              ))}
           </div>
        </div>
      )}
    </div>
  );
}

/**
 * Calculate overall domain evidence strength
 */
function calculateDomainStrength(summary: DomainEvidenceSummary): EvidenceStrength {
  const successRate = summary.pagesAttempted > 0 ? summary.pagesFetched / summary.pagesAttempted : 0;
  const hasHighValue = summary.highValuePagesFound > 0;
  const hasSecurityLegal = summary.securityLegalPagesFound > 0;
  const hasContent = summary.totalUsefulChars > 1000;
  const hasIssues = summary.issues.some(i => i.type === "error");

  if (summary.blockReason) return "weak";
  if (successRate === 0) return "unknown";
  if (successRate < 0.3 || hasIssues) return "weak";
  if (successRate < 0.6 || !hasHighValue || !hasContent) return "limited";
  if (successRate < 0.8 || !hasSecurityLegal) return "medium";

  return "strong";
}

/**
 * Get configuration for field strength display
 */
function getFieldStrengthConfig(strength: EvidenceStrength) {
  const configs = {
    strong: {
      label: "Strong",
      badgeClass: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
    },
    medium: {
      label: "Medium",
      badgeClass: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
    },
    limited: {
      label: "Limited",
      badgeClass: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
    },
    weak: {
      label: "Weak",
      badgeClass: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
    },
    unknown: {
      label: "Unknown",
      badgeClass: "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20",
    },
  };
  return configs[strength];
}

/**
 * Get specific block reason message
 */
function getBlockReasonMessage(reason: BlockReason) {
  const messages = {
    blocked: (
      <div className="flex items-start gap-2 p-2 bg-rose-500/10 border border-rose-500/20 rounded">
        <LockIcon className="h-3 w-3 text-rose-600 dark:text-rose-400 mt-0.5" />
        <div className="text-xs text-rose-700 dark:text-rose-400">
          <div className="font-medium">Website blocked automated access</div>
          <div className="mt-1">We reached the site, but it refused automated access (403 Forbidden).</div>
        </div>
      </div>
    ),
    rate_limited: (
      <div className="flex items-start gap-2 p-2 bg-amber-500/10 border border-amber-500/20 rounded">
        <ClockIcon className="h-3 w-3 text-amber-600 dark:text-amber-400 mt-0.5" />
        <div className="text-xs text-amber-700 dark:text-amber-400">
          <div className="font-medium">Rate limited by website</div>
          <div className="mt-1">The site is limiting automated requests (429 Too Many Requests).</div>
        </div>
      </div>
    ),
    server_error: (
      <div className="flex items-start gap-2 p-2 bg-rose-500/10 border border-rose-500/20 rounded">
        <AlertCircleIcon className="h-3 w-3 text-rose-600 dark:text-rose-400 mt-0.5" />
        <div className="text-xs text-rose-700 dark:text-rose-400">
          <div className="font-medium">Server errors encountered</div>
          <div className="mt-1">The website is experiencing technical issues (5xx errors).</div>
        </div>
      </div>
    ),
    dns_error: (
      <div className="flex items-start gap-2 p-2 bg-rose-500/10 border border-rose-500/20 rounded">
        <GlobeIcon className="h-3 w-3 text-rose-600 dark:text-rose-400 mt-0.5" />
        <div className="text-xs text-rose-700 dark:text-rose-400">
          <div className="font-medium">Domain not found</div>
          <div className="mt-1">The domain name could not be resolved (DNS error).</div>
        </div>
      </div>
    ),
    timeout: (
      <div className="flex items-start gap-2 p-2 bg-amber-500/10 border border-amber-500/20 rounded">
        <ClockIcon className="h-3 w-3 text-amber-600 dark:text-amber-400 mt-0.5" />
        <div className="text-xs text-amber-700 dark:text-amber-400">
          <div className="font-medium">Request timeout</div>
          <div className="mt-1">The website took too long to respond.</div>
        </div>
      </div>
    ),
    no_content: (
      <div className="flex items-start gap-2 p-2 bg-amber-500/10 border border-amber-500/20 rounded">
        <FileTextIcon className="h-3 w-3 text-amber-600 dark:text-amber-400 mt-0.5" />
        <div className="text-xs text-amber-700 dark:text-amber-400">
          <div className="font-medium">No useful content found</div>
          <div className="mt-1">The pages were accessible but didn't contain meaningful content.</div>
        </div>
      </div>
    ),
  };

  return messages[reason] || null;
}

/**
 * Get recovery message based on evidence strength and block reason
 */
function getRecoveryMessage(strength: EvidenceStrength, blockReason?: BlockReason) {
  if (blockReason === "blocked") {
    return "The website blocked automated access. You can provide specific page URLs (like /security or /privacy) or continue manually.";
  }
  
  if (blockReason === "rate_limited") {
    return "The website is rate limiting automated access. Try providing specific page URLs or continue manually.";
  }

  if (strength === "unknown") {
    return "We couldn't collect any evidence from the domain. You can provide specific page URLs or continue manually.";
  }

  if (strength === "weak") {
    return "Limited evidence was collected. Some fields may need manual confirmation. You can add more evidence sources or continue manually.";
  }

  return "Some fields have limited evidence. You can add more sources or continue with the current evidence.";
}
