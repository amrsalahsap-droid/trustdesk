import { describe, it, expect } from "vitest";
import {
  assessCrawlQuality,
  assessFieldCoverage,
  assessQualityAndCoverage,
  getQualityCoverageSummary,
  canFieldSupportDecision,
  getFieldConfidenceCap,
  calculateCoverageScore,
  type CrawlResult,
  type CrawlAttempt,
  type EvidenceExtractionResult,
  type FieldEvidence,
  type QualityCoverageResult,
} from "@/modules/workspaces/onboarding/quality-coverage";

describe("Quality and Coverage Separation", () => {
  describe("assessCrawlQuality", () => {
    it("rates excellent crawl with all pages successful", () => {
      const crawlResult: CrawlResult = {
        baseDomain: "example.com",
        startUrl: "https://example.com",
        pages: [
          {
            attemptedUrl: "https://example.com",
            fetchedUrl: "https://example.com",
            success: true,
            statusCode: 200,
            title: "Home",
            textLength: 2000,
            extractionStatus: "success",
            depth: 0,
            discoveredLinks: [],
            timestamp: new Date(),
            pageType: "homepage",
            usefulnessScore: 40,
            usefulnessTier: "low",
            classificationSignals: {},
          },
          {
            attemptedUrl: "https://example.com/security",
            fetchedUrl: "https://example.com/security",
            success: true,
            statusCode: 200,
            title: "Security",
            textLength: 3000,
            extractionStatus: "success",
            depth: 0,
            discoveredLinks: [],
            timestamp: new Date(),
            pageType: "security",
            usefulnessScore: 100,
            usefulnessTier: "critical",
            classificationSignals: {},
          },
          {
            attemptedUrl: "https://example.com/compliance",
            fetchedUrl: "https://example.com/compliance",
            success: true,
            statusCode: 200,
            title: "Compliance",
            textLength: 2500,
            extractionStatus: "success",
            depth: 0,
            discoveredLinks: [],
            timestamp: new Date(),
            pageType: "compliance",
            usefulnessScore: 90,
            usefulnessTier: "critical",
            classificationSignals: {},
          },
        ],
        totalAttempted: 3,
        totalFetched: 3,
        totalSuccessful: 3,
        durationMs: 5000,
        sitemapUrls: [],
        highValueUrls: ["https://example.com/security", "https://example.com/compliance"],
        classificationSummary: {
          homepage: 1,
          about: 0,
          product: 0,
          solutions: 0,
          security: 1,
          trust: 0,
          compliance: 1,
          privacy: 0,
          legal: 0,
          dpa: 0,
          docs: 0,
          pricing: 0,
          customers: 0,
          case_study: 0,
          integrations: 0,
          unknown: 0,
        },
        pagesByTier: {
          critical: [],
          high: [],
          medium: [],
          low: [],
          minimal: [],
        },
        highValuePages: [],
      };

      const quality = assessCrawlQuality(crawlResult);
      expect(quality.quality).toBe("excellent");
      expect(quality.score).toBeGreaterThan(80);
      expect(quality.usableForInference).toBe(true);
      expect(quality.issues).toHaveLength(0);
    });

    it("rates poor crawl with many failures", () => {
      const crawlResult: CrawlResult = {
        baseDomain: "example.com",
        startUrl: "https://example.com",
        pages: [
          {
            attemptedUrl: "https://example.com",
            fetchedUrl: "https://example.com",
            success: true,
            statusCode: 200,
            title: "Home",
            textLength: 2000,
            extractionStatus: "success",
            depth: 0,
            discoveredLinks: [],
            timestamp: new Date(),
            pageType: "homepage",
            usefulnessScore: 40,
            usefulnessTier: "low",
            classificationSignals: {},
          },
          {
            attemptedUrl: "https://example.com/security",
            success: false,
            extractionStatus: "error",
            errorMessage: "Connection refused",
            depth: 0,
            discoveredLinks: [],
            timestamp: new Date(),
            pageType: "unknown",
            usefulnessScore: 0,
            usefulnessTier: "minimal",
            classificationSignals: {},
          },
          {
            attemptedUrl: "https://example.com/compliance",
            success: false,
            extractionStatus: "timeout",
            errorMessage: "Request timed out",
            depth: 0,
            discoveredLinks: [],
            timestamp: new Date(),
            pageType: "unknown",
            usefulnessScore: 0,
            usefulnessTier: "minimal",
            classificationSignals: {},
          },
        ],
        totalAttempted: 3,
        totalFetched: 1,
        totalSuccessful: 1,
        durationMs: 5000,
        sitemapUrls: [],
        highValueUrls: [],
        classificationSummary: {
          homepage: 1,
          about: 0,
          product: 0,
          solutions: 0,
          security: 0,
          trust: 0,
          compliance: 0,
          privacy: 0,
          legal: 0,
          dpa: 0,
          docs: 0,
          pricing: 0,
          customers: 0,
          case_study: 0,
          integrations: 0,
          unknown: 2,
        },
        pagesByTier: {
          critical: [],
          high: [],
          medium: [],
          low: [],
          minimal: [],
        },
        highValuePages: [],
      };

      const quality = assessCrawlQuality(crawlResult);
      expect(quality.quality).toBe("poor");
      expect(quality.issues.length).toBeGreaterThan(0);
      expect(quality.metrics.errorCount).toBe(1);
      expect(quality.metrics.timeoutCount).toBe(1);
    });

    it("detects no high-value pages issue", () => {
      const crawlResult: CrawlResult = {
        baseDomain: "example.com",
        startUrl: "https://example.com",
        pages: [
          {
            attemptedUrl: "https://example.com",
            fetchedUrl: "https://example.com",
            success: true,
            statusCode: 200,
            title: "Home",
            textLength: 2000,
            extractionStatus: "success",
            depth: 0,
            discoveredLinks: [],
            timestamp: new Date(),
            pageType: "homepage",
            usefulnessScore: 40,
            usefulnessTier: "low",
            classificationSignals: {},
          },
        ],
        totalAttempted: 1,
        totalFetched: 1,
        totalSuccessful: 1,
        durationMs: 5000,
        sitemapUrls: [],
        highValueUrls: [],
        classificationSummary: {
          homepage: 1,
          about: 0,
          product: 0,
          solutions: 0,
          security: 0,
          trust: 0,
          compliance: 0,
          privacy: 0,
          legal: 0,
          dpa: 0,
          docs: 0,
          pricing: 0,
          customers: 0,
          case_study: 0,
          integrations: 0,
          unknown: 0,
        },
        pagesByTier: {
          critical: [],
          high: [],
          medium: [],
          low: [],
          minimal: [],
        },
        highValuePages: [],
      };

      const quality = assessCrawlQuality(crawlResult);
      expect(quality.issues).toContain("No high-value pages found");
    });
  });

  describe("assessFieldCoverage", () => {
    it("rates field with no evidence as none", () => {
      const fieldEvidence: FieldEvidence = {
        fieldKey: "industry",
        signals: [],
        coverage: "unknown",
        hasConflicts: false,
      };

      const assessment = assessFieldCoverage("industry", fieldEvidence);
      expect(assessment.coverage).toBe("none");
      expect(assessment.score).toBe(0);
      expect(assessment.supportingPages).toBe(0);
      expect(assessment.supportsHighConfidence).toBe(false);
    });

    it("rates field with strong evidence as strong", () => {
      const fieldEvidence: FieldEvidence = {
        fieldKey: "industry",
        signals: [
          {
            fieldKey: "industry",
            candidateValue: "fintech",
            signalType: "DIRECT_QUOTE",
            snippet: "We are a fintech company",
            sourceUrl: "https://example.com/about",
            pageType: "about",
            strength: "strong",
            reason: "Explicit fintech identification",
            location: "paragraph",
            position: 0,
          },
          {
            fieldKey: "industry",
            candidateValue: "fintech",
            signalType: "DIRECT_QUOTE",
            snippet: "Our fintech platform",
            sourceUrl: "https://example.com/product",
            pageType: "product",
            strength: "strong",
            reason: "Explicit fintech identification",
            location: "title",
            position: 1,
          },
        ],
        coverage: "strong",
        hasConflicts: false,
      };

      const assessment = assessFieldCoverage("industry", fieldEvidence);
      expect(assessment.coverage).toBe("strong");
      expect(assessment.supportingPages).toBe(2);
      expect(assessment.supportsHighConfidence).toBe(true);
      expect(assessment.bestEvidenceStrength).toBe("strong");
    });

    it("detects conflicts in field evidence", () => {
      const fieldEvidence: FieldEvidence = {
        fieldKey: "industry",
        signals: [
          {
            fieldKey: "industry",
            candidateValue: "fintech",
            signalType: "DIRECT_QUOTE",
            snippet: "We are a fintech company",
            sourceUrl: "https://example.com/about",
            pageType: "about",
            strength: "strong",
            reason: "Explicit fintech identification",
            location: "paragraph",
            position: 0,
          },
          {
            fieldKey: "industry",
            candidateValue: "software",
            signalType: "CONFLICTING",
            snippet: "We are a software company",
            sourceUrl: "https://example.com/home",
            pageType: "homepage",
            strength: "moderate",
            reason: "Conflicting industry identification",
            location: "paragraph",
            position: 1,
          },
        ],
        coverage: "strong",
        hasConflicts: true,
      };

      const assessment = assessFieldCoverage("industry", fieldEvidence);
      expect(assessment.hasConflicts).toBe(true);
      expect(assessment.conflictCount).toBeGreaterThan(0);
      expect(assessment.supportsHighConfidence).toBe(false);
    });

    it("requires medium coverage for industry high confidence", () => {
      const fieldEvidence: FieldEvidence = {
        fieldKey: "industry",
        signals: [
          {
            fieldKey: "industry",
            candidateValue: "fintech",
            signalType: "DIRECT_QUOTE",
            snippet: "We are a fintech company",
            sourceUrl: "https://example.com/about",
            pageType: "about",
            strength: "weak",
            reason: "Weak fintech identification",
            location: "paragraph",
            position: 0,
          },
        ],
        coverage: "weak",
        hasConflicts: false,
      };

      const assessment = assessFieldCoverage("industry", fieldEvidence);
      expect(assessment.supportsHighConfidence).toBe(false);
    });

    it("allows lower coverage for customer segment", () => {
      const fieldEvidence: FieldEvidence = {
        fieldKey: "customerSegment",
        signals: [
          {
            fieldKey: "customerSegment",
            candidateValue: "b2b",
            signalType: "DIRECT_QUOTE",
            snippet: "For businesses",
            sourceUrl: "https://example.com",
            pageType: "homepage",
            strength: "moderate",
            reason: "B2B mention",
            location: "paragraph",
            position: 0,
          },
        ],
        coverage: "moderate",
        hasConflicts: false,
      };

      const assessment = assessFieldCoverage("customerSegment", fieldEvidence);
      // customerSegment only requires "limited" coverage
      expect(assessment.supportsHighConfidence).toBe(true);
    });
  });

  describe("assessQualityAndCoverage", () => {
    it("separates good crawl quality from weak field coverage", () => {
      const crawlResult: CrawlResult = {
        baseDomain: "example.com",
        startUrl: "https://example.com",
        pages: [
          {
            attemptedUrl: "https://example.com",
            fetchedUrl: "https://example.com",
            success: true,
            statusCode: 200,
            title: "Home",
            textLength: 2000,
            extractionStatus: "success",
            depth: 0,
            discoveredLinks: [],
            timestamp: new Date(),
            pageType: "homepage",
            usefulnessScore: 40,
            usefulnessTier: "low",
            classificationSignals: {},
          },
        ],
        totalAttempted: 1,
        totalFetched: 1,
        totalSuccessful: 1,
        durationMs: 2000,
        sitemapUrls: [],
        highValueUrls: [],
        classificationSummary: {
          homepage: 1,
          about: 0,
          product: 0,
          solutions: 0,
          security: 0,
          trust: 0,
          compliance: 0,
          privacy: 0,
          legal: 0,
          dpa: 0,
          docs: 0,
          pricing: 0,
          customers: 0,
          case_study: 0,
          integrations: 0,
          unknown: 0,
        },
        pagesByTier: {
          critical: [],
          high: [],
          medium: [],
          low: [],
          minimal: [],
        },
        highValuePages: [],
      };

      const evidenceResult: EvidenceExtractionResult = {
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
        emptyPages: ["https://example.com"],
        conflicts: {},
      };

      const result = assessQualityAndCoverage(crawlResult, evidenceResult);

      // Crawl quality should be good (page fetched successfully)
      expect(result.crawlQuality.quality).toBe("fair");
      expect(result.crawlQuality.usableForInference).toBe(true);

      // But field coverage should be weak
      expect(result.overallCoverage).toBe("none");
      expect(result.weakFields.length).toBeGreaterThan(0);
      expect(result.canMakeHighConfidenceDecisions).toBe(false);
      expect(result.recommendedConfidenceCap).toBeLessThan(1.0);
    });

    it("allows high confidence when both quality and coverage are good", () => {
      const crawlResult: CrawlResult = {
        baseDomain: "example.com",
        startUrl: "https://example.com",
        pages: [
          {
            attemptedUrl: "https://example.com/security",
            fetchedUrl: "https://example.com/security",
            success: true,
            statusCode: 200,
            title: "Security",
            textLength: 3000,
            extractionStatus: "success",
            depth: 0,
            discoveredLinks: [],
            timestamp: new Date(),
            pageType: "security",
            usefulnessScore: 100,
            usefulnessTier: "critical",
            classificationSignals: {},
          },
          {
            attemptedUrl: "https://example.com/compliance",
            fetchedUrl: "https://example.com/compliance",
            success: true,
            statusCode: 200,
            title: "Compliance",
            textLength: 2500,
            extractionStatus: "success",
            depth: 0,
            discoveredLinks: [],
            timestamp: new Date(),
            pageType: "compliance",
            usefulnessScore: 90,
            usefulnessTier: "critical",
            classificationSignals: {},
          },
        ],
        totalAttempted: 2,
        totalFetched: 2,
        totalSuccessful: 2,
        durationMs: 3000,
        sitemapUrls: [],
        highValueUrls: ["https://example.com/security", "https://example.com/compliance"],
        classificationSummary: {
          homepage: 0,
          about: 0,
          product: 0,
          solutions: 0,
          security: 1,
          trust: 0,
          compliance: 1,
          privacy: 0,
          legal: 0,
          dpa: 0,
          docs: 0,
          pricing: 0,
          customers: 0,
          case_study: 0,
          integrations: 0,
          unknown: 0,
        },
        pagesByTier: {
          critical: [],
          high: [],
          medium: [],
          low: [],
          minimal: [],
        },
        highValuePages: [],
      };

      const evidenceResult: EvidenceExtractionResult = {
        fields: {
          industry: {
            fieldKey: "industry",
            signals: [
              {
                fieldKey: "industry",
                candidateValue: "fintech",
                signalType: "DIRECT_QUOTE",
                snippet: "We are a fintech company",
                sourceUrl: "https://example.com/compliance",
                pageType: "compliance",
                strength: "strong",
                reason: "Explicit fintech identification",
                location: "paragraph",
                position: 0,
              },
            ],
            coverage: "strong",
            hasConflicts: false,
          },
          productType: {
            fieldKey: "productType",
            signals: [
              {
                fieldKey: "productType",
                candidateValue: "saas",
                signalType: "DIRECT_QUOTE",
                snippet: "Our SaaS platform",
                sourceUrl: "https://example.com/compliance",
                pageType: "compliance",
                strength: "strong",
                reason: "Explicit SaaS identification",
                location: "paragraph",
                position: 0,
              },
            ],
            coverage: "strong",
            hasConflicts: false,
          },
          customerSegment: { fieldKey: "customerSegment", signals: [], coverage: "unknown", hasConflicts: false },
          complianceFocus: {
            fieldKey: "complianceFocus",
            signals: [
              {
                fieldKey: "complianceFocus",
                candidateValue: "soc2",
                signalType: "DIRECT_QUOTE",
                snippet: "SOC 2 Type II certified",
                sourceUrl: "https://example.com/security",
                pageType: "security",
                strength: "strong",
                reason: "Explicit SOC 2 mention",
                location: "paragraph",
                position: 0,
              },
            ],
            coverage: "strong",
            hasConflicts: false,
          },
          securityPosture: {
            fieldKey: "securityPosture",
            signals: [
              {
                fieldKey: "securityPosture",
                candidateValue: "encryption",
                signalType: "DIRECT_QUOTE",
                snippet: "AES-256 encryption",
                sourceUrl: "https://example.com/security",
                pageType: "security",
                strength: "strong",
                reason: "Explicit encryption mention",
                location: "paragraph",
                position: 0,
              },
            ],
            coverage: "strong",
            hasConflicts: false,
          },
          dataHandling: { fieldKey: "dataHandling", signals: [], coverage: "unknown", hasConflicts: false },
          integrations: { fieldKey: "integrations", signals: [], coverage: "unknown", hasConflicts: false },
        },
        overallCoverage: "strong",
        contributingPages: ["https://example.com/security", "https://example.com/compliance"],
        emptyPages: [],
        conflicts: {},
      };

      const result = assessQualityAndCoverage(crawlResult, evidenceResult);

      expect(result.crawlQuality.quality).toBe("excellent");
      expect(result.overallCoverage).toBe("strong");
      expect(result.canMakeHighConfidenceDecisions).toBe(true);
      expect(result.recommendedConfidenceCap).toBe(1.0);
      expect(result.weakFields.length).toBe(0);
    });

    it("prevents high confidence when critical fields are weak", () => {
      const crawlResult: CrawlResult = {
        baseDomain: "example.com",
        startUrl: "https://example.com",
        pages: [],
        totalAttempted: 3,
        totalFetched: 3,
        totalSuccessful: 3,
        durationMs: 3000,
        sitemapUrls: [],
        highValueUrls: [],
        classificationSummary: {
          homepage: 0,
          about: 0,
          product: 0,
          solutions: 0,
          security: 0,
          trust: 0,
          compliance: 0,
          privacy: 0,
          legal: 0,
          dpa: 0,
          docs: 0,
          pricing: 0,
          customers: 0,
          case_study: 0,
          integrations: 0,
          unknown: 0,
        },
        pagesByTier: {
          critical: [],
          high: [],
          medium: [],
          low: [],
          minimal: [],
        },
        highValuePages: [],
      };

      const evidenceResult: EvidenceExtractionResult = {
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
        conflicts: {},
      };

      const result = assessQualityAndCoverage(crawlResult, evidenceResult);

      expect(result.canMakeHighConfidenceDecisions).toBe(false);
      expect(result.recommendedConfidenceCap).toBe(0);
    });
  });

  describe("getQualityCoverageSummary", () => {
    it("produces human-readable summary", () => {
      const crawlResult: CrawlResult = {
        baseDomain: "example.com",
        startUrl: "https://example.com",
        pages: [],
        totalAttempted: 1,
        totalFetched: 1,
        totalSuccessful: 1,
        durationMs: 2000,
        sitemapUrls: [],
        highValueUrls: [],
        classificationSummary: {
          homepage: 0,
          about: 0,
          product: 0,
          solutions: 0,
          security: 0,
          trust: 0,
          compliance: 0,
          privacy: 0,
          legal: 0,
          dpa: 0,
          docs: 0,
          pricing: 0,
          customers: 0,
          case_study: 0,
          integrations: 0,
          unknown: 0,
        },
        pagesByTier: {
          critical: [],
          high: [],
          medium: [],
          low: [],
          minimal: [],
        },
        highValuePages: [],
      };

      const evidenceResult: EvidenceExtractionResult = {
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
        conflicts: {},
      };

      const result = assessQualityAndCoverage(crawlResult, evidenceResult);
      const summary = getQualityCoverageSummary(result);

      expect(summary).toContain("Crawl Quality:");
      expect(summary).toContain("Evidence Coverage:");
      expect(summary).toContain("Can make high-confidence decisions:");
    });
  });

  describe("canFieldSupportDecision", () => {
    it("returns true when field has sufficient coverage", () => {
      const result = {
        crawlQuality: {} as QualityCoverageResult["crawlQuality"],
        fieldCoverage: {
          industry: {
            fieldKey: "industry",
            coverage: "medium",
            score: 65,
            supportingPages: 2,
            conflictCount: 0,
            bestEvidenceStrength: "strong",
            supportsHighConfidence: true,
            assessment: "",
          },
        } as unknown as QualityCoverageResult["fieldCoverage"],
        overallCoverage: "medium" as FieldCoverage,
        fieldsByCoverage: [],
        weakFields: [],
        canMakeHighConfidenceDecisions: true,
        recommendedConfidenceCap: 1.0,
      };

      expect(canFieldSupportDecision(result, "industry", "limited")).toBe(true);
    });

    it("returns false when field has insufficient coverage", () => {
      const result = {
        crawlQuality: {} as QualityCoverageResult["crawlQuality"],
        fieldCoverage: {
          industry: {
            fieldKey: "industry",
            coverage: "weak",
            score: 25,
            supportingPages: 1,
            conflictCount: 0,
            bestEvidenceStrength: "weak",
            supportsHighConfidence: false,
            assessment: "",
          },
        } as unknown as QualityCoverageResult["fieldCoverage"],
        overallCoverage: "weak" as FieldCoverage,
        fieldsByCoverage: [],
        weakFields: [],
        canMakeHighConfidenceDecisions: false,
        recommendedConfidenceCap: 0.5,
      };

      expect(canFieldSupportDecision(result, "industry", "medium")).toBe(false);
    });
  });

  describe("getFieldConfidenceCap", () => {
    it("returns 1.0 for fields with strong coverage", () => {
      const result = {
        crawlQuality: {} as QualityCoverageResult["crawlQuality"],
        fieldCoverage: {
          industry: {
            fieldKey: "industry",
            coverage: "strong",
            score: 85,
            supportingPages: 3,
            conflictCount: 0,
            bestEvidenceStrength: "strong",
            supportsHighConfidence: true,
            assessment: "",
          },
        } as unknown as QualityCoverageResult["fieldCoverage"],
        overallCoverage: "strong" as FieldCoverage,
        fieldsByCoverage: [],
        weakFields: [],
        canMakeHighConfidenceDecisions: true,
        recommendedConfidenceCap: 1.0,
      };

      expect(getFieldConfidenceCap(result, "industry")).toBe(1.0);
    });

    it("returns 0.7 for fields that don't support high confidence", () => {
      const result = {
        crawlQuality: {} as QualityCoverageResult["crawlQuality"],
        fieldCoverage: {
          industry: {
            fieldKey: "industry",
            coverage: "weak",
            score: 30,
            supportingPages: 1,
            conflictCount: 0,
            bestEvidenceStrength: "weak",
            supportsHighConfidence: false,
            assessment: "",
          },
        } as unknown as QualityCoverageResult["fieldCoverage"],
        overallCoverage: "weak" as FieldCoverage,
        fieldsByCoverage: [],
        weakFields: [],
        canMakeHighConfidenceDecisions: false,
        recommendedConfidenceCap: 0.5,
      };

      expect(getFieldConfidenceCap(result, "industry")).toBe(0.7);
    });

    it("returns 0.8 for fields with conflicts", () => {
      const result = {
        crawlQuality: {} as QualityCoverageResult["crawlQuality"],
        fieldCoverage: {
          industry: {
            fieldKey: "industry",
            coverage: "strong",
            score: 75,
            supportingPages: 2,
            conflictCount: 2,
            bestEvidenceStrength: "strong",
            supportsHighConfidence: true,
            assessment: "",
          },
        } as unknown as QualityCoverageResult["fieldCoverage"],
        overallCoverage: "strong" as FieldCoverage,
        fieldsByCoverage: [],
        weakFields: [],
        canMakeHighConfidenceDecisions: true,
        recommendedConfidenceCap: 1.0,
      };

      expect(getFieldConfidenceCap(result, "industry")).toBe(0.8);
    });
  });
});
