import { SparklesIcon, ShieldCheckIcon, LinkIcon, ActivityIcon } from "@/components/icons";
import { cn } from "@/lib/utils";
import { type Capability, type ProcurementRiskArea, type Signal } from "@/modules/workspaces/onboarding/website-analysis-service";
import { AppCard, AppTypography, AppIcon } from "@/components/ui/app-design-system/primitives";

interface TrustIntelligenceHeroProps {
  companyName?: string;
  isReady: boolean;
  needsReviewCount: number;
  signals: {
    businessDomain?: Signal<string>;
    productType?: Signal<string[]>;
    structuredCapabilities?: Signal<Capability[]>;
    procurementRiskAreas?: Signal<ProcurementRiskArea[]>;
  };
  evidenceCount: number;
  confidence: number;
  topicsCount?: number;
  clarificationTasksCount?: number;
}

export function TrustIntelligenceHero({ 
  companyName, 
  isReady, 
  needsReviewCount,
  signals,
  evidenceCount,
  confidence,
  topicsCount = 0,
  clarificationTasksCount = 0,
}: TrustIntelligenceHeroProps) {
  
  const generateNarrative = () => {
    const domain = signals.businessDomain?.value || "technology";
    const type = signals.productType?.value?.[0] || "SaaS";
    const caps = signals.structuredCapabilities?.value?.slice(0, 3).map(c => c.label) || [];

    let text = `TrustDesk identified ${companyName || "your company"} as a ${domain} ${type} platform`;
    
    if (caps.length > 0) {
      text += ` focused on ${caps.join(", ")}${caps.length > 2 ? "," : ""} and related security workflows.`;
    } else {
      text += ".";
    }

    return text;
  };

  const narrative = generateNarrative();
  const displayConfidence = Math.round(confidence * 100);

  return (
    <AppCard variant="intelligence" className="!p-0 group relative border-white/5 overflow-hidden shadow-2xl">
      {/* Premium Gradient Overlays - Subtle & Focused */}
      <div className="absolute top-0 right-0 -mr-32 -mt-32 h-[400px] w-[400px] rounded-full bg-intelligence-blue/10 blur-[100px] transition-transform duration-[15s] group-hover:scale-105 pointer-events-none" />
      <div className="absolute bottom-0 left-0 -ml-24 -mb-24 h-[300px] w-[300px] rounded-full bg-trust-green/5 blur-[80px] pointer-events-none" />
      
      {/* Subtle Grid Pattern */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff03_1px,transparent_1px),linear-gradient(to_bottom,#ffffff03_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_80%_80%_at_50%_0%,#000_70%,transparent_100%)] pointer-events-none" />
      
      <div className="relative flex flex-col">
        {/* Main Content Area: Horizontal Layout */}
        <div className="p-8 md:p-12 lg:p-16 flex flex-col lg:flex-row lg:items-center justify-between gap-12">
          <div className="flex-1 space-y-8">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <AppIcon icon={SparklesIcon} variant="navy" filled size="xs" className="bg-intelligence-blue text-white shadow-[0_0_15px_rgba(37,99,235,0.3)] border-none" />
                <div className="flex items-center gap-2.5">
                  <AppTypography.Eyebrow className="!text-intelligence-blue !tracking-[0.25em] !text-[10px]">Trust Intelligence</AppTypography.Eyebrow>
                  <div className="h-1.5 w-1.5 rounded-full bg-trust-green/40" />
                  <span className="text-[10px] font-black text-trust-green/80 uppercase tracking-widest">Analysis Verified</span>
                </div>
              </div>
              <AppTypography.HeroTitle className="!text-white !text-3xl lg:!text-5xl leading-tight tracking-tight">
                Workspace <span className="text-intelligence-blue">Active.</span>
              </AppTypography.HeroTitle>
            </div>

            <AppTypography.Body className="!text-slate-400 text-lg md:text-xl xl:text-2xl max-w-[800px] font-medium leading-relaxed">
              {narrative}
            </AppTypography.Body>
          </div>

          {/* Performance Metrics Row - Consistently horizontal on desktop */}
          <div className="flex flex-wrap items-center gap-x-12 gap-y-8 shrink-0 border-t lg:border-t-0 lg:border-l border-white/10 pt-8 lg:pt-0 lg:pl-16">
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <div className="h-2 w-32 rounded-full bg-white/5 overflow-hidden">
                  <div 
                    className={cn(
                      "h-full transition-all duration-1000 ease-out",
                      confidence > 0.8 ? "bg-trust-green" : confidence > 0.6 ? "bg-warning-amber" : "bg-error-red"
                    )}
                    style={{ width: `${displayConfidence}%` }}
                  />
                </div>
                <span className="text-base font-black text-white">{displayConfidence}%</span>
              </div>
              <AppTypography.Metadata className="!text-slate-500 !tracking-widest !text-[10px]">Match Precision</AppTypography.Metadata>
            </div>

            <div className="h-10 w-px bg-white/10 hidden sm:block" />

            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3 text-white">
                <AppIcon icon={LinkIcon} className="text-intelligence-blue" size="xs" />
                <span className="text-base font-black">{evidenceCount}</span>
              </div>
              <AppTypography.Metadata className="!text-slate-500 !tracking-widest !text-[10px]">Verified Sources</AppTypography.Metadata>
            </div>

            <div className="h-10 w-px bg-white/10 hidden xl:block" />

            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3 text-white">
                <AppIcon icon={ActivityIcon} className="text-intelligence-blue" size="xs" />
                <span className="text-base font-black">{topicsCount}</span>
              </div>
              <AppTypography.Metadata className="!text-slate-500 !tracking-widest !text-[10px]">Trust Topics</AppTypography.Metadata>
            </div>

            <div className="h-10 w-px bg-white/10 hidden xl:block" />

            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3 text-white">
                <SparklesIcon className="h-4 w-4 text-intelligence-blue" />
                <span className="text-base font-black">{clarificationTasksCount}</span>
              </div>
              <AppTypography.Metadata className="!text-slate-500 !tracking-widest !text-[10px]">Clarifications</AppTypography.Metadata>
            </div>
          </div>
        </div>

        {/* Action/Review Strip - Very Compact */}
        {needsReviewCount > 0 && (
          <div className="px-6 md:px-10 lg:px-12 py-4 bg-white/[0.02] border-t border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="h-1.5 w-1.5 rounded-full bg-warning-amber animate-pulse shadow-[0_0_10px_rgba(245,158,11,0.5)]" />
              <AppTypography.Metadata className="!text-warning-amber font-black tracking-widest !text-[10px]">
                {needsReviewCount} DECISIONS PENDING REVIEW
              </AppTypography.Metadata>
            </div>
            <AppTypography.Metadata className="!text-slate-500 font-medium italic !text-[10px]">
              Finalize these items to complete your trust foundation.
            </AppTypography.Metadata>
          </div>
        )}
      </div>
    </AppCard>
  );


}
