"use client";

import React from "react";
import { AppCard, AppTypography, AppBadge } from "@/components/ui/app-design-system/primitives";
import { cn } from "@/lib/utils";
import { 
  DatabaseIcon, 
  ShieldCheckIcon, 
  GlobeIcon, 
  LockIcon, 
  EyeIcon, 
  SearchIcon,
  SparklesIcon,
  LinkIcon
} from "@/components/icons";
import { OperationalProfileView } from "@/modules/workspaces/onboarding/vendor-intelligence-types";

// Self-contained custom SVG icons for perfect resolution and control
function HardDriveIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
      <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
      <line x1="6" y1="6" x2="6.01" y2="6" />
      <line x1="6" y1="18" x2="6.01" y2="18" />
    </svg>
  );
}

function ShareIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" y1="2" x2="12" y2="15" />
    </svg>
  );
}

interface ReadinessOperationalProfileProps {
  profile: OperationalProfileView | null;
}

export function ReadinessOperationalProfile({ profile }: ReadinessOperationalProfileProps) {
  if (!profile) return null;

  const groups = [
    {
      title: "Data Architecture & Tenant Isolation",
      subtitle: "Verified core data flow, tenant models, and support parameters.",
      properties: [
        {
          label: "Customer Data Access",
          icon: DatabaseIcon,
          prop: profile.customerDataInteraction
        },
        {
          label: "Data Persistence",
          icon: HardDriveIcon,
          prop: profile.persistenceBehavior
        },
        {
          label: "Tenant Model",
          icon: LockIcon,
          prop: profile.tenantModel
        },
        {
          label: "Support Visibility",
          icon: EyeIcon,
          prop: profile.supportVisibility
        }
      ]
    },
    {
      title: "Integrations & Connectors",
      subtitle: "Authorized service connector boundaries and configuration discovery protocols.",
      properties: [
        {
          label: "Cloud Connector Scope",
          icon: LinkIcon,
          prop: profile.connectorScope
        },
        {
          label: "Infrastructure Interaction",
          icon: GlobeIcon,
          prop: profile.infrastructureInteraction
        },
        {
          label: "Scanning Behavior",
          icon: SearchIcon,
          prop: profile.scanningBehavior
        }
      ]
    },
    {
      title: "Operational & Admin Controls",
      subtitle: "AI interaction guidelines, export boundaries, and administrative visibility scopes.",
      properties: [
        {
          label: "AI Interaction Model",
          icon: SparklesIcon,
          prop: profile.aiInteractionModel
        },
        {
          label: "System Exportability",
          icon: ShareIcon,
          prop: profile.exportability
        },
        {
          label: "Administrative Scope",
          icon: ShieldCheckIcon,
          prop: profile.administrativeScope
        }
      ]
    }
  ];

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <AppTypography.SectionTitle className="!text-2xl font-black tracking-tight text-text-primary flex items-center gap-2">
          Operational Intelligence Profile
        </AppTypography.SectionTitle>
        <AppTypography.Metadata className="opacity-60 text-xs">
          Procurement-grade deep dive into data interactions, integrations, and architectural security boundaries.
        </AppTypography.Metadata>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 gap-6">
        {groups.map((group, idx) => (
          <AppCard key={idx} className="p-6 bg-surface-base border-surface-border/50 space-y-6 group relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 rounded-full blur-[60px] pointer-events-none bg-intelligence-blue/5 opacity-[0.02]" />
            
            <div className="space-y-1.5">
              <AppTypography.Metadata className="text-[10px] font-black uppercase tracking-widest text-intelligence-blue">
                {group.title}
              </AppTypography.Metadata>
              <p className="text-xs text-text-secondary/70 font-semibold">
                {group.subtitle}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {group.properties.map((item, i) => {
                if (!item) return null;
                const Icon = item.icon;
                const status = item.prop?.status || "unconfirmed";
                const value = item.prop?.value || "Not Identified";
                const evidence = item.prop?.evidence || "No evidence grounded.";

                return (
                  <div key={i} className="flex flex-col justify-between p-4 rounded-xl border border-surface-border/30 bg-surface-subtle/20 hover:border-intelligence-blue/20 hover:bg-surface-base transition-all duration-300 space-y-3">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="h-7 w-7 rounded-lg bg-surface-base border border-surface-border/50 flex items-center justify-center text-text-secondary shrink-0">
                          <Icon className="h-3.5 w-3.5" />
                        </div>

                        <AppBadge 
                          variant="outline" 
                          className={cn(
                            "text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded border bg-surface-base",
                            status === "confirmed" && "text-success-emerald border-success-emerald/20 bg-success-emerald/10",
                            status === "inferred" && "text-intelligence-blue border-intelligence-blue/20 bg-intelligence-blue/10",
                            status === "unconfirmed" && "text-text-secondary/60 border-surface-border bg-surface-subtle/40"
                          )}
                        >
                          {status}
                        </AppBadge>
                      </div>

                      <div className="space-y-1">
                        <div className="text-[9px] text-text-secondary/60 font-black uppercase tracking-widest">
                          {item.label}
                        </div>
                        <div className="text-xs font-black text-text-primary uppercase tracking-tight leading-snug">
                          {value}
                        </div>
                      </div>
                    </div>

                    <p className="text-[10px] text-text-secondary font-semibold leading-relaxed bg-surface-base/50 p-2 rounded-lg border border-surface-border/10">
                      {evidence}
                    </p>
                  </div>
                );
              })}
            </div>
          </AppCard>
        ))}
      </div>
    </div>
  );
}
