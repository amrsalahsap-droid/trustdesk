import { describe, it, expect } from "vitest";
import {
  extractEvidenceSignals,
  type EvidenceSignal,
  type EvidencePage,
  type PageType,
} from "@/modules/workspaces/onboarding/evidence-signal-extractor";

describe("Evidence Signal Extractor", () => {
  const createMockPage = (
    url: string,
    pageType: PageType,
    title: string,
    snippets: Array<{ type: string; content: string; relevanceScore: number }>
  ): EvidencePage => ({
    url,
    finalUrl: url,
    title,
    pageType,
    statusCode: 200,
    extractionStatus: "success",
    textLength: 1000,
    usefulTextLength: 800,
    headings: ["Main Heading"],
    metaDescription: "Test description",
    evidenceSnippets: snippets.map(s => ({
      type: s.type as any,
      content: s.content,
      relevanceScore: s.relevanceScore,
    })),
    usefulnessScore: 75,
  });

  it("extracts software industry signal from SaaS platform", () => {
    const pages = [
      createMockPage(
        "https://example.com",
        "homepage",
        "Cloud Platform for Business",
        [
          {
            type: "heading",
            content: "Our SaaS Platform",
            relevanceScore: 90,
          },
          {
            type: "paragraph",
            content: "We provide enterprise software solutions with our cloud-based platform",
            relevanceScore: 85,
          },
        ]
      ),
    ];

    const signals = extractEvidenceSignals(pages);

    expect(signals.industry).toBeDefined();
    expect(signals.industry?.fieldKey).toBe("industry");
    expect(signals.industry?.candidateValue).toBe("software");
    expect(signals.industry?.signalType).toBe("product_language");
    expect(signals.industry?.strength).toBe("high");
    expect(signals.industry?.reason).toBe("explicit software/platform/vendor wording");
    expect(signals.industry?.snippet).toContain("SaaS Platform");
    expect(signals.industry?.confidenceScore).toBeGreaterThan(70);
  });

  it("extracts healthcare industry signal from medical provider", () => {
    const pages = [
      createMockPage(
        "https://example.com",
        "homepage",
        "Medical Services Platform",
        [
          {
            type: "heading",
            content: "Healthcare Solutions",
            relevanceScore: 90,
          },
          {
            type: "paragraph",
            content: "We provide clinical software for hospitals and healthcare providers",
            relevanceScore: 85,
          },
        ]
      ),
    ];

    const signals = extractEvidenceSignals(pages);

    expect(signals.industry).toBeDefined();
    expect(signals.industry?.candidateValue).toBe("healthtech");
    expect(signals.industry?.pageType).toBe("homepage");
    expect(signals.industry?.reason).toBe("explicit healthcare/medical service language");
  });

  it("correctly separates SaaS serving healthcare from healthcare provider", () => {
    const pages = [
      createMockPage(
        "https://example.com",
        "homepage",
        "Healthcare SaaS Platform",
        [
          {
            type: "heading",
            content: "Our Healthcare SaaS Platform",
            relevanceScore: 90,
          },
          {
            type: "paragraph",
            content: "We provide software solutions for healthcare organizations",
            relevanceScore: 85,
          },
        ]
      ),
      createMockPage(
        "https://example.com/customers",
        "customers",
        "Our Customers",
        [
          {
            type: "paragraph",
            content: "We serve hospitals, clinics, and healthcare providers worldwide",
            relevanceScore: 80,
          },
        ]
      ),
    ];

    const signals = extractEvidenceSignals(pages);

    // Primary industry should be software (SaaS takes precedence)
    expect(signals.industry?.candidateValue).toBe("software");
    
    // Customer industry should be healthcare
    expect(signals.customerIndustries).toHaveLength(1);
    expect(signals.customerIndustries[0].candidateValue).toBe("healthcare");
    expect(signals.customerIndustries[0].fieldKey).toBe("customerIndustries");
    expect(signals.customerIndustries[0].signalType).toBe("customer_language");
  });

  it("extracts GDPR compliance signal from privacy page", () => {
    const pages = [
      createMockPage(
        "https://example.com/privacy",
        "privacy",
        "Privacy Policy",
        [
          {
            type: "heading",
            content: "GDPR Compliance",
            relevanceScore: 95,
          },
          {
            type: "paragraph",
            content: "We are fully compliant with the General Data Protection Regulation (GDPR) and have appointed a Data Protection Officer",
            relevanceScore: 90,
          },
        ]
      ),
    ];

    const signals = extractEvidenceSignals(pages);

    expect(signals.complianceFocus).toHaveLength(1);
    const gdprSignal = signals.complianceFocus[0];
    expect(gdprSignal.fieldKey).toBe("complianceFocus");
    expect(gdprSignal.candidateValue).toBe("GDPR");
    expect(gdprSignal.signalType).toBe("compliance_language");
    expect(gdprSignal.pageType).toBe("privacy");
    expect(gdprSignal.reason).toBe("GDPR privacy or data processing language");
    expect(gdprSignal.strength).toBe("high");
    expect(gdprSignal.snippet).toContain("GDPR Compliance");
  });

  it("extracts multiple compliance signals from security page", () => {
    const pages = [
      createMockPage(
        "https://example.com/security",
        "security",
        "Security Overview",
        [
          {
            type: "heading",
            content: "SOC 2 Type II Certification",
            relevanceScore: 95,
          },
          {
            type: "paragraph",
            content: "We maintain SOC 2 Type II compliance and ISO 27001 certification for our information security management system",
            relevanceScore: 90,
          },
          {
            type: "paragraph",
            content: "Our payment processing is PCI DSS compliant",
            relevanceScore: 85,
          },
        ]
      ),
    ];

    const signals = extractEvidenceSignals(pages);

    expect(signals.complianceFocus).toHaveLength(3);
    
    const complianceValues = signals.complianceFocus.map(s => s.candidateValue);
    expect(complianceValues).toContain("SOC2");
    expect(complianceValues).toContain("ISO27001");
    expect(complianceValues).toContain("PCI-DSS");
    
    // All should be from security page
    expect(signals.complianceFocus.every(s => s.pageType === "security")).toBe(true);
  });

  it("extracts SaaS business model signal", () => {
    const pages = [
      createMockPage(
        "https://example.com/pricing",
        "pricing",
        "Pricing Plans",
        [
          {
            type: "heading",
            content: "Subscription Pricing",
            relevanceScore: 90,
          },
          {
            type: "paragraph",
            content: "Our SaaS platform offers monthly and annual subscription plans with per-user pricing",
            relevanceScore: 85,
          },
        ]
      ),
    ];

    const signals = extractEvidenceSignals(pages);

    expect(signals.businessModel).toBeDefined();
    expect(signals.businessModel?.fieldKey).toBe("businessModel");
    expect(signals.businessModel?.candidateValue).toBe("saas");
    expect(signals.businessModel?.signalType).toBe("business_model_language");
    expect(signals.businessModel?.pageType).toBe("pricing");
    expect(signals.businessModel?.reason).toBe("explicit SaaS/subscription language");
  });

  it("extracts security posture signals", () => {
    const pages = [
      createMockPage(
        "https://example.com/security",
        "security",
        "Security Overview",
        [
          {
            type: "heading",
            content: "Enterprise-Grade Security",
            relevanceScore: 95,
          },
          {
            type: "paragraph",
            content: "We are certified by third-party auditors for our comprehensive security program",
            relevanceScore: 90,
          },
        ]
      ),
    ];

    const signals = extractEvidenceSignals(pages);

    expect(signals.securityPosture).toHaveLength(2);
    
    const postureValues = signals.securityPosture.map(s => s.candidateValue);
    expect(postureValues).toContain("enterprise_grade");
    expect(postureValues).toContain("certified");
    
    expect(signals.securityPosture.every(s => s.pageType === "security")).toBe(true);
  });

  it("extracts data handling signals", () => {
    const pages = [
      createMockPage(
        "https://example.com/privacy",
        "privacy",
        "Privacy Policy",
        [
          {
            type: "paragraph",
            content: "All data is encrypted using AES-256 encryption at rest and TLS 1.3 in transit",
            relevanceScore: 90,
          },
          {
            type: "paragraph",
            content: "We maintain secure data handling practices to protect your information",
            relevanceScore: 85,
          },
        ]
      ),
    ];

    const signals = extractEvidenceSignals(pages);

    expect(signals.dataHandling).toHaveLength(2);
    
    const handlingValues = signals.dataHandling.map(s => s.candidateValue);
    expect(handlingValues).toContain("encrypted");
    expect(handlingValues).toContain("secure");
    
    expect(signals.dataHandling.every(s => s.pageType === "privacy")).toBe(true);
  });

  it("extracts integration signals", () => {
    const pages = [
      createMockPage(
        "https://example.com/integrations",
        "integrations",
        "Integrations",
        [
          {
            type: "heading",
            content: "API Integrations",
            relevanceScore: 90,
          },
          {
            type: "paragraph",
            content: "We provide REST API and webhook integrations, plus SSO support with SAML and OAuth",
            relevanceScore: 85,
          },
        ]
      ),
    ];

    const signals = extractEvidenceSignals(pages);

    expect(signals.integrations).toHaveLength(3);
    
    const integrationValues = signals.integrations.map(s => s.candidateValue);
    expect(integrationValues).toContain("api");
    expect(integrationValues).toContain("webhook");
    expect(integrationValues).toContain("sso");
    
    expect(signals.integrations.every(s => s.pageType === "integrations")).toBe(true);
  });

  it("extracts multiple customer industries", () => {
    const pages = [
      createMockPage(
        "https://example.com/customers",
        "customers",
        "Our Customers",
        [
          {
            type: "paragraph",
            content: "We serve healthcare organizations, financial institutions, and ecommerce merchants",
            relevanceScore: 85,
          },
          {
            type: "paragraph",
            content: "Our fintech and banking customers rely on our secure platform",
            relevanceScore: 80,
          },
        ]
      ),
    ];

    const signals = extractEvidenceSignals(pages);

    expect(signals.customerIndustries.length).toBeGreaterThan(0);
    
    const customerValues = signals.customerIndustries.map(s => s.candidateValue);
    expect(customerValues).toContain("healthcare");
    expect(customerValues).toContain("fintech");
    expect(customerValues).toContain("ecommerce");
  });

  it("prioritizes software signals over healthcare for primary industry", () => {
    const pages = [
      createMockPage(
        "https://example.com",
        "homepage",
        "Healthcare Software Platform",
        [
          {
            type: "heading",
            content: "Our Healthcare Software Platform",
            relevanceScore: 95,
          },
          {
            type: "paragraph",
            content: "We provide SaaS solutions for the healthcare industry with our medical software platform",
            relevanceScore: 90,
          },
        ]
      ),
    ];

    const signals = extractEvidenceSignals(pages);

    // Software should be primary industry even with healthcare language
    expect(signals.industry?.candidateValue).toBe("software");
    expect(signals.industry?.signalType).toBe("product_language");
  });

  it("handles empty or missing pages gracefully", () => {
    const signals = extractEvidenceSignals([]);

    expect(signals.industry).toBeUndefined();
    expect(signals.businessModel).toBeUndefined();
    expect(signals.customerIndustries).toHaveLength(0);
    expect(signals.complianceFocus).toHaveLength(0);
    expect(signals.securityPosture).toHaveLength(0);
    expect(signals.dataHandling).toHaveLength(0);
    expect(signals.integrations).toHaveLength(0);
  });

  it("deduplicates signals by field and candidate value", () => {
    const pages = [
      createMockPage(
        "https://example.com/privacy",
        "privacy",
        "Privacy Policy",
        [
          {
            type: "heading",
            content: "GDPR Compliance",
            relevanceScore: 95,
          },
          {
            type: "paragraph",
            content: "We comply with GDPR requirements for data protection",
            relevanceScore: 90,
          },
        ]
      ),
      createMockPage(
        "https://example.com/legal",
        "legal",
        "Legal Terms",
        [
          {
            type: "paragraph",
            content: "Our GDPR compliance includes proper data processing procedures",
            relevanceScore: 85,
          },
        ]
      ),
    ];

    const signals = extractEvidenceSignals(pages);

    // Should only have one GDPR signal despite being found on two pages
    const gdprSignals = signals.complianceFocus.filter(s => s.candidateValue === "GDPR");
    expect(gdprSignals).toHaveLength(1);
    
    // Should be the highest confidence one
    expect(gdprSignals[0].pageType).toBe("privacy");
    expect(gdprSignals[0].confidenceScore).toBeGreaterThan(80);
  });

  it("calculates appropriate confidence scores", () => {
    const pages = [
      createMockPage(
        "https://example.com",
        "homepage",
        "Platform Overview",
        [
          {
            type: "heading",
            content: "Our SaaS Platform",
            relevanceScore: 95,
          },
          {
            type: "paragraph",
            content: "We provide enterprise software solutions with our cloud-based platform for business customers",
            relevanceScore: 90,
          },
        ]
      ),
    ];

    const signals = extractEvidenceSignals(pages);

    expect(signals.industry?.confidenceScore).toBeGreaterThan(50);
    expect(signals.industry?.confidenceScore).toBeLessThanOrEqual(100);
    
    // Software signal should have high confidence due to multiple patterns
    expect(signals.industry?.confidenceScore).toBeGreaterThan(70);
  });

  it("includes all required signal fields", () => {
    const pages = [
      createMockPage(
        "https://example.com/security",
        "security",
        "Security Overview",
        [
          {
            type: "heading",
            content: "SOC 2 Compliance",
            relevanceScore: 95,
          },
        ]
      ),
    ];

    const signals = extractEvidenceSignals(pages);
    const signal = signals.complianceFocus[0];

    expect(signal).toMatchObject({
      fieldKey: "complianceFocus",
      candidateValue: "SOC2",
      signalType: "compliance_language",
      strength: "high",
      sourceUrl: "https://example.com/security",
      pageType: "security",
      snippet: "SOC 2 Compliance",
      reason: "SOC 2 compliance language",
    });
    
    expect(signal.confidenceScore).toBeGreaterThanOrEqual(0);
    expect(signal.confidenceScore).toBeLessThanOrEqual(100);
  });
});
