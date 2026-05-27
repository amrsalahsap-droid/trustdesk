"use client";

import React from "react";
import { BrandMark } from "@/components/app-shell/brand-mark";
import { 
  AppIcon, 
  AppTypography, 
  AppMetadata,
  AppSubSection,
  AppBadge,
  AppBodySm
} from "@/components/ui/app-design-system/primitives";
import { 
  SparklesIcon, 
  GlobeIcon, 
  BuildingIcon, 
  ShieldCheckIcon, 
  FolderIcon, 
  ShieldIcon,
  ArrowRightIcon,
  ActivityIcon,
  CheckIcon,
  ClockIcon,
  DownloadIcon
} from "@/components/icons";
import { cn } from "@/lib/utils";

interface OnboardingSidebarProps {
  currentStep: "DETAILS" | "DOMAIN_INPUT" | "ANALYZING" | "REVIEW" | "PROFILE" | "RECOMMENDATIONS";
  workspaceName?: string;
  website?: string;
  industry?: string;
  readinessScore?: number;
  onReanalyze?: () => void;
  onNavigate?: (step: any) => void;
}

export function OnboardingSidebar({ 
  currentStep, 
  workspaceName, 
  website, 
  industry, 
  readinessScore,
  onReanalyze,
  onNavigate 
}: OnboardingSidebarProps) {
  
  const stepNumber = {
    DETAILS: 1,
    DOMAIN_INPUT: 2,
    ANALYZING: 2,
    PROFILE: 2,
    REVIEW: 3,
    RECOMMENDATIONS: 3
  }[currentStep] || 1;

  const isIntelligenceStep = ["REVIEW", "RECOMMENDATIONS"].includes(currentStep);

  return (
    <div className="hidden lg:flex lg:w-[280px] xl:w-[320px] lg:shrink-0 flex-col relative overflow-hidden bg-brand-navy border-r border-white/5">
      {/* Background Decorators */}
      <div className="absolute top-0 right-0 -translate-y-1/2 translate-x-1/2 w-[400px] h-[400px] bg-intelligence-blue/15 rounded-full blur-[100px] pointer-events-none animate-pulse duration-[10s]" />
      <div className="absolute bottom-0 left-0 translate-y-1/2 -translate-x-1/2 w-[300px] h-[300px] bg-intelligence-blue/5 rounded-full blur-[80px] pointer-events-none" />

      <div className="relative flex flex-1 flex-col justify-between p-10 xl:p-12">
        <div className="space-y-12">
          <BrandMark size="lg" theme="dark" href={null} />

          {/* Context Zone */}
          <div className="space-y-10">
            {isIntelligenceStep ? (
              <div className="space-y-8 animate-in fade-in slide-in-from-left-4 duration-700">
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-trust-green shadow-[0_0_8px_rgba(16,185,129,0.5)] animate-pulse" />
                    <span className="text-[10px] font-black text-trust-green uppercase tracking-[0.3em]">Intelligence Active</span>
                  </div>
                  <AppTypography.HeroTitle className="!text-white !text-2xl xl:!text-3xl leading-tight">
                    Workspace <br/><span className="text-intelligence-blue">Context</span>
                  </AppTypography.HeroTitle>
                </div>

                <div className="space-y-6">
                  <SidebarInfoItem icon={GlobeIcon} label="Analyzed Domain" value={website} />
                  <SidebarInfoItem icon={BuildingIcon} label="Industry Segment" value={industry} />
                  {readinessScore !== undefined && (
                    <div className="space-y-2 relative group">
                      <div className="flex items-center justify-between">
                         <AppMetadata className="text-white/40 uppercase tracking-widest !text-[9px] cursor-help flex items-center gap-1">
                           Intelligence Coverage
                           <div className="inline-flex items-center justify-center h-3 w-3 rounded-full border border-white/20 bg-white/5 text-[8px] font-bold text-white/40 leading-none">?</div>
                         </AppMetadata>
                         <span className="text-[10px] font-bold text-white">{Math.round(readinessScore * 100)}%</span>
                      </div>
                      <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-intelligence-blue transition-all duration-1000 shadow-[0_0_8px_rgba(37,99,235,0.5)]" 
                          style={{ width: `${readinessScore * 100}%` }} 
                        />
                      </div>
                      {/* Tooltip */}
                      <div className="absolute bottom-full left-0 mb-2 hidden w-60 rounded-xl bg-slate-900 border border-white/10 p-3 text-[11px] font-medium text-slate-300 shadow-2xl group-hover:block z-50 leading-relaxed normal-case tracking-normal">
                        <div className="absolute bottom-0 left-6 translate-y-full border-4 border-transparent border-t-slate-900"></div>
                        Coverage reflects extraction completeness and evidence discovery quality, not final procurement certainty.
                      </div>
                    </div>
                  )}
                </div>

                {/* Quick Navigation */}
                <div className="pt-8 border-t border-white/5 space-y-4">
                   <AppMetadata className="text-white/20 uppercase tracking-widest !text-[9px]">Quick Navigation</AppMetadata>
                   <nav className="space-y-4">
                      <QuickNavLink icon={ActivityIcon} label="Intelligence Panel" active />
                      <QuickNavLink icon={FolderIcon} label="Trust Library" />
                      <QuickNavLink icon={ShieldIcon} label="Evidence Map" />
                   </nav>
                </div>

                <button 
                  onClick={onReanalyze}
                  className="w-full py-4 rounded-xl border border-white/10 text-white/60 hover:text-white hover:bg-white/5 transition-all text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-2 group"
                >
                  <SparklesIcon className="h-3 w-3 group-hover:rotate-12 transition-transform" />
                  Re-analyze Domain
                </button>
              </div>
            ) : (
              <div className="space-y-8 animate-in fade-in duration-1000">
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-intelligence-blue shadow-[0_0_8px_rgba(37,99,235,0.5)]" />
                    <span className="text-[10px] font-black text-intelligence-blue uppercase tracking-[0.3em]">System Initializing</span>
                  </div>
                  <AppTypography.HeroTitle className="!text-white !text-2xl xl:!text-3xl leading-tight">
                    {currentStep === "DETAILS" ? (
                      <>Establish your <br/><span className="text-intelligence-blue">secure ops.</span></>
                    ) : (
                      <>Complete your <br/><span className="text-intelligence-blue">Trust Profile.</span></>
                    )}
                  </AppTypography.HeroTitle>
                </div>

                {currentStep === "DETAILS" ? (
                  <ul className="space-y-8">
                    <SidebarFeatureItem 
                      icon={ShieldCheckIcon} 
                      title="Tenant isolation" 
                      desc="Your data is isolated at the database level." 
                    />
                    <SidebarFeatureItem 
                      icon={ClockIcon} 
                      title="Audit trail" 
                      desc="Every action is recorded for compliance." 
                    />
                  </ul>
                ) : (
                   <AppTypography.BodySm className="text-white/50 text-base leading-relaxed">
                    We&apos;ve created your workspace <span className="text-white font-bold">&ldquo;{workspaceName || "New Workspace"}&rdquo;</span>. Let&apos;s build your trust foundations.
                  </AppTypography.BodySm>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="h-px w-12 bg-intelligence-blue/50" />
          <AppMetadata className="text-white/40 uppercase tracking-widest !text-[9px]">Step {stepNumber} of 3</AppMetadata>
        </div>
      </div>
    </div>
  );
}

function SidebarInfoItem({ icon, label, value }: { icon: any, label: string, value?: string }) {
  if (!value) return null;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 opacity-40">
        <AppIcon icon={icon} size="xs" />
        <AppMetadata className="text-white uppercase tracking-widest !text-[8px]">{label}</AppMetadata>
      </div>
      <AppSubSection className="!text-white !text-xs truncate">{value}</AppSubSection>
    </div>
  );
}

function SidebarFeatureItem({ icon, title, desc }: { icon: any, title: string, desc: string }) {
  return (
    <li className="flex items-start gap-4 group">
      <AppIcon icon={icon} variant="navy" size="xs" filled className="group-hover:scale-110 transition-transform mt-0.5" />
      <div className="space-y-1">
        <AppSubSection className="!text-white !text-sm">{title}</AppSubSection>
        <AppBodySm className="text-white/50 !text-[12px] leading-snug">
          {desc}
        </AppBodySm>
      </div>
    </li>
  );
}

function QuickNavLink({ icon, label, active = false }: { icon: any, label: string, active?: boolean }) {
  return (
    <div className={cn(
      "flex items-center gap-3 text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer group",
      active ? "text-white" : "text-white/40 hover:text-white"
    )}>
      <AppIcon icon={icon} size="xs" className={cn("transition-opacity", active ? "opacity-100" : "opacity-40 group-hover:opacity-100")} />
      {label}
      {active && <div className="h-1 w-1 rounded-full bg-intelligence-blue ml-auto shadow-[0_0_6px_rgba(37,99,235,0.8)]" />}
    </div>
  );
}
