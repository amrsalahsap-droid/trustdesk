import { describe, it, expect } from "vitest";
import { composeRecommendationSections, type ComposerRecommendation, type ComposerAction } from "../recommendation-composer";

function rec(overrides: Partial<ComposerRecommendation> = {}): ComposerRecommendation {
  return {
    id: "r1",
    category: "trust_topics",
    title: "Enterprise SaaS Security",
    description: "Security topics for enterprise SaaS",
    priority: "HIGH",
    confidenceBand: "high",
    recommendationReason: "Evidence-backed recommendation",
    citations: [{ sourceUrl: "https://example.com/security" }],
    ...overrides,
  };
}

function action(overrides: Partial<ComposerAction> = {}): ComposerAction {
  return {
    id: "a1",
    title: "Upload SOC2 report",
    description: "Use this to support enterprise procurement.",
    actionLabel: "Upload SOC2",
    actionType: "upload_document",
    priority: "HIGH",
    reason: "SOC2 evidence is commonly requested.",
    linkedRecommendationIds: ["r1"],
    ...overrides,
  };
}

describe("recommendation composer", () => {
  it("duplicate recommendations render once", () => {
    const sections = composeRecommendationSections({
      recommendations: [rec(), rec()],
      topRecommendations: [rec()],
      nextBestActions: [action(), action({ id: "a2", title: "Review topics", actionType: "review_topics" }), action({ id: "a3", title: "Import questionnaire", actionType: "import_questionnaire" })],
    });
    const trustSection = sections.find(s => s.id === "trust_topics");
    expect(trustSection?.cards.length).toBe(1);
  });

  it("empty categories are hidden", () => {
    const sections = composeRecommendationSections({
      recommendations: [],
      topRecommendations: [],
      nextBestActions: [],
    });
    expect(sections.length).toBe(0);
  });

  it("top recommendations appear first in category", () => {
    const top = rec({ id: "top", title: "Top Rec", priority: "MEDIUM" });
    const other = rec({ id: "other", title: "Other Rec", priority: "CRITICAL" });
    const sections = composeRecommendationSections({
      recommendations: [other, top],
      topRecommendations: [top],
      nextBestActions: [action(), action({ id: "a2" }), action({ id: "a3" })],
    });
    const trustSection = sections.find(s => s.id === "trust_topics");
    expect(trustSection?.cards[0].id).toBe("top");
  });

  it("limited-confidence recommendations show review badge", () => {
    const sections = composeRecommendationSections({
      recommendations: [rec({ id: "limited", confidenceBand: "limited" })],
      topRecommendations: [],
      nextBestActions: [action(), action({ id: "a2" }), action({ id: "a3" })],
    });
    const trustSection = sections.find(s => s.id === "trust_topics");
    expect(trustSection?.cards[0].reviewSuggested).toBe(true);
    expect(trustSection?.cards[0].confidenceLabel).toBe("Review suggested");
  });

  it("selected defaults match confidence", () => {
    const sections = composeRecommendationSections({
      recommendations: [
        rec({ id: "high", confidenceBand: "high" }),
        rec({ id: "low", confidenceBand: "low", title: "Low confidence rec" }),
      ],
      topRecommendations: [],
      nextBestActions: [action(), action({ id: "a2" }), action({ id: "a3" })],
    });
    const trustSection = sections.find(s => s.id === "trust_topics");
    const high = trustSection?.cards.find(c => c.id === "high");
    const low = trustSection?.cards.find(c => c.id === "low");
    expect(high?.selectedByDefault).toBe(true);
    expect(low?.selectedByDefault).toBe(false);
  });
});
