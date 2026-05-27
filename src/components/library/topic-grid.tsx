import { TopicCard, TopicWithStats } from "./topic-card";

interface TopicGridProps {
  topics: TopicWithStats[];
  onTopicClick: (topic: TopicWithStats) => void;
}

export function TopicGrid({ topics, onTopicClick }: TopicGridProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {topics.map((topic) => (
        <TopicCard
          key={topic.id}
          topic={topic}
          onClick={() => onTopicClick(topic)}
        />
      ))}
    </div>
  );
}
