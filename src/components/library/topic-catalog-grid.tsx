"use client";

import { TopicCard, type TopicWithStats } from "@/components/library/topic-card";
import { TopicGroupSection } from "@/components/library/topic-group-section";
import { groupTopicsByFirstLetter } from "@/components/library/library-topic-utils";

interface TopicCatalogGridProps {
  topics: TopicWithStats[];
  onTopicOpen: (topic: TopicWithStats) => void;
  onAddEntry?: (topic: TopicWithStats) => void;
}

export function TopicCatalogGrid({ topics, onTopicOpen, onAddEntry }: TopicCatalogGridProps) {
  if (topics.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-surface-border bg-surface-base/50 px-4 py-8 text-center text-sm text-text-muted">
        No topics match your search.
      </p>
    );
  }

  const groups = groupTopicsByFirstLetter(topics);
  const useGroups = topics.length >= 8;

  if (!useGroups) {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {topics.map((topic) => (
          <TopicCard key={topic.id} topic={topic} onClick={() => onTopicOpen(topic)} onAddEntry={onAddEntry ? () => onAddEntry(topic) : undefined} />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {groups.map((g) => (
        <TopicGroupSection key={g.label} title={g.label === "#" ? "Other" : `Topics — ${g.label}`} topicCount={g.topics.length}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {g.topics.map((topic) => (
              <TopicCard key={topic.id} topic={topic} onClick={() => onTopicOpen(topic)} onAddEntry={onAddEntry ? () => onAddEntry(topic) : undefined} />
            ))}
          </div>
        </TopicGroupSection>
      ))}
    </div>
  );
}
