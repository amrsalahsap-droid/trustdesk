import { describe, expect, it } from "vitest";
import {
  countGroundedBusinessSignals,
  countObservedBusinessFields,
  type DeepInferredProfile,
  type Signal,
} from "../website-analysis-service";

function makeBaseProfile(): DeepInferredProfile {
  return {
    tailoringConfidence: 0.4,
    suggestedDocuments: [],
    pagesScanned: [],
  };
}

function makeSignal<T>(
  value: T,
  overrides?: Partial<Signal<T>>,
): Signal<T> {
  return {
    value,
    category: "DERIVED",
    confidence: 0.7,
    confidenceBand: "medium",
    evidenceCoverage: "medium",
    supportScore: 65,
    source: "https://example.com/product",
    reasons: ["Matched product page evidence"],
    citations: [
      {
        pageUrl: "https://example.com/product",
        pageType: "product",
        evidenceKind: "heading-section",
        excerpt: "Enterprise SaaS security platform",
      },
    ],
    ...overrides,
  };
}

describe("grounded business signal counting", () => {
  it("increments grounded count for citation-backed SaaS signal", () => {
    const profile = makeBaseProfile();
    profile.productType = makeSignal("saas");

    expect(countGroundedBusinessSignals(profile)).toBe(1);
  });

  it("allows DERIVED signal with strong citation to count as grounded", () => {
    const profile = makeBaseProfile();
    profile.industry = makeSignal("software", { category: "DERIVED" });

    expect(countGroundedBusinessSignals(profile)).toBe(1);
    expect(countObservedBusinessFields(profile)).toBe(0);
  });

  it("does not count raw rich text without grounded field signal", () => {
    const profile = makeBaseProfile();
    profile.industry = makeSignal("software", {
      source: "marketing copy",
      reasons: [],
      citations: [],
      evidenceCoverage: "none",
      supportScore: 0,
      confidence: 0.2,
    });

    expect(countGroundedBusinessSignals(profile)).toBe(0);
  });

  it("preserves OBSERVED-only business field counting separately", () => {
    const profile = makeBaseProfile();
    profile.industry = makeSignal("software", {
      category: "OBSERVED",
      citations: [],
      reasons: ["Explicit on homepage"],
      source: "https://example.com",
    });

    expect(countObservedBusinessFields(profile)).toBe(1);
    expect(countGroundedBusinessSignals(profile)).toBe(0);
  });
});

