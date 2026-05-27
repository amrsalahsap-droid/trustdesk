import { describe, it, expect } from "vitest";
import { WebsiteAnalysisService } from "../website-analysis-service";
import { type DeepInferredProfile, type EvidenceItem } from "../website-analysis-service";

describe("Regression: AI Inference Normalization", () => {
  const mockEvidence: any[] = [
    {
      pageType: "security",
      evidence: { url: "https://example.com/security", title: "Security", snippet: "", headings: [] },
      structured: {
        url: "https://example.com/security",
        title: "Security & Trust",
        pageType: "security",
        score: 100,
        sourceConfidence: 1.0,
        blocks: [
          { kind: "heading-section", heading: "Enterprise Security", bodyText: "We build cybersecurity software." }
        ]
      }
    }
  ];

  const normalize = (raw: any) => (WebsiteAnalysisService as any).normalizeProfile(raw, mockEvidence);

  // 1. AI returns industry "cybersecurity" => normalized industry software
  it("maps industry 'cybersecurity' to 'software'", () => {
    const raw = {
      companyName: "CyberSec",
      industry: "cybersecurity",
      productType: "saas"
    };
    const profile = normalize(raw);
    expect(profile?.industry?.value).toBe("software");
    expect(profile?.industry?.normalizationMethod).toBe("synonym_map");
  });

  // 2. AI returns industry "security software" => normalized industry software
  it("maps industry 'security software' to 'software'", () => {
    const raw = {
      companyName: "SecSoft",
      industry: "security software",
      productType: "saas"
    };
    const profile = normalize(raw);
    expect(profile?.industry?.value).toBe("software");
  });

  // 3. AI returns productType "SaaS Platform" => normalized productType saas
  it("maps productType 'SaaS Platform' to 'saas'", () => {
    const raw = {
      companyName: "SaaSCo",
      industry: "software",
      productType: "SaaS Platform"
    };
    const profile = normalize(raw);
    expect(profile?.productType?.value).toBe("saas");
    expect(profile?.productType?.normalizationMethod).toBe("synonym_map");
  });

  // 4. AI returns productType "cloud platform" => normalized productType saas
  it("maps productType 'cloud platform' to 'saas'", () => {
    const raw = {
      companyName: "CloudCo",
      industry: "software",
      productType: "cloud platform"
    };
    const profile = normalize(raw);
    expect(profile?.productType?.value).toBe("saas");
  });

  // 5. AI returns unknown industry => normalized industry other with diagnostic
  it("maps unknown industry to 'other' with diagnostic", () => {
    const raw = {
      companyName: "RocketCo",
      industry: "Rocket Science",
      productType: "saas"
    };
    const profile = normalize(raw);
    expect(profile?.industry?.value).toBe("other");
    expect(profile?.industry?.normalizationMethod).toBe("fallback");
    expect(profile?.industry?.reasons?.[0]).toContain("Inferred from raw value: \"Rocket Science\"");
  });

  // 6. Enum mismatch does not return schema_invalid (it should normalize instead of returning null)
  it("enum mismatch does not cause normalization to fail (return null)", () => {
    const raw = {
      companyName: "Unknown",
      industry: "Completely New Industry",
      productType: "Novel Deployment"
    };
    const profile = normalize(raw);
    expect(profile).not.toBeNull();
    expect(profile?.industry?.value).toBe("other");
    expect(profile?.productType?.value).toBe("saas"); // Default fallback
  });

  // 7. Malformed AI structure still returns null (which leads to schema_invalid in caller)
  it("truly malformed structure returns null", () => {
    const raw = {
      not_a_profile: true
    };
    const profile = normalize(raw);
    expect(profile).toBeNull();
  });

  // 8. Missing optional fields default safely
  it("missing optional fields like suggestedDocuments default safely", () => {
    const raw = {
      companyName: "MinCo",
      industry: "software",
      productType: "saas"
      // suggestedDocuments missing
    };
    const profile = normalize(raw);
    expect(profile?.suggestedDocuments).toEqual([]);
  });

  // 9. confidenceBand/supportScore are backend-calculated, not required from AI
  it("calculates confidenceBand and supportScore in backend", () => {
    const raw = {
      companyName: "ConfidenceCo",
      industry: "software",
      productType: "saas"
    };
    const profile = normalize(raw);
    expect(profile?.industry?.confidenceBand).toBeDefined();
    expect(profile?.industry?.supportScore).toBeGreaterThan(0);
    expect(profile?.industry?.evidenceCoverage).toBeDefined();
  });

  // 10. rawValue is preserved for normalized fields
  it("preserves rawValue for normalized fields", () => {
    const raw = {
      companyName: "RawCo",
      industry: "cybersecurity",
      productType: "SaaS Platform"
    };
    const profile = normalize(raw);
    expect(profile?.industry?.rawValue).toBe("cybersecurity");
    expect(profile?.productType?.rawValue).toBe("SaaS Platform");
  });
});
