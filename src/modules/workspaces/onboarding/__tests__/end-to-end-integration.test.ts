import { describe, it, expect, vi, beforeEach } from "vitest";
import { WebsiteAnalysisService } from "../website-analysis-service";
import { AiHttpClient } from "@/lib/ai/ai-http-client";

// Mock the feature flags to disable failClosedInference in tests
vi.mock("@/lib/feature-flags/onboarding-flags", () => ({
  onboardingFlags: {
    failClosedInference: false,
    robustCrawler: true,
    strictInference: false,
    docTypeTailoring: true,
    renderedFallback: true,
    enhancedDomainCrawler: true,
  },
  effectiveOnboardingFlag: (flag: string) => {
    if (flag === "failClosedInference") return false;
    return true;
  }
}));

// Mock the HTTP client to avoid real network requests
vi.mock("@/lib/ai/ai-http-client");
const mockGet = vi.mocked(AiHttpClient.get);
const mockGetFull = vi.mocked(AiHttpClient.getFull);

describe("End-to-End Onboarding Intelligence Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should execute ProductGraph, BlastRadius, and ProcurementRiskEngineV2 end-to-end for cybral.com", async () => {
    // Given
    // Mock HTTP requests cleanly using mockImplementation
    mockGet.mockResolvedValue("");
    mockGetFull.mockImplementation(async (url: string) => {
      return {
        statusCode: 200,
        contentType: "text/html",
        body: `
          <!DOCTYPE html>
          <html>
            <head>
              <title>Cybral - AI Security</title>
              <meta name="description" content="Cybral automatically discovers and classifies sensitive data.">
            </head>
            <body>
              <h1>Continuous scanning of cloud perimeter</h1>
              <p>We discover sensitive data in your customer cloud accounts using AI inference models.</p>
            </body>
          </html>
        `
      };
    });

    // When
    const result = await WebsiteAnalysisService.analyze("https://cybral.com");

    // Then
    expect(["success", "weak_signals", "needs_review"]).toContain(result.analysisStatus);
    expect(result.intelligenceProfile).toBeDefined();

    const profile = result.intelligenceProfile!;
    
    // 1. Verify ProductGraph exists and is populated
    expect(profile.productGraph).toBeDefined();
    expect(profile.productGraph.productCapabilities.length).toBeGreaterThan(0);
    expect(profile.productGraph.operationalWorkflows.length).toBeGreaterThan(0);
    expect(profile.productGraph.accessPatterns.length).toBeGreaterThan(0);
    expect(profile.productGraph.infrastructureTouchpoints.length).toBeGreaterThan(0);

    // Verify a specific capability detected in the graph
    const hasCloudScanning = profile.productGraph.productCapabilities.some((c: any) => c.key === "cloud_scanning");
    expect(hasCloudScanning).toBe(true);

    // 2. Verify BlastRadius exists and is calculated
    expect(profile.blastRadius).toBeDefined();
    expect(profile.blastRadius.compromiseScenarios.length).toBeGreaterThan(0);
    expect(profile.blastRadius.infrastructureReachLevel).toBeGreaterThanOrEqual(1.0);
    expect(profile.blastRadius.customerDataExposureLevel).toBeGreaterThanOrEqual(1.0);

    // 3. Verify V2 Procurement Risks are evaluated and mapped
    expect(profile.securityAndTrustModel.procurementRiskAreas.length).toBeGreaterThan(0);
    const hasDataRisk = profile.securityAndTrustModel.procurementRiskAreas.some((r: any) => r.key === "customer_data_exposure");
    expect(hasDataRisk).toBe(true);

    // 4. Verify dataInteractionModel is correctly mapped and updated from graph access patterns
    expect(profile.dataInteractionModel.accessesCustomerData.value).toBe(true);
    expect(profile.dataInteractionModel.scansInfrastructure.value).toBe(true);
    expect(profile.dataInteractionModel.usesAIOnCustomerData.value).toBe(true);

    // 5. Verify foundation topics were correctly generated from legacyRisks recommendation keys
    expect(profile.workspacePreparation.workspaceFoundation.totalRelevantTopicsCount).toBeGreaterThan(0);
  });
});
