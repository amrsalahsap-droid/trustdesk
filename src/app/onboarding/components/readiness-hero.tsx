"use client";

import React from "react";
import { SparklesIcon, GlobeIcon, ShieldCheckIcon, LinkIcon, AlertCircleIcon } from "@/components/icons";
import { AppCard, AppTypography, AppIcon } from "@/components/ui/app-design-system/primitives";
import { cn } from "@/lib/utils";
import { Signal } from "@/modules/workspaces/onboarding/website-analysis-service";

interface ReadinessHeroProps {
  companyName: string;
  domain: string;
  businessSummary: string;
  confidence: number;
  evidencePoints: number;
  securityPillarsIdentifiedCount: number;
  totalRelevantTopicsCount: number;
  autoReadyTopicsCount: number;
  clarificationTasksCount: number;
  evidenceNeedsCount: number;
  onReanalyze: () => void;
  onExplore: () => void;
}

export function ReadinessHero({
  companyName,
  domain,
  businessSummary,
  confidence,
  evidencePoints,
  securityPillarsIdentifiedCount,
  totalRelevantTopicsCount,
  autoReadyTopicsCount,
  clarificationTasksCount,
  evidenceNeedsCount,
  onReanalyze,
  onExplore
}: ReadinessHeroProps) {
  const displayConfidence = Math.round(confidence * 100);

  return (
    <AppCard variant="intelligence" className="!p-0 group relative border-white/5 overflow-hidden shadow-2xl bg-slate-950">
      {/* Background Effects */}
      <div className="absolute top-0 right-0 -mr-32 -mt-32 h-[400px] w-[400px] rounded-full bg-intelligence-blue/10 blur-[100px] pointer-events-none" />
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff03_1px,transparent_1px),linear-gradient(to_bottom,#ffffff03_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_80%_80%_at_50%_0%,#000_70%,transparent_100%)] pointer-events-none" />

      <div className="relative p-8 md:p-12 lg:p-16">
        <div className="flex flex-col lg:flex-row gap-12 justify-between">
          <div className="flex-1 space-y-8">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-intelligence-blue/20 border border-intelligence-blue/30">
                   <GlobeIcon className="h-3 w-3 text-intelligence-blue" />
                   <span className="text-[10px] font-black text-intelligence-blue uppercase tracking-widest">{domain}</span>
                </div>
                <div className="h-1.5 w-1.5 rounded-full bg-white/20" />
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Workspace Readiness Review</span>
              </div>
              <AppTypography.HeroTitle className="!text-white !text-3xl lg:!text-5xl tracking-tight">
                Strategic Readiness <span className="text-intelligence-blue">Review.</span>
              </AppTypography.HeroTitle>
            </div>

            <AppTypography.Body className="!text-slate-400 text-lg md:text-xl font-medium leading-relaxed max-w-3xl">
              {businessSummary}
            </AppTypography.Body>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 pt-4">
               <div className="space-y-1">
                 <HeroMetric label="Security Pillars" value={securityPillarsIdentifiedCount} icon={ShieldCheckIcon} />
               </div>
               <div className="space-y-1">
                 <HeroMetric label="Trust Topics" value={totalRelevantTopicsCount} icon={ShieldCheckIcon} />
                 <AppTypography.Metadata className="!text-slate-500 !text-[9px] pl-14 font-bold uppercase tracking-wider opacity-60">
                   {autoReadyTopicsCount} Ready · {totalRelevantTopicsCount - autoReadyTopicsCount} Review
                 </AppTypography.Metadata>
               </div>
               <HeroMetric label="Evidence Needs" value={evidenceNeedsCount} icon={AlertCircleIcon} color="amber" />
               <HeroMetric label="Clarification" value={clarificationTasksCount} icon={AlertCircleIcon} color="amber" />
            </div>
          </div>

          <div className="lg:w-72 space-y-6 lg:pl-12 lg:border-l border-white/10">
            <div className="space-y-3 relative group">
              <div className="flex items-center justify-between">
                <AppTypography.Metadata className="!text-slate-500 !tracking-widest !text-[10px] uppercase font-bold cursor-help flex items-center gap-1">
                  Intelligence Coverage
                  <div className="inline-flex items-center justify-center h-3.5 w-3.5 rounded-full border border-white/10 bg-white/5 text-[9px] font-bold text-white/40 leading-none">?</div>
                </AppTypography.Metadata>
                <span className="text-sm font-black text-white">{displayConfidence}%</span>
              </div>
              <div className="h-2 w-full rounded-full bg-white/5 overflow-hidden">
                <div 
                  className={cn(
                    "h-full transition-all duration-1000",
                    confidence > 0.8 ? "bg-trust-green" : confidence > 0.6 ? "bg-warning-amber" : "bg-error-red"
                  )}
                  style={{ width: `${displayConfidence}%` }}
                />
              </div>
              {/* Tooltip */}
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden w-64 rounded-xl bg-slate-900 border border-white/10 p-3 text-[11px] font-medium text-slate-300 shadow-2xl group-hover:block z-50 leading-relaxed normal-case tracking-normal">
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-full border-4 border-transparent border-t-slate-900"></div>
                Coverage reflects extraction completeness and evidence discovery quality, not final procurement certainty.
              </div>
            </div>

            <button 
              onClick={onExplore}
              className="w-full py-3 rounded-xl bg-intelligence-blue text-white text-xs font-black transition-all uppercase tracking-widest shadow-[0_0_20px_rgba(37,99,235,0.2)] hover:shadow-[0_0_25px_rgba(37,99,235,0.4)]"
            >
              <div className="flex items-center justify-center gap-2">
                <SparklesIcon className="h-3.5 w-3.5" />
                Explore Intelligence
              </div>
            </button>
            
            <AppTypography.Metadata className="text-center block !text-slate-500 !text-[10px] font-bold uppercase tracking-widest opacity-60">
              {evidencePoints} Source Points Grounded
            </AppTypography.Metadata>
          </div>
        </div>
      </div>
    </AppCard>
  );
}


function HeroMetric({ label, value, icon: Icon, color = "blue" }: { label: string, value: number, icon: any, color?: "blue" | "amber" }) {
  const colorMap = {
    blue: "text-intelligence-blue bg-intelligence-blue/10 border-intelligence-blue/20",
    amber: "text-warning-amber bg-warning-amber/10 border-warning-amber/20"
  };

  return (
    <div className="flex items-center gap-3">
      <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center border", colorMap[color])}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <div className="text-lg font-black text-white">{value}</div>
        <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">{label}</div>
      </div>
    </div>
  );
}
