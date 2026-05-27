"use client";

import type { ReactNode } from "react";

interface TopicGroupSectionProps {
  title: string;
  topicCount: number;
  children: ReactNode;
}

export function TopicGroupSection({ title, topicCount, children }: TopicGroupSectionProps) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-2 border-b border-surface-border pb-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-text-muted">{title}</h2>
        <span className="text-xs tabular-nums text-text-muted">{topicCount}</span>
      </div>
      {children}
    </section>
  );
}
