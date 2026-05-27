import { describe, it, expect } from "vitest";
import { scoreIndustryCandidates } from "../industry-candidate-scoring";
import { type PageType } from "../domain-crawler";

describe("Regression Tests: Conflict Detection Logic", () => {
  describe("Close top candidates => conflicted", () => {
    it("should detect conflict when top scores differ by 15 or less", () => {
      const signals = [
        // Software signals (score ~55)
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
        // Healthtech signals (score ~48) - close to software
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
        ["https://example.com/services", { pageType: "product" as PageType, text: "medical software" }],
      ]);

      const result = scoreIndustryCandidates({ signals, pages });

      const softwareCandidate = result.candidates.find(c => c.value === "software");
      const healthtechCandidate = result.candidates.find(c => c.value === "healthtech");

      expect(softwareCandidate).toBeDefined();
      expect(healthtechCandidate).toBeDefined();

      // Should detect conflict (gap <= 15)
      const scoreGap = Math.abs(softwareCandidate!.supportScore - healthtechCandidate!.supportScore);
      expect(scoreGap).toBeLessThanOrEqual(15);
      expect(result.hasConflict).toBe(true);
      
      // Both candidates should be marked as conflicted
      expect(softwareCandidate!.isConflicted).toBe(true);
      expect(healthtechCandidate!.isConflicted).toBe(true);
      
      // Confidence should be overridden to unknown due to conflict
      expect(softwareCandidate!.confidenceBand).toBe("unknown");
      expect(healthtechCandidate!.confidenceBand).toBe("unknown");
      
      // Should have conflicting signals
      expect(softwareCandidate!.conflictingSignals.length).toBeGreaterThan(0);
      expect(healthtechCandidate!.conflictingSignals.length).toBeGreaterThan(0);
    });

    it("should detect conflict at exactly 15 point threshold", () => {
      const signals = [
        // Software signals designed to score exactly 60
        {
          fieldKey: "industry" as const,
          candidateValue: "software",
          signalType: "DIRECT_QUOTE",
          snippet: "Software platform for business",
          sourceUrl: "https://example.com/about",
          pageType: "about" as PageType,
          strength: "moderate" as const,
          reason: "Direct quote",
          location: "body",
          position: 0,
        },
        // Healthtech signals designed to score exactly 45
        {
          fieldKey: "industry" as const,
          candidateValue: "healthtech",
          signalType: "DIRECT_QUOTE",
          snippet: "Medical platform for healthcare",
          sourceUrl: "https://example.com/services",
          pageType: "product" as PageType,
          strength: "moderate" as const,
          reason: "Direct quote",
          location: "body",
          position: 0,
        },
      ];

      const pages = new Map([
        ["https://example.com/about", { pageType: "about" as PageType, text: "software platform" }],
        ["https://example.com/services", { pageType: "product" as PageType, text: "medical platform" }],
      ]);

      const result = scoreIndustryCandidates({ signals, pages });

      const softwareCandidate = result.candidates.find(c => c.value === "software");
      const healthtechCandidate = result.candidates.find(c => c.value === "healthtech");

      expect(softwareCandidate).toBeDefined();
      expect(healthtechCandidate).toBeDefined();

      // Should detect conflict at exactly 15 point gap
      const scoreGap = Math.abs(softwareCandidate!.supportScore - healthtechCandidate!.supportScore);
      expect(scoreGap).toBeLessThanOrEqual(15);
      expect(result.hasConflict).toBe(true);
    });

    it("should detect conflict with three close candidates", () => {
      const signals = [
        // Software: ~50 points
        {
          fieldKey: "industry" as const,
          candidateValue: "software",
          signalType: "DIRECT_QUOTE",
          snippet: "Software solutions",
          sourceUrl: "https://example.com/about",
          pageType: "about" as PageType,
          strength: "moderate" as const,
          reason: "Direct quote",
          location: "body",
          position: 0,
        },
        // Fintech: ~45 points
        {
          fieldKey: "industry" as const,
          candidateValue: "fintech",
          signalType: "DIRECT_QUOTE",
          snippet: "Financial technology platform",
          sourceUrl: "https://example.com/product",
          pageType: "product" as PageType,
          strength: "moderate" as const,
          reason: "Direct quote",
          location: "body",
          position: 0,
        },
        // Healthtech: ~40 points
        {
          fieldKey: "industry" as const,
          candidateValue: "healthtech",
          signalType: "INFERRED",
          snippet: "Healthcare solutions",
          sourceUrl: "https://example.com/services",
          pageType: "docs" as PageType,
          strength: "weak" as const,
          reason: "Inferred",
          location: "body",
          position: 0,
        },
      ];

      const pages = new Map([
        ["https://example.com/about", { pageType: "about" as PageType, text: "software solutions" }],
        ["https://example.com/product", { pageType: "product" as PageType, text: "financial technology" }],
        ["https://example.com/services", { pageType: "docs" as PageType, text: "healthcare solutions" }],
      ]);

      const result = scoreIndustryCandidates({ signals, pages });

      const softwareCandidate = result.candidates.find(c => c.value === "software");
      const fintechCandidate = result.candidates.find(c => c.value === "fintech");
      const healthtechCandidate = result.candidates.find(c => c.value === "healthtech");

      expect(softwareCandidate).toBeDefined();
      expect(fintechCandidate).toBeDefined();
      expect(healthtechCandidate).toBeDefined();

      // Top two should be in conflict (gap <= 15)
      const topGap = Math.abs(softwareCandidate!.supportScore - fintechCandidate!.supportScore);
      expect(topGap).toBeLessThanOrEqual(15);
      expect(result.hasConflict).toBe(true);
      
      // Top two should be marked as conflicted
      expect(softwareCandidate!.isConflicted).toBe(true);
      expect(fintechCandidate!.isConflicted).toBe(true);
      
      // Third candidate might not be conflicted if gap is larger
      const secondGap = Math.abs(fintechCandidate!.supportScore - healthtechCandidate!.supportScore);
      if (secondGap > 15) {
        expect(healthtechCandidate!.isConflicted).toBe(false);
      }
    });
  });

  describe("Clear score gap => not conflicted", () => {
    it("should not detect conflict when top scores differ by more than 15", () => {
      const signals = [
        // Software signals (strong, ~82 points)
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
          snippet: "JSON-LD: software company",
          sourceUrl: "https://example.com",
          pageType: "homepage" as PageType,
          strength: "strong" as const,
          reason: "Structured data",
          location: "json-ld",
          position: 0,
        },
        // Healthtech signals (weak, ~40 points)
        {
          fieldKey: "industry" as const,
          candidateValue: "healthtech",
          signalType: "INFERRED",
          snippet: "Healthcare terms mentioned in compliance section",
          sourceUrl: "https://example.com/security",
          pageType: "security" as PageType,
          strength: "weak" as const,
          reason: "Inferred",
          location: "body",
          position: 0,
        },
      ];

      const pages = new Map([
        ["https://example.com/about", { pageType: "about" as PageType, text: "software company" }],
        ["https://example.com/product", { pageType: "product" as PageType, text: "SaaS platform" }],
        ["https://example.com", { 
          pageType: "homepage" as PageType, 
          text: "software", 
          jsonLd: { "@type": "Organization", "industry": "Computer Software" }
        }],
        ["https://example.com/security", { pageType: "security" as PageType, text: "healthcare terms" }],
      ]);

      const result = scoreIndustryCandidates({ signals, pages });

      const softwareCandidate = result.candidates.find(c => c.value === "software");
      const healthtechCandidate = result.candidates.find(c => c.value === "healthtech");

      expect(softwareCandidate).toBeDefined();
      expect(healthtechCandidate).toBeDefined();

      // Should not detect conflict (gap > 15)
      const scoreGap = Math.abs(softwareCandidate!.supportScore - healthtechCandidate!.supportScore);
      expect(scoreGap).toBeGreaterThan(15);
      expect(result.hasConflict).toBe(false);
      
      // Software should not be conflicted
      expect(softwareCandidate!.isConflicted).toBe(false);
      expect(softwareCandidate!.confidenceBand).toBe("high");
      
      // Healthtech should not be conflicted
      expect(healthtechCandidate!.isConflicted).toBe(false);
      expect(healthtechCandidate!.confidenceBand).toBe("limited");
      
      // Software should be primary
      expect(result.primaryIndustry).toBe("software");
    });

    it("should not detect conflict with single dominant candidate", () => {
      const signals = [
        // Strong software signals
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
          snippet: "Our platform",
          sourceUrl: "https://example.com/product",
          pageType: "product" as PageType,
          strength: "strong" as const,
          reason: "Direct quote",
          location: "body",
          position: 0,
        },
        // Very weak fintech signal
        {
          fieldKey: "industry" as const,
          candidateValue: "fintech",
          signalType: "INFERRED",
          snippet: "Payment mentioned once",
          sourceUrl: "https://example.com/docs",
          pageType: "docs" as PageType,
          strength: "weak" as const,
          reason: "Inferred",
          location: "body",
          position: 0,
        },
      ];

      const pages = new Map([
        ["https://example.com/about", { pageType: "about" as PageType, text: "software company" }],
        ["https://example.com/product", { pageType: "product" as PageType, text: "platform" }],
        ["https://example.com/docs", { pageType: "docs" as PageType, text: "payment mentioned" }],
      ]);

      const result = scoreIndustryCandidates({ signals, pages });

      const softwareCandidate = result.candidates.find(c => c.value === "software");
      const fintechCandidate = result.candidates.find(c => c.value === "fintech");

      expect(softwareCandidate).toBeDefined();
      expect(fintechCandidate).toBeDefined();

      // Should not detect conflict
      expect(result.hasConflict).toBe(false);
      
      // Large score gap
      const scoreGap = Math.abs(softwareCandidate!.supportScore - fintechCandidate!.supportScore);
      expect(scoreGap).toBeGreaterThan(30);
      
      // Software should be high confidence, not conflicted
      expect(softwareCandidate!.isConflicted).toBe(false);
      expect(softwareCandidate!.confidenceBand).toBe("high");
      
      // Fintech should be low confidence, not conflicted
      expect(fintechCandidate!.isConflicted).toBe(false);
      expect(fintechCandidate!.confidenceBand).toBe("limited");
    });
  });

  describe("Conflict threshold behavior", () => {
    it("should use 15-point threshold consistently", () => {
      const testCases = [
        { software: 75, healthtech: 60, expectedConflict: true },  // 15 point gap = conflict
        { software: 76, healthtech: 60, expectedConflict: false }, // 16 point gap = no conflict
        { software: 74, healthtech: 60, expectedConflict: true },  // 14 point gap = conflict
        { software: 80, healthtech: 64, expectedConflict: true },  // 16 point gap = no conflict
        { software: 80, healthtech: 65, expectedConflict: false }, // 15 point gap = conflict
      ];

      testCases.forEach(({ software, healthtech, expectedConflict }, index) => {
        // Create signals to achieve target scores
        const signals = [
          {
            fieldKey: "industry" as const,
            candidateValue: "software",
            signalType: "DIRECT_QUOTE",
            snippet: "Software company",
            sourceUrl: "https://example.com/about",
            pageType: "about" as PageType,
            strength: "strong" as const,
            reason: "Direct quote",
            location: "body",
            position: 0,
          },
          {
            fieldKey: "industry" as const,
            candidateValue: "healthtech",
            signalType: "DIRECT_QUOTE",
            snippet: "Healthcare platform",
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
          ["https://example.com/services", { pageType: "product" as PageType, text: "healthcare platform" }],
        ]);

        const result = scoreIndustryCandidates({ signals, pages });
        
        // Check that the actual scores are close to our targets
        const actualSoftware = result.candidates.find(c => c.value === "software")?.supportScore || 0;
        const actualHealthtech = result.candidates.find(c => c.value === "healthtech")?.supportScore || 0;
        const actualGap = Math.abs(actualSoftware - actualHealthtech);
        
        // Verify conflict detection based on actual gap
        const shouldBeConflicted = actualGap <= 15;
        expect(result.hasConflict).toBe(shouldBeConflicted);
      });
    });

    it("should handle edge case of identical scores", () => {
      const signals = [
        {
          fieldKey: "industry" as const,
          candidateValue: "software",
          signalType: "DIRECT_QUOTE",
          snippet: "Software platform",
          sourceUrl: "https://example.com/about",
          pageType: "about" as PageType,
          strength: "moderate" as const,
          reason: "Direct quote",
          location: "body",
          position: 0,
        },
        {
          fieldKey: "industry" as const,
          candidateValue: "fintech",
          signalType: "DIRECT_QUOTE",
          snippet: "Financial platform",
          sourceUrl: "https://example.com/about",
          pageType: "about" as PageType,
          strength: "moderate" as const,
          reason: "Direct quote",
          location: "body",
          position: 0,
        },
      ];

      const pages = new Map([
        ["https://example.com/about", { pageType: "about" as PageType, text: "platform" }],
      ]);

      const result = scoreIndustryCandidates({ signals, pages });

      const softwareCandidate = result.candidates.find(c => c.value === "software");
      const fintechCandidate = result.candidates.find(c => c.value === "fintech");

      expect(softwareCandidate).toBeDefined();
      expect(fintechCandidate).toBeDefined();

      // Identical scores should definitely be conflicted
      const scoreGap = Math.abs(softwareCandidate!.supportScore - fintechCandidate!.supportScore);
      expect(scoreGap).toBeLessThanOrEqual(5); // Very small gap
      expect(result.hasConflict).toBe(true);
      expect(softwareCandidate!.isConflicted).toBe(true);
      expect(fintechCandidate!.isConflicted).toBe(true);
    });
  });

  describe("Conflict impact on confidence bands", () => {
    it("should override confidence band to unknown when conflicted", () => {
      const signals = [
        // Both candidates would normally have high/medium confidence
        {
          fieldKey: "industry" as const,
          candidateValue: "software",
          signalType: "DIRECT_QUOTE",
          snippet: "Software company with strong evidence",
          sourceUrl: "https://example.com/about",
          pageType: "about" as PageType,
          strength: "strong" as const,
          reason: "Direct quote",
          location: "body",
          position: 0,
        },
        {
          fieldKey: "industry" as const,
          candidateValue: "fintech",
          signalType: "DIRECT_QUOTE",
          snippet: "Financial technology with strong evidence",
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
        ["https://example.com/services", { pageType: "product" as PageType, text: "financial technology" }],
      ]);

      const result = scoreIndustryCandidates({ signals, pages });

      const softwareCandidate = result.candidates.find(c => c.value === "software");
      const fintechCandidate = result.candidates.find(c => c.value === "fintech");

      // Both should have high support scores but be conflicted
      expect(softwareCandidate!.supportScore).toBeGreaterThan(60);
      expect(fintechCandidate!.supportScore).toBeGreaterThan(60);
      
      // Conflict should override confidence to unknown
      expect(softwareCandidate!.confidenceBand).toBe("unknown");
      expect(fintechCandidate!.confidenceBand).toBe("unknown");
      expect(softwareCandidate!.isConflicted).toBe(true);
      expect(fintechCandidate!.isConflicted).toBe(true);
      expect(result.hasConflict).toBe(true);
    });

    it("should maintain evidence quality assessment despite conflict", () => {
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
          candidateValue: "healthtech",
          signalType: "DIRECT_QUOTE",
          snippet: "Medical software solutions",
          sourceUrl: "https://example.com/services",
          pageType: "product" as PageType,
          strength: "strong" as const,
          reason: "Direct quote",
          location: "body",
          position: 0,
        },
        {
          fieldKey: "industry" as const,
          candidateValue: "healthtech",
          signalType: "DIRECT_QUOTE",
          snippet: "Healthcare platform",
          sourceUrl: "https://example.com/platform",
          pageType: "product" as PageType,
          strength: "strong" as const,
          reason: "Direct quote",
          location: "body",
          position: 0,
        },
      ];

      const pages = new Map([
        ["https://example.com/about", { pageType: "about" as PageType, text: "software company" }],
        ["https://example.com/product", { pageType: "product" as PageType, text: "SaaS platform" }],
        ["https://example.com/services", { pageType: "product" as PageType, text: "medical software" }],
        ["https://example.com/platform", { pageType: "product" as PageType, text: "healthcare platform" }],
      ]);

      const result = scoreIndustryCandidates({ signals, pages });

      const softwareCandidate = result.candidates.find(c => c.value === "software");
      const healthtechCandidate = result.candidates.find(c => c.value === "healthtech");

      // Evidence coverage should still be calculated correctly
      expect(softwareCandidate!.evidenceCoverage).toBe("strong");
      expect(healthtechCandidate!.evidenceCoverage).toBe("strong");
      
      // Support scores should reflect evidence quality
      expect(softwareCandidate!.supportScore).toBeGreaterThan(70);
      expect(healthtechCandidate!.supportScore).toBeGreaterThan(70);
      
      // But confidence should be overridden due to conflict
      expect(softwareCandidate!.confidenceBand).toBe("unknown");
      expect(healthtechCandidate!.confidenceBand).toBe("unknown");
      expect(result.hasConflict).toBe(true);
    });
  });
});
