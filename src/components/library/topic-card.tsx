"use client";

import { cn } from "@/lib/utils";
import { TopicIcon } from "@/components/icons";
import { ProgressBar } from "@/components/ui/progress-bar";

export interface TopicWithStats {
  id: string;
  key: string;
  name: string;
  description: string | null;
  ownerId?: string | null;
  approverId?: string | null;
  owner?: { id: string; name: string; email: string } | null;
  approver?: { id: string; name: string; email: string } | null;
  totalAnswers: number;
  approvedAnswers: number;
  health: {
    strength: number;
    evidencedAnswers: number;
    usageCount: number;
    gapCount: number;
    sourceChunks: number;
    seedingError?: string | null;
  };
}




interface TopicCardProps {
  topic: TopicWithStats;
  onClick: () => void;
  /** Opens add-answer flow for this topic (does not navigate). */
  onAddEntry?: () => void;
}

export function TopicCard({ topic, onClick, onAddEntry }: TopicCardProps) {
  const progress = topic.health?.strength ?? 0;
  const isEmpty = topic.totalAnswers === 0;
  const draftish = topic.totalAnswers - topic.approvedAnswers;
  
  // Health Badges logic
  const needsEvidence = topic.approvedAnswers > 0 && (topic.health?.evidencedAnswers ?? 0) === 0;
  const isCriticalGap = (topic.health?.gapCount ?? 0) > 2 && topic.approvedAnswers === 0;

  return (
    <article className="group flex h-full flex-col rounded-2xl border border-surface-border bg-white text-left shadow-sm transition-all hover:border-accent-primary/40 hover:shadow-md hover:translate-y-[-2px] duration-300">
      <button
        type="button"
        onClick={onClick}
        className="flex flex-1 flex-col p-6 text-left transition-colors hover:bg-surface-base/[0.02]"
      >
        <div className="mb-4 flex items-start justify-between">
          <div className="rounded-xl bg-accent-primary/[0.04] p-2.5 text-accent-primary transition-all group-hover:scale-105 group-hover:bg-accent-primary group-hover:text-white ring-1 ring-accent-primary/10">
            <TopicIcon className="h-5 w-5" />
          </div>
          <div className="flex flex-col items-end gap-1.5">
            {isEmpty ? (
              <span className="rounded-full border border-surface-border bg-surface-base px-2 py-0.5 text-[10px] font-bold uppercase tracking-tight text-text-muted">
                Empty
              </span>
            ) : (
              <span className="rounded-full bg-accent-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-tight text-accent-primary">
                {topic.totalAnswers} {topic.totalAnswers === 1 ? "answer" : "answers"}
              </span>
            )}
            
            {/* Status Badges */}
            {isCriticalGap && (
                <span className="rounded-full bg-semantic-error/10 border border-semantic-error/20 px-2 py-0.5 text-[9px] font-bold uppercase tracking-tighter text-semantic-error animate-pulse">
                    Critical Gap
                </span>
            )}
            {needsEvidence && (
                <span className="rounded-full bg-semantic-warning/10 border border-semantic-warning/20 px-2 py-0.5 text-[9px] font-bold uppercase tracking-tighter text-semantic-warning">
                    Needs Evidence
                </span>
            )}
          </div>
        </div>

        <h3 className="mb-1 text-base font-bold text-text-primary transition-colors hover:text-accent-primary">{topic.name}</h3>
        <p className="line-clamp-2 text-xs leading-relaxed text-text-muted mb-4">
          {topic.description || `Controls and evidence patterns for ${topic.name}.`}
        </p>

        <div className="mt-auto pt-4 border-t border-surface-border/50">
            <div className="mb-2 flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-widest text-text-muted/50">Topic Strength</span>
                <span className={cn(
                    "text-[10px] font-black tabular-nums",
                    progress > 80 ? "text-semantic-success" : progress > 50 ? "text-semantic-warning" : "text-accent-primary"
                )}>
                    {Math.round(progress)}%
                </span>
            </div>
            <ProgressBar 
                value={progress} 
                className="h-2 shadow-inner rounded-full overflow-hidden" 
            />

            
            <div className="mt-4 grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-black/5 p-2 border border-white/5">
                    <p className="text-[9px] font-bold text-text-muted uppercase tracking-tighter">Approved</p>
                    <p className="text-xs font-black text-text-primary">{topic.approvedAnswers}</p>
                </div>
                <div className="rounded-lg bg-black/5 p-2 border border-white/5">
                    <p className="text-[9px] font-bold text-text-muted uppercase tracking-tighter">Usage Hits</p>
                    <p className="text-xs font-black text-text-primary">{topic.health?.usageCount || 0}</p>
                </div>
            </div>
        </div>
      </button>

      {onAddEntry && (
        <div className="border-t border-surface-border/50 px-6 py-3 bg-surface-panel/50 flex items-center justify-between">
          <span className="text-[10px] font-medium text-text-muted italic">
             {topic.health?.sourceChunks || 0} chunks linked
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              onAddEntry();
            }}
            className="text-[11px] font-bold text-accent-primary uppercase tracking-tight hover:underline"
          >
            Add entry
          </button>
        </div>
      )}
    </article>
  );
}
