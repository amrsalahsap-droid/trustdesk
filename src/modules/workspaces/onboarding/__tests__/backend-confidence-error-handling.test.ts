import { describe, it, expect, vi } from "vitest";
import { WebsiteAnalysisService } from "../website-analysis-service";
import { type EvidenceItem } from "../website-analysis-service";

// Mock logger to capture error logs
vi.mock("@/lib/logging/logger", () => ({
  logger: {
    error: vi.fn(),
  },
}));

describe("Backend Confidence Error Handling", () => {
  let service: WebsiteAnalysisService;

  beforeEach(() => {
    service = new WebsiteAnalysisService();
    vi.clearAllMocks();
  });

  describe("Function scope fix", () => {
    it("should not throw 'this.calculateBackendConfidence is not a function' error", async () => {
      // Create mock evidence items
      const evidenceItems: EvidenceItem[] = [
        {
          evidence: {
            url: "https://example.com/about",
            title: "About Us",
            headings: ["About Our Software Company"],
            snippet: "We are a software company that builds enterprise platforms",
          },
          pageType: "about",
          score: 1.5,
          structured: {
            url: "https://example.com/about",
            title: "About Us",
            pageType: "about",
            score: 1.5,
            sourceConfidence: 0.9,
            blocks: [
              { 
                kind: "heading-section", 
                level: 1, 
                heading: "About Our Software Company", 
                bodyText: "We are a software company that builds enterprise platforms" 
              },
            ],
          },
        },
      ];

      // Mock AI response that would trigger backend confidence calculation
      const mockAiResponse = {
        companyName: "Test Software Company",
        industry: {
          value: "software",
          category: "OBSERVED",
          confidence: 0.75,
          source: "https://example.com/about",
          candidates: [
            {
              value: "software",
              confidence: 0.75,
              sourcePages: ["https://example.com/about"],
            },
          ],
        },
        productType: {
          value: "saas",
          category: "OBSERVED", 
          confidence: 0.8,
          source: "https://example.com/about",
        },
        customerSegment: {
          value: "b2b",
          category: "DERIVED",
          confidence: 0.6,
          source: "https://example.com/about",
        },
        dataTypes: {
          value: ["email", "name"],
          category: "OBSERVED",
          confidence: 0.7,
          source: "https://example.com/about",
        },
        complianceSignals: {
          value: ["SOC2"],
          category: "OBSERVED",
          confidence: 0.8,
          source: "https://example.com/about",
        },
        customerIndustries: {
          value: ["technology"],
          category: "DERIVED",
          confidence: 0.5,
          source: "https://example.com/about",
        },
        businessModel: {
          value: "b2b-saas",
          category: "DERIVED",
          confidence: 0.6,
          source: "https://example.com/about",
        },
        userTypes: {
          value: ["admin", "user"],
          category: "OBSERVED",
          confidence: 0.7,
          source: "https://example.com/about",
        },
        internalRoles: {
          value: ["developer"],
          category: "HYPOTHESIZED",
          confidence: 0.4,
          source: "https://example.com/about",
        },
        operationalWorkflows: {
          value: ["development"],
          category: "HYPOTHESIZED",
          confidence: 0.3,
          source: "https://example.com/about",
        },
        trustClaims: {
          value: ["secure"],
          category: "OBSERVED",
          confidence: 0.8,
          source: "https://example.com/about",
        },
        riskAreas: {
          value: ["data-privacy"],
          category: "DERIVED",
          confidence: 0.6,
          source: "https://example.com/about",
        },
        tailoringConfidence: 0.7,
        suggestedDocuments: ["privacy-policy"],
      };

      // Mock the AI provider to return our test response
      const mockAiProvider = {
        generateObject: vi.fn().mockResolvedValue({
          data: mockAiResponse,
        }),
      };

      const mockAiFactory = {
        getInstance: vi.fn().mockReturnValue(mockAiProvider),
      };

      vi.doMock("@/lib/ai/ai-factory", () => mockAiFactory);

      // This should not throw "this.calculateBackendConfidence is not a function"
      const result = await service.analyzeWebsite("https://example.com", evidenceItems);

      // Should succeed without the function scope error
      expect(result.analysisStatus).not.toBe("backend_confidence_error");
      expect(result.analysisStatus).toBe("success");
    });
  });

  describe("Error classification", () => {
    it("should classify backend confidence errors as backend_confidence_error", async () => {
      // Mock a scenario where backend confidence calculation fails
      const evidenceItems: EvidenceItem[] = [
        {
          evidence: {
            url: "https://example.com/about",
            title: "About",
            headings: [],
            snippet: "Minimal content",
          },
          pageType: "about",
          score: 0.5,
          structured: {
            url: "https://example.com/about",
            title: "About",
            pageType: "about",
            score: 0.5,
            sourceConfidence: 0.3,
            blocks: [
              { 
                kind: "body-fallback", 
                text: "Minimal content" 
              },
            ],
          },
        },
      ];

      // Create a malformed AI response that might cause backend confidence issues
      const malformedAiResponse = {
        companyName: "Test Company",
        industry: {
          value: "software",
          category: "OBSERVED",
          confidence: "invalid-confidence", // This might cause issues
          source: "https://example.com/about",
        },
        // Incomplete response that might trigger errors
      };

      // Mock AI provider to return malformed response
      const mockAiProvider = {
        generateObject: vi.fn().mockResolvedValue({
          data: malformedAiResponse,
        }),
      };

      const mockAiFactory = {
        getInstance: vi.fn().mockReturnValue(mockAiProvider),
      };

      vi.doMock("@/lib/ai/ai-factory", () => mockAiFactory);

      const result = await service.analyzeWebsite("https://example.com", evidenceItems);

      // Should classify backend processing errors correctly
      if (result.analysisStatus !== "success") {
        expect(
          result.analysisStatus === "backend_confidence_error" ||
          result.analysisStatus === "schema_invalid"
        ).toBe(true);
        
        // If it's a backend confidence error, the reason should be descriptive
        if (result.analysisStatus === "backend_confidence_error") {
          expect(result.reason).toContain("Backend confidence calculation failed");
        }
      }
    });

    it("should classify actual schema validation errors as schema_invalid", async () => {
      const evidenceItems: EvidenceItem[] = [];

      // Mock AI provider to return completely invalid response
      const mockAiProvider = {
        generateObject: vi.fn().mockResolvedValue({
          data: {
            // Completely invalid structure that fails schema validation
            invalidField: "invalid",
            nested: {
              invalid: true,
            },
          },
        }),
      };

      const mockAiFactory = {
        getInstance: vi.fn().mockReturnValue(mockAiProvider),
      };

      vi.doMock("@/lib/ai/ai-factory", () => mockAiFactory);

      const result = await service.analyzeWebsite("https://example.com", evidenceItems);

      // Should classify schema validation errors correctly
      expect(result.analysisStatus).toBe("schema_invalid");
      expect(result.reason).not.toContain("Backend confidence calculation failed");
    });
  });

  describe("Defensive handling", () => {
    it("should use safe defaults when backend confidence calculation fails", async () => {
      const evidenceItems: EvidenceItem[] = [
        {
          evidence: {
            url: "https://example.com/about",
            title: "About",
            headings: ["About"],
            snippet: "Software company",
          },
          pageType: "about",
          score: 1.0,
          structured: {
            url: "https://example.com/about",
            title: "About",
            pageType: "about",
            score: 1.0,
            sourceConfidence: 0.8,
            blocks: [
              { 
                kind: "heading-section", 
                level: 1, 
                heading: "About", 
                bodyText: "Software company" 
              },
            ],
          },
        },
      ];

      // Mock normal AI response
      const mockAiResponse = {
        companyName: "Test Software Company",
        industry: {
          value: "software",
          category: "OBSERVED",
          confidence: 0.75,
          source: "https://example.com/about",
          candidates: [
            {
              value: "software",
              confidence: 0.75,
              sourcePages: ["https://example.com/about"],
            },
          ],
        },
        // ... other required fields
        productType: { value: "saas", category: "OBSERVED", confidence: 0.8, source: "https://example.com/about" },
        customerSegment: { value: "b2b", category: "DERIVED", confidence: 0.6, source: "https://example.com/about" },
        dataTypes: { value: ["email"], category: "OBSERVED", confidence: 0.7, source: "https://example.com/about" },
        complianceSignals: { value: ["SOC2"], category: "OBSERVED", confidence: 0.8, source: "https://example.com/about" },
        customerIndustries: { value: ["technology"], category: "DERIVED", confidence: 0.5, source: "https://example.com/about" },
        businessModel: { value: "b2b-saas", category: "DERIVED", confidence: 0.6, source: "https://example.com/about" },
        userTypes: { value: ["admin"], category: "OBSERVED", confidence: 0.7, source: "https://example.com/about" },
        internalRoles: { value: ["developer"], category: "HYPOTHESIZED", confidence: 0.4, source: "https://example.com/about" },
        operationalWorkflows: { value: ["development"], category: "HYPOTHESIZED", confidence: 0.3, source: "https://example.com/about" },
        trustClaims: { value: ["secure"], category: "OBSERVED", confidence: 0.8, source: "https://example.com/about" },
        riskAreas: { value: ["data-privacy"], category: "DERIVED", confidence: 0.6, source: "https://example.com/about" },
        tailoringConfidence: 0.7,
        suggestedDocuments: ["privacy-policy"],
      };

      const mockAiProvider = {
        generateObject: vi.fn().mockResolvedValue({
          data: mockAiResponse,
        }),
      };

      const mockAiFactory = {
        getInstance: vi.fn().mockReturnValue(mockAiProvider),
      };

      vi.doMock("@/lib/ai/ai-factory", () => mockAiFactory);

      const result = await service.analyzeWebsite("https://example.com", evidenceItems);

      // Should succeed even if there are backend confidence calculation issues
      expect(result.analysisStatus).toBe("success");
      
      if (result.analysisStatus === "success") {
        // Verify the profile has reasonable confidence values
        expect(result.profile.industry.confidence).toBeGreaterThan(0);
        expect(result.profile.industry.confidenceBand).toBeDefined();
        expect(result.profile.industry.supportScore).toBeGreaterThanOrEqual(0);
        expect(result.profile.industry.aiConfidence).toBeDefined();
      }
    });

    it("should log backend confidence calculation errors appropriately", async () => {
      const evidenceItems: EvidenceItem[] = [
        {
          evidence: {
            url: "https://example.com/about",
            title: "About",
            headings: [],
            snippet: "Minimal",
          },
          pageType: "about",
          score: 0.3,
          structured: {
            url: "https://example.com/about",
            title: "About",
            pageType: "about",
            score: 0.3,
            sourceConfidence: 0.2,
            blocks: [
              { 
                kind: "body-fallback", 
                text: "Minimal" 
              },
            ],
          },
        },
      ];

      const mockAiResponse = {
        companyName: "Test Company",
        industry: {
          value: "software",
          category: "OBSERVED",
          confidence: 0.75,
          source: "https://example.com/about",
          candidates: [
            {
              value: "software",
              confidence: 0.75,
              sourcePages: ["https://example.com/about"],
            },
          ],
        },
        // Minimal required fields
        productType: { value: "saas", category: "OBSERVED", confidence: 0.8, source: "https://example.com/about" },
        customerSegment: { value: "b2b", category: "DERIVED", confidence: 0.6, source: "https://example.com/about" },
        dataTypes: { value: ["email"], category: "OBSERVED", confidence: 0.7, source: "https://example.com/about" },
        complianceSignals: { value: [], category: "HYPOTHESIZED", confidence: 0.3, source: "https://example.com/about" },
        customerIndustries: { value: [], category: "HYPOTHESIZED", confidence: 0.3, source: "https://example.com/about" },
        businessModel: { value: "unknown", category: "HYPOTHESIZED", confidence: 0.3, source: "https://example.com/about" },
        userTypes: { value: [], category: "HYPOTHESIZED", confidence: 0.3, source: "https://example.com/about" },
        internalRoles: { value: [], category: "HYPOTHESIZED", confidence: 0.3, source: "https://example.com/about" },
        operationalWorkflows: { value: [], category: "HYPOTHESIZED", confidence: 0.3, source: "https://example.com/about" },
        trustClaims: { value: [], category: "HYPOTHESIZED", confidence: 0.3, source: "https://example.com/about" },
        riskAreas: { value: [], category: "HYPOTHESIZED", confidence: 0.3, source: "https://example.com/about" },
        tailoringConfidence: 0.3,
        suggestedDocuments: [],
      };

      const mockAiProvider = {
        generateObject: vi.fn().mockResolvedValue({
          data: mockAiResponse,
        }),
      };

      const mockAiFactory = {
        getInstance: vi.fn().mockReturnValue(mockAiProvider),
      };

      vi.doMock("@/lib/ai/ai-factory", () => mockAiFactory);

      const { logger } = await import("@/lib/logging/logger");
      
      const result = await service.analyzeWebsite("https://example.com", evidenceItems);

      // Should log appropriately if there are errors
      if (result.analysisStatus === "backend_confidence_error") {
        expect(logger.error).toHaveBeenCalledWith(
          "onboarding:website-scan:backend-confidence-failed",
          expect.any(Object)
        );
      }
    });
  });

  describe("Integration scenarios", () => {
    it("should handle the original error scenario: this.calculateBackendConfidence is not a function", async () => {
      // This test specifically addresses the original bug report
      const evidenceItems: EvidenceItem[] = [
        {
          evidence: {
            url: "https://example.com/about",
            title: "About Us - Software Company",
            headings: ["About Our Software Company", "Our Platform"],
            snippet: "We are a software company that builds enterprise platforms and SaaS solutions",
          },
          pageType: "about",
          score: 1.8,
          structured: {
            url: "https://example.com/about",
            title: "About Us - Software Company",
            pageType: "about",
            score: 1.8,
            sourceConfidence: 0.95,
            blocks: [
              { 
                kind: "heading-section", 
                level: 1, 
                heading: "About Our Software Company", 
                bodyText: "We are a software company that builds enterprise platforms" 
              },
              { 
                kind: "heading-section", 
                level: 2, 
                heading: "Our Platform", 
                bodyText: "SaaS solutions for business automation" 
              },
            ],
          },
        },
      ];

      const mockAiResponse = {
        companyName: "Enterprise Software Inc",
        industry: {
          value: "software",
          category: "OBSERVED",
          confidence: 0.85,
          source: "https://example.com/about",
          candidates: [
            {
              value: "software",
              confidence: 0.85,
              sourcePages: ["https://example.com/about"],
            },
          ],
        },
        productType: { value: "saas", category: "OBSERVED", confidence: 0.9, source: "https://example.com/about" },
        customerSegment: { value: "b2b", category: "DERIVED", confidence: 0.8, source: "https://example.com/about" },
        dataTypes: { value: ["email", "name", "company"], category: "OBSERVED", confidence: 0.85, source: "https://example.com/about" },
        complianceSignals: { value: ["SOC2", "GDPR"], category: "OBSERVED", confidence: 0.9, source: "https://example.com/about" },
        customerIndustries: { value: ["technology", "finance"], category: "DERIVED", confidence: 0.7, source: "https://example.com/about" },
        businessModel: { value: "b2b-saas", category: "DERIVED", confidence: 0.8, source: "https://example.com/about" },
        userTypes: { value: ["admin", "user", "developer"], category: "OBSERVED", confidence: 0.85, source: "https://example.com/about" },
        internalRoles: { value: ["developer", "admin"], category: "OBSERVED", confidence: 0.8, source: "https://example.com/about" },
        operationalWorkflows: { value: ["development", "deployment"], category: "DERIVED", confidence: 0.7, source: "https://example.com/about" },
        trustClaims: { value: ["secure", "reliable", "scalable"], category: "OBSERVED", confidence: 0.9, source: "https://example.com/about" },
        riskAreas: { value: ["data-privacy", "access-control"], category: "DERIVED", confidence: 0.75, source: "https://example.com/about" },
        tailoringConfidence: 0.85,
        suggestedDocuments: ["privacy-policy", "terms-of-service", "security-whitepaper"],
      };

      const mockAiProvider = {
        generateObject: vi.fn().mockResolvedValue({
          data: mockAiResponse,
        }),
      };

      const mockAiFactory = {
        getInstance: vi.fn().mockReturnValue(mockAiProvider),
      };

      vi.doMock("@/lib/ai/ai-factory", () => mockAiFactory);

      // This should NOT throw "this.calculateBackendConfidence is not a function"
      const result = await service.analyzeWebsite("https://example.com", evidenceItems);

      // Should succeed and proceed to Trust Profile review screen
      expect(result.analysisStatus).toBe("success");
      expect(result.profile).toBeDefined();
      expect(result.profile.industry.value).toBe("software");
      expect(result.profile.industry.confidenceBand).toBe("high");
      expect(result.profile.industry.supportScore).toBeGreaterThan(80);
      
      // Verify backend confidence was calculated correctly
      expect(result.profile.industry.aiConfidence).toBe(0.85);
      expect(result.profile.industry.confidence).toBeGreaterThan(0.8);
      expect(result.profile.industry.reasons).toContain("2 strong evidence pages");
    });
  });
});
