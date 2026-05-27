import { describe, it, expect } from "vitest";
import {
  makeFieldDecision,
  scoreEvidenceBasedDecisions,
  getFieldDecision,
  isFieldConflicted,
  explainFieldScoring,
} from "@/modules/workspaces/onboarding/evidence-scoring";
import {
  type EvidenceSignal,
  type FieldEvidence,
  type EvidenceExtractionResult,
} from "@/modules/workspaces/onboarding/evidence-extraction";
import { type CrawlAttempt, type PageType } from "@/modules/workspaces/onboarding/domain-crawler";

describe("Evidence-Based Scoring", () => {
  const createMockPage = (
    url: string,
    pageType: PageType,
    usefulnessTier: "critical" | "high" | "medium" | "low" | "minimal",
  ): CrawlAttempt => ({
    attemptedUrl: url,
    fetchedUrl: url,
    success: true,
    statusCode: 200,
    title: "Test Page",
    textLength: 2000,
    extractionStatus: "success",
    depth: 0,
    discoveredLinks: [],
    timestamp: new Date(),
    pageType,
    usefulnessScore: usefulnessTier === "critical" ? 100 : usefulnessTier === "high" ? 80 : 50,
    usefulnessTier,
    classificationSignals: {},
  });

  const createMockSignal = (
    fieldKey: string,
    candidateValue: string,
    signalType: string,
    strength: "strong" | "moderate" | "weak",
    pageType: PageType,
  ): EvidenceSignal => ({
    fieldKey: fieldKey as any,
    candidateValue,
    signalType,
    snippet: `Evidence for ${candidateValue}`,
    sourceUrl: `https://example.com/${pageType}`,
    pageType,
    strength,
    reason: "Test evidence",
    location: "paragraph",
    position: 0,
  });

  describe("makeFieldDecision", () => {
    it("returns unknown for no evidence", () => {
      const decision = makeFieldDecision("industry", undefined, new Map());

      expect(decision.selectedCandidate.value).toBe("unknown");
      expect(decision.selectedCandidate.supportScore).toBe(0);
      expect(decision.selectedCandidate.confidenceBand).toBe("uncertain");
      expect(decision.selectedCandidate.evidenceCoverage).toBe("none");
      expect(decision.hasConflict).toBe(false);
    });

    it("scores single candidate with strong evidence", () => {
      const fieldEvidence: FieldEvidence = {
        fieldKey: "industry",
        signals: [
          createMockSignal("industry", "fintech", "DIRECT_QUOTE", "strong", "about"),
        ],
        coverage: "strong",
        hasConflicts: false,
      };

      const pages = new Map([
        ["https://example.com/about", createMockPage("https://example.com/about", "about", "medium")],
      ]);

      const decision = makeFieldDecision("industry", fieldEvidence, pages);

      expect(decision.selectedCandidate.value).toBe("fintech");
      expect(decision.selectedCandidate.supportScore).toBeGreaterThan(0);
      expect(decision.selectedCandidate.confidenceBand).toBe("low");
      expect(decision.selectedCandidate.signalCount).toBe(1);
      expect(decision.hasConflict).toBe(false);
      expect(decision.selectedCandidate.reasons.length).toBeGreaterThan(0);
    });

    it("boosts confidence with direct legal/security source", () => {
      const fieldEvidence: FieldEvidence = {
        fieldKey: "complianceFocus",
        signals: [
          createMockSignal("complianceFocus", "soc2", "DIRECT_QUOTE", "strong", "security"),
        ],
        coverage: "medium",
        hasConflicts: false,
      };

      const pages = new Map([
        [
          "https://example.com/security",
          createMockPage("https://example.com/security", "security", "critical"),
        ],
      ]);

      const decision = makeFieldDecision("complianceFocus", fieldEvidence, pages);

      expect(decision.selectedCandidate.hasDirectLegalSecuritySource).toBe(true);
      expect(decision.selectedCandidate.confidenceBand).toBe("high");
    });

    it("detects conflict between close candidates", () => {
      const fieldEvidence: FieldEvidence = {
        fieldKey: "industry",
        signals: [
          createMockSignal("industry", "fintech", "DIRECT_QUOTE", "strong", "about"),
          createMockSignal("industry", "software", "DIRECT_QUOTE", "strong", "homepage"),
          createMockSignal("industry", "fintech", "DIRECT_QUOTE", "strong", "product"),
        ],
        coverage: "strong",
        hasConflicts: true,
      };

      const pages = new Map([
        ["https://example.com/about", createMockPage("https://example.com/about", "about", "medium")],
        ["https://example.com/", createMockPage("https://example.com/", "homepage", "low")],
        ["https://example.com/product", createMockPage("https://example.com/product", "product", "high")],
      ]);

      const decision = makeFieldDecision("industry", fieldEvidence, pages);

      expect(decision.hasConflict).toBe(true);
      expect(decision.conflictCandidates.length).toBeGreaterThan(1);
      expect(decision.canSupportHighConfidence).toBe(false);
    });

    it("scores multiple signals for same candidate higher", () => {
      const fieldEvidence: FieldEvidence = {
        fieldKey: "industry",
        signals: [
          createMockSignal("industry", "fintech", "DIRECT_QUOTE", "strong", "about"),
          createMockSignal("industry", "fintech", "HEADING_MATCH", "strong", "product"),
          createMockSignal("industry", "fintech", "META_EXTRACT", "moderate", "homepage"),
        ],
        coverage: "strong",
        hasConflicts: false,
      };

      const pages = new Map([
        ["https://example.com/about", createMockPage("https://example.com/about", "about", "medium")],
        ["https://example.com/product", createMockPage("https://example.com/product", "product", "high")],
        ["https://example.com/", createMockPage("https://example.com/", "homepage", "low")],
      ]);

      const decision = makeFieldDecision("industry", fieldEvidence, pages);

      expect(decision.selectedCandidate.value).toBe("fintech");
      expect(decision.selectedCandidate.signalCount).toBe(3);
      expect(decision.selectedCandidate.sourceDiversity).toBe(3);
      expect(decision.selectedCandidate.supportScore).toBeGreaterThan(50);
    });

    it("caps confidence for weak coverage", () => {
      const fieldEvidence: FieldEvidence = {
        fieldKey: "industry",
        signals: [
          createMockSignal("industry", "fintech", "INFERRED", "weak", "homepage"),
        ],
        coverage: "weak",
        hasConflicts: false,
      };

      const pages = new Map([
        ["https://example.com/", createMockPage("https://example.com/", "homepage", "low")],
      ]);

      const decision = makeFieldDecision("industry", fieldEvidence, pages);

      expect(decision.selectedCandidate.confidenceBand).toBe("uncertain");
      expect(decision.canSupportHighConfidence).toBe(false);
    });

    it("includes evidence refs in candidate", () => {
      const fieldEvidence: FieldEvidence = {
        fieldKey: "securityPosture",
        signals: [
          createMockSignal("securityPosture", "encryption", "DIRECT_QUOTE", "strong", "security"),
        ],
        coverage: "strong",
        hasConflicts: false,
      };

      const pages = new Map([
        [
          "https://example.com/security",
          createMockPage("https://example.com/security", "security", "critical"),
        ],
      ]);

      const decision = makeFieldDecision("securityPosture", fieldEvidence, pages);

      expect(decision.selectedCandidate.evidenceRefs.length).toBeGreaterThan(0);
      expect(decision.selectedCandidate.evidenceRefs[0].pageType).toBe("security");
      expect(decision.selectedCandidate.evidenceRefs[0].strength).toBe("strong");
    });

    it("selects highest scored candidate", () => {
      const fieldEvidence: FieldEvidence = {
        fieldKey: "productType",
        signals: [
          createMockSignal("productType", "saas", "DIRECT_QUOTE", "strong", "product"),
          createMockSignal("productType", "saas", "DIRECT_QUOTE", "strong", "about"),
          createMockSignal("productType", "mobile", "INFERRED", "weak", "homepage"),
        ],
        coverage: "strong",
        hasConflicts: false,
      };

      const pages = new Map([
        ["https://example.com/product", createMockPage("https://example.com/product", "product", "high")],
        ["https://example.com/about", createMockPage("https://example.com/about", "about", "medium")],
        ["https://example.com/", createMockPage("https://example.com/", "homepage", "low")],
      ]);

      const decision = makeFieldDecision("productType", fieldEvidence, pages);

      expect(decision.selectedCandidate.value).toBe("saas");
      expect(decision.allCandidates.length).toBe(2);
      expect(decision.allCandidates[0].value).toBe("saas");
      expect(decision.allCandidates[1].value).toBe("mobile");
      expect(decision.allCandidates[0].supportScore).toBeGreaterThan(
        decision.allCandidates[1].supportScore,
      );
    });
  });

  describe("scoreEvidenceBasedDecisions", () => {
    it("scores all fields and identifies conflicts", () => {
      const evidenceResult: EvidenceExtractionResult = {
        fields: {
          industry: {
            fieldKey: "industry",
            signals: [
              createMockSignal("industry", "fintech", "DIRECT_QUOTE", "strong", "about"),
              createMockSignal("industry", "software", "DIRECT_QUOTE", "strong", "homepage"),
            ],
            coverage: "strong",
            hasConflicts: true,
          },
          productType: {
            fieldKey: "productType",
            signals: [createMockSignal("productType", "saas", "DIRECT_QUOTE", "strong", "product")],
            coverage: "strong",
            hasConflicts: false,
          },
          customerSegment: {
            fieldKey: "customerSegment",
            signals: [createMockSignal("customerSegment", "b2b", "DIRECT_QUOTE", "strong", "about")],
            coverage: "strong",
            hasConflicts: false,
          },
          complianceFocus: {
            fieldKey: "complianceFocus",
            signals: [
              createMockSignal("complianceFocus", "soc2", "DIRECT_QUOTE", "strong", "security"),
            ],
            coverage: "strong",
            hasConflicts: false,
          },
          securityPosture: {
            fieldKey: "securityPosture",
            signals: [
              createMockSignal("securityPosture", "encryption", "DIRECT_QUOTE", "strong", "security"),
            ],
            coverage: "strong",
            hasConflicts: false,
          },
          dataHandling: {
            fieldKey: "dataHandling",
            signals: [],
            coverage: "unknown",
            hasConflicts: false,
          },
          integrations: {
            fieldKey: "integrations",
            signals: [],
            coverage: "unknown",
            hasConflicts: false,
          },
        },
        overallCoverage: "medium",
        contributingPages: ["https://example.com/about", "https://example.com/security"],
        emptyPages: [],
        conflicts: {},
      };

      const pages = [
        createMockPage("https://example.com/about", "about", "medium"),
        createMockPage("https://example.com/security", "security", "critical"),
        createMockPage("https://example.com/product", "product", "high"),
        createMockPage("https://example.com/", "homepage", "low"),
      ];

      const result = scoreEvidenceBasedDecisions(evidenceResult, pages);

      expect(Object.keys(result.fieldDecisions).length).toBe(7);
      expect(result.conflictedFields).toContain("industry");
      expect(result.highConfidenceFields).toContain("complianceFocus");
      expect(result.highConfidenceFields).toContain("securityPosture");
      expect(result.overallConfidence).toBeDefined();
      expect(result.summary).toContain("Overall confidence:");
    });

    it("handles all empty fields", () => {
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

      const pages: CrawlAttempt[] = [];

      const result = scoreEvidenceBasedDecisions(evidenceResult, pages);

      expect(result.overallConfidence).toBe("uncertain");
      expect(result.highConfidenceFields).toHaveLength(0);
      expect(result.conflictedFields).toHaveLength(0);
    });
  });

  describe("getFieldDecision", () => {
    it("returns decision for specific field", () => {
      const mockDecision = {
        fieldKey: "industry" as const,
        selectedCandidate: {
          value: "fintech",
          supportScore: 75,
          confidenceBand: "medium" as const,
          evidenceCoverage: "medium" as const,
          reasons: ["Good evidence"],
          evidenceRefs: [],
          signalCount: 2,
          sourceDiversity: 2,
          hasDirectLegalSecuritySource: false,
        },
        allCandidates: [],
        hasConflict: false,
        conflictCandidates: [],
        fieldCoverage: "medium" as const,
        canSupportHighConfidence: true,
        decisionSummary: "Test",
      };

      const result = {
        fieldDecisions: { industry: mockDecision },
        conflictedFields: [],
        highConfidenceFields: ["industry"],
        overallConfidence: "medium" as const,
        summary: "Test",
      };

      const decision = getFieldDecision(result, "industry");
      expect(decision).toBeDefined();
      expect(decision?.fieldKey).toBe("industry");
    });

    it("returns undefined for unknown field", () => {
      const result = {
        fieldDecisions: {},
        conflictedFields: [],
        highConfidenceFields: [],
        overallConfidence: "uncertain" as const,
        summary: "",
      };

      const decision = getFieldDecision(result, "industry");
      expect(decision).toBeUndefined();
    });
  });

  describe("isFieldConflicted", () => {
    it("returns true for conflicted field", () => {
      const result = {
        fieldDecisions: {},
        conflictedFields: ["industry"],
        highConfidenceFields: [],
        overallConfidence: "medium" as const,
        summary: "",
      };

      expect(isFieldConflicted(result, "industry")).toBe(true);
      expect(isFieldConflicted(result, "productType")).toBe(false);
    });
  });

  describe("explainFieldScoring", () => {
    it("produces human-readable explanation", () => {
      const decision = {
        fieldKey: "industry" as const,
        selectedCandidate: {
          value: "fintech",
          supportScore: 85,
          confidenceBand: "high" as const,
          evidenceCoverage: "strong" as const,
          reasons: ["3 supporting signals", "2 independent sources"],
          evidenceRefs: [
            {
              sourceUrl: "https://example.com/about",
              pageType: "about" as PageType,
              snippet: "We are a fintech company",
              signalType: "DIRECT_QUOTE",
              strength: "strong" as const,
            },
          ],
          signalCount: 3,
          sourceDiversity: 2,
          hasDirectLegalSecuritySource: false,
        },
        allCandidates: [],
        hasConflict: false,
        conflictCandidates: [],
        fieldCoverage: "strong" as const,
        canSupportHighConfidence: true,
        decisionSummary: "Test summary",
      };

      const explanation = explainFieldScoring(decision);

      expect(explanation).toContain("Field: industry");
      expect(explanation).toContain("Selected: fintech");
      expect(explanation).toContain("Support Score: 85/100");
      expect(explanation).toContain("NOT accuracy");
      expect(explanation).toContain("Confidence Band: high");
      expect(explanation).toContain("Evidence Coverage: strong");
      expect(explanation).toContain("Reasons:");
      expect(explanation).toContain("Signals: 3");
      expect(explanation).toContain("Source Diversity: 2 page(s)");
    });

    it("includes conflict information when present", () => {
      const decision = {
        fieldKey: "industry" as const,
        selectedCandidate: {
          value: "fintech",
          supportScore: 70,
          confidenceBand: "medium" as const,
          evidenceCoverage: "medium" as const,
          reasons: ["Some evidence"],
          evidenceRefs: [],
          signalCount: 2,
          sourceDiversity: 1,
          hasDirectLegalSecuritySource: false,
        },
        allCandidates: [],
        hasConflict: true,
        conflictCandidates: [
          {
            value: "fintech",
            supportScore: 70,
            confidenceBand: "medium" as const,
            evidenceCoverage: "medium" as const,
            reasons: [],
            evidenceRefs: [],
            signalCount: 2,
            sourceDiversity: 1,
            hasDirectLegalSecuritySource: false,
          },
          {
            value: "software",
            supportScore: 65,
            confidenceBand: "medium" as const,
            evidenceCoverage: "medium" as const,
            reasons: [],
            evidenceRefs: [],
            signalCount: 2,
            sourceDiversity: 1,
            hasDirectLegalSecuritySource: false,
          },
        ],
        fieldCoverage: "medium" as const,
        canSupportHighConfidence: false,
        decisionSummary: "Test",
      };

      const explanation = explainFieldScoring(decision);

      expect(explanation).toContain("⚠️ CONFLICT detected");
      expect(explanation).toContain("software");
    });
  });
});
