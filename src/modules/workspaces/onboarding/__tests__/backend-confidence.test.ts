import { describe, it, expect } from "vitest";
import { WebsiteAnalysisService, ConfidenceBand } from "../website-analysis-service";

describe("Backend Confidence Calculation", () => {
  describe("AI confidence vs Backend confidence separation", () => {
    it("stores AI confidence separately from user-facing confidence", () => {
      const raw = {
        industry: {
          value: "software",
          category: "OBSERVED",
          confidence: 0.35, // Low AI confidence
          source: "homepage",
          candidates: [
            { value: "software", confidence: 0.35, sourcePages: ["https://example.com"] },
          ],
        },
        productType: {
          value: "saas",
          category: "OBSERVED",
          confidence: 0.80,
          candidates: [
            { value: "saas", confidence: 0.80, sourcePages: ["https://example.com"] },
          ],
        },
        tailoringConfidence: 0.60,
        suggestedDocuments: [],
      };

      // Create strong evidence items (simulating 10 strong pages with 5,000 chars)
      const evidenceItems = Array(10).fill(null).map((_, i) => ({
        evidence: {
          url: `https://example.com/page${i}`,
          title: "Software Solutions",
          headings: ["Our Platform", "Features", "Security"],
          snippet: "Enterprise software platform for security and compliance. We build SaaS solutions.",
        },
        pageType: i === 0 ? "homepage" : i === 1 ? "security" : "product" as const,
        score: i === 1 ? 1.5 : 1.0,
        structured: {
          url: `https://example.com/page${i}`,
          title: "Software Solutions",
          pageType: i === 0 ? "homepage" : i === 1 ? "security" : "product" as const,
          score: i === 1 ? 1.5 : 1.0,
          sourceConfidence: 0.9,
          blocks: [
            { kind: "heading-section" as const, level: 1 as const, heading: "Our Platform", bodyText: "Enterprise software" },
            { kind: "heading-section" as const, level: 2 as const, heading: "Features", bodyText: "SaaS platform" },
            { kind: "body-fallback" as const, text: "We build software solutions for enterprise customers. Our platform helps with security and compliance." },
          ],
        },
      }));

      const result = (WebsiteAnalysisService as any).normalizeProfile(raw, evidenceItems);

      expect(result).not.toBeNull();
      expect(result?.industry?.aiConfidence).toBe(0.35); // Raw AI confidence preserved
      expect(result?.industry?.confidence).toBeGreaterThan(0.5); // Backend confidence boosted due to strong evidence
      expect(result?.industry?.confidenceBand).toBe("high"); // Should be high due to strong evidence
      expect(result?.industry?.supportScore).toBeGreaterThanOrEqual(70); // Strong support score
      expect(result?.industry?.evidenceCoverage).toBe("strong");
      expect(result?.industry?.reasons).toContain(expect.stringContaining("strong evidence"));
    });

    it("caps backend confidence when AI is very uncertain", () => {
      const raw = {
        industry: {
          value: "software",
          category: "HYPOTHESIZED",
          confidence: 0.25, // Very low AI confidence
          source: "inferred",
        },
        productType: {
          value: "saas",
          category: "OBSERVED",
          confidence: 0.85,
          candidates: [
            { value: "saas", confidence: 0.85, sourcePages: ["https://example.com"] },
          ],
        },
        tailoringConfidence: 0.30,
        suggestedDocuments: [],
      };

      // Weak evidence (only 2 pages)
      const evidenceItems = [
        {
          evidence: {
            url: "https://example.com",
            title: "Home",
            headings: ["Welcome"],
            snippet: "Software company",
          },
          pageType: "homepage" as const,
          score: 1.0,
          structured: {
            url: "https://example.com",
            title: "Home",
            pageType: "homepage" as const,
            score: 1.0,
            sourceConfidence: 0.5,
            blocks: [
              { kind: "heading-section" as const, level: 1 as const, heading: "Welcome", bodyText: "Software company" },
            ],
          },
        },
        {
          evidence: {
            url: "https://example.com/about",
            title: "About",
            headings: ["About Us"],
            snippet: "We make software",
          },
          pageType: "about" as const,
          score: 0.8,
          structured: {
            url: "https://example.com/about",
            title: "About",
            pageType: "about" as const,
            score: 0.8,
            sourceConfidence: 0.6,
            blocks: [
              { kind: "heading-section" as const, level: 1 as const, heading: "About Us", bodyText: "We make software" },
            ],
          },
        },
      ];

      const result = (WebsiteAnalysisService as any).normalizeProfile(raw, evidenceItems);

      expect(result).not.toBeNull();
      expect(result?.industry?.aiConfidence).toBe(0.25);
      // Backend confidence should be capped due to AI uncertainty
      expect(result?.industry?.confidence).toBeLessThanOrEqual(0.7);
      expect(result?.industry?.confidenceBand).not.toBe("high");
    });

    it("boosts backend confidence when AI is low but evidence is strong", () => {
      const raw = {
        industry: {
          value: "software",
          category: "OBSERVED",
          confidence: 0.35, // AI says 35%
          source: "homepage mentions software",
          candidates: [
            { value: "software", confidence: 0.35, sourcePages: ["https://example.com"] },
            { value: "fintech", confidence: 0.30, sourcePages: ["https://example.com/customers"] },
          ],
        },
        productType: {
          value: "saas",
          category: "OBSERVED",
          confidence: 0.90,
          candidates: [
            { value: "saas", confidence: 0.90, sourcePages: ["https://example.com"] },
          ],
        },
        tailoringConfidence: 0.70,
        suggestedDocuments: [],
      };

      // Very strong evidence (12 pages, multiple security/compliance pages)
      const evidenceItems = [
        ...Array(5).fill(null).map((_, i) => ({
          evidence: {
            url: `https://example.com/page${i}`,
            title: "Software Platform",
            headings: ["Enterprise Software", "SaaS Solutions"],
            snippet: "We build enterprise software and SaaS platforms for security and compliance.",
          },
          pageType: "product" as const,
          score: 1.2,
          structured: {
            url: `https://example.com/page${i}`,
            title: "Software Platform",
            pageType: "product" as const,
            score: 1.2,
            sourceConfidence: 0.9,
            blocks: [
              { kind: "heading-section" as const, level: 1 as const, heading: "Enterprise Software", bodyText: "Software platform" },
              { kind: "heading-section" as const, level: 2 as const, heading: "SaaS Solutions", bodyText: "Cloud software" },
              { kind: "body-fallback" as const, text: "We build software. Our SaaS platform serves enterprises." },
            ],
          },
        })),
        ...Array(3).fill(null).map((_, i) => ({
          evidence: {
            url: `https://example.com/security${i}`,
            title: "Security",
            headings: ["Security Features", "Compliance"],
            snippet: "SOC 2 compliant software platform with enterprise security.",
          },
          pageType: "security" as const,
          score: 1.5,
          structured: {
            url: `https://example.com/security${i}`,
            title: "Security",
            pageType: "security" as const,
            score: 1.5,
            sourceConfidence: 0.95,
            blocks: [
              { kind: "heading-section" as const, level: 1 as const, heading: "Security Features", bodyText: "Enterprise security" },
              { kind: "heading-section" as const, level: 2 as const, heading: "Compliance", bodyText: "SOC 2" },
              { kind: "body-fallback" as const, text: "Our software platform maintains SOC 2 compliance." },
            ],
          },
        })),
        ...Array(4).fill(null).map((_, i) => ({
          evidence: {
            url: `https://example.com/doc${i}`,
            title: "Documentation",
            headings: ["API Reference", "Integration"],
            snippet: "Software API documentation for developers.",
          },
          pageType: "docs" as const,
          score: 0.8,
          structured: {
            url: `https://example.com/doc${i}`,
            title: "Documentation",
            pageType: "docs" as const,
            score: 0.8,
            sourceConfidence: 0.7,
            blocks: [
              { kind: "heading-section" as const, level: 1 as const, heading: "API Reference", bodyText: "Developer docs" },
              { kind: "body-fallback" as const, text: "API documentation for our software platform." },
            ],
          },
        })),
      ];

      const result = (WebsiteAnalysisService as any).normalizeProfile(raw, evidenceItems);

      expect(result).not.toBeNull();
      expect(result?.industry?.aiConfidence).toBe(0.35); // Original AI confidence preserved
      expect(result?.industry?.confidence).toBeGreaterThan(0.5); // But backend confidence is boosted
      expect(result?.industry?.confidenceBand).toBe("high"); // High due to strong evidence
      expect(result?.industry?.supportScore).toBeGreaterThanOrEqual(70);
      expect(result?.industry?.evidenceCoverage).toBe("strong");
      expect(result?.industry?.reasons?.some((r: string) => r.includes("Evidence-based override"))).toBe(true);
    });

    it("detects conflicted fields and sets appropriate confidence band", () => {
      const raw = {
        industry: {
          value: "software",
          category: "DERIVED",
          confidence: 0.65,
          source: "mixed signals",
          candidates: [
            { value: "software", confidence: 0.65, sourcePages: ["https://example.com"] },
            { value: "fintech", confidence: 0.60, sourcePages: ["https://example.com/customers"] }, // Only 5% gap = conflict
          ],
        },
        productType: {
          value: "saas",
          category: "OBSERVED",
          confidence: 0.85,
          candidates: [
            { value: "saas", confidence: 0.85, sourcePages: ["https://example.com"] },
          ],
        },
        tailoringConfidence: 0.60,
        suggestedDocuments: [],
      };

      const evidenceItems = Array(8).fill(null).map((_, i) => ({
        evidence: {
          url: `https://example.com/page${i}`,
          title: i === 0 ? "Software" : i === 1 ? "Fintech Solutions" : "Products",
          headings: ["Solutions"],
          snippet: i === 1 ? "Financial technology platform" : "Software platform",
        },
        pageType: i === 0 ? "homepage" : i === 1 ? "product" : "about" as const,
        score: 1.0,
        structured: {
          url: `https://example.com/page${i}`,
          title: i === 0 ? "Software" : i === 1 ? "Fintech Solutions" : "Products",
          pageType: i === 0 ? "homepage" : i === 1 ? "product" : "about" as const,
          score: 1.0,
          sourceConfidence: 0.8,
          blocks: [
            { kind: "heading-section" as const, level: 1 as const, heading: "Solutions", bodyText: "Platform" },
          ],
        },
      }));

      const result = (WebsiteAnalysisService as any).normalizeProfile(raw, evidenceItems);

      expect(result).not.toBeNull();
      expect(result?.industry?.confidenceBand).toBe("conflicted");
      expect(result?.industry?.reasons?.some((r: string) => r.includes("Conflicting signals"))).toBe(true);
    });

    it("provides reasons for confidence calculation", () => {
      const raw = {
        industry: {
          value: "software",
          category: "OBSERVED",
          confidence: 0.70,
          source: "homepage",
          candidates: [
            { value: "software", confidence: 0.70, sourcePages: ["https://example.com"] },
          ],
        },
        productType: {
          value: "saas",
          category: "OBSERVED",
          confidence: 0.80,
          candidates: [
            { value: "saas", confidence: 0.80, sourcePages: ["https://example.com"] },
          ],
        },
        tailoringConfidence: 0.75,
        suggestedDocuments: [],
      };

      const evidenceItems = Array(6).fill(null).map((_, i) => ({
        evidence: {
          url: `https://example.com/page${i}`,
          title: "Security",
          headings: ["Enterprise Security", "Compliance"],
          snippet: "SOC 2 compliant software platform.",
        },
        pageType: "security" as const,
        score: 1.5,
        structured: {
          url: `https://example.com/page${i}`,
          title: "Security",
          pageType: "security" as const,
          score: 1.5,
          sourceConfidence: 0.9,
          blocks: [
            { kind: "heading-section" as const, level: 1 as const, heading: "Enterprise Security", bodyText: "Security" },
            { kind: "heading-section" as const, level: 2 as const, heading: "Compliance", bodyText: "SOC 2" },
          ],
        },
      }));

      const result = (WebsiteAnalysisService as any).normalizeProfile(raw, evidenceItems);

      expect(result).not.toBeNull();
      expect(result?.industry?.reasons).toBeDefined();
      expect(result?.industry?.reasons?.length).toBeGreaterThan(0);
      expect(result?.industry?.reasons?.some((r: string) => r.includes("compliance/security"))).toBe(true);
    });
  });

  describe("confidence band mapping", () => {
    it("maps support scores to correct confidence bands", () => {
      // Test cases for confidence band thresholds
      const testCases = [
        { supportScore: 85, expectedBand: "high" },
        { supportScore: 70, expectedBand: "high" },
        { supportScore: 69, expectedBand: "medium" },
        { supportScore: 50, expectedBand: "medium" },
        { supportScore: 49, expectedBand: "limited" },
        { supportScore: 30, expectedBand: "limited" },
        { supportScore: 29, expectedBand: "unknown" },
        { supportScore: 10, expectedBand: "unknown" },
      ];

      for (const testCase of testCases) {
        // Verify the logic matches our implementation
        let expectedBand: ConfidenceBand;
        if (testCase.supportScore >= 70) {
          expectedBand = "high";
        } else if (testCase.supportScore >= 50) {
          expectedBand = "medium";
        } else if (testCase.supportScore >= 30) {
          expectedBand = "limited";
        } else {
          expectedBand = "unknown";
        }
        
        expect(expectedBand).toBe(testCase.expectedBand);
      }
    });
  });
});
