import { describe, it, expect } from "vitest";
import { BlastRadiusEngine } from "../blast-radius/blast-radius-engine";
import { ProductGraph } from "../product-graph-types";

describe("BlastRadiusEngine", () => {
  it("should evaluate low-risk/empty SaaS profiles correctly", () => {
    const graph: ProductGraph = {
      productCapabilities: [],
      procurementImplications: [],
      accessPatterns: [],
      infrastructureTouchpoints: [],
      externalDependencyPatterns: [],
      operationalWorkflows: [],
    };

    const profile = BlastRadiusEngine.evaluate({ graph });
    expect(profile.customerDataExposureLevel).toBe(1.0);
    expect(profile.infrastructureReachLevel).toBe(1.0);
    expect(profile.actionExecutionRisk).toBe(1.0);
    expect(profile.identityExposureLevel).toBe(1.0);
    expect(profile.operationalDependencyLevel).toBe(1.0);
    expect(profile.compromiseScenarios).toHaveLength(0);
  });

  it("should evaluate Cybral-like cloud scanning blast radius indicators", () => {
    const graph: ProductGraph = {
      productCapabilities: [
        {
          key: "cloud_scanning",
          label: "Cloud Scanning",
          confidence: 0.95,
          evidenceStrength: "strong",
          inferredFrom: ["scan aws"],
          evidenceRefs: [],
          sourcePages: [],
          procurementRiskWeight: 8,
          likelyQuestionnaireAreas: [],
          requiredEvidenceTypes: [],
          rationale: "Cloud Scanning active",
        },
      ],
      procurementImplications: [],
      accessPatterns: [],
      infrastructureTouchpoints: [],
      externalDependencyPatterns: [],
      operationalWorkflows: [
        {
          key: "scanning",
          label: "Continuous Scanning Workflow",
          confidence: 0.95,
          evidenceRefs: [],
          sourcePages: [],
          steps: [],
          dataFlow: [],
          accessFlow: [],
          procurementRisks: [],
          trustImplications: [],
          evidenceRequirements: [],
          rationale: "Continuous Scanning active",
        },
      ],
    };

    const profile = BlastRadiusEngine.evaluate({ graph });
    // Cloud scanning adds 2.0 to infra reach -> 3.0. Cloud scanning adds 2.0 to action execution -> 3.0.
    expect(profile.infrastructureReachLevel).toBe(3.0);
    expect(profile.actionExecutionRisk).toBe(3.0);

    const scenario = profile.compromiseScenarios.find(s => s.key === "infra_scan_abuse");
    expect(scenario).toBeDefined();
    expect(scenario!.probability).toBe("low"); // Elevated only if reach >= 4.0
    expect(scenario!.impact).toBe("critical");
  });

  it("should evaluate AI-enabled SaaS platforms", () => {
    const graph: ProductGraph = {
      productCapabilities: [
        {
          key: "ai_inference",
          label: "AI Inference",
          confidence: 0.95,
          evidenceStrength: "strong",
          inferredFrom: ["openai api"],
          evidenceRefs: [],
          sourcePages: [],
          procurementRiskWeight: 6,
          likelyQuestionnaireAreas: [],
          requiredEvidenceTypes: [],
          rationale: "AI Inference active",
        },
      ],
      procurementImplications: [],
      accessPatterns: [],
      infrastructureTouchpoints: [],
      externalDependencyPatterns: [],
      operationalWorkflows: [
        {
          key: "ai_analysis",
          label: "AI Processing & Analysis Workflow",
          confidence: 0.95,
          evidenceRefs: [],
          sourcePages: [],
          steps: [],
          dataFlow: [],
          accessFlow: [],
          procurementRisks: [],
          trustImplications: [],
          evidenceRequirements: [],
          rationale: "AI Workflow active",
        },
      ],
    };

    const profile = BlastRadiusEngine.evaluate({ graph });
    expect(profile.operationalDependencyLevel).toBe(2.5); // AI active adds 1.5 -> 2.5

    const scenario = profile.compromiseScenarios.find(s => s.key === "ai_training_exposure");
    expect(scenario).toBeDefined();
    expect(scenario!.probability).toBe("medium");
    expect(scenario!.suggestedMitigations[0]).toContain("DPA");
  });

  it("should evaluate support-access-heavy workflows", () => {
    const graph: ProductGraph = {
      productCapabilities: [
        {
          key: "support_access",
          label: "Support Access",
          confidence: 0.95,
          evidenceStrength: "strong",
          inferredFrom: ["impersonation"],
          evidenceRefs: [],
          sourcePages: [],
          procurementRiskWeight: 5,
          likelyQuestionnaireAreas: [],
          requiredEvidenceTypes: [],
          rationale: "Support impersonation active",
        },
      ],
      procurementImplications: [],
      accessPatterns: [],
      infrastructureTouchpoints: [],
      externalDependencyPatterns: [],
      operationalWorkflows: [
        {
          key: "support",
          label: "Support Access and Impersonation Workflow",
          confidence: 0.95,
          evidenceRefs: [],
          sourcePages: [],
          steps: [],
          dataFlow: [],
          accessFlow: [],
          procurementRisks: [],
          trustImplications: [],
          evidenceRequirements: [],
          rationale: "Support workflow active",
        },
      ],
    };

    const profile = BlastRadiusEngine.evaluate({ graph });
    expect(profile.identityExposureLevel).toBe(4.5); // Support access (2.0) + Support workflow (1.5) -> 4.5

    const scenario = profile.compromiseScenarios.find(s => s.key === "support_impersonation");
    expect(scenario).toBeDefined();
    expect(scenario!.impact).toBe("high");
  });

  it("should evaluate ingestion platforms", () => {
    const graph: ProductGraph = {
      productCapabilities: [
        {
          key: "email_ingestion",
          label: "Email Ingestion",
          confidence: 0.95,
          evidenceStrength: "strong",
          inferredFrom: ["imap connection"],
          evidenceRefs: [],
          sourcePages: [],
          procurementRiskWeight: 6,
          likelyQuestionnaireAreas: [],
          requiredEvidenceTypes: [],
          rationale: "Email Ingestion active",
        },
      ],
      procurementImplications: [],
      accessPatterns: [],
      infrastructureTouchpoints: [],
      externalDependencyPatterns: [],
      operationalWorkflows: [
        {
          key: "ingestion",
          label: "Data Ingestion Workflow",
          confidence: 0.95,
          evidenceRefs: [],
          sourcePages: [],
          steps: [],
          dataFlow: [],
          accessFlow: [],
          procurementRisks: [],
          trustImplications: [],
          evidenceRequirements: [],
          rationale: "Ingestion workflow active",
        },
      ],
    };

    const profile = BlastRadiusEngine.evaluate({ graph });
    expect(profile.customerDataExposureLevel).toBe(2.5); // Ingestion (1.5) -> 2.5

    const scenario = profile.compromiseScenarios.find(s => s.key === "customer_metadata_exposure");
    expect(scenario).toBeDefined();
    expect(scenario!.impact).toBe("high");
  });
});
