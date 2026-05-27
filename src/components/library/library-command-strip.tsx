"use client";

import { SearchIcon } from "@/components/icons";
import { cn } from "@/lib/utils";
import type { TopicWithStats } from "@/components/library/topic-card";
import { libraryWorkspaceStats } from "@/components/library/library-topic-utils";

interface LibraryCommandStripProps {
  topics: TopicWithStats[];
  topicSearchQuery: string;
  onTopicSearchQueryChange: (q: string) => void;
  /** When filtering, how many topics are visible (for "Showing N of M"). */
  filteredTopicCount: number;
}

interface StatBlockProps {
  label: string;
  value: number | string;
  tone?: "default" | "success" | "warning";
  hint?: string;
}

function StatBlock({ label, value, tone = "default", hint }: StatBlockProps) {
  return (
    <div className="min-w-[7rem] flex-1 border-l border-surface-border pl-4 first:border-l-0 first:pl-0">
      <div className="text-[11px] font-medium uppercase tracking-wide text-text-muted">{label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span
          className={cn(
            "text-xl font-semibold tabular-nums",
            tone === "success" && "text-semantic-success",
            tone === "warning" && "text-semantic-warning",
            tone === "default" && "text-text-primary",
          )}
        >
          {value}
        </span>
        {hint && <span className="text-xs text-text-muted">{hint}</span>}
      </div>
    </div>
  );
}

export function LibraryCommandStrip({
  topics,
  topicSearchQuery,
  onTopicSearchQueryChange,
  filteredTopicCount,
}: LibraryCommandStripProps) {
  const stats = libraryWorkspaceStats(topics);
  const showingFiltered = topicSearchQuery.trim().length > 0 && filteredTopicCount !== stats.topicCount;

  return (
    <div className="rounded-xl border border-surface-border bg-surface-panel px-5 py-4 shadow-sm sm:px-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-stretch gap-x-6 gap-y-3">
          <StatBlock label="Topics" value={stats.topicCount} />
          <StatBlock label="Answers" value={stats.totalAnswers} />
          <StatBlock label="Approved" value={stats.approvedAnswers} tone="success" />
          <StatBlock
            label="Approval coverage"
            value={`${stats.approvalRate}%`}
            tone={stats.approvalRate >= 70 ? "success" : stats.approvalRate >= 40 ? "default" : "warning"}
          />
          {stats.emptyTopics > 0 && (
            <StatBlock label="Empty topics" value={stats.emptyTopics} tone="warning" />
          )}
        </div>

        <div className="flex w-full shrink-0 items-center gap-3 lg:w-auto lg:max-w-md">
          <div className="relative min-w-0 flex-1">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <input
              type="search"
              value={topicSearchQuery}
              onChange={(e) => onTopicSearchQueryChange(e.target.value)}
              placeholder="Search topics by name or key…"
              className="h-10 w-full rounded-md border border-surface-border bg-surface-base pl-10 pr-3 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary"
              aria-label="Search topics"
            />
          </div>
          {showingFiltered && (
            <span className="shrink-0 rounded-md border border-surface-border bg-surface-base px-2.5 py-1 text-xs font-medium text-text-secondary">
              {filteredTopicCount} / {stats.topicCount}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
