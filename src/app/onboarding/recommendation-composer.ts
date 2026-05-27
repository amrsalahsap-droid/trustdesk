export type ComposerRecommendation = {
  id: string;
  category:
    | "trust_topics"
    | "evidence_uploads"
    | "workspace_configuration"
    | "questionnaire_readiness"
    | "trust_center_readiness"
    | "governance_maturity"
    | "next_best_actions";
  title: string;
  description: string;
  priority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "OPTIONAL";
  confidenceBand?: "high" | "medium" | "limited" | "low";
  confidence?: number;
  recommendationReason?: string;
  citations?: Array<{ sourceUrl?: string }>;
  metadata?: { topicKeys?: string[] };
};

export type ComposerAction = {
  id: string;
  title: string;
  description: string;
  actionLabel: string;
  actionType: string;
  priority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "OPTIONAL";
  reason: string;
  linkedRecommendationIds: string[];
};

export type ComposerCard = {
  id: string;
  title: string;
  description: string;
  reason: string;
  confidenceLabel: string;
  reviewSuggested: boolean;
  citationCount: number;
  selectedByDefault: boolean;
};

export type ComposerSection = {
  id: string;
  title: string;
  cards: ComposerCard[];
};

function toConfidenceLabel(confidenceBand?: string): string {
  if (confidenceBand === "high") return "High confidence";
  if (confidenceBand === "medium") return "Medium confidence";
  if (confidenceBand === "limited") return "Review suggested";
  return "Review suggested";
}

function dedupeRecommendations(recommendations: ComposerRecommendation[]): ComposerRecommendation[] {
  const seen = new Set<string>();
  return recommendations.filter((r) => {
    const key = `${r.id}:${r.title.toLowerCase().trim()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function toCard(rec: ComposerRecommendation): ComposerCard {
  const reviewSuggested = rec.confidenceBand === "limited" || rec.confidenceBand === "low";
  return {
    id: rec.id,
    title: rec.title,
    description: rec.description,
    reason: rec.recommendationReason || "Recommended based on your Trust Profile evidence.",
    confidenceLabel: toConfidenceLabel(rec.confidenceBand),
    reviewSuggested,
    citationCount: rec.citations?.length ?? 0,
    selectedByDefault: rec.confidenceBand === "high",
  };
}

export function composeRecommendationSections(input: {
  recommendations: ComposerRecommendation[];
  topRecommendations: ComposerRecommendation[];
  nextBestActions: ComposerAction[];
}): ComposerSection[] {
  const topIds = new Set(input.topRecommendations.map((r) => r.id));
  const recommendations = dedupeRecommendations(input.recommendations);

  const sortByTopThenPriority = (a: ComposerRecommendation, b: ComposerRecommendation): number => {
    const priorityRank: Record<ComposerRecommendation["priority"], number> = {
      CRITICAL: 5,
      HIGH: 4,
      MEDIUM: 3,
      LOW: 2,
      OPTIONAL: 1,
    };
    if (Number(topIds.has(b.id)) !== Number(topIds.has(a.id))) {
      return Number(topIds.has(b.id)) - Number(topIds.has(a.id));
    }
    return priorityRank[b.priority] - priorityRank[a.priority];
  };

  const nextStepCards: ComposerCard[] = input.nextBestActions.slice(0, 5).map((action) => ({
    id: action.id,
    title: action.title,
    description: action.description,
    reason: action.reason,
    confidenceLabel: "High confidence",
    reviewSuggested: false,
    citationCount: 0,
    selectedByDefault: true,
  }));

  const trustTopicCards = recommendations
    .filter((r) => r.category === "trust_topics")
    .sort(sortByTopThenPriority)
    .slice(0, 8)
    .map(toCard);

  const evidenceCards = recommendations
    .filter((r) => r.category === "evidence_uploads")
    .sort(sortByTopThenPriority)
    .slice(0, 6)
    .map(toCard);

  const workspaceCards = recommendations
    .filter((r) => r.category === "workspace_configuration")
    .sort(sortByTopThenPriority)
    .slice(0, 4)
    .map(toCard);

  const optionalCards = recommendations
    .filter((r) =>
      r.priority === "LOW" ||
      r.priority === "OPTIONAL" ||
      r.confidenceBand === "limited" ||
      r.confidenceBand === "low",
    )
    .sort(sortByTopThenPriority)
    .slice(0, 6)
    .map(toCard);

  const sections: ComposerSection[] = [
    { id: "next_steps", title: "Recommended next steps", cards: nextStepCards.slice(0, Math.max(3, Math.min(5, nextStepCards.length))) },
    { id: "trust_topics", title: "Suggested trust topics", cards: trustTopicCards },
    { id: "evidence_uploads", title: "Recommended evidence uploads", cards: evidenceCards },
    { id: "workspace_setup", title: "Workspace setup suggestions", cards: workspaceCards },
    { id: "optional", title: "Optional / lower priority", cards: optionalCards },
  ];

  const uniqueSections = new Map<string, ComposerSection>();
  for (const section of sections) {
    if (!section.cards.length) continue;
    if (!uniqueSections.has(section.id)) {
      uniqueSections.set(section.id, section);
    }
  }
  return [...uniqueSections.values()];
}
