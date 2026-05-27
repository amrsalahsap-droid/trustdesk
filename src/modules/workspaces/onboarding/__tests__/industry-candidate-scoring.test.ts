import { describe, it, expect } from "vitest";
import { scoreIndustryCandidates, type IndustryCandidate } from "../industry-candidate-scoring";
import { type PageType } from "../domain-crawler";

describe("Industry Candidate Scoring", () => {
  describe("explicit software company evidence", () => {
    it("scores Software >= 75 with explicit software company evidence", () => {
      const signals = [
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
      ];

      const pages = new Map([
        ["https://example.com/about", { pageType: "about" as PageType, text: "We are a software company" }],
        ["https://example.com/product", { pageType: "product" as PageType, text: "Our SaaS platform" }],
      ]);

      const result = scoreIndustryCandidates({ signals, pages });

      const softwareCandidate = result.candidates.find(c => c.value === "software");
      expect(softwareCandidate).toBeDefined();
      expect(softwareCandidate!.supportScore).toBeGreaterThanOrEqual(75);
      expect(softwareCandidate!.evidenceRefs).toHaveLength(2);
      expect(softwareCandidate!.reasons).toContain("DIRECT_QUOTE match: software");
    });

    it("boosts score with JSON-LD industry = Software", () => {
      const signals = [
        {
          fieldKey: "industry" as const,
          candidateValue: "software",
          signalType: "DIRECT_QUOTE",
          snippet: "Software platform for enterprises",
          sourceUrl: "https://example.com",
          pageType: "homepage" as PageType,
          strength: "moderate" as const,
          reason: "Direct quote",
          location: "body",
          position: 0,
        },
      ];

      const pages = new Map([
        ["https://example.com", { 
          pageType: "homepage" as PageType, 
          text: "Software platform",
          jsonLd: { "@type": "Organization", "industry": "Computer Software" }
        }],
      ]);

      const result = scoreIndustryCandidates({ signals, pages });

      const softwareCandidate = result.candidates.find(c => c.value === "software");
      expect(softwareCandidate).toBeDefined();
      expect(softwareCandidate!.supportScore).toBeGreaterThanOrEqual(70);
      expect(softwareCandidate!.reasons).toContain("JSON-LD industry: computer software");
    });
  });

  describe("SaaS serving healthcare", () => {
    it("scores Software > Healthtech when serving healthcare customers", () => {
      const signals = [
        // Software company indicators
        {
          fieldKey: "industry" as const,
          candidateValue: "software",
          signalType: "DIRECT_QUOTE",
          snippet: "We are a software company that builds platforms",
          sourceUrl: "https://example.com/about",
          pageType: "about" as PageType,
          strength: "strong" as const,
          reason: "Direct quote",
          location: "heading",
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
          snippet: "We serve healthcare organizations",
          sourceUrl: "https://example.com/customers",
          pageType: "customers" as PageType,
          strength: "moderate" as const,
          reason: "Customer signal",
          location: "body",
          position: 0,
        },
      ];

      const pages = new Map([
        ["https://example.com/about", { pageType: "about" as PageType, text: "We are a software company" }],
        ["https://example.com/security", { pageType: "security" as PageType, text: "HIPAA compliant" }],
        ["https://example.com/customers", { pageType: "customers" as PageType, text: "healthcare organizations" }],
      ]);

      const result = scoreIndustryCandidates({ signals, pages });

      const softwareCandidate = result.candidates.find(c => c.value === "software");
      const healthtechCustomerCandidate = result.candidates.find(c => c.value === "healthtech_customer");
      
      expect(softwareCandidate).toBeDefined();
      expect(healthtechCustomerCandidate).toBeDefined();
      
      // Software should score higher
      expect(softwareCandidate!.supportScore).toBeGreaterThan(healthtechCustomerCandidate!.supportScore);
      expect(softwareCandidate!.supportScore).toBeGreaterThanOrEqual(50);
      
      // Primary industry should be software
      expect(result.primaryIndustry).toBe("software");
    });

    it("reduces healthtech score when only customer signals present", () => {
      const signals = [
        // Strong software company indicators
        {
          fieldKey: "industry" as const,
          candidateValue: "software",
          signalType: "DIRECT_QUOTE",
          snippet: "We are a software company that builds SaaS platforms",
          sourceUrl: "https://example.com/about",
          pageType: "about" as PageType,
          strength: "strong" as const,
          reason: "Direct quote",
          location: "heading",
          position: 0,
        },
        // Healthcare customer indicators only
        {
          fieldKey: "industry" as const,
          candidateValue: "healthtech",
          signalType: "CUSTOMER_SIGNAL",
          snippet: "Our platform helps hospitals stay HIPAA compliant",
          sourceUrl: "https://example.com/security",
          pageType: "security" as PageType,
          strength: "moderate" as const,
          reason: "Customer signal",
          location: "body",
          position: 0,
        },
      ];

      const pages = new Map([
        ["https://example.com/about", { pageType: "about" as PageType, text: "software company" }],
        ["https://example.com/security", { pageType: "security" as PageType, text: "HIPAA compliant" }],
      ]);

      const result = scoreIndustryCandidates({ signals, pages });

      const softwareCandidate = result.candidates.find(c => c.value === "software");
      const healthtechCandidate = result.candidates.find(c => c.value === "healthtech");
      
      expect(softwareCandidate).toBeDefined();
      expect(healthtechCandidate).toBeDefined();
      
      // Software should dominate
      expect(softwareCandidate!.supportScore).toBeGreaterThan(healthtechCandidate!.supportScore * 2);
      
      // Healthtech should have penalty reason
      expect(healthtechCandidate!.reasons).toContain("Healthcare appears to be customer industry, not company");
    });
  });

  describe("actual healthcare provider", () => {
    it("scores Healthtech > Software when company provides healthcare", () => {
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
        // Some software references (but as supporting tech, not primary business)
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
        ["https://example.com/technology", { pageType: "docs" as PageType, text: "uses software" }],
      ]);

      const result = scoreIndustryCandidates({ signals, pages });

      const healthtechCandidate = result.candidates.find(c => c.value === "healthtech");
      const softwareCandidate = result.candidates.find(c => c.value === "software");
      
      expect(healthtechCandidate).toBeDefined();
      expect(softwareCandidate).toBeDefined();
      
      // Healthtech should score higher
      expect(healthtechCandidate!.supportScore).toBeGreaterThan(softwareCandidate!.supportScore);
      expect(healthtechCandidate!.supportScore).toBeGreaterThanOrEqual(75);
      
      // Primary industry should be healthtech
      expect(result.primaryIndustry).toBe("healthtech");
    });
  });

  describe("no strong evidence", () => {
    it("returns limited/unknown scores with weak evidence", () => {
      const signals = [
        {
          fieldKey: "industry" as const,
          candidateValue: "software",
          signalType: "INFERRED",
          snippet: "We build solutions for businesses",
          sourceUrl: "https://example.com",
          pageType: "homepage" as PageType,
          strength: "weak" as const,
          reason: "Inferred",
          location: "body",
          position: 0,
        },
      ];

      const pages = new Map([
        ["https://example.com", { pageType: "homepage" as PageType, text: "solutions for businesses" }],
      ]);

      const result = scoreIndustryCandidates({ signals, pages });

      const softwareCandidate = result.candidates.find(c => c.value === "software");
      if (softwareCandidate) {
        expect(softwareCandidate.supportScore).toBeLessThan(50);
      }
      
      // No clear primary industry
      expect(result.primaryIndustry).toBeNull();
    });
  });

  describe("repetition bonus", () => {
    it("adds repetition bonus for software/SaaS terms across multiple pages", () => {
      const signals = [
        {
          fieldKey: "industry" as const,
          candidateValue: "software",
          signalType: "DIRECT_QUOTE",
          snippet: "Software platform",
          sourceUrl: "https://example.com",
          pageType: "homepage" as PageType,
          strength: "moderate" as const,
          reason: "Direct quote",
          location: "body",
          position: 0,
        },
        {
          fieldKey: "industry" as const,
          candidateValue: "software",
          signalType: "DIRECT_QUOTE",
          snippet: "Our software solution",
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
          signalType: "DIRECT_QUOTE",
          snippet: "SaaS platform",
          sourceUrl: "https://example.com/product",
          pageType: "product" as PageType,
          strength: "moderate" as const,
          reason: "Direct quote",
          location: "body",
          position: 0,
        },
      ];

      const pages = new Map([
        ["https://example.com", { pageType: "homepage" as PageType, text: "Software platform" }],
        ["https://example.com/about", { pageType: "about" as PageType, text: "software solution" }],
        ["https://example.com/product", { pageType: "product" as PageType, text: "SaaS platform" }],
      ]);

      const result = scoreIndustryCandidates({ signals, pages });

      const softwareCandidate = result.candidates.find(c => c.value === "software");
      expect(softwareCandidate).toBeDefined();
      expect(softwareCandidate!.reasons).toContain(expect.stringContaining("Repeated across"));
    });
  });

  describe("conflict detection", () => {
    it("detects conflicts between primary industries", () => {
      const signals = [
        // Software signals
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
        // Fintech signals (conflicting)
        {
          fieldKey: "industry" as const,
          candidateValue: "fintech",
          signalType: "DIRECT_QUOTE",
          snippet: "We provide financial technology services",
          sourceUrl: "https://example.com/services",
          pageType: "product" as PageType,
          strength: "strong" as const,
          reason: "Direct quote",
          location: "body",
          position: 0,
        },
      ];

      const pages = new Map([
        ["https://example.com/about", { pageType: "about" as PageType, text: "software company" }],
        ["https://example.com/services", { pageType: "product" as PageType, text: "financial technology" }],
      ]);

      const result = scoreIndustryCandidates({ signals, pages });

      expect(result.hasConflict).toBe(true);
      
      const softwareCandidate = result.candidates.find(c => c.value === "software");
      const fintechCandidate = result.candidates.find(c => c.value === "fintech");
      
      expect(softwareCandidate).toBeDefined();
      expect(fintechCandidate).toBeDefined();
      
      // Both should have conflicting signals
      expect(softwareCandidate!.conflictingSignals.length).toBeGreaterThan(0);
      expect(fintechCandidate!.conflictingSignals.length).toBeGreaterThan(0);
    });
  });

  describe("fintech scoring", () => {
    it("correctly scores fintech companies", () => {
      const signals = [
        {
          fieldKey: "industry" as const,
          candidateValue: "fintech",
          signalType: "DIRECT_QUOTE",
          snippet: "We are a fintech company that builds payment platforms",
          sourceUrl: "https://example.com/about",
          pageType: "about" as PageType,
          strength: "strong" as const,
          reason: "Direct quote",
          location: "body",
          position: 0,
        },
        {
          fieldKey: "industry" as const,
          candidateValue: "fintech",
          signalType: "DIRECT_QUOTE",
          snippet: "Our banking software helps financial institutions",
          sourceUrl: "https://example.com/product",
          pageType: "product" as PageType,
          strength: "strong" as const,
          reason: "Direct quote",
          location: "body",
          position: 0,
        },
      ];

      const pages = new Map([
        ["https://example.com/about", { pageType: "about" as PageType, text: "fintech company" }],
        ["https://example.com/product", { pageType: "product" as PageType, text: "banking software" }],
      ]);

      const result = scoreIndustryCandidates({ signals, pages });

      const fintechCandidate = result.candidates.find(c => c.value === "fintech");
      expect(fintechCandidate).toBeDefined();
      expect(fintechCandidate!.supportScore).toBeGreaterThanOrEqual(75);
      expect(result.primaryIndustry).toBe("fintech");
    });
  });

  describe("ecommerce scoring", () => {
    it("correctly scores ecommerce companies", () => {
      const signals = [
        {
          fieldKey: "industry" as const,
          candidateValue: "ecommerce",
          signalType: "DIRECT_QUOTE",
          snippet: "We operate an e-commerce platform for retailers",
          sourceUrl: "https://example.com/about",
          pageType: "about" as PageType,
          strength: "strong" as const,
          reason: "Direct quote",
          location: "body",
          position: 0,
        },
      ];

      const pages = new Map([
        ["https://example.com/about", { pageType: "about" as PageType, text: "e-commerce platform" }],
      ]);

      const result = scoreIndustryCandidates({ signals, pages });

      const ecommerceCandidate = result.candidates.find(c => c.value === "ecommerce");
      expect(ecommerceCandidate).toBeDefined();
      expect(ecommerceCandidate!.supportScore).toBeGreaterThanOrEqual(40);
    });
  });
});
