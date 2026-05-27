import { describe, it, expect } from "vitest";
import { scoreIndustryCandidates } from "../industry-candidate-scoring";
import { type PageType } from "../domain-crawler";

describe("Regression Tests: Software Classification", () => {
  describe("Clear software/SaaS company classification", () => {
    it("should classify clear software company with supportScore >= 75 and high confidence", () => {
      const signals = [
        // Strong software company indicators
        {
          fieldKey: "industry" as const,
          candidateValue: "software",
          signalType: "DIRECT_QUOTE",
          snippet: "We are a software company that builds enterprise platforms",
          sourceUrl: "https://example.com/about",
          pageType: "about" as PageType,
          strength: "strong" as const,
          reason: "Direct quote",
          location: "heading",
          position: 0,
        },
        {
          fieldKey: "industry" as const,
          candidateValue: "software",
          signalType: "DIRECT_QUOTE",
          snippet: "Our SaaS platform helps businesses scale",
          sourceUrl: "https://example.com/product",
          pageType: "product" as PageType,
          strength: "strong" as const,
          reason: "Direct quote",
          location: "body",
          position: 0,
        },
        {
          fieldKey: "industry" as const,
          candidateValue: "software",
          signalType: "STRUCTURED_DATA",
          snippet: "JSON-LD: software company",
          sourceUrl: "https://example.com",
          pageType: "homepage" as PageType,
          strength: "strong" as const,
          reason: "Structured data",
          location: "json-ld",
          position: 0,
        },
        {
          fieldKey: "industry" as const,
          candidateValue: "software",
          signalType: "INFERRED",
          snippet: "Platform solution for enterprise clients",
          sourceUrl: "https://example.com/solutions",
          pageType: "docs" as PageType,
          strength: "moderate" as const,
          reason: "Inferred",
          location: "body",
          position: 0,
        },
      ];

      const pages = new Map([
        ["https://example.com/about", { pageType: "about" as PageType, text: "software company" }],
        ["https://example.com/product", { pageType: "product" as PageType, text: "SaaS platform" }],
        ["https://example.com", { 
          pageType: "homepage" as PageType, 
          text: "software", 
          jsonLd: { "@type": "Organization", "industry": "Computer Software" }
        }],
        ["https://example.com/solutions", { pageType: "docs" as PageType, text: "platform solution" }],
      ]);

      const result = scoreIndustryCandidates({ signals, pages });

      const softwareCandidate = result.candidates.find(c => c.value === "software");
      expect(softwareCandidate).toBeDefined();
      
      // Should have high support score and confidence
      expect(softwareCandidate!.supportScore).toBeGreaterThanOrEqual(75);
      expect(softwareCandidate!.confidenceBand).toBe("high");
      expect(softwareCandidate!.evidenceCoverage).toBe("strong");
      
      // Should be primary industry
      expect(result.primaryIndustry).toBe("software");
      expect(result.hasConflict).toBe(false);
      
      // Should have strong evidence
      expect(softwareCandidate!.evidenceRefs.length).toBeGreaterThanOrEqual(3);
      expect(softwareCandidate!.reasons).toContain("DIRECT_QUOTE match: software");
      expect(softwareCandidate!.reasons).toContain("JSON-LD industry: computer software");
    });

    it("should classify medium confidence software company with supportScore 60-74", () => {
      const signals = [
        {
          fieldKey: "industry" as const,
          candidateValue: "software",
          signalType: "DIRECT_QUOTE",
          snippet: "Software platform for businesses",
          sourceUrl: "https://example.com/about",
          pageType: "about" as PageType,
          strength: "moderate" as const,
          reason: "Direct quote",
          location: "body",
          position: 0,
        },
        {
          fieldKey: "industry" as const,
          candidateValue: "software",
          signalType: "INFERRED",
          snippet: "Platform solution for enterprise",
          sourceUrl: "https://example.com/product",
          pageType: "product" as PageType,
          strength: "moderate" as const,
          reason: "Inferred",
          location: "body",
          position: 0,
        },
      ];

      const pages = new Map([
        ["https://example.com/about", { pageType: "about" as PageType, text: "software platform" }],
        ["https://example.com/product", { pageType: "product" as PageType, text: "platform solution" }],
      ]);

      const result = scoreIndustryCandidates({ signals, pages });

      const softwareCandidate = result.candidates.find(c => c.value === "software");
      expect(softwareCandidate).toBeDefined();
      
      // Should have medium support score and confidence
      expect(softwareCandidate!.supportScore).toBeGreaterThanOrEqual(60);
      expect(softwareCandidate!.supportScore).toBeLessThan(75);
      expect(softwareCandidate!.confidenceBand).toBe("medium");
      expect(softwareCandidate!.evidenceCoverage).toBe("medium");
      
      // Should still be primary industry
      expect(result.primaryIndustry).toBe("software");
    });
  });

  describe("Software company serving healthcare", () => {
    it("should classify software serving healthcare with Software as primary", () => {
      const signals = [
        // Strong software company indicators
        {
          fieldKey: "industry" as const,
          candidateValue: "software",
          signalType: "DIRECT_QUOTE",
          snippet: "We are a software company that builds healthcare platforms",
          sourceUrl: "https://example.com/about",
          pageType: "about" as PageType,
          strength: "strong" as const,
          reason: "Direct quote",
          location: "heading",
          position: 0,
        },
        {
          fieldKey: "industry" as const,
          candidateValue: "software",
          signalType: "DIRECT_QUOTE",
          snippet: "Our SaaS platform helps hospitals manage patient data",
          sourceUrl: "https://example.com/product",
          pageType: "product" as PageType,
          strength: "strong" as const,
          reason: "Direct quote",
          location: "body",
          position: 0,
        },
        // Healthcare customer indicators
        {
          fieldKey: "industry" as const,
          candidateValue: "healthcare_customer",
          signalType: "CUSTOMER_SIGNAL",
          snippet: "Our platform helps hospitals stay HIPAA compliant",
          sourceUrl: "https://example.com/security",
          pageType: "security" as PageType,
          strength: "moderate" as const,
          reason: "Customer signal",
          location: "body",
          position: 0,
        },
        {
          fieldKey: "industry" as const,
          candidateValue: "healthcare_customer",
          signalType: "CUSTOMER_SIGNAL",
          snippet: "We serve healthcare organizations and medical providers",
          sourceUrl: "https://example.com/customers",
          pageType: "customers" as PageType,
          strength: "moderate" as const,
          reason: "Customer signal",
          location: "body",
          position: 0,
        },
      ];

      const pages = new Map([
        ["https://example.com/about", { pageType: "about" as PageType, text: "software company" }],
        ["https://example.com/product", { pageType: "product" as PageType, text: "SaaS platform" }],
        ["https://example.com/security", { pageType: "security" as PageType, text: "HIPAA compliant" }],
        ["https://example.com/customers", { pageType: "customers" as PageType, text: "healthcare organizations" }],
      ]);

      const result = scoreIndustryCandidates({ signals, pages });

      const softwareCandidate = result.candidates.find(c => c.value === "software");
      const healthcareCustomerCandidate = result.candidates.find(c => c.value === "healthcare_customer");
      
      expect(softwareCandidate).toBeDefined();
      expect(healthcareCustomerCandidate).toBeDefined();
      
      // Software should be primary with high confidence
      expect(softwareCandidate!.supportScore).toBeGreaterThanOrEqual(75);
      expect(softwareCandidate!.confidenceBand).toBe("high");
      expect(result.primaryIndustry).toBe("software");
      
      // Healthcare customer should have lower score
      expect(healthcareCustomerCandidate!.supportScore).toBeLessThan(softwareCandidate!.supportScore);
      expect(healthcareCustomerCandidate!.confidenceBand).toBe("limited");
      
      // Should not be conflicted (software clearly primary)
      expect(result.hasConflict).toBe(false);
      
      // Software candidate should have customer signals in conflicts
      expect(softwareCandidate!.conflictingSignals.length).toBeGreaterThan(0);
      expect(softwareCandidate!.conflictingSignals[0].pageType).toBe("security");
    });

    it("should distinguish customer industry from company industry", () => {
      const signals = [
        // Software company indicators
        {
          fieldKey: "industry" as const,
          candidateValue: "software",
          signalType: "DIRECT_QUOTE",
          snippet: "We are a software company",
          sourceUrl: "https://example.com/about",
          pageType: "about" as PageType,
          strength: "strong" as const,
          reason: "Direct quote",
          location: "body",
          position: 0,
        },
        // Healthcare customer indicators only
        {
          fieldKey: "industry" as const,
          candidateValue: "healthtech",
          signalType: "CUSTOMER_SIGNAL",
          snippet: "Our platform serves healthcare providers",
          sourceUrl: "https://example.com/customers",
          pageType: "customers" as PageType,
          strength: "moderate" as const,
          reason: "Customer signal",
          location: "body",
          position: 0,
        },
      ];

      const pages = new Map([
        ["https://example.com/about", { pageType: "about" as PageType, text: "software company" }],
        ["https://example.com/customers", { pageType: "customers" as PageType, text: "healthcare providers" }],
      ]);

      const result = scoreIndustryCandidates({ signals, pages });

      const softwareCandidate = result.candidates.find(c => c.value === "software");
      const healthtechCandidate = result.candidates.find(c => c.value === "healthtech");
      
      expect(softwareCandidate).toBeDefined();
      expect(healthtechCandidate).toBeDefined();
      
      // Software should dominate
      expect(softwareCandidate!.supportScore).toBeGreaterThan(healthtechCandidate!.supportScore * 2);
      expect(result.primaryIndustry).toBe("software");
      
      // Healthtech should be penalized as customer industry
      expect(healthtechCandidate!.reasons).toContain("Healthcare appears to be customer industry, not company");
      expect(healthtechCandidate!.supportScore).toBeLessThan(40);
    });
  });

  describe("Healthcare provider/medical service classification", () => {
    it("should classify actual healthcare provider as Healthtech primary", () => {
      const signals = [
        // Healthcare provider indicators
        {
          fieldKey: "industry" as const,
          candidateValue: "healthtech",
          signalType: "DIRECT_QUOTE",
          snippet: "We provide healthcare services to patients",
          sourceUrl: "https://example.com/about",
          pageType: "about" as PageType,
          strength: "strong" as const,
          reason: "Direct quote",
          location: "heading",
          position: 0,
        },
        {
          fieldKey: "industry" as const,
          candidateValue: "healthtech",
          signalType: "DIRECT_QUOTE",
          snippet: "Our telemedicine platform provides clinical services",
          sourceUrl: "https://example.com/services",
          pageType: "product" as PageType,
          strength: "strong" as const,
          reason: "Direct quote",
          location: "body",
          position: 0,
        },
        {
          fieldKey: "industry" as const,
          candidateValue: "healthtech",
          signalType: "DIRECT_QUOTE",
          snippet: "Medical practice management system for clinics",
          sourceUrl: "https://example.com/platform",
          pageType: "product" as PageType,
          strength: "strong" as const,
          reason: "Direct quote",
          location: "body",
          position: 0,
        },
        // Some software references (supporting tech, not primary business)
        {
          fieldKey: "industry" as const,
          candidateValue: "software",
          signalType: "INFERRED",
          snippet: "Our platform uses software to deliver care",
          sourceUrl: "https://example.com/technology",
          pageType: "docs" as PageType,
          strength: "weak" as const,
          reason: "Inferred",
          location: "body",
          position: 0,
        },
      ];

      const pages = new Map([
        ["https://example.com/about", { pageType: "about" as PageType, text: "healthcare services" }],
        ["https://example.com/services", { pageType: "product" as PageType, text: "telemedicine platform" }],
        ["https://example.com/platform", { pageType: "product" as PageType, text: "medical practice" }],
        ["https://example.com/technology", { pageType: "docs" as PageType, text: "uses software" }],
      ]);

      const result = scoreIndustryCandidates({ signals, pages });

      const healthtechCandidate = result.candidates.find(c => c.value === "healthtech");
      const softwareCandidate = result.candidates.find(c => c.value === "software");
      
      expect(healthtechCandidate).toBeDefined();
      expect(softwareCandidate).toBeDefined();
      
      // Healthtech should be primary with high confidence
      expect(healthtechCandidate!.supportScore).toBeGreaterThanOrEqual(75);
      expect(healthtechCandidate!.confidenceBand).toBe("high");
      expect(result.primaryIndustry).toBe("healthtech");
      
      // Software should be much lower (supporting tech only)
      expect(healthtechCandidate!.supportScore).toBeGreaterThan(softwareCandidate!.supportScore * 3);
      expect(softwareCandidate!.supportScore).toBeLessThan(30);
      
      // Should not be conflicted
      expect(result.hasConflict).toBe(false);
    });

    it("should classify medical service provider with high confidence", () => {
      const signals = [
        {
          fieldKey: "industry" as const,
          candidateValue: "healthtech",
          signalType: "DIRECT_QUOTE",
          snippet: "We are a healthcare provider offering telemedicine services",
          sourceUrl: "https://example.com/about",
          pageType: "about" as PageType,
          strength: "strong" as const,
          reason: "Direct quote",
          location: "heading",
          position: 0,
        },
        {
          fieldKey: "industry" as const,
          candidateValue: "healthtech",
          signalType: "DIRECT_QUOTE",
          snippet: "Our clinic provides medical services to patients",
          sourceUrl: "https://example.com/services",
          pageType: "product" as PageType,
          strength: "strong" as const,
          reason: "Direct quote",
          location: "body",
          position: 0,
        },
      ];

      const pages = new Map([
        ["https://example.com/about", { pageType: "about" as PageType, text: "healthcare provider" }],
        ["https://example.com/services", { pageType: "product" as PageType, text: "medical services" }],
      ]);

      const result = scoreIndustryCandidates({ signals, pages });

      const healthtechCandidate = result.candidates.find(c => c.value === "healthtech");
      expect(healthtechCandidate).toBeDefined();
      
      expect(healthtechCandidate!.supportScore).toBeGreaterThanOrEqual(75);
      expect(healthtechCandidate!.confidenceBand).toBe("high");
      expect(result.primaryIndustry).toBe("healthtech");
      
      // Should have clear healthcare provider reasons
      expect(healthtechCandidate!.reasons).toContain("DIRECT_QUOTE match: healthtech");
      expect(healthtechCandidate!.evidenceRefs.some(ref => 
        ref.snippet.includes("healthcare provider")
      )).toBe(true);
    });
  });

  describe("Edge cases and boundaries", () => {
    it("should handle mixed signals with clear primary industry", () => {
      const signals = [
        // Strong software signals
        {
          fieldKey: "industry" as const,
          candidateValue: "software",
          signalType: "DIRECT_QUOTE",
          snippet: "We are a software company",
          sourceUrl: "https://example.com/about",
          pageType: "about" as PageType,
          strength: "strong" as const,
          reason: "Direct quote",
          location: "body",
          position: 0,
        },
        // Weak fintech signals
        {
          fieldKey: "industry" as const,
          candidateValue: "fintech",
          signalType: "INFERRED",
          snippet: "Payment processing integration",
          sourceUrl: "https://example.com/features",
          pageType: "docs" as PageType,
          strength: "weak" as const,
          reason: "Inferred",
          location: "body",
          position: 0,
        },
      ];

      const pages = new Map([
        ["https://example.com/about", { pageType: "about" as PageType, text: "software company" }],
        ["https://example.com/features", { pageType: "docs" as PageType, text: "payment processing" }],
      ]);

      const result = scoreIndustryCandidates({ signals, pages });

      const softwareCandidate = result.candidates.find(c => c.value === "software");
      const fintechCandidate = result.candidates.find(c => c.value === "fintech");
      
      expect(softwareCandidate).toBeDefined();
      expect(fintechCandidate).toBeDefined();
      
      // Software should clearly dominate
      expect(softwareCandidate!.supportScore).toBeGreaterThan(fintechCandidate!.supportScore * 3);
      expect(result.primaryIndustry).toBe("software");
      expect(result.hasConflict).toBe(false);
    });

    it("should handle limited evidence scenarios", () => {
      const signals = [
        {
          fieldKey: "industry" as const,
          candidateValue: "software",
          signalType: "INFERRED",
          snippet: "Platform for business",
          sourceUrl: "https://example.com",
          pageType: "homepage" as PageType,
          strength: "weak" as const,
          reason: "Inferred",
          location: "body",
          position: 0,
        },
      ];

      const pages = new Map([
        ["https://example.com", { pageType: "homepage" as PageType, text: "platform for business" }],
      ]);

      const result = scoreIndustryCandidates({ signals, pages });

      const softwareCandidate = result.candidates.find(c => c.value === "software");
      if (softwareCandidate) {
        expect(softwareCandidate.supportScore).toBeLessThan(50);
        expect(softwareCandidate.confidenceBand).toBe("limited");
        expect(softwareCandidate.evidenceCoverage).toBe("limited");
      }
      
      // No clear primary industry with weak evidence
      expect(result.primaryIndustry).toBe("software"); // Still picks best available
      expect(result.hasConflict).toBe(false);
    });
  });
});
