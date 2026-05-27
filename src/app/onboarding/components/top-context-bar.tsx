"use client";

import React from "react";
import { BrandMark } from "@/components/app-shell/brand-mark";
import { 
  AppIcon, 
  AppTypography, 
  AppMetadata,
  AppBadge
} from "@/components/ui/app-design-system/primitives";
import { 
  SparklesIcon, 
  GlobeIcon, 
  BuildingIcon, 
  LinkIcon,
  RefreshCwIcon
} from "@/components/icons";
import { cn } from "@/lib/utils";

interface TopContextBarProps {
  website?: string;
  industry?: string;
  confidence: number;
  evidenceCount: number;
  onReanalyze: () => void;
  className?: string;
}

export function TopContextBar({ 
  website, 
  industry, 
  confidence, 
  evidenceCount, 
  onReanalyze,
  className 
}: TopContextBarProps) {
  const displayUrl = website?.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");
  const displayConfidence = Math.round(confidence * 100);

  return (
    <div className={cn(
      "sticky top-0 z-[60] w-full bg-white/80 backdrop-blur-md border-b border-surface-border py-4 px-6 md:px-8 xl:px-12",
      className
    )}>
      <div className="max-w-[1240px] mx-auto flex items-center justify-between gap-6">
        {/* Left Side: Brand & Status */}
        <div className="flex items-center gap-6">
          <BrandMark size="sm" theme="light" href={null} />
          <div className="h-4 w-px bg-surface-border hidden md:block" />
          <div className="flex items-center gap-2.5">
            <div className="h-1.5 w-1.5 rounded-full bg-trust-green shadow-[0_0_8px_rgba(16,185,129,0.5)] animate-pulse" />
            <span className="text-[10px] font-black text-trust-green uppercase tracking-[0.2em] whitespace-nowrap">Intelligence Active</span>
          </div>
        </div>

        {/* Middle: Analysis Details (Horizontal Row) */}
        <div className="hidden lg:flex flex-1 items-center justify-center gap-8 text-[11px] font-bold text-text-primary">
          <div className="flex items-center gap-2 min-w-0">
            <AppIcon icon={GlobeIcon} size="xs" variant="muted" className="shrink-0" />
            <span className="truncate max-w-[140px]" title={displayUrl}>{displayUrl || "unknown domain"}</span>
          </div>
          
          <div className="h-3 w-px bg-surface-border" />
          
          <div className="flex items-center gap-2 min-w-0">
            <AppIcon icon={BuildingIcon} size="xs" variant="muted" className="shrink-0" />
            <span className="truncate max-w-[140px]" title={industry}>{industry || "SaaS"}</span>
          </div>
          
          <div className="h-3 w-px bg-surface-border" />
          
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 relative group">
              <div className="h-1 w-8 rounded-full bg-surface-border overflow-hidden">
                <div 
                  className={cn("h-full", confidence > 0.8 ? "bg-trust-green" : "bg-warning-amber")} 
                  style={{ width: `${displayConfidence}%` }}
                />
              </div>
              <span className={cn("cursor-help flex items-center gap-1", confidence > 0.8 ? "text-trust-green" : "text-warning-amber")}>
                {displayConfidence}% Coverage
                <div className="inline-flex items-center justify-center h-3 w-3 rounded-full border border-current text-[8px] font-black leading-none">?</div>
              </span>
              {/* Tooltip */}
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden w-64 rounded-xl bg-slate-900 border border-white/10 p-3 text-[11px] font-medium text-slate-300 shadow-2xl group-hover:block z-50 leading-relaxed normal-case tracking-normal text-white">
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-full border-4 border-transparent border-t-slate-900"></div>
                Coverage reflects extraction completeness and evidence discovery quality, not final procurement certainty.
              </div>
            </div>
          </div>
          
          <div className="h-3 w-px bg-surface-border" />
          
          <div className="flex items-center gap-2">
            <AppIcon icon={LinkIcon} size="xs" variant="muted" className="shrink-0" />
            <span>{evidenceCount} Citation{evidenceCount !== 1 ? 's' : ''}</span>
          </div>
        </div>

        {/* Right Side: Re-analyze Action */}
        <button
          onClick={onReanalyze}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-surface-border bg-surface-base text-[10px] font-black uppercase tracking-widest text-text-muted hover:text-intelligence-blue hover:border-intelligence-blue/30 transition-all group"
        >
          <RefreshCwIcon className="h-3 w-3 group-hover:rotate-180 transition-transform duration-500" />
          <span className="hidden sm:inline">Re-analyze</span>
        </button>
      </div>
    </div>
  );
}
