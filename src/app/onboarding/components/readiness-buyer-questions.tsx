"use client";

import React from "react";
import { HelpCircleIcon, AlertCircleIcon, ShieldIcon, FileTextIcon, CheckIcon, ZapIcon, PlusIcon } from "@/components/icons";
import { AppCard, AppTypography, AppBadge, AppButton } from "@/components/ui/app-design-system/primitives";
import { cn } from "@/lib/utils";
import { BuyerQuestionView } from "@/modules/workspaces/onboarding/vendor-intelligence-types";

interface ReadinessBuyerQuestionsProps {
  questions: BuyerQuestionView[];
  onAddEvidence?: (question: BuyerQuestionView) => void;
  onCreateAnswerDraft?: (question: BuyerQuestionView) => void;
}

export function ReadinessBuyerQuestions({ questions, onAddEvidence, onCreateAnswerDraft }: ReadinessBuyerQuestionsProps) {
  const [activeTab, setActiveTab] = React.useState<"ALL" | "LIKELY" | "SPECULATIVE">("ALL");
  const allQuestions = questions || [];

  // Filter based on active tab
  const filteredQuestions = allQuestions.filter(q => {
    if (activeTab === "ALL") return true;
    return q.likelihood === activeTab;
  });

  // Group by concern domain
  const domains = Array.from(new Set(filteredQuestions.map(q => q.concernDomain)));

  if (allQuestions.length === 0) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <AppTypography.SectionTitle className="!text-xl font-black">Likely Enterprise Questions</AppTypography.SectionTitle>
          <AppTypography.Metadata className="opacity-50">
            Simulated procurement questionnaire items predicted based on active operational semantics.
          </AppTypography.Metadata>
        </div>

        {/* Tab Filters */}
        <div className="flex p-1 rounded-xl bg-surface-muted/60 border border-surface-border/50 self-start">
          <TabButton active={activeTab === "ALL"} onClick={() => setActiveTab("ALL")} count={allQuestions.length}>
            All
          </TabButton>
          <TabButton 
            active={activeTab === "LIKELY"} 
            onClick={() => setActiveTab("LIKELY")} 
            count={allQuestions.filter(q => q.likelihood === "LIKELY").length}
          >
            Likely Concerns
          </TabButton>
          <TabButton 
            active={activeTab === "SPECULATIVE"} 
            onClick={() => setActiveTab("SPECULATIVE")} 
            count={allQuestions.filter(q => q.likelihood === "SPECULATIVE").length}
          >
            Speculative
          </TabButton>
        </div>
      </div>

      <div className="space-y-8">
        {domains.map(domain => {
          const domainQuestions = filteredQuestions.filter(q => q.concernDomain === domain);
          if (domainQuestions.length === 0) return null;

          return (
            <div key={domain} className="space-y-4">
              <div className="flex items-center gap-2 border-b border-surface-border/20 pb-2">
                <div className="h-2 w-2 rounded-full bg-intelligence-blue" />
                <span className="text-[10px] font-black uppercase tracking-widest text-text-primary">
                  {domain}
                </span>
                <span className="text-[10px] font-bold text-text-muted">
                  ({domainQuestions.length} simulated item{domainQuestions.length !== 1 ? "s" : ""})
                </span>
              </div>

              <div className="grid grid-cols-1 gap-4">
                {domainQuestions.map(q => (
                  <QuestionCard 
                    key={q.id} 
                    q={q} 
                    onAddEvidence={onAddEvidence}
                    onCreateAnswerDraft={onCreateAnswerDraft}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TabButton({ active, onClick, count, children }: { active: boolean; onClick: () => void; count: number; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer",
        active 
          ? "bg-surface-base text-text-primary shadow-sm border border-surface-border/30" 
          : "text-text-muted hover:text-text-primary"
      )}
    >
      {children}
      <span className={cn(
        "px-1.5 py-0.25 rounded text-[8px] font-bold",
        active ? "bg-intelligence-blue/10 text-intelligence-blue" : "bg-surface-muted text-text-muted"
      )}>
        {count}
      </span>
    </button>
  );
}

function QuestionCard({ q, onAddEvidence, onCreateAnswerDraft }: { q: BuyerQuestionView; onAddEvidence?: (question: BuyerQuestionView) => void; onCreateAnswerDraft?: (question: BuyerQuestionView) => void }) {
  const [expanded, setExpanded] = React.useState(false);

  return (
    <AppCard className="border-surface-border/40 hover:border-intelligence-blue/20 transition-all duration-300">
      <div className="p-5 space-y-4">
        {/* Header Summary */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="h-8 w-8 rounded-lg bg-intelligence-blue/5 text-intelligence-blue flex items-center justify-center border border-intelligence-blue/10 mt-0.5 shrink-0">
              <HelpCircleIcon className="h-4 w-4" />
            </div>
            <div className="space-y-1">
              <h4 className="text-[13px] font-black text-text-primary leading-snug cursor-pointer hover:text-intelligence-blue transition-colors" onClick={() => setExpanded(!expanded)}>
                {q.question}
              </h4>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[9px] font-black uppercase tracking-wider text-intelligence-blue">
                  {q.concernDomain}
                </span>
                <span className="text-text-muted text-[10px]">•</span>
                <span className="text-[9px] font-medium text-text-muted">
                  Likelihood: <span className={cn("font-bold uppercase", q.likelihood === "LIKELY" ? "text-trust-green" : "text-amber-500")}>{q.likelihood}</span>
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <AppBadge
              variant="muted"
              className={cn(
                "h-5 text-[8px] font-black uppercase tracking-wide",
                q.importance === "CRITICAL" && "bg-error-red/5 border-error-red/10 text-error-red",
                q.importance === "HIGH" && "bg-warning-amber/5 border-warning-amber/10 text-warning-amber",
                q.importance === "MEDIUM" && "bg-intelligence-blue/5 border-intelligence-blue/10 text-intelligence-blue"
              )}
            >
              {q.importance}
            </AppBadge>

            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className="text-[10px] font-black uppercase tracking-widest text-intelligence-blue hover:text-intelligence-blue/80 transition-colors p-1 cursor-pointer"
            >
              {expanded ? "Collapse" : "Expand"}
            </button>
          </div>
        </div>

        {/* Expanded Details */}
        {expanded && (
          <div className="pt-4 border-t border-surface-border/20 space-y-4 animate-fadeIn">
            {/* Buyer Concern Summary */}
            <div className="p-3.5 rounded-xl bg-surface-muted/30 border border-surface-border/20 space-y-1.5">
              <div className="flex items-center gap-1.5">
                <AlertCircleIcon className="h-3.5 w-3.5 text-warning-amber shrink-0" />
                <span className="text-[9px] font-black uppercase tracking-widest text-warning-amber">
                  Why Buyers Ask This
                </span>
              </div>
              <p className="text-[11px] font-medium leading-relaxed text-text-primary">
                {q.whyBuyersAskThis}
              </p>
            </div>

            {/* Assessment Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-[11px]">
              {/* Expected Maturity */}
              <div className="space-y-1 p-3 rounded-xl bg-surface-muted/20 border border-surface-border/20">
                <span className="text-[9px] font-black uppercase tracking-wide text-text-muted">Expected Answer Maturity</span>
                <div className="pt-0.5">
                  <span className={cn(
                    "inline-block px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wide",
                    q.expectedAnswerMaturity === "ADVANCED" && "bg-trust-green/10 text-trust-green",
                    q.expectedAnswerMaturity === "STANDARD" && "bg-warning-amber/10 text-warning-amber",
                    q.expectedAnswerMaturity === "DEVELOPING" && "bg-error-red/10 text-error-red"
                  )}>
                    {q.expectedAnswerMaturity}
                  </span>
                </div>
              </div>

              {/* Current Answer Readiness */}
              <div className="space-y-1 p-3 rounded-xl bg-surface-muted/20 border border-surface-border/20">
                <span className="text-[9px] font-black uppercase tracking-wide text-text-muted">Answer Readiness</span>
                <div className="pt-0.5 flex items-center justify-between">
                  <span className={cn(
                    "inline-block px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wide",
                    q.answerReadiness === "ready" && "bg-trust-green/10 text-trust-green",
                    q.answerReadiness === "needs_evidence" && "bg-warning-amber/10 text-warning-amber",
                    q.answerReadiness === "blocked" && "bg-error-red/10 text-error-red"
                  )}>
                    {q.answerReadiness ? q.answerReadiness.replace("_", " ") : "Unknown"}
                  </span>
                  {q.currentAnswerConfidence !== undefined && (
                    <span className="text-[10px] font-bold text-text-muted">
                      {Math.round(q.currentAnswerConfidence * 100)}% Confidence
                    </span>
                  )}
                </div>
              </div>

              {/* Confidence Driver */}
              <div className="col-span-1 md:col-span-2 space-y-1 p-3 rounded-xl bg-surface-muted/20 border border-surface-border/20">
                <span className="text-[9px] font-black uppercase tracking-wide text-text-muted">Confidence Driver</span>
                <p className="text-text-primary leading-tight font-medium">{q.confidenceDriver}</p>
              </div>
            </div>

            {/* Mappings */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-[11px] pt-2">
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <ShieldIcon className="h-3 w-3 text-text-muted" />
                  <span className="text-[9px] font-black uppercase tracking-wide text-text-muted">Related Risk Areas</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {q.relatedRisks.map((r, i) => (
                    <span key={i} className="px-2 py-0.5 rounded bg-surface-muted text-text-secondary text-[10px] border border-surface-border/50">
                      {r}
                    </span>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <FileTextIcon className="h-3 w-3 text-text-muted" />
                  <span className="text-[9px] font-black uppercase tracking-wide text-text-muted">Related Evidence Gaps</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(q.relatedEvidenceGaps || q.relatedEvidence).map((e, i) => (
                    <span key={i} className="px-2 py-0.5 rounded bg-surface-muted text-text-secondary text-[10px] border border-surface-border/50">
                      {e}
                    </span>
                  ))}
                </div>
              </div>
              
              {q.relatedTrustTopics && q.relatedTrustTopics.length > 0 && (
                <div className="space-y-2 col-span-1 md:col-span-2">
                  <div className="flex items-center gap-1.5">
                    <CheckIcon className="h-3 w-3 text-text-muted" />
                    <span className="text-[9px] font-black uppercase tracking-wide text-text-muted">Related Trust Topics</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {q.relatedTrustTopics.map((t, i) => (
                      <span key={i} className="px-2 py-0.5 rounded bg-trust-green/5 text-trust-green text-[10px] border border-trust-green/10">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Actionable Bottom Section */}
            <div className="mt-4 pt-4 border-t border-surface-border/20">
              {q.answerReadiness === "blocked" || (q.missingEvidence && q.missingEvidence.length > 0) ? (
                <div className="space-y-3">
                  <div className="p-3 rounded-lg bg-error-red/5 border border-error-red/10 flex items-start gap-2">
                    <AlertCircleIcon className="h-4 w-4 text-error-red shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-error-red">Answer draft blocked until evidence is added or confirmed.</p>
                      {q.missingEvidence && q.missingEvidence.length > 0 && (
                        <div className="text-[11px] text-error-red/80">
                          Missing: {q.missingEvidence.join(", ")}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <AppButton 
                      variant="error" 
                      size="sm" 
                      className="h-8 text-[10px]"
                      onClick={() => onAddEvidence?.(q)}
                    >
                      <PlusIcon className="h-3 w-3 mr-1.5" />
                      Add Evidence
                    </AppButton>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {q.suggestedAnswerSkeleton && (
                    <div className="p-3 rounded-lg bg-intelligence-blue/5 border border-intelligence-blue/10 space-y-1.5">
                      <div className="text-[9px] font-black uppercase tracking-widest text-intelligence-blue">
                        Suggested Answer Skeleton
                      </div>
                      <p className="text-xs text-text-secondary italic">
                        "{q.suggestedAnswerSkeleton}"
                      </p>
                    </div>
                  )}
                  <div className="flex justify-end">
                    <AppButton 
                      variant="brand" 
                      size="sm" 
                      className="h-8 text-[10px]"
                      onClick={() => onCreateAnswerDraft?.(q)}
                    >
                      <ZapIcon className="h-3 w-3 mr-1.5" />
                      Create Answer Draft
                    </AppButton>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </AppCard>
  );
}
