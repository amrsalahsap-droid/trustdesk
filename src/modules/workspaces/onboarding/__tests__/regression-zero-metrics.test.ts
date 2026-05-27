import { describe, it, expect } from "vitest";
import { mapToVendorIntelligenceProfile } from "../vendor-intelligence-mapper";
import { FoundationBuilder } from "../foundation-builder";
import { DeepInferredProfile, ProcurementRiskArea } from "../onboarding-core-types";

describe("Zero-Metrics Regression", () => {
  it("should generate a warning when workspace foundation is omitted in analyze flow", () => {
    const profile: DeepInferredProfile = {
      companyName: "Test Co",
      tailoringConfidence: 0.8,
    };
    
    const result = mapToVendorIntelligenceProfile(profile, "test.com", { totalUrls: 1, depth: 1, sitemapCoverage: false, highValueUrls: 0 });
    
    expect(result.workspacePreparation.workspaceFoundation.warnings).toContain("Workspace foundation was not generated during analysis.");
    expect(result.workspacePreparation.workspaceFoundation.totalRelevantTopicsCount).toBe(0);
  });

  it("should output > 0 topics when risk areas have recommendedTopicKeys", () => {
    // Given
    const profile: DeepInferredProfile = {
      companyName: "Test Co",
      tailoringConfidence: 0.8,
    };

    const riskAreas: ProcurementRiskArea[] = [
      {
        key: "risk_data_privacy",
        label: "Data Privacy Risk",
        reason: "Processes PII",
        severity: "HIGH",
        confidence: 0.9,
        triggeringSignals: ["processesPII"],
        evidenceRefs: ["https://test.com/privacy"],
        recommendedTopicKeys: ["privacy_data_protection"],
        recommendedEvidenceNeeds: [],
        clarificationTasks: [],
        evidenceCoverage: "high",
        supportScore: 90
      }
    ];

    // When (simulating the analyze flow)
    const foundation = FoundationBuilder.build({
      mode: "preview",
      riskAreas,
      capabilities: [],
      operationalModel: {
        accessesCustomerData: false,
        processesSensitiveData: false,
        storesCustomerData: false,
        scansInfrastructure: false,
        integratesWithCloudProviders: false,
        usesAIOnCustomerData: false,
        handlesPayments: false,
        handlesPII: false,
      },
      citations: [],
      evidenceRefs: [],
      sourcePages: [],
    });

    const result = mapToVendorIntelligenceProfile(
      profile, 
      "test.com", 
      { totalUrls: 1, depth: 1, sitemapCoverage: false, highValueUrls: 0 }, 
      foundation
    );

    // Then
    expect(result.workspacePreparation.workspaceFoundation.totalRelevantTopicsCount).toBeGreaterThan(0);
    expect(result.workspacePreparation.workspaceFoundation.generatedTopicKeys).toContain("privacy_data_protection");
  });
});
