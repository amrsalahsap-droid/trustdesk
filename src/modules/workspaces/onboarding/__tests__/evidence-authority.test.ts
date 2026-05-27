import { describe, it, expect } from "vitest";
import { EvidenceAuthorityEngine } from "../evidence-authority/evidence-authority-engine";
import { EvidenceRef } from "../evidence-scoring";
import { StructuredPageEvidence } from "../evidence";

describe("EvidenceAuthorityEngine", () => {
  it("should evaluate Trust Center evidence with Very High authority score and modifiers", () => {
    const ref: EvidenceRef = {
      sourceUrl: "https://example.com/trust-portal/security",
      pageType: "trust",
      snippet: "Our SOC 2 Type II report is available under NDA.",
      signalType: "CAPABILITY_STRONG_KEYWORD_MATCH",
      strength: "strong",
    };

    const page: StructuredPageEvidence = {
      url: "https://example.com/trust-portal/security",
      title: "Trust Portal",
      pageType: "trust",
      score: 0.95,
      sourceConfidence: 0.9,
      blocks: [
        {
          kind: "heading-section",
          source: "visible_text",
          level: 2,
          heading: "SOC 2 Compliance",
          bodyText: "Our SOC 2 Type II report is available under NDA.",
        },
      ],
    };

    const auth = EvidenceAuthorityEngine.evaluate(ref, page);

    expect(auth.sourceType).toBe("trust_center");
    expect(auth.authorityScore).toBeGreaterThanOrEqual(95);
    expect(auth.confidenceModifier).toBe(1.25);
    expect(auth.extractionQuality).toBe(85); // heading section block
    expect(auth.freshnessScore).toBe(85); // default fallback
    expect(auth.contradictionRisk).toBe(5);
  });

  it("should evaluate API Docs evidence with High authority score", () => {
    const ref: EvidenceRef = {
      sourceUrl: "https://example.com/docs/api-reference",
      pageType: "docs",
      snippet: "Use our webhook POST API to fetch audit logs.",
      signalType: "CAPABILITY_MEDIUM_KEYWORD_MATCH",
      strength: "medium",
    };

    const auth = EvidenceAuthorityEngine.evaluate(ref);

    expect(auth.sourceType).toBe("api_schema");
    expect(auth.authorityScore).toBe(95);
    expect(auth.confidenceModifier).toBe(1.25);
  });

  it("should discount raw confidence when evidence is blog-only", () => {
    const ref: EvidenceRef = {
      sourceUrl: "https://example.com/blog/security-announcement",
      pageType: "other",
      snippet: "We announced the release of our advanced cloud vulnerability scanning capability.",
      signalType: "CAPABILITY_WEAK_KEYWORD_MATCH",
      strength: "weak",
    };

    const authRefs = EvidenceAuthorityEngine.evaluateRefList([ref]);
    expect(authRefs[0].authority?.sourceType).toBe("blog");

    // Blog-only should severely discount raw confidence (e.g. 0.85 -> 0.85 * 0.60 * 0.50 = ~0.25)
    const adjusted = EvidenceAuthorityEngine.adjustConfidence(0.85, authRefs);
    expect(adjusted).toBeLessThan(0.35);
  });

  it("should boost contradiction risk for transient, negative, or future statements", () => {
    const ref: EvidenceRef = {
      sourceUrl: "https://example.com/docs/setup",
      pageType: "docs",
      snippet: "Note: cloud scanning is coming soon and is under development.",
      signalType: "CAPABILITY_STRONG_KEYWORD_MATCH",
      strength: "strong",
    };

    const auth = EvidenceAuthorityEngine.evaluate(ref);
    expect(auth.contradictionRisk).toBe(80);
    expect(auth.confidenceModifier).toBeLessThan(1.0); // modifier penalized due to contradiction

    const authRefs = EvidenceAuthorityEngine.evaluateRefList([ref]);
    const contradictionReport = EvidenceAuthorityEngine.detectContradictions(authRefs);
    expect(contradictionReport.hasContradiction).toBe(true);
    expect(contradictionReport.riskScore).toBe(80);
    expect(contradictionReport.details[0]).toContain("High contradiction risk detected");
  });

  it("should decrease freshness score for stale or legacy evidence", () => {
    const ref: EvidenceRef = {
      sourceUrl: "https://example.com/v1/archive/setup",
      pageType: "docs",
      snippet: "This legacy setup document describes configuration as of 2023.",
      signalType: "CAPABILITY_STRONG_KEYWORD_MATCH",
      strength: "strong",
    };

    const auth = EvidenceAuthorityEngine.evaluate(ref);
    expect(auth.freshnessScore).toBe(45);
  });
});
