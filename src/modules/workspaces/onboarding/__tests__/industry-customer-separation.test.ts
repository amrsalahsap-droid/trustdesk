import { describe, it, expect } from "vitest";
import { WebsiteAnalysisService, DeepInferredProfile } from "../website-analysis-service";

describe("Industry vs Customer Industry Separation", () => {
  describe("normalizeProfile handles new fields", () => {
    it("extracts customerIndustries from AI response", () => {
      const raw = {
        companyName: "HealthSecure",
        industry: {
          value: "software",
          category: "OBSERVED",
          confidence: 0.85,
          source: "homepage",
          candidates: [
            { value: "software", confidence: 0.85, sourcePages: ["https://example.com"] },
          ],
        },
        productType: {
          value: "saas",
          category: "OBSERVED",
          confidence: 0.90,
          candidates: [
            { value: "saas", confidence: 0.90, sourcePages: ["https://example.com"] },
          ],
        },
        customerSegment: {
          value: "b2b",
          category: "DERIVED",
          confidence: 0.75,
          candidates: [
            { value: "b2b", confidence: 0.75, sourcePages: ["https://example.com"] },
          ],
        },
        customerIndustries: {
          value: ["healthcare", "finance"],
          category: "OBSERVED",
          confidence: 0.80,
          source: "security page",
        },
        businessModel: {
          value: "B2B SaaS platform for healthcare compliance",
          category: "DERIVED",
          confidence: 0.75,
          source: "about page",
        },
        tailoringConfidence: 0.80,
        suggestedDocuments: ["SOC 2 report"],
      };

      const evidence = [{ url: "https://example.com", title: "Test", headings: [], snippet: "" }];
      
      // Access private method via type assertion
      const result = (WebsiteAnalysisService as any).normalizeProfile(raw, evidence);

      expect(result).not.toBeNull();
      expect(result?.industry?.value).toBe("software");
      expect(result?.customerIndustries?.value).toEqual(["healthcare", "finance"]);
      expect(result?.businessModel?.value).toBe("B2B SaaS platform for healthcare compliance");
    });

    it("handles missing customerIndustries gracefully", () => {
      const raw = {
        companyName: "PureSoftware",
        industry: {
          value: "software",
          category: "OBSERVED",
          confidence: 0.90,
          candidates: [
            { value: "software", confidence: 0.90, sourcePages: ["https://example.com"] },
          ],
        },
        productType: {
          value: "saas",
          category: "OBSERVED",
          confidence: 0.85,
          candidates: [
            { value: "saas", confidence: 0.85, sourcePages: ["https://example.com"] },
          ],
        },
        tailoringConfidence: 0.85,
        suggestedDocuments: [],
      };

      const evidence = [{ url: "https://example.com", title: "Test", headings: [], snippet: "" }];
      
      const result = (WebsiteAnalysisService as any).normalizeProfile(raw, evidence);

      expect(result).not.toBeNull();
      expect(result?.industry?.value).toBe("software");
      expect(result?.customerIndustries).toBeUndefined();
      expect(result?.businessModel).toBeUndefined();
    });

    it("correctly separates SaaS serving healthcare customers", () => {
      // Simulate AI response for a SaaS company serving healthcare
      const raw = {
        companyName: "MedSecure Platform",
        industry: {
          value: "software",
          category: "OBSERVED",
          confidence: 0.80,
          source: "homepage: 'secure medical data platform'",
          candidates: [
            { value: "software", confidence: 0.80, sourcePages: ["https://medsecure.com"] },
            { value: "healthtech", confidence: 0.45, sourcePages: ["https://medsecure.com/security"] },
          ],
        },
        productType: {
          value: "saas",
          category: "OBSERVED",
          confidence: 0.90,
          candidates: [
            { value: "saas", confidence: 0.90, sourcePages: ["https://medsecure.com"] },
          ],
        },
        customerIndustries: {
          value: ["healthcare", "medical"],
          category: "OBSERVED",
          confidence: 0.85,
          source: "security page mentions HIPAA and hospitals",
        },
        complianceSignals: {
          value: ["HIPAA", "SOC 2", "HITRUST"],
          category: "OBSERVED",
          confidence: 0.90,
          source: "security page",
        },
        businessModel: {
          value: "B2B SaaS platform helping healthcare providers secure patient data",
          category: "DERIVED",
          confidence: 0.75,
          source: "homepage and security page",
        },
        tailoringConfidence: 0.80,
        suggestedDocuments: ["SOC 2 Type II", "HIPAA BAA"],
      };

      const evidence = [
        { url: "https://medsecure.com", title: "Home", headings: ["Secure Platform"], snippet: "" },
      ];

      const result = (WebsiteAnalysisService as any).normalizeProfile(raw, evidence);

      // Primary industry should be software (what they build)
      expect(result?.industry?.value).toBe("software");
      expect(result?.industry?.confidence).toBe(0.80);
      
      // Customer industries should capture healthcare (who they serve)
      expect(result?.customerIndustries?.value).toContain("healthcare");
      
      // Compliance signals should capture HIPAA (what compliance they support)
      expect(result?.complianceSignals?.value).toContain("HIPAA");
    });

    it("correctly identifies actual healthcare provider as healthtech", () => {
      const raw = {
        companyName: "DirectHealth Telemedicine",
        industry: {
          value: "healthtech",
          category: "OBSERVED",
          confidence: 0.90,
          source: "homepage: 'We provide telemedicine services to patients'",
          candidates: [
            { value: "healthtech", confidence: 0.90, sourcePages: ["https://directhealth.com"] },
          ],
        },
        productType: {
          value: "saas",
          category: "DERIVED",
          confidence: 0.70,
          candidates: [
            { value: "saas", confidence: 0.70, sourcePages: ["https://directhealth.com"] },
          ],
        },
        // No customerIndustries because they ARE the healthcare provider
        complianceSignals: {
          value: ["HIPAA", "state medical licenses"],
          category: "OBSERVED",
          confidence: 0.95,
          source: "about page",
        },
        businessModel: {
          value: "Telemedicine provider offering direct healthcare services to patients",
          category: "OBSERVED",
          confidence: 0.90,
          source: "homepage",
        },
        tailoringConfidence: 0.85,
        suggestedDocuments: ["Medical License", "HIPAA Compliance"],
      };

      const evidence = [
        { url: "https://directhealth.com", title: "Home", headings: ["Telemedicine"], snippet: "" },
      ];

      const result = (WebsiteAnalysisService as any).normalizeProfile(raw, evidence);

      // Primary industry should be healthtech (they provide healthcare services)
      expect(result?.industry?.value).toBe("healthtech");
      expect(result?.industry?.confidence).toBe(0.90);
      
      // No customer industries because they serve patients directly
      expect(result?.customerIndustries).toBeUndefined();
      
      // But they still have compliance requirements
      expect(result?.complianceSignals?.value).toContain("HIPAA");
    });

    it("handles cybersecurity SaaS with compliance focus", () => {
      const raw = {
        companyName: "CyberShield",
        industry: {
          value: "software",
          category: "OBSERVED",
          confidence: 0.85,
          source: "homepage",
          candidates: [
            { value: "software", confidence: 0.85, sourcePages: ["https://cybershield.com"] },
            { value: "fintech", confidence: 0.40, sourcePages: ["https://cybershield.com/customers"] },
          ],
        },
        productType: {
          value: "saas",
          category: "OBSERVED",
          confidence: 0.90,
          candidates: [
            { value: "saas", confidence: 0.90, sourcePages: ["https://cybershield.com"] },
          ],
        },
        customerIndustries: {
          value: ["finance", "healthcare", "government"],
          category: "OBSERVED",
          confidence: 0.80,
          source: "customers page lists industries served",
        },
        complianceSignals: {
          value: ["SOC 2", "ISO 27001", "HIPAA", "PCI DSS"],
          category: "OBSERVED",
          confidence: 0.90,
          source: "security and compliance pages",
        },
        businessModel: {
          value: "B2B SaaS security platform serving regulated industries",
          category: "DERIVED",
          confidence: 0.80,
          source: "homepage and about page",
        },
        tailoringConfidence: 0.85,
        suggestedDocuments: ["SOC 2 Type II", "ISO 27001 Certificate"],
      };

      const evidence = [
        { url: "https://cybershield.com", title: "Home", headings: ["Security"], snippet: "" },
      ];

      const result = (WebsiteAnalysisService as any).normalizeProfile(raw, evidence);

      // Should remain software despite having finance customers
      expect(result?.industry?.value).toBe("software");
      
      // Customer industries should capture all served industries
      expect(result?.customerIndustries?.value).toContain("finance");
      expect(result?.customerIndustries?.value).toContain("healthcare");
      
      // Compliance signals should be comprehensive
      expect(result?.complianceSignals?.value).toContain("HIPAA");
      expect(result?.complianceSignals?.value).toContain("PCI DSS");
    });
  });
});
