import { describe, it, expect } from "vitest";
import { OperationalWorkflowEngine } from "../operational-workflows/operational-workflow-engine";

describe("OperationalWorkflowEngine Inference", () => {
  it("should infer cloud scanning workflow when cloud capability is present", () => {
    const capabilities = [
      {
        key: "cloud_scanning",
        label: "Cloud Scanning",
        confidence: 0.95,
        evidenceStrength: "strong",
        sourceUrl: "https://example.com",
        pageType: "product",
        snippet: "We scan cloud assets."
      }
    ];
    const operationalModel = {
      scansInfrastructure: true
    };
    const result = OperationalWorkflowEngine.infer(capabilities, operationalModel, []);

    const cloudWf = result.find(w => w.type === "cloud_scanning");
    expect(cloudWf).toBeDefined();
    expect(cloudWf?.confidence).toBe(0.95);
    expect(cloudWf?.evidenceStrength).toBe("strong");
    expect(cloudWf?.steps.length).toBeGreaterThan(0);
    expect(cloudWf?.relatedEvidenceNeeds).toContain("Cloud Security Assessment");
    expect(cloudWf?.relatedRisks).toContain("infrastructure_cloud_risk");
  });

  it("should infer AI enrichment workflow when usesAIOnCustomerData is true", () => {
    const capabilities: any[] = [];
    const operationalModel = {
      usesAIOnCustomerData: true
    };
    const result = OperationalWorkflowEngine.infer(capabilities, operationalModel, []);

    const aiWf = result.find(w => w.type === "ai_enrichment");
    expect(aiWf).toBeDefined();
    expect(aiWf?.confidence).toBe(0.88); // Derived default confidence
    expect(aiWf?.evidenceStrength).toBe("medium");
    expect(aiWf?.relatedEvidenceNeeds).toContain("AI Data Usage Policy");
  });

  it("should infer sensitive data discovery workflow when processesSensitiveData is true", () => {
    const capabilities = [
      {
        key: "sensitive_data_discovery",
        label: "Sensitive Data Discovery",
        confidence: 0.92,
        evidenceStrength: "authoritative",
        sourceUrl: "https://example.com",
        pageType: "product",
        snippet: "PII discovery"
      }
    ];
    const operationalModel = {
      processesSensitiveData: true
    };
    const result = OperationalWorkflowEngine.infer(capabilities, operationalModel, []);

    const sensitiveWf = result.find(w => w.type === "sensitive_data_discovery");
    expect(sensitiveWf).toBeDefined();
    expect(sensitiveWf?.confidence).toBe(0.92);
    expect(sensitiveWf?.evidenceStrength).toBe("strong"); // Authoritative maps to strong
    expect(sensitiveWf?.relatedEvidenceNeeds).toContain("Data Handling Policy");
  });
});
