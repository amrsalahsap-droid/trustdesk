"use client";

import React from "react";
import { 
  DatabaseIcon, 
  ShieldCheckIcon, 
  LinkIcon, 
  GlobeIcon, 
  LockIcon, 
  EyeIcon, 
  SearchIcon
} from "@/components/icons";
import { AppCard, AppTypography } from "@/components/ui/app-design-system/primitives";
import { cn } from "@/lib/utils";

import { OperationalSignalView } from "@/modules/workspaces/onboarding/vendor-intelligence-types";

interface ReadinessOperationalModelProps {
  operationalModel: OperationalSignalView[];
}

export function ReadinessOperationalModel({ operationalModel }: ReadinessOperationalModelProps) {
  const iconMap: Record<string, any> = {
    "Data Access": LockIcon,
    "Sensitive Processing": EyeIcon,
    "Data Storage": DatabaseIcon,
    "Infra Scanning": SearchIcon,
    "AI Usage": ShieldCheckIcon,
    "Integrations": LinkIcon,
  };

  const items = (operationalModel || []).map(sig => ({
    label: sig.label,
    value: sig.value,
    icon: iconMap[sig.label] || GlobeIcon,
    uncertain: sig.confidence < 0.85
  }));

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <AppTypography.SectionTitle className="!text-xl font-black">Technical Governance Profile</AppTypography.SectionTitle>
        <AppTypography.Metadata className="opacity-50">Architectural and operational patterns identified for security compliance mapping.</AppTypography.Metadata>
      </div>

      <AppCard className="p-8 bg-surface-base border-surface-border/50">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-y-10 gap-x-12">
          {items.map((item, i) => (
            <div key={i} className="flex gap-5 group">
              <div className="h-12 w-12 rounded-2xl bg-surface-base border border-surface-border/50 flex items-center justify-center text-text-muted group-hover:text-intelligence-blue group-hover:border-intelligence-blue/20 transition-all shadow-sm">
                <item.icon className="h-5 w-5" />
              </div>
              <div className="space-y-1.5 flex-1 min-w-0">
                <div className="text-[10px] text-text-muted uppercase font-black tracking-widest">{item.label}</div>
                <div className={cn(
                  "text-sm font-black uppercase tracking-tight transition-colors",
                  item.uncertain ? "text-warning-amber" : "text-text-primary group-hover:text-intelligence-blue"
                )}>
                  {item.value}
                </div>
                <div className="h-1 w-8 rounded-full bg-surface-border/30 group-hover:bg-intelligence-blue/30 transition-all" />
              </div>
            </div>
          ))}
        </div>
      </AppCard>
    </div>
  );
}
