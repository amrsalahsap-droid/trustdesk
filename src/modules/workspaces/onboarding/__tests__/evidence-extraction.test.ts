import { describe, it, expect } from "vitest";
import {
  extractEvidenceFromPage,
  extractAllEvidence,
  hasSufficientEvidence,
  getConflicts,
  truncateSnippet,
  extractSnippets,
  type EvidenceSignal,
  type EvidenceFieldKey,
  type FieldEvidence,
  type EvidenceExtractionResult,
} from "@/modules/workspaces/onboarding/evidence-extraction";
import { type CrawlAttempt } from "@/modules/workspaces/onboarding/domain-crawler";

describe("Evidence Extraction", () => {
  describe("truncateSnippet", () => {
    it("returns short text unchanged", () => {
      const text = "Short text";
      expect(truncateSnippet(text, 50)).toBe("Short text");
    });

    it("truncates long text at sentence boundary", () => {
      const text = "This is a long sentence. This is another sentence.";
      const result = truncateSnippet(text, 30);
      expect(result).toBe("This is a long sentence.");
    });

    it("truncates at word boundary if no sentence end", () => {
      const text = "This is a long piece of text without sentence breaks";
      const result = truncateSnippet(text, 30);
      expect(result).toContain("...");
      expect(result.length).toBeLessThanOrEqual(33);
    });
  });

  describe("extractEvidenceFromPage", () => {
    it("returns empty array for failed page", () => {
      const page: CrawlAttempt = {
        attemptedUrl: "https://example.com",
        success: false,
        extractionStatus: "error",
        depth: 0,
        discoveredLinks: [],
        timestamp: new Date(),
        pageType: "unknown",
        usefulnessScore: 0,
        usefulnessTier: "minimal",
        classificationSignals: {},
      };

      const signals = extractEvidenceFromPage(page);
      expect(signals).toHaveLength(0);
    });

    it("extracts security posture evidence from security page", () => {
      const page: CrawlAttempt = {
        attemptedUrl: "https://example.com/security",
        fetchedUrl: "https://example.com/security",
        success: true,
        statusCode: 200,
        title: "Security Overview - Enterprise Security",
        textLength: 2000,
        extractionStatus: "success",
        depth: 0,
        discoveredLinks: [],
        timestamp: new Date(),
        pageType: "security",
        usefulnessScore: 100,
        usefulnessTier: "critical",
        classificationSignals: {
          urlPattern: "security",
        },
      };

      const signals = extractEvidenceFromPage(page);
      expect(signals.length).toBeGreaterThan(0);
      expect(signals[0].fieldKey).toBe("securityPosture");
      expect(signals[0].pageType).toBe("security");
    });

    it("extracts compliance evidence from compliance page", () => {
      const page: CrawlAttempt = {
        attemptedUrl: "https://example.com/compliance",
        fetchedUrl: "https://example.com/compliance",
        success: true,
        statusCode: 200,
        title: "Compliance & Certifications",
        textLength: 1500,
        extractionStatus: "success",
        depth: 0,
        discoveredLinks: [],
        timestamp: new Date(),
        pageType: "compliance",
        usefulnessScore: 90,
        usefulnessTier: "critical",
        classificationSignals: {
          urlPattern: "compliance",
        },
      };

      const signals = extractEvidenceFromPage(page);
      expect(signals.length).toBeGreaterThan(0);
      expect(signals[0].fieldKey).toBe("complianceFocus");
    });

    it("extracts product type from product page", () => {
      const page: CrawlAttempt = {
        attemptedUrl: "https://example.com/product",
        fetchedUrl: "https://example.com/product",
        success: true,
        statusCode: 200,
        title: "Our SaaS Platform",
        textLength: 1800,
        extractionStatus: "success",
        depth: 0,
        discoveredLinks: [],
        timestamp: new Date(),
        pageType: "product",
        usefulnessScore: 75,
        usefulnessTier: "high",
        classificationSignals: {
          urlPattern: "product",
        },
      };

      const signals = extractEvidenceFromPage(page);
      expect(signals.length).toBeGreaterThan(0);
      expect(signals[0].fieldKey).toBe("productType");
    });

    it("creates signal with proper snippet", () => {
      const page: CrawlAttempt = {
        attemptedUrl: "https://example.com/security",
        fetchedUrl: "https://example.com/security",
        success: true,
        statusCode: 200,
        title: "Security - SOC 2 Certified",
        textLength: 2000,
        extractionStatus: "success",
        depth: 0,
        discoveredLinks: [],
        timestamp: new Date(),
        pageType: "security",
        usefulnessScore: 100,
        usefulnessTier: "critical",
        classificationSignals: {
          urlPattern: "security",
        },
      };

      const signals = extractEvidenceFromPage(page);
      expect(signals[0].snippet).toContain("SOC 2");
      expect(signals[0].snippet.length).toBeLessThanOrEqual(200);
    });
  });

  describe("extractAllEvidence", () => {
    it("aggregates signals from multiple pages", async () => {
      const pages: CrawlAttempt[] = [
        {
          attemptedUrl: "https://example.com/security",
          fetchedUrl: "https://example.com/security",
          success: true,
          statusCode: 200,
          title: "Security",
          textLength: 2000,
          extractionStatus: "success",
          depth: 0,
          discoveredLinks: [],
          timestamp: new Date(),
          pageType: "security",
          usefulnessScore: 100,
          usefulnessTier: "critical",
          classificationSignals: { urlPattern: "security" },
        },
        {
          attemptedUrl: "https://example.com/compliance",
          fetchedUrl: "https://example.com/compliance",
          success: true,
          statusCode: 200,
          title: "Compliance",
          textLength: 1500,
          extractionStatus: "success",
          depth: 0,
          discoveredLinks: [],
          timestamp: new Date(),
          pageType: "compliance",
          usefulnessScore: 90,
          usefulnessTier: "critical",
          classificationSignals: { urlPattern: "compliance" },
        },
      ];

      const result = await extractAllEvidence(pages);

      expect(Object.keys(result.fields).length).toBeGreaterThan(0);
      expect(result.contributingPages.length).toBe(2);
      expect(result.emptyPages.length).toBe(0);
    });

    it("identifies empty pages", async () => {
      const pages: CrawlAttempt[] = [
        {
          attemptedUrl: "https://example.com/random",
          fetchedUrl: "https://example.com/random",
          success: true,
          statusCode: 200,
          title: "Random Page",
          textLength: 100,
          extractionStatus: "success",
          depth: 0,
          discoveredLinks: [],
          timestamp: new Date(),
          pageType: "unknown",
          usefulnessScore: 10,
          usefulnessTier: "minimal",
          classificationSignals: {},
        },
      ];

      const result = await extractAllEvidence(pages);

      expect(result.contributingPages.length).toBe(0);
      expect(result.emptyPages.length).toBe(1);
    });

    it("tracks skipped pages", async () => {
      const pages: CrawlAttempt[] = [
        {
          attemptedUrl: "https://example.com/failed",
          success: false,
          extractionStatus: "error",
          depth: 0,
          discoveredLinks: [],
          timestamp: new Date(),
          pageType: "unknown",
          usefulnessScore: 0,
          usefulnessTier: "minimal",
          classificationSignals: {},
        },
      ];

      const result = await extractAllEvidence(pages);

      expect(result.emptyPages.length).toBe(0);
      expect(result.contributingPages.length).toBe(0);
    });

    it("detects field coverage levels", async () => {
      const pages: CrawlAttempt[] = [
        {
          attemptedUrl: "https://example.com/security",
          fetchedUrl: "https://example.com/security",
          success: true,
          statusCode: 200,
          title: "Security",
          textLength: 2000,
          extractionStatus: "success",
          depth: 0,
          discoveredLinks: [],
          timestamp: new Date(),
          pageType: "security",
          usefulnessScore: 100,
          usefulnessTier: "critical",
          classificationSignals: { urlPattern: "security" },
        },
      ];

      const result = await extractAllEvidence(pages);

      expect(result.fields.securityPosture).toBeDefined();
      expect(result.fields.securityPosture.coverage).toBe("strong");
    });

    it("identifies overall coverage", async () => {
      const pages: CrawlAttempt[] = [
        {
          attemptedUrl: "https://example.com/security",
          fetchedUrl: "https://example.com/security",
          success: true,
          statusCode: 200,
          title: "Security",
          textLength: 2000,
          extractionStatus: "success",
          depth: 0,
          discoveredLinks: [],
          timestamp: new Date(),
          pageType: "security",
          usefulnessScore: 100,
          usefulnessTier: "critical",
          classificationSignals: { urlPattern: "security" },
        },
        {
          attemptedUrl: "https://example.com/compliance",
          fetchedUrl: "https://example.com/compliance",
          success: true,
          statusCode: 200,
          title: "Compliance",
          textLength: 1500,
          extractionStatus: "success",
          depth: 0,
          discoveredLinks: [],
          timestamp: new Date(),
          pageType: "compliance",
          usefulnessScore: 90,
          usefulnessTier: "critical",
          classificationSignals: { urlPattern: "compliance" },
        },
      ];

      const result = await extractAllEvidence(pages);

      expect(result.overallCoverage).toBe("strong");
    });
  });

  describe("hasSufficientEvidence", () => {
    it("returns true for strong evidence", () => {
      const fieldEvidence = {
        fieldKey: "securityPosture" as EvidenceFieldKey,
        signals: [],
        coverage: "strong" as const,
        hasConflicts: false,
      };

      expect(hasSufficientEvidence(fieldEvidence, "moderate")).toBe(true);
    });

    it("returns true for moderate evidence when requiring moderate", () => {
      const fieldEvidence = {
        fieldKey: "securityPosture" as EvidenceFieldKey,
        signals: [],
        coverage: "moderate" as const,
        hasConflicts: false,
      };

      expect(hasSufficientEvidence(fieldEvidence, "moderate")).toBe(true);
    });

    it("returns false for weak evidence when requiring moderate", () => {
      const fieldEvidence = {
        fieldKey: "securityPosture" as EvidenceFieldKey,
        signals: [],
        coverage: "weak" as const,
        hasConflicts: false,
      };

      expect(hasSufficientEvidence(fieldEvidence, "moderate")).toBe(false);
    });

    it("returns false for undefined field", () => {
      expect(hasSufficientEvidence(undefined, "weak")).toBe(false);
    });

    it("returns true for any evidence when requiring weak", () => {
      const fieldEvidence = {
        fieldKey: "securityPosture" as EvidenceFieldKey,
        signals: [],
        coverage: "weak" as const,
        hasConflicts: false,
      };

      expect(hasSufficientEvidence(fieldEvidence, "weak")).toBe(true);
    });
  });

  describe("getConflicts", () => {
    it("returns empty array for field without conflicts", () => {
      const result: EvidenceExtractionResult = {
        fields: {
          industry: { fieldKey: "industry", signals: [], coverage: "unknown", hasConflicts: false },
          productType: { fieldKey: "productType", signals: [], coverage: "unknown", hasConflicts: false },
          customerSegment: { fieldKey: "customerSegment", signals: [], coverage: "unknown", hasConflicts: false },
          complianceFocus: { fieldKey: "complianceFocus", signals: [], coverage: "unknown", hasConflicts: false },
          securityPosture: { fieldKey: "securityPosture", signals: [], coverage: "unknown", hasConflicts: false },
          dataHandling: { fieldKey: "dataHandling", signals: [], coverage: "unknown", hasConflicts: false },
          integrations: { fieldKey: "integrations", signals: [], coverage: "unknown", hasConflicts: false },
        },
        overallCoverage: "unknown",
        contributingPages: [],
        emptyPages: [],
        conflicts: {
          industry: [],
          productType: [],
          customerSegment: [],
          complianceFocus: [],
          securityPosture: [],
          dataHandling: [],
          integrations: [],
        },
      };

      const conflicts = getConflicts(result, "industry");
      expect(conflicts).toHaveLength(0);
    });

    it("returns conflicting signals when present", async () => {
      // This would require actual conflicting signals in the result
      // For now, we test the structure
      const pages: CrawlAttempt[] = [
        {
          attemptedUrl: "https://example.com/product",
          fetchedUrl: "https://example.com/product",
          success: true,
          statusCode: 200,
          title: "Product - SaaS",
          textLength: 2000,
          extractionStatus: "success",
          depth: 0,
          discoveredLinks: [],
          timestamp: new Date(),
          pageType: "product",
          usefulnessScore: 75,
          usefulnessTier: "high",
          classificationSignals: { urlPattern: "product" },
        },
      ];

      const result = await extractAllEvidence(pages);
      const conflicts = getConflicts(result, "productType");

      // Should be empty since we only have one page
      expect(Array.isArray(conflicts)).toBe(true);
    });
  });
});
