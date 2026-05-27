import { describe, it, expect } from "vitest";
import {
  computeEvidenceBasedDecisions,
  getTopCandidate,
  getHighConfidenceDecisions,
  getConflictedDecisions,
  type EvidenceSignal,
  type ExtractedSignals,
} from "@/modules/workspaces/onboarding/evidence-based-decisions";

describe("Evidence-Based Decisions", () => {
  const createSignal = (
    fieldKey: string,
    candidateValue: string,
    signalType: string,
    strength: string,
    pageType: string,
    sourceUrl: string,
    snippet: string,
    confidenceScore: number = 80
  ): EvidenceSignal => ({
    fieldKey,
    candidateValue,
    signalType: signalType as any,
    strength: strength as any,
    sourceUrl,
    pageType: pageType as any,
    snippet,
    reason: "test reason",
    confidenceScore,
  });

  it("computes high confidence for clear software evidence", () => {
    const extractedSignals: ExtractedSignals = {
      industry: createSignal(
        "industry",
        "software",
        "product_language",
        "high",
        "homepage",
        "https://example.com",
        "Our SaaS platform provides enterprise software solutions",
        90
      ),
      customerIndustries: [],
      businessModel: undefined,
      complianceFocus: [],
      securityPosture: [],
      dataHandling: [],
      integrations: [],
    };

    const decisions = computeEvidenceBasedDecisions(extractedSignals);
    const industryDecision = decisions.industry;

    expect(industryDecision.topCandidate?.value).toBe("software");
    expect(industryDecision.topCandidate?.supportScore).toBeGreaterThanOrEqual(80);
    expect(industryDecision.topCandidate?.confidenceBand).toBe("high");
    expect(industryDecision.topCandidate?.evidenceCoverage).toBeGreaterThanOrEqual(70);
    expect(industryDecision.topCandidate?.reasons).toContain("Strong signal strength");
    expect(industryDecision.topCandidate?.evidenceRefs).toHaveLength(1);
    expect(industryDecision.overallConfidence).toBe("high");
    expect(industryDecision.isConflicted).toBe(false);
  });

  it("handles software vendor serving healthcare correctly", () => {
    const extractedSignals: ExtractedSignals = {
      industry: createSignal(
        "industry",
        "software",
        "product_language",
        "high",
        "homepage",
        "https://example.com",
        "Our healthcare SaaS platform serves medical organizations",
        90
      ),
      customerIndustries: [
        createSignal(
          "customerIndustries",
          "healthcare",
          "customer_language",
          "medium",
          "customers",
          "https://example.com/customers",
          "We serve hospitals and healthcare providers",
          75
        ),
      ],
      businessModel: undefined,
      complianceFocus: [],
      securityPosture: [],
      dataHandling: [],
      integrations: [],
    };

    const decisions = computeEvidenceBasedDecisions(extractedSignals);
    
    // Primary industry should be software
    expect(decisions.industry.topCandidate?.value).toBe("software");
    expect(decisions.industry.topCandidate?.confidenceBand).toBe("high");
    
    // Customer industry should be healthcare
    expect(decisions.customerIndustries.topCandidate?.value).toBe("healthcare");
    expect(decisions.customerIndustries.topCandidate?.confidenceBand).toBe("medium");
  });

  it("classifies healthcare provider as healthtech", () => {
    const extractedSignals: ExtractedSignals = {
      industry: createSignal(
        "industry",
        "healthtech",
        "industry_language",
        "high",
        "homepage",
        "https://example.com",
        "Our healthtech platform provides clinical software for hospitals",
        85
      ),
      customerIndustries: [],
      businessModel: undefined,
      complianceFocus: [],
      securityPosture: [],
      dataHandling: [],
      integrations: [],
    };

    const decisions = computeEvidenceBasedDecisions(extractedSignals);
    
    expect(decisions.industry.topCandidate?.value).toBe("healthtech");
    expect(decisions.industry.topCandidate?.confidenceBand).toBe("high");
    expect(decisions.industry.topCandidate?.reasons).toContain("Strong signal strength");
  });

  it("marks close candidates as conflicted", () => {
    const extractedSignals: ExtractedSignals = {
      industry: [
        createSignal(
          "industry",
          "software",
          "product_language",
          "high",
          "homepage",
          "https://example.com",
          "Our software platform",
          75
        ),
        createSignal(
          "industry",
          "healthtech",
          "industry_language",
          "high",
          "about",
          "https://example.com/about",
          "Our healthtech solutions",
          70
        ),
      ],
      customerIndustries: [],
      businessModel: undefined,
      complianceFocus: [],
      securityPosture: [],
      dataHandling: [],
      integrations: [],
    };

    const decisions = computeEvidenceBasedDecisions(extractedSignals);
    
    expect(decisions.industry.isConflicted).toBe(true);
    expect(decisions.industry.overallConfidence).toBe("conflicted");
    
    // Top candidates should be marked as conflicted
    expect(decisions.industry.candidates[0].confidenceBand).toBe("conflicted");
    expect(decisions.industry.candidates[1].confidenceBand).toBe("conflicted");
    
    // Support scores should be close (within 15 points)
    const scoreDiff = decisions.industry.candidates[0].supportScore - decisions.industry.candidates[1].supportScore;
    expect(scoreDiff).toBeLessThanOrEqual(15);
  });

  it("returns limited confidence for weak evidence", () => {
    const extractedSignals: ExtractedSignals = {
      industry: createSignal(
        "industry",
        "software",
        "product_language",
        "low",
        "docs",
        "https://example.com/docs",
        "Software mentioned in documentation",
        40
      ),
      customerIndustries: [],
      businessModel: undefined,
      complianceFocus: [],
      securityPosture: [],
      dataHandling: [],
      integrations: [],
    };

    const decisions = computeEvidenceBasedDecisions(extractedSignals);
    
    expect(decisions.industry.topCandidate?.value).toBe("software");
    expect(decisions.industry.topCandidate?.confidenceBand).toBe("limited");
    expect(decisions.industry.topCandidate?.supportScore).toBeLessThan(60);
    expect(decisions.industry.topCandidate?.evidenceCoverage).toBeLessThan(50);
  });

  it("returns unknown confidence for no evidence", () => {
    const extractedSignals: ExtractedSignals = {
      industry: undefined,
      customerIndustries: [],
      businessModel: undefined,
      complianceFocus: [],
      securityPosture: [],
      dataHandling: [],
      integrations: [],
    };

    const llmCandidates = {
      industry: [{ value: "software", aiConfidence: 0.7 }],
    };

    const decisions = computeEvidenceBasedDecisions(extractedSignals, llmCandidates);
    
    expect(decisions.industry.topCandidate?.value).toBe("software");
    expect(decisions.industry.topCandidate?.confidenceBand).toBe("limited");
    expect(decisions.industry.topCandidate?.supportScore).toBeLessThan(30); // Heavily discounted LLM
    expect(decisions.industry.topCandidate?.evidenceCoverage).toBe(0);
    expect(decisions.industry.topCandidate?.reasons).toContain("No direct evidence found, relying on LLM inference");
  });

  it("boosts scores for high-value source pages", () => {
    const extractedSignals: ExtractedSignals = {
      complianceFocus: createSignal(
        "complianceFocus",
        "GDPR",
        "compliance_language",
        "high",
        "privacy",
        "https://example.com/privacy",
        "GDPR compliance notice",
        80
      ),
      customerIndustries: [],
      businessModel: undefined,
      industry: undefined,
      securityPosture: [],
      dataHandling: [],
      integrations: [],
    };

    const decisions = computeEvidenceBasedDecisions(extractedSignals);
    
    // Privacy page should get high weight (1.5x)
    expect(decisions.complianceFocus.topCandidate?.supportScore).toBeGreaterThan(80);
    expect(decisions.complianceFocus.topCandidate?.confidenceBand).toBe("high");
  });

  it("boosts scores for multiple signals across pages", () => {
    const extractedSignals: ExtractedSignals = {
      industry: [
        createSignal(
          "industry",
          "software",
          "product_language",
          "high",
          "homepage",
          "https://example.com",
          "Our software platform",
          80
        ),
        createSignal(
          "industry",
          "software",
          "product_language",
          "medium",
          "product",
          "https://example.com/product",
          "Software features",
          70
        ),
      ],
      customerIndustries: [],
      businessModel: undefined,
      complianceFocus: [],
      securityPosture: [],
      dataHandling: [],
      integrations: [],
    };

    const decisions = computeEvidenceBasedDecisions(extractedSignals);
    
    expect(decisions.industry.topCandidate?.value).toBe("software");
    expect(decisions.industry.topCandidate?.confidenceBand).toBe("high");
    expect(decisions.industry.topCandidate?.reasons).toContain("Evidence across multiple pages");
    expect(decisions.industry.topCandidate?.evidenceRefs).toHaveLength(2);
  });

  it("boosts scores for multiple corroborating signals on same page", () => {
    const extractedSignals: ExtractedSignals = {
      businessModel: [
        createSignal(
          "businessModel",
          "saas",
          "business_model_language",
          "high",
          "pricing",
          "https://example.com/pricing",
          "SaaS subscription pricing",
          80
        ),
        createSignal(
          "businessModel",
          "saas",
          "business_model_language",
          "medium",
          "pricing",
          "https://example.com/pricing",
          "Monthly subscription plans",
          70
        ),
      ],
      customerIndustries: [],
      industry: undefined,
      complianceFocus: [],
      securityPosture: [],
      dataHandling: [],
      integrations: [],
    };

    const decisions = computeEvidenceBasedDecisions(extractedSignals);
    
    expect(decisions.businessModel.topCandidate?.value).toBe("saas");
    expect(decisions.businessModel.topCandidate?.confidenceBand).toBe("high");
    expect(decisions.businessModel.topCandidate?.evidenceRefs).toHaveLength(2);
  });

  it("includes all required candidate fields", () => {
    const extractedSignals: ExtractedSignals = {
      securityPosture: createSignal(
        "securityPosture",
        "enterprise_grade",
        "security_language",
        "high",
        "security",
        "https://example.com/security",
        "Enterprise-grade security",
        85
      ),
      customerIndustries: [],
      businessModel: undefined,
      industry: undefined,
      complianceFocus: [],
      dataHandling: [],
      integrations: [],
    };

    const decisions = computeEvidenceBasedDecisions(extractedSignals);
    const candidate = decisions.securityPosture.topCandidate!;

    expect(candidate).toMatchObject({
      value: "enterprise_grade",
      aiConfidence: 0,
      supportScore: expect.any(Number),
      confidenceBand: expect.any(String),
      evidenceCoverage: expect.any(Number),
      reasons: expect.any(Array),
      evidenceRefs: expect.any(Array),
      conflictingSignals: expect.any(Array),
    });
    
    expect(candidate.supportScore).toBeGreaterThanOrEqual(0);
    expect(candidate.supportScore).toBeLessThanOrEqual(100);
    expect(candidate.evidenceCoverage).toBeGreaterThanOrEqual(0);
    expect(candidate.evidenceCoverage).toBeLessThanOrEqual(100);
  });

  it("provides evidence references with all required fields", () => {
    const extractedSignals: ExtractedSignals = {
      integrations: createSignal(
        "integrations",
        "api",
        "integration_language",
        "medium",
        "integrations",
        "https://example.com/integrations",
        "REST API integration",
        75
      ),
      customerIndustries: [],
      businessModel: undefined,
      industry: undefined,
      complianceFocus: [],
      securityPosture: [],
      dataHandling: [],
    };

    const decisions = computeEvidenceBasedDecisions(extractedSignals);
    const evidenceRef = decisions.integrations.topCandidate?.evidenceRefs[0];

    expect(evidenceRef).toMatchObject({
      fieldKey: "integrations",
      candidateValue: "api",
      sourceUrl: "https://example.com/integrations",
      pageType: "integrations",
      snippet: "REST API integration",
      signalType: "integration_language",
      strength: "medium",
      confidenceScore: 75,
    });
  });

  it("computes decisions for all fields", () => {
    const extractedSignals: ExtractedSignals = {
      industry: createSignal("industry", "software", "product_language", "high", "homepage", "https://example.com", "Software platform", 80),
      businessModel: createSignal("businessModel", "saas", "business_model_language", "high", "pricing", "https://example.com/pricing", "SaaS pricing", 80),
      customerIndustries: [createSignal("customerIndustries", "healthcare", "customer_language", "medium", "customers", "https://example.com/customers", "Healthcare customers", 70)],
      complianceFocus: [createSignal("complianceFocus", "GDPR", "compliance_language", "high", "privacy", "https://example.com/privacy", "GDPR compliance", 85)],
      securityPosture: [createSignal("securityPosture", "enterprise_grade", "security_language", "high", "security", "https://example.com/security", "Enterprise security", 85)],
      dataHandling: [createSignal("dataHandling", "encrypted", "security_language", "high", "privacy", "https://example.com/privacy", "Data encryption", 80)],
      integrations: [createSignal("integrations", "api", "integration_language", "medium", "integrations", "https://example.com/integrations", "API integration", 75)],
    };

    const decisions = computeEvidenceBasedDecisions(extractedSignals);

    // All fields should have decisions
    expect(Object.keys(decisions)).toHaveLength(7);
    
    // All should have top candidates
    expect(decisions.industry.topCandidate?.value).toBe("software");
    expect(decisions.businessModel.topCandidate?.value).toBe("saas");
    expect(decisions.customerIndustries.topCandidate?.value).toBe("healthcare");
    expect(decisions.complianceFocus.topCandidate?.value).toBe("GDPR");
    expect(decisions.securityPosture.topCandidate?.value).toBe("enterprise_grade");
    expect(decisions.dataHandling.topCandidate?.value).toBe("encrypted");
    expect(decisions.integrations.topCandidate?.value).toBe("api");
  });

  it("handles empty extracted signals gracefully", () => {
    const extractedSignals: ExtractedSignals = {
      industry: undefined,
      customerIndustries: [],
      businessModel: undefined,
      complianceFocus: [],
      securityPosture: [],
      dataHandling: [],
      integrations: [],
    };

    const decisions = computeEvidenceBasedDecisions(extractedSignals);

    expect(Object.keys(decisions)).toHaveLength(7);
    
    // All decisions should have no top candidate
    for (const decision of Object.values(decisions)) {
      expect(decision.topCandidate).toBeUndefined();
      expect(decision.overallConfidence).toBe("unknown");
      expect(decision.isConflicted).toBe(false);
    }
  });

  describe("Utility Functions", () => {
    it("gets top candidate for field", () => {
      const extractedSignals: ExtractedSignals = {
        industry: createSignal("industry", "software", "product_language", "high", "homepage", "https://example.com", "Software", 80),
        customerIndustries: [],
        businessModel: undefined,
        complianceFocus: [],
        securityPosture: [],
        dataHandling: [],
        integrations: [],
      };

      const decisions = computeEvidenceBasedDecisions(extractedSignals);
      const topCandidate = getTopCandidate(decisions, "industry");

      expect(topCandidate?.value).toBe("software");
      expect(getTopCandidate(decisions, "nonexistent")).toBeUndefined();
    });

    it("gets high confidence decisions", () => {
      const extractedSignals: ExtractedSignals = {
        industry: createSignal("industry", "software", "product_language", "high", "homepage", "https://example.com", "Software", 90),
        complianceFocus: createSignal("complianceFocus", "GDPR", "compliance_language", "high", "privacy", "https://example.com/privacy", "GDPR", 85),
        customerIndustries: [],
        businessModel: undefined,
        securityPosture: [],
        dataHandling: [],
        integrations: [],
      };

      const decisions = computeEvidenceBasedDecisions(extractedSignals);
      const highConfidence = getHighConfidenceDecisions(decisions);

      expect(Object.keys(highConfidence)).toHaveLength(2);
      expect(highConfidence.industry.overallConfidence).toBe("high");
      expect(highConfidence.complianceFocus.overallConfidence).toBe("high");
    });

    it("gets conflicted decisions", () => {
      const extractedSignals: ExtractedSignals = {
        industry: [
          createSignal("industry", "software", "product_language", "high", "homepage", "https://example.com", "Software", 75),
          createSignal("industry", "healthtech", "industry_language", "high", "about", "https://example.com/about", "Healthtech", 70),
        ],
        customerIndustries: [],
        businessModel: undefined,
        complianceFocus: [],
        securityPosture: [],
        dataHandling: [],
        integrations: [],
      };

      const decisions = computeEvidenceBasedDecisions(extractedSignals);
      const conflicted = getConflictedDecisions(decisions);

      expect(Object.keys(conflicted)).toHaveLength(1);
      expect(conflicted.industry.isConflicted).toBe(true);
      expect(conflicted.industry.overallConfidence).toBe("conflicted");
    });
  });
});
