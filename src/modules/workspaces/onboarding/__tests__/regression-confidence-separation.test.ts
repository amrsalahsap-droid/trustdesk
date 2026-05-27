import { describe, it, expect } from "vitest";
import { WebsiteAnalysisService } from "../website-analysis-service";
import { type PageType } from "../page-discovery";
import { scoreIndustryCandidates } from "../industry-candidate-scoring";

describe("Regression Tests: Confidence Source Separation", () => {
  describe("AI confidence is not final user-facing confidence", () => {
    it("should preserve AI confidence separately from backend confidence", () => {
      // Create a signal with low AI confidence but strong evidence
      const aiConfidence = 0.35;
      const category = "OBSERVED";
      const evidenceItems: any[] = [
        {
          evidence: { url: "https://example.com/a", title: "A", headings: ["A", "B"], snippet: "A".repeat(400) },
          pageType: "security" as any,
          score: 1.5,
          structured: {
            url: "https://example.com/a",
            title: "A",
            pageType: "security" as any,
            score: 1.5,
            sourceConfidence: 0.9,
            blocks: [
              { kind: "heading-section" as const, level: 1, heading: "A", bodyText: "A".repeat(200) },
              { kind: "heading-section" as const, level: 2, heading: "B", bodyText: "B".repeat(200) },
            ],
          },
        },
        {
          evidence: { url: "https://example.com/b", title: "B", headings: ["C", "D"], snippet: "B".repeat(400) },
          pageType: "trust" as any,
          score: 1.5,
          structured: {
            url: "https://example.com/b",
            title: "B",
            pageType: "trust" as any,
            score: 1.5,
            sourceConfidence: 0.9,
            blocks: [
              { kind: "heading-section" as const, level: 1, heading: "C", bodyText: "C".repeat(200) },
              { kind: "heading-section" as const, level: 2, heading: "D", bodyText: "D".repeat(200) },
            ],
          },
        },
      ];


      const backendResult = WebsiteAnalysisService.calculateBackendConfidence({
        aiConfidence,
        category,
        evidenceItems,
        fieldKey: "industry",
        value: "software",
      });

      // Backend confidence should override user-facing confidence
      expect(backendResult.confidence).toBeGreaterThan(0.5);
      expect(backendResult.confidenceBand).toBe("high");
      expect(backendResult.supportScore).toBeGreaterThanOrEqual(70);
      expect(backendResult.evidenceCoverage).toBe("medium");
    });
  });

  describe("ConfidenceBand comes from deterministic support scoring", () => {
    it("should derive confidenceBand from supportScore and evidence coverage", () => {
      const signals = [
        {
          fieldKey: "industry" as const,
          candidateValue: "software",
          signalType: "DIRECT_QUOTE" as const,
          snippet: "We are a software company",
          sourceUrl: "https://example.com/about",
          pageType: "about" as any,
          strength: "strong" as const,
          reason: "Direct quote",
          location: "body",
          position: 0,
        },
        {
          fieldKey: "industry" as const,
          candidateValue: "software",
          signalType: "DIRECT_QUOTE" as const,
          snippet: "Our SaaS platform",
          sourceUrl: "https://example.com/product",
          pageType: "product" as any,
          strength: "strong" as const,
          reason: "Direct quote",
          location: "body",
          position: 0,
        },
      ];

      const pages = new Map([
        ["https://example.com/about", { pageType: "about" as any, text: "software company" }],
        ["https://example.com/product", { pageType: "product" as any, text: "SaaS platform" }],
      ]);


      const result = scoreIndustryCandidates({ signals, pages });
      const softwareCandidate = result.candidates.find(c => c.value === "software");

      expect(softwareCandidate).toBeDefined();
      expect(softwareCandidate!.confidenceBand).toBe("medium");
      expect(softwareCandidate!.evidenceCoverage).toBe("medium");
    });
  });
});
