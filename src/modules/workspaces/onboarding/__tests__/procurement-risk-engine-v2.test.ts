import { describe, it, expect } from "vitest";
import { ProcurementRiskEngineV2 } from "../procurement-risk-v2/procurement-risk-engine-v2";
import { DeepInferredProfile } from "../../onboarding-core-types";
import { ProductGraph } from "../product-graph-types";

describe("ProcurementRiskEngineV2", () => {
  it("should successfully evaluate empty profile and return no risk detections", () => {
    const profile: DeepInferredProfile = {
      tailoringConfidence: 0.1,
      suggestedDocuments: [],
      pagesScanned: [],
    };

    const graph: ProductGraph = {
      productCapabilities: [],
      procurementImplications: [],
      accessPatterns: [],
      infrastructureTouchpoints: [],
      externalDependencyPatterns: [],
      operationalWorkflows: [],
    };

    const risks = ProcurementRiskEngineV2.evaluate({ profile, graph });
    expect(risks).toHaveLength(0);
  });

  it("should evaluate Cybral-like cloud scanning infrastructure triggers", () => {
    const profile: DeepInferredProfile = {
      tailoringConfidence: 0.8,
      suggestedDocuments: [],
      pagesScanned: [],
      vendorCertifications: {
        value: ["SOC 2 Type II"],
        category: "DERIVED",
        confidence: 0.9,
        confidenceBand: "high",
        evidenceCoverage: "strong",
        supportScore: 95,
      },
    };

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
          rationale: "Cloud Scanning detected",
        },
        {
          key: "cloud_connector",
          label: "Cloud Connector",
          confidence: 0.95,
          evidenceStrength: "strong",
          inferredFrom: ["aws integration"],
          evidenceRefs: [],
          sourcePages: [],
          procurementRiskWeight: 7,
          likelyQuestionnaireAreas: [],
          requiredEvidenceTypes: [],
          rationale: "Cloud Connector detected",
        },
        {
          key: "endpoint_agent",
          label: "Endpoint Agent",
          confidence: 0.95,
          evidenceStrength: "strong",
          inferredFrom: ["install agent"],
          evidenceRefs: [],
          sourcePages: [],
          procurementRiskWeight: 9,
          likelyQuestionnaireAreas: [],
          requiredEvidenceTypes: [],
          rationale: "Endpoint Agent active",
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

    const risks = ProcurementRiskEngineV2.evaluate({ profile, graph });

    // Should detect infrastructure_reach, privileged_access, and integration_blast_radius
    const reach = risks.find(r => r.key === "infrastructure_reach");
    expect(reach).toBeDefined();
    // SOC 2 Type II is present -> severity mitigated from critical to high
    expect(reach!.severity).toBe("high");
    expect(reach!.mitigationSignals).toContain("SOC 2 Type II Certified independent audit");

    const priv = risks.find(r => r.key === "privileged_access");
    expect(priv).toBeDefined();
    // SOC 2 mitigates severity from critical to high
    expect(priv!.severity).toBe("high");

    const blast = risks.find(r => r.key === "integration_blast_radius");
    expect(blast).toBeDefined();
  });

  it("should evaluate AI-enabled SaaS platforms", () => {
    const profile: DeepInferredProfile = {
      tailoringConfidence: 0.8,
      suggestedDocuments: [],
      pagesScanned: [],
      privacyPostureSignals: {
        value: ["opt-out of training", "zero retention"],
        category: "DERIVED",
        confidence: 0.8,
        confidenceBand: "high",
        evidenceCoverage: "strong",
        supportScore: 90,
      },
    };

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

    const risks = ProcurementRiskEngineV2.evaluate({ profile, graph });

    // Should detect ai_training_risk and supply_chain_risk
    const aiRisk = risks.find(r => r.key === "ai_training_risk");
    expect(aiRisk).toBeDefined();
    // No SOC 2 mitigations, but Zero retention verified mitigates to medium
    expect(aiRisk!.severity).toBe("medium");
    expect(aiRisk!.mitigationSignals).toContain("Zero Data Retention LLM policy verified");

    // Missing SOC 2 -> Deal Blocker
    expect(aiRisk!.missingCriticalEvidence).toContain("SOC 2 Type II audit certificate / ISO 27001 security statement");
  });

  it("should evaluate support-access-heavy workflows", () => {
    const profile: DeepInferredProfile = {
      tailoringConfidence: 0.8,
      suggestedDocuments: [],
      pagesScanned: [],
    };

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

    const risks = ProcurementRiskEngineV2.evaluate({ profile, graph });

    // Should detect support_visibility and identity_impersonation
    const support = risks.find(r => r.key === "support_visibility");
    expect(support).toBeDefined();
    expect(support!.severity).toBe("high");

    const identity = risks.find(r => r.key === "identity_impersonation");
    expect(identity).toBeDefined();
    expect(identity!.severity).toBe("high");
  });

  it("should evaluate ingestion platforms and regulated data HIPAA inputs", () => {
    const profile: DeepInferredProfile = {
      tailoringConfidence: 0.8,
      suggestedDocuments: [],
      pagesScanned: [],
      dataTypes: {
        value: ["HIPAA PHI data", "regulated data"],
        category: "DERIVED",
        confidence: 0.9,
        confidenceBand: "high",
        evidenceCoverage: "strong",
        supportScore: 90,
      },
    };

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

    const risks = ProcurementRiskEngineV2.evaluate({ profile, graph });

    // Should detect customer_data_exposure, regulated_data_risk, and persistence_risk
    const exposure = risks.find(r => r.key === "customer_data_exposure");
    expect(exposure).toBeDefined();
    expect(exposure!.severity).toBe("critical"); // High blast radius or no compliance mitigations keeps it critical

    const regulated = risks.find(r => r.key === "regulated_data_risk");
    expect(regulated).toBeDefined();
    expect(regulated!.severity).toBe("high");
  });
});
