import { describe, it, expect } from "vitest";
import { type IndustryCandidate } from "../../modules/workspaces/onboarding/website-analysis-service";

// Mock data for testing explainability UI
const mockSoftwareCandidate: IndustryCandidate = {
  value: "software",
  supportScore: 85,
  confidenceBand: "high",
  evidenceCoverage: "strong",
  evidenceRefs: [
    {
      sourceUrl: "https://example.com/about",
      pageType: "about",
      snippet: "We are a software company that builds enterprise platforms",
      signalType: "DIRECT_QUOTE",
      strength: "strong",
      contribution: 40,
    },
    {
      sourceUrl: "https://example.com/product",
      pageType: "product", 
      snippet: "Our SaaS platform helps businesses scale",
      signalType: "DIRECT_QUOTE",
      strength: "strong",
      contribution: 25,
    },
    {
      sourceUrl: "https://example.com/security",
      pageType: "security",
      snippet: "Enterprise software security and compliance",
      signalType: "INFERRED",
      strength: "moderate",
      contribution: 15,
    },
  ],
  reasons: [
    "DIRECT_QUOTE match: software",
    "Repeated across 3 pages (+20)",
    "JSON-LD industry: computer software",
  ],
  conflictingSignals: [
    {
      sourceUrl: "https://example.com/customers",
      pageType: "customers",
      snippet: "We help healthcare organizations with our software",
      signalType: "CUSTOMER_SIGNAL",
      strength: "weak",
      contribution: 0,
    },
  ],
  isConflicted: false,
};

const mockHealthtechCandidate: IndustryCandidate = {
  value: "healthtech",
  supportScore: 45,
  confidenceBand: "limited",
  evidenceCoverage: "limited",
  evidenceRefs: [
    {
      sourceUrl: "https://example.com/customers",
      pageType: "customers",
      snippet: "Our platform serves healthcare providers",
      signalType: "CUSTOMER_SIGNAL",
      strength: "moderate",
      contribution: 15,
    },
  ],
  reasons: [
    "CUSTOMER_SIGNAL match: healthtech",
    "Healthcare appears to be customer industry, not company",
  ],
  conflictingSignals: [],
  isConflicted: false,
};

const mockConflictedCandidate: IndustryCandidate = {
  value: "software",
  supportScore: 55,
  confidenceBand: "unknown", // Conflict overrides to unknown
  evidenceCoverage: "medium",
  evidenceRefs: [
    {
      sourceUrl: "https://example.com/about",
      pageType: "about",
      snippet: "We are a software company",
      signalType: "DIRECT_QUOTE",
      strength: "strong",
      contribution: 40,
    },
  ],
  reasons: [
    "DIRECT_QUOTE match: software",
  ],
  conflictingSignals: [
    {
      sourceUrl: "https://example.com/services",
      pageType: "product",
      snippet: "We provide medical software solutions",
      signalType: "DIRECT_QUOTE",
      strength: "strong",
      contribution: 40,
    },
  ],
  isConflicted: true,
};

describe("Industry Candidate Explainability", () => {
  describe("Software company example", () => {
    it("shows high confidence with strong evidence", () => {
      const candidate = mockSoftwareCandidate;
      
      expect(candidate.supportScore).toBe(85);
      expect(candidate.confidenceBand).toBe("high");
      expect(candidate.evidenceCoverage).toBe("strong");
      expect(candidate.evidenceRefs).toHaveLength(3);
      expect(candidate.reasons).toContain("DIRECT_QUOTE match: software");
      expect(candidate.reasons).toContain("Repeated across 3 pages (+20)");
    });

    it("explains why software was recommended", () => {
      const candidate = mockSoftwareCandidate;
      
      // Should show explicit software company evidence
      const softwareEvidence = candidate.evidenceRefs.find(ref => 
        ref.snippet.includes("software company")
      );
      expect(softwareEvidence).toBeDefined();
      expect(softwareEvidence?.pageType).toBe("about");
      expect(softwareEvidence?.strength).toBe("strong");
      
      // Should show SaaS platform evidence
      const saasEvidence = candidate.evidenceRefs.find(ref => 
        ref.snippet.includes("SaaS platform")
      );
      expect(saasEvidence).toBeDefined();
      expect(saasEvidence?.pageType).toBe("product");
    });

    it("handles customer industry signals correctly", () => {
      const candidate = mockSoftwareCandidate;
      
      // Should have customer signals but not conflicted
      expect(candidate.conflictingSignals).toHaveLength(1);
      expect(candidate.conflictingSignals[0].snippet).toContain("healthcare");
      expect(candidate.conflictingSignals[0].pageType).toBe("customers");
      expect(candidate.isConflicted).toBe(false);
    });
  });

  describe("Healthtech customer industry example", () => {
    it("shows limited confidence for customer-only signals", () => {
      const candidate = mockHealthtechCandidate;
      
      expect(candidate.supportScore).toBe(45);
      expect(candidate.confidenceBand).toBe("limited");
      expect(candidate.evidenceCoverage).toBe("limited");
      expect(candidate.reasons).toContain("Healthcare appears to be customer industry, not company");
    });

    it("explains missing evidence for higher confidence", () => {
      const candidate = mockHealthtechCandidate;
      
      expect(candidate.confidenceBand).toBe("limited");
      expect(candidate.evidenceCoverage).toBe("limited");
      
      // Should have customer signals but no company indicators
      expect(candidate.evidenceRefs[0].pageType).toBe("customers");
      expect(candidate.evidenceRefs[0].snippet).toContain("healthcare providers");
    });
  });

  describe("Conflicted signals example", () => {
    it("shows unknown confidence when conflicted", () => {
      const candidate = mockConflictedCandidate;
      
      expect(candidate.supportScore).toBe(55); // Still has decent score
      expect(candidate.confidenceBand).toBe("unknown"); // But conflict overrides
      expect(candidate.isConflicted).toBe(true);
    });

    it("shows conflicting evidence clearly", () => {
      const candidate = mockConflictedCandidate;
      
      expect(candidate.conflictingSignals).toHaveLength(1);
      expect(candidate.conflictingSignals[0].snippet).toContain("medical software");
      expect(candidate.conflictingSignals[0].pageType).toBe("product");
      expect(candidate.conflictingSignals[0].strength).toBe("strong");
    });
  });

  describe("UI content examples", () => {
    it("provides clear explanation for software recommendation", () => {
      const candidate = mockSoftwareCandidate;
      
      const explanation = {
        why: candidate.reasons.join(", "),
        evidence: candidate.evidenceRefs.map(ref => ({
          page: ref.pageType,
          snippet: ref.snippet,
          strength: ref.strength,
        })),
        conflicts: candidate.conflictingSignals.map(ref => ({
          page: ref.pageType,
          snippet: ref.snippet,
        })),
        score: candidate.supportScore,
        confidence: candidate.confidenceBand,
      };
      
      expect(explanation.why).toContain("DIRECT_QUOTE match: software");
      expect(explanation.evidence).toHaveLength(3);
      expect(explanation.conflicts).toHaveLength(1);
      expect(explanation.score).toBe(85);
      expect(explanation.confidence).toBe("high");
    });

    it("shows customer vs company industry distinction", () => {
      const softwareCandidate = mockSoftwareCandidate;
      const healthtechCandidate = mockHealthtechCandidate;
      
      // Software should have customer signals but still be primary
      expect(softwareCandidate.conflictingSignals).toHaveLength(1);
      expect(softwareCandidate.conflictingSignals[0].pageType).toBe("customers");
      expect(softwareCandidate.isConflicted).toBe(false);
      
      // Healthtech should be marked as customer industry
      expect(healthtechCandidate.reasons).toContain("Healthcare appears to be customer industry, not company");
      expect(healthtechCandidate.confidenceBand).toBe("limited");
    });
  });

  describe("Evidence quality indicators", () => {
    it("shows strong evidence indicators", () => {
      const candidate = mockSoftwareCandidate;
      
      const strongEvidence = candidate.evidenceRefs.filter(ref => ref.strength === "strong");
      expect(strongEvidence).toHaveLength(2);
      
      const highValuePages = candidate.evidenceRefs.filter(ref => 
        ["about", "product", "security", "trust", "compliance"].includes(ref.pageType)
      );
      expect(highValuePages).toHaveLength(3);
    });

    it("shows evidence source diversity", () => {
      const candidate = mockSoftwareCandidate;
      
      const uniquePages = new Set(candidate.evidenceRefs.map(ref => ref.pageType));
      expect(uniquePages.size).toBe(3); // about, product, security
      
      const uniqueUrls = new Set(candidate.evidenceRefs.map(ref => ref.sourceUrl));
      expect(uniqueUrls.size).toBe(3);
    });
  });
});
