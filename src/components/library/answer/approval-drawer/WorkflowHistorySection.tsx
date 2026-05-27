"use client";

import { AnswerWorkflowAuditPanel } from "@/components/library/answer-workflow-audit-panel";
import { AnswerVersionTimeline } from "@/components/library/answer/answer-version-timeline";
import { AnswerVersionSummary } from "@/components/library/answer/answer-version-summary";
import { useState } from "react";
import { ClockIcon, ShieldCheckIcon } from "@/components/icons";
import { cn } from "@/lib/utils";


interface WorkflowHistorySectionProps {
  answerId: string;
  workspaceId: string;
  versions: any[];
  currentVersion: number;
  updatedAtRaw: string | Date | null | undefined;
}

export function WorkflowHistorySection({
  answerId,
  workspaceId,
  versions,
  currentVersion,
  updatedAtRaw,
}: WorkflowHistorySectionProps) {
  const [tab, setTab] = useState<"audit" | "versions">("audit");

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between border-b border-surface-border pb-1">
        <div className="flex gap-4">
          <button
            onClick={() => setTab("audit")}
            className={cn(
              "flex items-center gap-2 pb-2 text-[11px] font-bold uppercase tracking-wider transition-all",
              tab === "audit" ? "border-b-2 border-accent-primary text-accent-primary" : "text-text-muted hover:text-text-primary"
            )}
          >
            <ShieldCheckIcon className="h-3.5 w-3.5" />
            Audit Trail
          </button>
          <button
            onClick={() => setTab("versions")}
            className={cn(
              "flex items-center gap-2 pb-2 text-[11px] font-bold uppercase tracking-wider transition-all",
              tab === "versions" ? "border-b-2 border-accent-primary text-accent-primary" : "text-text-muted hover:text-text-primary"
            )}
          >
            <ClockIcon className="h-3.5 w-3.5" />
            Version History
          </button>

        </div>
      </div>

      <div className="min-h-[200px]">
        {tab === "audit" ? (
          <div className="animate-in fade-in slide-in-from-left-2 duration-300">
            <AnswerWorkflowAuditPanel answerId={answerId} workspaceId={workspaceId} />
          </div>
        ) : (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-2 duration-300">
            <AnswerVersionSummary
              currentVersion={currentVersion}
              versions={versions}
              updatedAtRaw={updatedAtRaw}
              onOpenHistory={() => {}} // History is already visible in timeline here
            />
            <AnswerVersionTimeline versions={versions} currentVersion={currentVersion} />
          </div>
        )}
      </div>
    </section>
  );
}
