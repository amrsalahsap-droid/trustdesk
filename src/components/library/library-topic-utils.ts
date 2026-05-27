import type { TopicWithStats } from "@/components/library/topic-card";

export function filterTopicsByQuery(topics: TopicWithStats[], query: string): TopicWithStats[] {
  const q = query.trim().toLowerCase();
  if (!q) return topics;
  return topics.filter((t) => t.name.toLowerCase().includes(q) || t.key.toLowerCase().includes(q));
}

export function groupTopicsByFirstLetter(topics: TopicWithStats[]): { label: string; topics: TopicWithStats[] }[] {
  const sorted = [...topics].sort((a, b) => a.name.localeCompare(b.name));
  const map = new Map<string, TopicWithStats[]>();
  for (const t of sorted) {
    const ch = t.name.trim()[0]?.toUpperCase() ?? "#";
    const key = /[A-Z]/.test(ch) ? ch : "#";
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(t);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => {
      if (a === "#") return 1;
      if (b === "#") return -1;
      return a.localeCompare(b);
    })
    .map(([label, tops]) => ({ label, topics: tops }));
}

export function libraryWorkspaceStats(topics: TopicWithStats[]) {
  const totalAnswers = topics.reduce((s, t) => s + t.totalAnswers, 0);
  const approvedAnswers = topics.reduce((s, t) => s + t.approvedAnswers, 0);
  const emptyTopics = topics.filter((t) => t.totalAnswers === 0).length;
  const approvalRate = totalAnswers > 0 ? Math.round((approvedAnswers / totalAnswers) * 100) : 0;
  return { totalAnswers, approvedAnswers, emptyTopics, approvalRate, topicCount: topics.length };
}
