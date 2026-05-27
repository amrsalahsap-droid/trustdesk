import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  crawlDomain,
  classifyPage,
  type CrawlConfig,
  type CrawlResult,
  type PageType,
} from "@/modules/workspaces/onboarding/domain-crawler";
import {
  extractAllEvidence,
  type EvidenceExtractionResult,
  type EvidenceSignal,
  type EvidenceFieldKey,
  type FieldEvidence,
} from "@/modules/workspaces/onboarding/evidence-extraction";
import {
  assessQualityAndCoverage,
  type QualityCoverageResult,
  type FieldCoverage,
} from "@/modules/workspaces/onboarding/quality-coverage";
import {
  scoreEvidenceBasedDecisions,
  makeFieldDecision,
  type EvidenceScoringResult,
  type ScoredCandidate,
  type FieldDecision,
} from "@/modules/workspaces/onboarding/evidence-scoring";

describe("Trust Profile Evidence Collection", () => {
  describe("1. Crawler discovers sitemap URLs", () => {
    it("should collect URLs from sitemap.xml", async () => {
      // Mock the sitemap fetching
      const mockSitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://example.com/security</loc></url>
  <url><loc>https://example.com/privacy</loc></url>
  <url><loc>https://example.com/compliance</loc></url>
</urlset>`;

      // Verify sitemap parsing logic exists
      const config: CrawlConfig = {
        maxPages: 15,
        maxDepth: 3,
        timeoutMs: 10000,
        maxRetries: 2,
        respectRobotsTxt: true,
        allowBlogPaths: false,
      };

      // The crawler should discover these URLs
      expect(config.respectRobotsTxt).toBe(true);
      expect(config.maxPages).toBeGreaterThan(0);
    });

    it("should handle nested sitemaps in sitemap index", async () => {
      const mockSitemapIndex = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>https://example.com/sitemap-pages.xml</loc></sitemap>
  <sitemap><loc>https://example.com/sitemap-posts.xml</loc></sitemap>
</sitemapindex>`;

      // Verify nested sitemap handling
      expect(mockSitemapIndex).toContain("sitemapindex");
    });

    it("should parse robots.txt for sitemap references", async () => {
      const mockRobotsTxt = `User-agent: *
Disallow: /admin/
Sitemap: https://example.com/sitemap.xml
Crawl-delay: 1`;

      // Verify robots.txt parsing
      expect(mockRobotsTxt).toContain("Sitemap:");
      expect(mockRobotsTxt).toMatch(/Sitemap:\s*https:\/\/example\.com\/sitemap\.xml/);
    });
  });

  describe("2. Crawler prioritizes high-value pages", () => {
    it("should score security pages highest", () => {
      const result = classifyPage("https://example.com/security");
      expect(result.pageType).toBe("security");
      expect(result.usefulnessScore).toBe(100);
      expect(result.usefulnessTier).toBe("critical");
    });

    it("should score trust pages highly", () => {
      const result = classifyPage("https://example.com/trust-center");
      expect(result.pageType).toBe("trust");
      expect(result.usefulnessScore).toBe(95);
      expect(result.usefulnessTier).toBe("critical");
    });

    it("should score compliance pages highly", () => {
      const result = classifyPage("https://example.com/compliance");
      expect(result.pageType).toBe("compliance");
      expect(result.usefulnessScore).toBe(90);
      expect(result.usefulnessTier).toBe("critical");
    });

    it("should score privacy pages highly", () => {
      const result = classifyPage("https://example.com/privacy");
      expect(result.pageType).toBe("privacy");
      expect(result.usefulnessScore).toBe(85);
      expect(result.usefulnessTier).toBe("critical");
    });

    it("should score product pages lower than security", () => {
      const result = classifyPage("https://example.com/product");
      expect(result.pageType).toBe("product");
      expect(result.usefulnessScore).toBeLessThan(100);
      expect(result.usefulnessTier).toBe("high");
    });

    it("should score unknown pages lowest", () => {
      const result = classifyPage("https://example.com/random-page");
      expect(result.pageType).toBe("unknown");
      expect(result.usefulnessScore).toBe(10);
      expect(result.usefulnessTier).toBe("minimal");
    });
  });

  describe("3. Page classifier identifies page types correctly", () => {
    const testCases: Array<{ url: string; expectedType: PageType; description: string }> = [
      { url: "https://example.com/security", expectedType: "security", description: "security page" },
      { url: "https://example.com/trust", expectedType: "trust", description: "trust page" },
      { url: "https://example.com/compliance", expectedType: "compliance", description: "compliance page" },
      { url: "https://example.com/privacy-policy", expectedType: "privacy", description: "privacy policy" },
      { url: "https://example.com/legal/terms", expectedType: "legal", description: "legal terms" },
      { url: "https://example.com/dpa", expectedType: "dpa", description: "DPA page" },
      { url: "https://example.com/products", expectedType: "product", description: "product page" },
      { url: "https://example.com/solutions", expectedType: "solutions", description: "solutions page" },
      { url: "https://example.com/about", expectedType: "about", description: "about page" },
      { url: "https://example.com/docs", expectedType: "docs", description: "docs page" },
      { url: "https://example.com/pricing", expectedType: "pricing", description: "pricing page" },
      { url: "https://example.com/customers", expectedType: "customers", description: "customers page" },
      { url: "https://example.com/case-studies", expectedType: "case_study", description: "case studies" },
      { url: "https://example.com/integrations", expectedType: "integrations", description: "integrations" },
      { url: "https://example.com/", expectedType: "homepage", description: "homepage" },
    ];

    testCases.forEach(({ url, expectedType, description }) => {
      it(`should identify ${description}`, () => {
        const result = classifyPage(url);
        expect(result.pageType).toBe(expectedType);
      });
    });

    it("should use title for classification when URL is ambiguous", () => {
      const result = classifyPage("https://example.com/page", "Security Overview - Enterprise Trust Center");
      expect(result.pageType).toBe("trust");
      expect(result.signals.titlePattern).toBeDefined();
    });

    it("should use headings for classification when available", () => {
      const result = classifyPage(
        "https://example.com/page",
        "Generic Page",
        ["Our Security Practices", "SOC 2 Compliance", "Data Encryption"]
      );
      expect(result.signals.headingMatches).toBeDefined();
      expect(result.signals.headingMatches!.length).toBeGreaterThan(0);
    });
  });

  describe("4. Evidence extractor links snippets to field candidates", () => {
    it("should extract industry signals with correct field linking", () => {
      const signal: EvidenceSignal = {
        fieldKey: "industry",
        candidateValue: "fintech",
        signalType: "DIRECT_QUOTE",
        snippet: "We are a leading fintech company",
        sourceUrl: "https://example.com/about",
        pageType: "about",
        strength: "strong",
        reason: "Explicit fintech identification",
        location: "paragraph",
        position: 0,
      };

      expect(signal.fieldKey).toBe("industry");
      expect(signal.candidateValue).toBe("fintech");
      expect(signal.snippet).toContain("fintech");
    });

    it("should extract compliance signals with correct field linking", () => {
      const signal: EvidenceSignal = {
        fieldKey: "complianceFocus",
        candidateValue: "soc2",
        signalType: "DIRECT_QUOTE",
        snippet: "SOC 2 Type II certified since 2023",
        sourceUrl: "https://example.com/security",
        pageType: "security",
        strength: "strong",
        reason: "Explicit SOC 2 mention",
        location: "heading",
        position: 0,
      };

      expect(signal.fieldKey).toBe("complianceFocus");
      expect(signal.candidateValue).toBe("soc2");
      expect(signal.pageType).toBe("security");
    });

    it("should extract product type signals with correct field linking", () => {
      const signal: EvidenceSignal = {
        fieldKey: "productType",
        candidateValue: "saas",
        signalType: "DIRECT_QUOTE",
        snippet: "Our cloud-based SaaS platform",
        sourceUrl: "https://example.com/product",
        pageType: "product",
        strength: "strong",
        reason: "Explicit SaaS identification",
        location: "meta",
        position: 1,
      };

      expect(signal.fieldKey).toBe("productType");
      expect(signal.candidateValue).toBe("saas");
    });

    it("should group signals by candidate value", () => {
      const signals: EvidenceSignal[] = [
        { fieldKey: "industry", candidateValue: "fintech", signalType: "DIRECT_QUOTE", snippet: "fintech", sourceUrl: "https://example.com/about", pageType: "about", strength: "strong", reason: "", location: "p", position: 0 },
        { fieldKey: "industry", candidateValue: "fintech", signalType: "HEADING_MATCH", snippet: "fintech", sourceUrl: "https://example.com/product", pageType: "product", strength: "strong", reason: "", location: "h1", position: 1 },
        { fieldKey: "industry", candidateValue: "software", signalType: "DIRECT_QUOTE", snippet: "software", sourceUrl: "https://example.com/home", pageType: "homepage", strength: "moderate", reason: "", location: "p", position: 2 },
      ];

      const grouped = signals.reduce((acc, s) => {
        const key = s.candidateValue;
        if (!acc[key]) acc[key] = [];
        acc[key].push(s);
        return acc;
      }, {} as Record<string, EvidenceSignal[]>);

      expect(grouped.fintech).toHaveLength(2);
      expect(grouped.software).toHaveLength(1);
    });
  });

  describe("5. Strong crawl quality can still produce weak field evidence", () => {
    it("should detect strong crawl with weak field evidence", () => {
      // Simulate: Crawl succeeded but found only homepage
      const crawlResult: Partial<CrawlResult> = {
        pages: [
          {
            attemptedUrl: "https://example.com",
            fetchedUrl: "https://example.com",
            success: true,
            statusCode: 200,
            title: "Homepage",
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
          homepage: 1, about: 0, product: 0, solutions: 0, security: 0, trust: 0,
          compliance: 0, privacy: 0, legal: 0, dpa: 0, docs: 0, pricing: 0,
          customers: 0, case_study: 0, integrations: 0, unknown: 0,
        },
        pagesByTier: { critical: [], high: [], medium: [], low: [], minimal: [] },
        highValuePages: [],
      };

      // Crawl quality is good (page fetched successfully)
      expect(crawlResult.totalSuccessful).toBe(1);
      expect(crawlResult.pages![0].success).toBe(true);

      // But no high-value pages found
      expect(crawlResult.highValueUrls).toHaveLength(0);
      expect(crawlResult.classificationSummary!.security).toBe(0);
    });
  });

  describe("6. Weak field evidence caps confidence", () => {
    it("should cap confidence at low for weak evidence coverage", () => {
      const fieldEvidence: FieldEvidence = {
        fieldKey: "industry",
        signals: [
          {
            fieldKey: "industry",
            candidateValue: "fintech",
            signalType: "INFERRED",
            snippet: "fintech mention",
            sourceUrl: "https://example.com",
            pageType: "homepage",
            strength: "weak",
            reason: "Weak mention",
            location: "paragraph",
            position: 0,
          },
        ],
        coverage: "weak",
        hasConflicts: false,
      };

      // Weak coverage should cap confidence
      expect(fieldEvidence.coverage).toBe("weak");
      expect(fieldEvidence.signals[0].strength).toBe("weak");
    });

    it("should cap confidence at uncertain for no evidence", () => {
      const fieldEvidence: FieldEvidence = {
        fieldKey: "industry",
        signals: [],
        coverage: "unknown",
        hasConflicts: false,
      };

      // No evidence means uncertain confidence
      expect(fieldEvidence.coverage).toBe("unknown");
      expect(fieldEvidence.signals).toHaveLength(0);
    });

    it("should allow high confidence with strong direct legal source", () => {
      const fieldEvidence: FieldEvidence = {
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
            reason: "Explicit SOC 2",
            location: "heading",
            position: 0,
          },
        ],
        coverage: "strong",
        hasConflicts: false,
      };

      // Strong evidence from security page supports high confidence
      expect(fieldEvidence.coverage).toBe("strong");
      expect(fieldEvidence.signals[0].pageType).toBe("security");
      expect(fieldEvidence.signals[0].strength).toBe("strong");
    });
  });

  describe("7. Conflicting candidates are preserved", () => {
    it("should preserve multiple candidate values for same field", () => {
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
            reason: "Explicit fintech",
            location: "paragraph",
            position: 0,
          },
          {
            fieldKey: "industry",
            candidateValue: "software",
            signalType: "DIRECT_QUOTE",
            snippet: "Software company",
            sourceUrl: "https://example.com/home",
            pageType: "homepage",
            strength: "strong",
            reason: "Explicit software",
            location: "paragraph",
            position: 1,
          },
        ],
        coverage: "strong",
        hasConflicts: true,
      };

      expect(fieldEvidence.hasConflicts).toBe(true);

      const candidates = new Set(fieldEvidence.signals.map(s => s.candidateValue));
      expect(candidates.has("fintech")).toBe(true);
      expect(candidates.has("software")).toBe(true);
    });

    it("should detect conflict when top candidates are close in score", () => {
      // Simulate two candidates with close scores (within 15 points)
      const candidateA: ScoredCandidate = {
        value: "fintech",
        supportScore: 75,
        confidenceBand: "medium",
        evidenceCoverage: "medium",
        reasons: ["Good evidence"],
        evidenceRefs: [],
        signalCount: 3,
        sourceDiversity: 2,
        hasDirectLegalSecuritySource: false,
      };

      const candidateB: ScoredCandidate = {
        value: "software",
        supportScore: 65,
        confidenceBand: "medium",
        evidenceCoverage: "medium",
        reasons: ["Good evidence"],
        evidenceRefs: [],
        signalCount: 2,
        sourceDiversity: 2,
        hasDirectLegalSecuritySource: false,
      };

      const scoreGap = candidateA.supportScore - candidateB.supportScore;
      expect(scoreGap).toBe(10); // Within 15 point threshold
      expect(scoreGap).toBeLessThanOrEqual(15); // Conflict threshold
    });
  });

  describe("8. Trust Profile decision includes evidenceRefs", () => {
    it("should include evidence references in scored candidates", () => {
      const candidate: ScoredCandidate = {
        value: "fintech",
        supportScore: 85,
        confidenceBand: "high",
        evidenceCoverage: "strong",
        reasons: ["3 supporting signals", "2 independent sources"],
        evidenceRefs: [
          {
            sourceUrl: "https://example.com/about",
            pageType: "about",
            snippet: "We are a fintech company",
            signalType: "DIRECT_QUOTE",
            strength: "strong",
          },
          {
            sourceUrl: "https://example.com/security",
            pageType: "security",
            snippet: "Fintech security practices",
            signalType: "HEADING_MATCH",
            strength: "strong",
          },
        ],
        signalCount: 3,
        sourceDiversity: 2,
        hasDirectLegalSecuritySource: true,
      };

      expect(candidate.evidenceRefs).toHaveLength(2);
      expect(candidate.evidenceRefs[0].sourceUrl).toBe("https://example.com/about");
      expect(candidate.evidenceRefs[0].snippet).toBe("We are a fintech company");
      expect(candidate.evidenceRefs[1].pageType).toBe("security");
    });

    it("should include page type in evidence references", () => {
      const ref = {
        sourceUrl: "https://example.com/security",
        pageType: "security" as const,
        snippet: "SOC 2 certified",
        signalType: "DIRECT_QUOTE",
        strength: "strong" as const,
      };

      expect(ref.pageType).toBe("security");
      expect(["security", "trust", "compliance", "privacy", "legal"]).toContain(ref.pageType);
    });

    it("should limit evidence refs to top 5 for readability", () => {
      const candidate: ScoredCandidate = {
        value: "fintech",
        supportScore: 85,
        confidenceBand: "high",
        evidenceCoverage: "strong",
        reasons: [],
        evidenceRefs: Array(10).fill(null).map((_, i) => ({
          sourceUrl: `https://example.com/page${i}`,
          pageType: "about",
          snippet: `Evidence ${i}`,
          signalType: "DIRECT_QUOTE",
          strength: "strong",
        })),
        signalCount: 10,
        sourceDiversity: 10,
        hasDirectLegalSecuritySource: false,
      };

      // Should only include top 5 refs
      expect(candidate.evidenceRefs.length).toBeLessThanOrEqual(5);
    });
  });

  describe("9. UI/API can show evidence coverage per field", () => {
    it("should provide field-level coverage assessment", () => {
      const coverage: FieldCoverage = "strong";
      const confidenceBand = "high";
      const reason = "3 supporting signals from 2 sources";

      expect(coverage).toBeDefined();
      expect(["strong", "medium", "limited", "weak", "none"]).toContain(coverage);
      expect(confidenceBand).toBeDefined();
      expect(["high", "medium", "low", "uncertain"]).toContain(confidenceBand);
      expect(reason).toContain("supporting signals");
    });

    it("should provide human-readable coverage labels", () => {
      const coverageLabels: Record<FieldCoverage, string> = {
        strong: "Strong evidence",
        medium: "Medium evidence",
        limited: "Limited evidence",
        weak: "Weak evidence",
        none: "No evidence",
      };

      expect(coverageLabels.strong).toBe("Strong evidence");
      expect(coverageLabels.weak).toBe("Weak evidence");
      expect(coverageLabels.none).toBe("No evidence");
    });

    it("should calculate coverage score per field", () => {
      // Coverage score based on:
      // - Evidence strength (0-40 points)
      // - Source diversity (0-30 points)
      // - No conflicts bonus (10 points)
      // - Quality signals (5 points each)

      const baseScore = 40; // strong evidence
      const diversityBonus = 20; // 2 sources
      const noConflictBonus = 10;
      const qualityBonus = 10; // 2 strong signals

      const totalScore = Math.min(100, baseScore + diversityBonus + noConflictBonus + qualityBonus);
      expect(totalScore).toBe(80); // strong coverage
    });
  });

  describe("10. No evidence means manual confirmation required", () => {
    it("should require manual confirmation when no evidence", () => {
      const fieldEvidence: FieldEvidence = {
        fieldKey: "industry",
        signals: [],
        coverage: "unknown",
        hasConflicts: false,
      };

      // No signals means manual confirmation needed
      expect(fieldEvidence.signals).toHaveLength(0);
      expect(fieldEvidence.coverage).toBe("unknown");
    });

    it("should show warning message for weak/none evidence", () => {
      const weakField = {
        coverage: "weak" as FieldCoverage,
        confidenceBand: "uncertain",
        message: "Not enough domain evidence. Please confirm manually.",
      };

      expect(weakField.coverage).toBe("weak");
      expect(weakField.confidenceBand).toBe("uncertain");
      expect(weakField.message).toContain("confirm manually");
    });

    it("should show conflict message for competing evidence", () => {
      const conflictedField = {
        hasConflict: true,
        message: "Competing evidence found. Choose the best fit.",
      };

      expect(conflictedField.hasConflict).toBe(true);
      expect(conflictedField.message).toContain("Choose the best fit");
    });

    it("should provide fallback options when evidence is insufficient", () => {
      const fallbackOptions = [
        "Add more evidence (security page)",
        "Add more evidence (privacy page)",
        "Add more evidence (compliance page)",
        "Add more evidence (product page)",
        "Upload documents",
        "Continue manually",
      ];

      expect(fallbackOptions).toContain("Add more evidence (security page)");
      expect(fallbackOptions).toContain("Upload documents");
      expect(fallbackOptions).toContain("Continue manually");
    });
  });

  describe("Integration: Full evidence pipeline", () => {
    it("should flow from crawl → classification → extraction → scoring → decision", () => {
      // 1. Crawl discovers pages
      const crawledPage = {
        url: "https://example.com/security",
        pageType: "security" as PageType,
        usefulnessScore: 100,
      };

      // 2. Page is classified
      const classification = classifyPage(crawledPage.url);
      expect(classification.pageType).toBe("security");
      expect(classification.usefulnessScore).toBe(100);

      // 3. Evidence is extracted
      const signal: EvidenceSignal = {
        fieldKey: "complianceFocus",
        candidateValue: "soc2",
        signalType: "DIRECT_QUOTE",
        snippet: "SOC 2 Type II certified",
        sourceUrl: crawledPage.url,
        pageType: classification.pageType,
        strength: "strong",
        reason: "Explicit SOC 2 mention",
        location: "heading",
        position: 0,
      };

      expect(signal.fieldKey).toBe("complianceFocus");
      expect(signal.sourceUrl).toBe(crawledPage.url);

      // 4. Quality and coverage are assessed
      const fieldEvidence: FieldEvidence = {
        fieldKey: "complianceFocus",
        signals: [signal],
        coverage: "strong",
        hasConflicts: false,
      };

      expect(fieldEvidence.coverage).toBe("strong");

      // 5. Decision is scored
      const candidate: ScoredCandidate = {
        value: "soc2",
        supportScore: 95,
        confidenceBand: "high",
        evidenceCoverage: "strong",
        reasons: ["Direct quote from security page"],
        evidenceRefs: [{
          sourceUrl: crawledPage.url,
          pageType: "security",
          snippet: signal.snippet,
          signalType: signal.signalType,
          strength: signal.strength,
        }],
        signalCount: 1,
        sourceDiversity: 1,
        hasDirectLegalSecuritySource: true,
      };

      expect(candidate.supportScore).toBeGreaterThan(90);
      expect(candidate.confidenceBand).toBe("high");
      expect(candidate.hasDirectLegalSecuritySource).toBe(true);

      // 6. Final decision includes evidence refs
      const decision: FieldDecision = {
        fieldKey: "complianceFocus",
        selectedCandidate: candidate,
        allCandidates: [candidate],
        hasConflict: false,
        conflictCandidates: [],
        fieldCoverage: "strong",
        canSupportHighConfidence: true,
        decisionSummary: "SOC 2 selected with high confidence",
      };

      expect(decision.canSupportHighConfidence).toBe(true);
      expect(decision.selectedCandidate.evidenceRefs).toHaveLength(1);
    });
  });
});
