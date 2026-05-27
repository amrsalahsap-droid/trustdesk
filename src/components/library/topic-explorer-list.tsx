"use client";

import { useMemo } from "react";
import { ProgressBar } from "@/components/ui/progress-bar";

import { SearchIcon } from "@/components/icons";
import { cn } from "@/lib/utils";
import type { TopicWithStats } from "@/components/library/topic-card";

interface TopicExplorerListProps {
  topics: TopicWithStats[];
  selectedTopic: TopicWithStats | null;
  onSelectTopic: (topic: TopicWithStats) => void;
  topicSearchQuery: string;
  onTopicSearchQueryChange: (q: string) => void;
  role?: string;
  userId?: string | null;
  topicScope?: "focused" | "all";
}

export function TopicExplorerList({
  topics,
  selectedTopic,
  onSelectTopic,
  topicSearchQuery,
  onTopicSearchQueryChange,
  role,
  userId,
  topicScope = "all",
}: TopicExplorerListProps) {
  const isOwner = role === "OWNER";

  const filtered = useMemo(() => {
    let base = topicSearchQuery.trim()
      ? topics.filter(
          (t) =>
            t.name.toLowerCase().includes(topicSearchQuery.trim().toLowerCase()) ||
            t.key.toLowerCase().includes(topicSearchQuery.trim().toLowerCase()),
        )
      : [...topics];

    // If Owner, sort by 'my work priority'
    if (role === "OWNER" && !topicSearchQuery.trim()) {
      base.sort((a, b) => {
        const aDrafts = a.totalAnswers - a.approvedAnswers;
        const bDrafts = b.totalAnswers - b.approvedAnswers;
        // Topics with drafts first, then alphabetically
        if (aDrafts > 0 && bDrafts === 0) return -1;
        if (aDrafts === 0 && bDrafts > 0) return 1;
        return a.name.localeCompare(b.name);
      });
    }
    
    return base;
  }, [topics, topicSearchQuery, role]);


  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-surface-border px-4 pb-3 pt-4 sm:px-5">
        <div className="mb-3 flex items-baseline justify-between">
          <h3 className="text-sm font-semibold text-text-primary">Topics</h3>
          <span className="text-[11px] font-medium tabular-nums text-text-muted">
            {filtered.length}
            {topicSearchQuery.trim() ? ` of ${topics.length}` : ""}
          </span>
        </div>
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
          <input
            type="search"
            value={topicSearchQuery}
            onChange={(e) => onTopicSearchQueryChange(e.target.value)}
            placeholder="Filter topics…"
            className="h-9 w-full rounded-md border border-surface-border bg-surface-base pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary"
            aria-label="Filter topics in sidebar"
          />
        </div>
      </div>

      <ul className="flex-1 space-y-0.5 overflow-y-auto px-2 py-2">
        {filtered.length === 0 ? (
          <li className="px-3 py-8 text-center text-sm text-text-muted">No topics match this filter.</li>
        ) : (
          filtered.map((topic) => {
            const active = topic.key === selectedTopic?.key;
            const progress = topic.totalAnswers > 0 ? (topic.approvedAnswers / topic.totalAnswers) * 100 : 0;
            const drafts = Math.max(0, topic.totalAnswers - topic.approvedAnswers);
            const isEmpty = topic.totalAnswers === 0;
            const needsEvidence = (topic.health?.sourceChunks ?? 0) > 0 && topic.totalAnswers === 0;

            return (
              <li key={topic.key}>
                <button
                  type="button"
                  onClick={() => onSelectTopic(topic)}
                  aria-current={active ? "true" : undefined}
                  className={cn(
                    "group relative flex w-full flex-col gap-2 rounded-md px-3 py-2.5 text-left transition-colors",
                    active
                      ? "bg-accent-primary/10 text-accent-primary"
                      : "text-text-secondary hover:bg-surface-hover hover:text-text-primary",
                  )}
                >
                  {active && (
                    <span
                      className="absolute inset-y-1.5 left-0 w-1 rounded-r-full bg-accent-primary"
                      aria-hidden="true"
                    />
                  )}
                  <div className="flex items-center justify-between gap-3">
                    <span
                      className={cn(
                        "truncate text-sm",
                        active ? "font-semibold text-accent-primary" : "font-medium text-text-primary",
                      )}
                    >
                      {topic.name}
                    </span>
                    <span
                      className={cn(
                        "shrink-0 rounded-full border px-1.5 py-0.5 text-[11px] font-semibold tabular-nums",
                        active
                          ? "border-accent-primary/30 bg-accent-primary/10 text-accent-primary"
                          : isEmpty
                            ? "border-surface-border bg-surface-base text-text-muted"
                            : "border-surface-border bg-surface-panel text-text-secondary",
                      )}
                    >
                      {topic.approvedAnswers}/{topic.totalAnswers}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <ProgressBar value={progress} className="min-w-0 flex-1" />
                    <span
                      className={cn(
                        "shrink-0 text-[10px] font-semibold uppercase tracking-wide",
                        isEmpty
                          ? needsEvidence ? "text-semantic-warning" : "text-text-muted/70"
                          : drafts > 0
                            ? "text-semantic-warning"
                            : "text-semantic-success",
                      )}
                    >
                      {isEmpty ? needsEvidence ? "Needs Seed" : "Empty" : drafts > 0 ? `${drafts} draft${drafts === 1 ? "" : "s"}` : "Complete"}
                    </span>
                  </div>
                  {isOwner && drafts > 0 && (
                    <div className="flex items-center gap-1 text-[9px] font-bold text-accent-primary/80 uppercase tracking-tight">
                      <div className="h-1 w-1 rounded-full bg-accent-primary animate-pulse" />
                      Maintenance required
                    </div>
                  )}
                </button>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}

