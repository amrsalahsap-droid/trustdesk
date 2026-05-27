import { describe, it, expect } from "vitest";
import { scoreIndustryCandidates, type IndustryCandidate } from "../industry-candidate-scoring";
import { type PageType } from "../domain-crawler";

describe("Confidence Band Conversion and Conflict Detection", () => {
  describe("support score to confidence band conversion", () => {
    it("converts 80–100 to high confidence", () => {
      const signals = [
        {
          fieldKey: "industry" as const,
          candidateValue: "software",
          signalType: "DIRECT_QUOTE",
          snippet: "We are a software company that builds enterprise platforms",
          sourceUrl: "https://example.com/about",
          pageType: "about" as PageType,
          strength: "strong" as const,
          reason: "Direct quote",
          location: "heading",
          position: 0,
        },
        {
          fieldKey: "industry" as const,
          candidateValue: "software",
          signalType: "DIRECT_QUOTE",
          snippet: "Our SaaS platform helps businesses scale",
          sourceUrl: "https://example.com/product",
          pageType: "product" as PageType,
          strength: "strong" as const,
          reason: "Direct quote",
          location: "body",
          position: 0,
        },
        {
          fieldKey: "industry" as const,
          candidateValue: "software",
          signalType: "STRUCTURED_DATA",
          snippet: "JSON-LD: software",
          sourceUrl: "https://example.com",
          pageType: "homepage" as PageType,
          strength: "strong" as const,
          reason: "Structured data",
          location: "json-ld",
          position: 0,
        },
      ];

      const pages = new Map([
        ["https://example.com/about", { pageType: "about" as PageType, text: "software company" }],
        ["https://example.com/product", { pageType: "product" as PageType, text: "SaaS platform" }],
        ["https://example.com", { pageType: "homepage" as PageType, text: "software", jsonLd: { "@type": "Organization", "industry": "Computer Software" } }],
      ]);

      const result = scoreIndustryCandidates({ signals, pages });

      const softwareCandidate = result.candidates.find(c => c.value === "software");
      expect(softwareCandidate).toBeDefined();
      expect(softwareCandidate!.supportScore).toBeGreaterThanOrEqual(80);
      expect(softwareCandidate!.confidenceBand).toBe("high");
      expect(softwareCandidate!.evidenceCoverage).toBe("strong");
    });

    it("converts 60–79 to medium confidence", () => {
      const signals = [
        {
          fieldKey: "industry" as const,
          candidateValue: "software",
          signalType: "DIRECT_QUOTE",
          snippet: "Software platform for enterprises",
          sourceUrl: "https://example.com/about",
          pageType: "about" as PageType,
          strength: "moderate" as const,
          reason: "Direct quote",
          location: "body",
          position: 0,
        },
        {
          fieldKey: "industry" as const,
          candidateValue: "software",
          signalType: "INFERRED",
          snippet: "Platform solution for business",
          sourceUrl: "https://example.com/product",
          pageType: "product" as PageType,
          strength: "moderate" as const,
          reason: "Inferred",
          location: "body",
          position: 0,
        },
      ];

      const pages = new Map([
        ["https://example.com/about", { pageType: "about" as PageType, text: "software platform" }],
        ["https://example.com/product", { pageType: "product" as PageType, text: "platform solution" }],
      ]);

      const result = scoreIndustryCandidates({ signals, pages });

      const softwareCandidate = result.candidates.find(c => c.value === "software");
      expect(softwareCandidate).toBeDefined();
      expect(softwareCandidate!.supportScore).toBeGreaterThanOrEqual(60);
      expect(softwareCandidate!.supportScore).toBeLessThan(80);
      expect(softwareCandidate!.confidenceBand).toBe("medium");
      expect(softwareCandidate!.evidenceCoverage).toBe("medium");
    });

    it("converts 40–59 to limited confidence", () => {
      const signals = [
        {
          fieldKey: "industry" as const,
          candidateValue: "software",
          signalType: "INFERRED",
          snippet: "Platform for business",
          sourceUrl: "https://example.com",
          pageType: "homepage" as PageType,
          strength: "weak" as const,
          reason: "Inferred",
          location: "body",
          position: 0,
        },
      ];

      const pages = new Map([
        ["https://example.com", { pageType: "homepage" as PageType, text: "platform for business" }],
      ]);

      const result = scoreIndustryCandidates({ signals, pages });

      const softwareCandidate = result.candidates.find(c => c.value === "software");
      if (softwareCandidate) {
        expect(softwareCandidate.supportScore).toBeGreaterThanOrEqual(40);
        expect(softwareCandidate.supportScore).toBeLessThan(60);
        expect(softwareCandidate.confidenceBand).toBe("limited");
        expect(softwareCandidate.evidenceCoverage).toBe("limited");
      }
    });

    it("converts below 40 to unknown confidence", () => {
      const signals = [
        {
          fieldKey: "industry" as const,
          candidateValue: "software",
          signalType: "INFERRED",
          snippet: "Solution for companies",
          sourceUrl: "https://example.com",
          pageType: "docs" as PageType,
          strength: "weak" as const,
          reason: "Inferred",
          location: "body",
          position: 0,
        },
      ];

      const pages = new Map([
        ["https://example.com", { pageType: "docs" as PageType, text: "solution for companies" }],
      ]);

      const result = scoreIndustryCandidates({ signals, pages });

      const softwareCandidate = result.candidates.find(c => c.value === "software");
      if (softwareCandidate) {
        expect(softwareCandidate.supportScore).toBeLessThan(40);
        expect(softwareCandidate.confidenceBand).toBe("unknown");
        expect(softwareCandidate.evidenceCoverage).toBe("weak");
      }
    });
  });

  describe("conflict detection", () => {
    it("detects no conflict when top scores differ by more than 15", () => {
      const signals = [
        // Software signals (strong)
        {
          fieldKey: "industry" as const,
          candidateValue: "software",
          signalType: "DIRECT_QUOTE",
          snippet: "We are a software company",
          sourceUrl: "https://example.com/about",
          pageType: "about" as PageType,
          strength: "strong" as const,
          reason: "Direct quote",
          location: "body",
          position: 0,
        },
        // Fintech signals (weaker)
        {
          fieldKey: "industry" as const,
          candidateValue: "fintech",
          signalType: "INFERRED",
          snippet: "Payment processing solution",
          sourceUrl: "https://example.com/services",
          pageType: "product" as PageType,
          strength: "weak" as const,
          reason: "Inferred",
          location: "body",
          position: 0,
        },
      ];

      const pages = new Map([
        ["https://example.com/about", { pageType: "about" as PageType, text: "software company" }],
        ["https://example.com/services", { pageType: "product" as PageType, text: "payment processing" }],
      ]);

      const result = scoreIndustryCandidates({ signals, pages });

      expect(result.hasConflict).toBe(false);
      
      const softwareCandidate = result.candidates.find(c => c.value === "software");
      const fintechCandidate = result.candidates.find(c => c.value === "fintech");
      
      expect(softwareCandidate!.isConflicted).toBe(false);
      expect(fintechCandidate!.isConflicted).toBe(false);
      
      // Software should be high confidence, fintech should be limited/unknown
      expect(softwareCandidate!.confidenceBand).toBe("high");
      expect(fintechCandidate!.confidenceBand).toBe("limited");
      
      // Score gap should be > 15
      const scoreGap = softwareCandidate!.supportScore - fintechCandidate!.supportScore;
      expect(scoreGap).toBeGreaterThan(15);
    });

    it("detects conflict when top scores differ by 15 or less", () => {
      const signals = [
        // Software signals
        {
          fieldKey: "industry" as const,
          candidateValue: "software",
          signalType: "DIRECT_QUOTE",
          snippet: "We are a software company",
          sourceUrl: "https://example.com/about",
          pageType: "about" as PageType,
          strength: "strong" as const,
          reason: "Direct quote",
          location: "body",
          position: 0,
        },
        // Healthtech signals (close score)
        {
          fieldKey: "industry" as const,
          candidateValue: "healthtech",
          signalType: "DIRECT_QUOTE",
          snippet: "We provide medical software solutions",
          sourceUrl: "https://example.com/services",
          pageType: "product" as PageType,
          strength: "strong" as const,
          reason: "Direct quote",
          location: "body",
          position: 0,
        },
      ];

      const pages = new Map([
        ["https://example.com/about", { pageType: "about" as PageType, text: "software company" }],
        ["https://example.com/services", { pageType: "product" as PageType, text: "medical software solutions" }],
      ]);

      const result = scoreIndustryCandidates({ signals, pages });

      expect(result.hasConflict).toBe(true);
      
      const softwareCandidate = result.candidates.find(c => c.value === "software");
      const healthtechCandidate = result.candidates.find(c => c.value === "healthtech");
      
      expect(softwareCandidate!.isConflicted).toBe(true);
      expect(healthtechCandidate!.isConflicted).toBe(true);
      
      // Both should be unknown due to conflict
      expect(softwareCandidate!.confidenceBand).toBe("unknown");
      expect(healthtechCandidate!.confidenceBand).toBe("unknown");
      
      // Score gap should be <= 15
      const scoreGap = Math.abs(softwareCandidate!.supportScore - healthtechCandidate!.supportScore);
      expect(scoreGap).toBeLessThanOrEqual(15);
    });

    it("conflict overrides normal confidence band", () => {
      const signals = [
        // Strong software signals (would normally be high confidence)
        {
          fieldKey: "industry" as const,
          candidateValue: "software",
          signalType: "DIRECT_QUOTE",
          snippet: "We are a software company that builds enterprise platforms",
          sourceUrl: "https://example.com/about",
          pageType: "about" as PageType,
          strength: "strong" as const,
          reason: "Direct quote",
          location: "body",
          position: 0,
        },
        {
          fieldKey: "industry" as const,
          candidateValue: "software",
          signalType: "STRUCTURED_DATA",
          snippet: "JSON-LD: software",
          sourceUrl: "https://example.com",
          pageType: "homepage" as PageType,
          strength: "strong" as const,
          reason: "Structured data",
          location: "json-ld",
          position: 0,
        },
        // Strong fintech signals (close score, causing conflict)
        {
          fieldKey: "industry" as const,
          candidateValue: "fintech",
          signalType: "DIRECT_QUOTE",
          snippet: "We provide financial technology platforms",
          sourceUrl: "https://example.com/services",
          pageType: "product" as PageType,
          strength: "strong" as const,
          reason: "Direct quote",
          location: "body",
          position: 0,
        },
        {
          fieldKey: "industry" as const,
          candidateValue: "fintech",
          signalType: "STRUCTURED_DATA",
          snippet: "JSON-LD: fintech",
          sourceUrl: "https://example.com/services",
          pageType: "product" as PageType,
          strength: "strong" as const,
          reason: "Structured data",
          location: "json-ld",
          position: 0,
        },
      ];

      const pages = new Map([
        ["https://example.com/about", { pageType: "about" as PageType, text: "software company", jsonLd: { "@type": "Organization", "industry": "Computer Software" } }],
        ["https://example.com", { pageType: "homepage" as PageType, text: "software", jsonLd: { "@type": "Organization", "industry": "Computer Software" } }],
        ["https://example.com/services", { pageType: "product" as PageType, text: "financial technology", jsonLd: { "@type": "Organization", "industry": "Financial Technology" } }],
      ]);

      const result = scoreIndustryCandidates({ signals, pages });

      expect(result.hasConflict).toBe(true);
      
      const softwareCandidate = result.candidates.find(c => c.value === "software");
      const fintechCandidate = result.candidates.find(c => c.value === "fintech");
      
      expect(softwareCandidate!.isConflicted).toBe(true);
      expect(fintechCandidate!.isConflicted).toBe(true);
      
      // Both should be unknown despite strong evidence due to conflict
      expect(softwareCandidate!.confidenceBand).toBe("unknown");
      expect(fintechCandidate!.confidenceBand).toBe("unknown");
      
      // But evidence coverage should still be calculated correctly
      expect(softwareCandidate!.evidenceCoverage).toBe("strong");
      expect(fintechCandidate!.evidenceCoverage).toBe("strong");
    });
  });

  describe("evidence coverage caps confidence", () => {
    it("weak evidence caps confidence to limited/unknown", () => {
      const signals = [
        {
          fieldKey: "industry" as const,
          candidateValue: "software",
          signalType: "INFERRED",
          snippet: "Software solution",
          sourceUrl: "https://example.com/docs",
          pageType: "docs" as PageType,
          strength: "weak" as const,
          reason: "Inferred",
          location: "body",
          position: 0,
        },
      ];

      const pages = new Map([
        ["https://example.com/docs", { pageType: "docs" as PageType, text: "software solution" }],
      ]);

      const result = scoreIndustryCandidates({ signals, pages });

      const softwareCandidate = result.candidates.find(c => c.value === "software");
      if (softwareCandidate) {
        expect(softwareCandidate.evidenceCoverage).toBe("weak");
        expect(softwareCandidate.confidenceBand).toBe("unknown");
      }
    });

    it("limited evidence caps to medium at best", () => {
      const signals = [
        {
          fieldKey: "industry" as const,
          candidateValue: "software",
          signalType: "DIRECT_QUOTE",
          snippet: "Software platform",
          sourceUrl: "https://example.com",
          pageType: "homepage" as PageType,
          strength: "strong" as const,
          reason: "Direct quote",
          location: "body",
          position: 0,
        },
      ];

      const pages = new Map([
        ["https://example.com", { pageType: "homepage" as PageType, text: "software platform" }],
      ]);

      const result = scoreIndustryCandidates({ signals, pages });

      const softwareCandidate = result.candidates.find(c => c.value === "software");
      if (softwareCandidate) {
        expect(softwareCandidate.evidenceCoverage).toBe("limited");
        // Even with strong signal, limited coverage caps to medium at best
        expect(softwareCandidate.confidenceBand).toBe("limited");
      }
    });

    it("strong evidence can achieve high confidence", () => {
      const signals = [
        {
          fieldKey: "industry" as const,
          candidateValue: "software",
          signalType: "DIRECT_QUOTE",
          snippet: "We are a software company",
          sourceUrl: "https://example.com/about",
          pageType: "about" as PageType,
          strength: "strong" as const,
          reason: "Direct quote",
          location: "body",
          position: 0,
        },
        {
          fieldKey: "industry" as const,
          candidateValue: "software",
          signalType: "DIRECT_QUOTE",
          snippet: "Our SaaS platform",
          sourceUrl: "https://example.com/product",
          pageType: "product" as PageType,
          strength: "strong" as const,
          reason: "Direct quote",
          location: "body",
          position: 0,
        },
        {
          fieldKey: "industry" as const,
          candidateValue: "software",
          signalType: "DIRECT_QUOTE",
          snippet: "Enterprise software solutions",
          sourceUrl: "https://example.com/security",
          pageType: "security" as PageType,
          strength: "strong" as const,
          reason: "Direct quote",
          location: "body",
          position: 0,
        },
      ];

      const pages = new Map([
        ["https://example.com/about", { pageType: "about" as PageType, text: "software company" }],
        ["https://example.com/product", { pageType: "product" as PageType, text: "SaaS platform" }],
        ["https://example.com/security", { pageType: "security" as PageType, text: "enterprise software" }],
      ]);

      const result = scoreIndustryCandidates({ signals, pages });

      const softwareCandidate = result.candidates.find(c => c.value === "software");
      expect(softwareCandidate).toBeDefined();
      expect(softwareCandidate!.evidenceCoverage).toBe("strong");
      expect(softwareCandidate!.confidenceBand).toBe("high");
    });
  });

  describe("AI confidence preservation", () => {
    it("preserves AI confidence separately from evidence-based confidence", () => {
      // This test verifies the integration with website-analysis-service
      // The actual AI confidence preservation happens in the integration layer
      const signals = [
        {
          fieldKey: "industry" as const,
          candidateValue: "software",
          signalType: "DIRECT_QUOTE",
          snippet: "We are a software company",
          sourceUrl: "https://example.com/about",
          pageType: "about" as PageType,
          strength: "strong" as const,
          reason: "Direct quote",
          location: "body",
          position: 0,
        },
      ];

      const pages = new Map([
        ["https://example.com/about", { pageType: "about" as PageType, text: "software company" }],
      ]);

      const result = scoreIndustryCandidates({ signals, pages });

      const softwareCandidate = result.candidates.find(c => c.value === "software");
      expect(softwareCandidate).toBeDefined();
      
      // Evidence-based scoring
      expect(softwareCandidate!.supportScore).toBeGreaterThan(0);
      expect(softwareCandidate!.confidenceBand).toBeDefined();
      expect(softwareCandidate!.evidenceCoverage).toBeDefined();
      
      // The actual AI confidence preservation happens in website-analysis-service
      // This test ensures the scoring system provides the necessary data
      expect(softwareCandidate!.evidenceRefs).toHaveLength(1);
      expect(softwareCandidate!.reasons).toContain("DIRECT_QUOTE match: software");
    });
  });
});
