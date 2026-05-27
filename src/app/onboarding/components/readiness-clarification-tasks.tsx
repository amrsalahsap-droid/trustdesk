"use client";

import React from "react";
import { ArrowRightIcon, SparklesIcon, CheckIcon } from "@/components/icons";
import { AppCard, AppTypography, AppBadge } from "@/components/ui/app-design-system/primitives";
import { cn } from "@/lib/utils";
import type { RemediationTarget } from "../onboarding-review-interactions";
import type {
  GovernanceRemediationStatus,
  GovernanceTaskRemediationRecord,
} from "@/modules/workspaces/onboarding/governance-remediation-types";
import {
  enrichGovernanceTask,
  type PremiumRemediationTask,
} from "./governance-task-enrichment";

interface ClarificationTask {
  id?: string;
  task?: string;
  title?: string;
  reason?: string;
  description?: string;
  priority: "high" | "medium" | "low" | "HIGH" | "MEDIUM" | "LOW" | "CRITICAL";
  classification?: "blocker" | "enhancement";
  whyItMatters?: string;
  whatItUnlocks?: string;
  affectedRisks?: string[];
  confidenceDelta?: number;
  suggestedAction?: string;
  smartDefault?: string;
}

interface ReadinessClarificationTasksProps {
  tasks: ClarificationTask[];
  isCompactHeader?: boolean;
  customTitle?: string;
  customSubtitle?: string;
  showProTip?: boolean;
  taskRemediations?: Record<string, GovernanceTaskRemediationRecord>;
  onRemediate?: (target: RemediationTarget) => void;
}

const STATUS_LABELS: Record<GovernanceRemediationStatus, string> = {
  open: "Open",
  evidence_added: "Evidence Added",
  confirmed: "Confirmed",
  not_applicable: "Not Applicable",
  assigned: "Assigned",
};

const STATUS_VARIANT: Record<
  GovernanceRemediationStatus,
  "warning" | "success" | "muted" | "brand"
> = {
  open: "warning",
  evidence_added: "brand",
  confirmed: "success",
  not_applicable: "muted",
  assigned: "muted",
};

export function toRemediationTarget(task: PremiumRemediationTask): RemediationTarget {
  return {
    taskId: task.id,
    title: task.title,
    description: task.description,
    priority: task.priority,
    relatedPillar: task.relatedPillar,
    relatedRisks: task.relatedRisks,
    whyItMatters: task.whyItMatters,
    procurementBlockerImpact: task.procurementBlockerImpact,
    requestedEvidence: task.requestedEvidence,
    whatItUnlocks: task.whatItUnlocks,
    confidenceDelta: task.confidenceDelta,
    sourceRationale: task.sourceRationale,
  };
}

export function ReadinessClarificationTasks({
  tasks,
  isCompactHeader = false,
  customTitle,
  customSubtitle,
  showProTip = true,
  taskRemediations = {},
  onRemediate,
}: ReadinessClarificationTasksProps) {
  if (tasks.length === 0) return null;

  const enrichedTasks = tasks.map((t) =>
    enrichGovernanceTask(t as unknown as Record<string, unknown>),
  );
  const pendingCount = enrichedTasks.filter((task) => {
    const record = taskRemediations[task.id];
    return !record || !["confirmed", "not_applicable"].includes(record.status);
  }).length;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <AppTypography.SectionTitle
            className={cn(
              "font-black tracking-tight text-text-primary",
              isCompactHeader ? "!text-xl" : "!text-2xl",
            )}
          >
            {customTitle || "Governance Action Items"}
          </AppTypography.SectionTitle>
          <AppTypography.Metadata className="opacity-60 text-xs">
            {customSubtitle ||
              "High-impact remediation priorities required to address procurement blockers and unlock enterprise approvals."}
          </AppTypography.Metadata>
        </div>
        <AppBadge
          variant="warning"
          className="h-8 px-4 text-[10px] font-black uppercase tracking-wider bg-warning-amber/10 border-warning-amber/20 text-warning-amber"
        >
          {pendingCount} {pendingCount === 1 ? "Task" : "Tasks"} Pending
        </AppBadge>
      </div>

      <div className="space-y-6">
        {enrichedTasks.map((task) => {
          const remediation = taskRemediations[task.id];
          const status: GovernanceRemediationStatus = remediation?.status ?? "open";

          return (
            <AppCard
              key={task.id}
              className={cn(
                "p-6 bg-surface-base border transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_8px_30px_rgb(0,0,0,0.12)] relative overflow-hidden group",
                task.priority === "CRITICAL"
                  ? "border-error-red/20 hover:border-error-red/40"
                  : "border-warning-amber/20 hover:border-warning-amber/40",
              )}
            >
              <div
                className={cn(
                  "absolute top-0 right-0 w-64 h-64 rounded-full blur-[100px] pointer-events-none opacity-[0.03] transition-opacity group-hover:opacity-[0.06] duration-500",
                  task.priority === "CRITICAL" ? "bg-error-red" : "bg-warning-amber",
                )}
              />

              <div className="space-y-6 relative z-10">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div className="space-y-2 max-w-[80%]">
                    <div className="flex flex-wrap items-center gap-3">
                      <AppBadge
                        variant={task.priority === "CRITICAL" ? "error" : "warning"}
                        className={cn(
                          "text-[9px] font-black uppercase tracking-wider px-2.5 py-0.5 border shrink-0",
                          task.priority === "CRITICAL"
                            ? "bg-error-red/10 border-error-red/20 text-error-red"
                            : "bg-warning-amber/10 border-warning-amber/20 text-warning-amber",
                        )}
                      >
                        {task.priority} PRIORITY
                      </AppBadge>

                      <AppBadge variant={STATUS_VARIANT[status]} className="text-[9px] font-black uppercase tracking-wider">
                        {STATUS_LABELS[status]}
                      </AppBadge>

                      <span className="text-[10px] font-bold text-text-secondary/60 uppercase tracking-widest">
                        {task.relatedPillar}
                      </span>
                    </div>

                    <AppTypography.SectionTitle className="!text-lg font-black tracking-tight text-text-primary group-hover:text-warning-amber transition-colors">
                      {task.title}
                    </AppTypography.SectionTitle>
                  </div>

                  <div className="shrink-0 flex items-center gap-2 bg-success-emerald/5 border border-success-emerald/10 rounded-xl px-3 py-1.5 self-start sm:self-auto">
                    <div className="text-[9px] font-black text-success-emerald/60 uppercase tracking-widest">
                      Est. Boost
                    </div>
                    <div className="text-sm font-black text-success-emerald">+{task.confidenceDelta}%</div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4 rounded-xl bg-surface-subtle/30 border border-surface-border/40">
                  <div className="space-y-1.5">
                    <div className="text-[10px] font-black text-text-secondary/70 uppercase tracking-wider">
                      Executive Summary
                    </div>
                    <AppTypography.BodySm className="text-text-secondary leading-relaxed font-medium">
                      {task.description}
                    </AppTypography.BodySm>
                  </div>
                  <div className="space-y-1.5 border-t md:border-t-0 md:border-l border-surface-border/50 pt-4 md:pt-0 md:pl-6">
                    <div className="text-[10px] font-black text-text-secondary/70 uppercase tracking-wider">
                      Why This Matters
                    </div>
                    <AppTypography.BodySm className="text-text-secondary leading-relaxed font-medium">
                      {task.whyItMatters}
                    </AppTypography.BodySm>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[10px] font-black text-text-secondary/50 uppercase tracking-widest">
                      Triggered Risks:
                    </span>
                    {task.relatedRisks.map((risk, index) => (
                      <AppBadge
                        key={index}
                        variant="muted"
                        className="text-[9px] font-semibold py-0.5 px-2 bg-surface-subtle/50 text-text-secondary/80"
                      >
                        {risk}
                      </AppBadge>
                    ))}
                  </div>

                  <div className="text-xs font-medium text-text-secondary leading-relaxed border-l-2 border-error-red/30 pl-3">
                    <span className="font-black text-error-red/90 uppercase tracking-wide mr-1.5">
                      Procurement Impact:
                    </span>
                    {task.procurementBlockerImpact}
                  </div>
                </div>

                <hr className="border-surface-border/40" />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div className="space-y-1.5">
                    <div className="font-black text-text-secondary/70 uppercase tracking-wider text-[9px]">
                      Requested Evidence
                    </div>
                    <ul className="space-y-1 text-text-secondary">
                      {task.requestedEvidence.map((ev, idx) => (
                        <li key={idx} className="flex items-center gap-2 font-medium">
                          <span className="h-1.5 w-1.5 rounded-full bg-warning-amber" />
                          {ev}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="space-y-1.5">
                    <div className="font-black text-text-secondary/70 uppercase tracking-wider text-[9px]">
                      Expected Unlock
                    </div>
                    <div className="flex items-start gap-2 text-text-secondary font-medium leading-relaxed">
                      <CheckIcon className="h-4 w-4 text-success-emerald shrink-0 mt-0.5" />
                      <span>{task.whatItUnlocks}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end pt-2">
                  <button
                    type="button"
                    onClick={() => onRemediate?.(toRemediationTarget(task))}
                    className="flex items-center gap-2 px-4 py-2 text-xs font-black uppercase tracking-widest text-surface-base bg-text-primary rounded-xl transition-all duration-300 hover:bg-warning-amber hover:text-text-primary hover:shadow-md hover:scale-[1.02]"
                  >
                    <span>Remediate Control</span>
                    <ArrowRightIcon className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </AppCard>
          );
        })}
      </div>

      {showProTip && (
        <div className="p-6 rounded-2xl bg-intelligence-blue/5 border border-intelligence-blue/10 flex items-center gap-4">
          <div className="h-10 w-10 rounded-full bg-intelligence-blue/10 flex items-center justify-center text-intelligence-blue shrink-0">
            <SparklesIcon className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <div className="text-xs font-black text-intelligence-blue uppercase tracking-widest">
              Remediation Intelligence Pro-tip
            </div>
            <div className="text-xs text-text-secondary font-medium leading-relaxed">
              Providing the requested evidence for these governance action items will immediately clear critical
              procurement blockers, boosting your overall intelligence coverage by up to{" "}
              <span className="font-black text-success-emerald">+40%</span>.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
