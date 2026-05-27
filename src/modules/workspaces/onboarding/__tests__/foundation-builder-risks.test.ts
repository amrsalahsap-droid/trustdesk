import { describe, it, expect } from "vitest";
import { FoundationBuilder } from "../foundation-builder";
import { ProcurementRiskArea } from "../vendor-intelligence-types";

describe("FoundationBuilder Risk Mapping Rules", () => {
  it("Rule 1: every high or critical risk must produce at least a topic, evidence need, or task", () => {
    const riskAreas: ProcurementRiskArea[] = [
      {
        key: "some_custom_high_risk",
        label: "Some Custom High Risk",
        reason: "Generic reason",
        recommendedTopicKeys: [], // No topics recommended
        confidence: 0.8,
        evidenceStrength: "strong",
        severity: "HIGH",
        triggeringSignals: [],
        evidenceRefs: [],
        recommendedEvidenceNeeds: [],
        clarificationTasks: []
      }
    ];

    const result = FoundationBuilder.build({
      riskAreas,
      capabilities: [],
      operationalModel: {} as any,
      evidenceRefs: [],
      citations: [],
      sourcePages: []
    });

    // Should produce a default fallback evidence need to satisfy Rule 1
    expect(result.evidenceNeedsCount).toBeGreaterThan(0);
    const fallbackNeed = result.evidenceNeeds.find(n => n.type === "Some Custom High Risk Evidence");
    expect(fallbackNeed).toBeDefined();
  });

  it("Rule 2: low-evidence critical risks must produce evidence needs", () => {
    const riskAreas: ProcurementRiskArea[] = [
      {
        key: "some_critical_risk",
        label: "Some Critical Risk",
        reason: "Generic reason",
        recommendedTopicKeys: [],
        confidence: 0.45,
        evidenceStrength: "weak",
        severity: "CRITICAL",
        triggeringSignals: [],
        evidenceRefs: [],
        recommendedEvidenceNeeds: [],
        clarificationTasks: []
      }
    ];

    const result = FoundationBuilder.build({
      riskAreas,
      capabilities: [],
      operationalModel: {} as any,
      evidenceRefs: [],
      citations: [],
      sourcePages: []
    });

    const verificationNeed = result.evidenceNeeds.find(n => n.type === "Some Critical Risk Verification");
    expect(verificationNeed).toBeDefined();
    expect(verificationNeed?.reason).toContain("low evidence");
  });

  it("Rule 3: AI training risk must produce AI Data Usage Policy need and model training clarification", () => {
    const riskAreas: ProcurementRiskArea[] = [
      {
        key: "ai_training_risk",
        label: "AI Training Risk",
        reason: "Inferred AI training on customer data",
        recommendedTopicKeys: [],
        confidence: 0.7,
        evidenceStrength: "medium",
        severity: "HIGH",
        triggeringSignals: [],
        evidenceRefs: [],
        recommendedEvidenceNeeds: [],
        clarificationTasks: []
      }
    ];

    const result = FoundationBuilder.build({
      riskAreas,
      capabilities: [],
      operationalModel: {} as any,
      evidenceRefs: [],
      citations: [],
      sourcePages: []
    });

    // Must produce "AI Data Usage Policy" evidence need
    const aiNeed = result.evidenceNeeds.find(n => n.type === "AI Data Usage Policy");
    expect(aiNeed).toBeDefined();

    // Must produce "AI Model Training Clarification" task
    const aiTask = result.clarificationTasks.find(t => t.id === "task_ai_training_confirmation");
    expect(aiTask).toBeDefined();
    expect(aiTask?.description).toContain("Verify if customer-provided data inputs are utilized");
  });

  it("Rule 4: support visibility/access must produce Support Access Policy need and support staff access clarification", () => {
    const riskAreas: ProcurementRiskArea[] = [
      {
        key: "support_visibility",
        label: "Support Visibility Risk",
        reason: "Support visibility inferred",
        recommendedTopicKeys: [],
        confidence: 0.7,
        evidenceStrength: "medium",
        severity: "HIGH",
        triggeringSignals: [],
        evidenceRefs: [],
        recommendedEvidenceNeeds: [],
        clarificationTasks: []
      }
    ];

    const result = FoundationBuilder.build({
      riskAreas,
      capabilities: [],
      operationalModel: {} as any,
      evidenceRefs: [],
      citations: [],
      sourcePages: []
    });

    // Must produce "Support Access Policy" evidence need
    const supportNeed = result.evidenceNeeds.find(n => n.type === "Support Access Policy");
    expect(supportNeed).toBeDefined();

    // Must produce "Support Staff Access Clarification" task
    const supportTask = result.clarificationTasks.find(t => t.id === "task_support_access_confirmation");
    expect(supportTask).toBeDefined();
    expect(supportTask?.description).toContain("Confirm access management standards outlining employee credential security");
  });

  it("Rule 5: tenant escape risk must produce tenant_isolation topic and Tenant Isolation Architecture need", () => {
    const riskAreas: ProcurementRiskArea[] = [
      {
        key: "tenant_escape_risk",
        label: "Tenant Escape Risk",
        reason: "Multi-tenant container escape risk",
        recommendedTopicKeys: [], // Topic keys array empty initially
        confidence: 0.75,
        evidenceStrength: "medium",
        severity: "HIGH",
        triggeringSignals: [],
        evidenceRefs: [],
        recommendedEvidenceNeeds: [],
        clarificationTasks: []
      }
    ];

    const result = FoundationBuilder.build({
      riskAreas,
      capabilities: [],
      operationalModel: {} as any,
      evidenceRefs: [],
      citations: [],
      sourcePages: []
    });

    // Must produce tenant_isolation topic
    expect(result.generatedTopicKeys).toContain("tenant_isolation");

    // Must produce "Tenant Isolation Architecture" evidence need
    const tenantNeed = result.evidenceNeeds.find(n => n.type === "Tenant Isolation Architecture");
    expect(tenantNeed).toBeDefined();
  });

  it("Rule 6: cloud/infra risks must produce Least Privilege/Connector Permission evidence need", () => {
    const riskAreas: ProcurementRiskArea[] = [
      {
        key: "privileged_access",
        label: "Privileged Access Risk",
        reason: "IAM credentials scanning active",
        recommendedTopicKeys: [],
        confidence: 0.75,
        evidenceStrength: "medium",
        severity: "CRITICAL",
        triggeringSignals: [],
        evidenceRefs: [],
        recommendedEvidenceNeeds: [],
        clarificationTasks: []
      }
    ];

    const result = FoundationBuilder.build({
      riskAreas,
      capabilities: [],
      operationalModel: {} as any,
      evidenceRefs: [],
      citations: [],
      sourcePages: []
    });

    // Must produce "Least Privilege/Connector Permission" evidence need
    const privilegeNeed = result.evidenceNeeds.find(n => n.type === "Least Privilege/Connector Permission");
    expect(privilegeNeed).toBeDefined();
  });

  it("generates and populates all premium governance remediation actions under appropriate risk triggers", () => {
    const riskAreas: ProcurementRiskArea[] = [
      {
        key: "ai_training_risk",
        label: "AI Training Risk",
        reason: "Uses customer data to train models",
        severity: "CRITICAL",
        confidence: 0.9,
        evidenceStrength: "weak",
        triggeringSignals: [],
        evidenceRefs: [],
        recommendedEvidenceNeeds: [],
        clarificationTasks: []
      },
      {
        key: "tenant_escape_risk",
        label: "Tenant Escape Risk",
        reason: "Logical isolation boundaries unverified",
        severity: "HIGH",
        confidence: 0.85,
        evidenceStrength: "medium",
        triggeringSignals: [],
        evidenceRefs: [],
        recommendedEvidenceNeeds: [],
        clarificationTasks: []
      },
      {
        key: "support_visibility",
        label: "Support Access Risk",
        reason: "Access to production customer DB by support",
        severity: "HIGH",
        confidence: 0.8,
        evidenceStrength: "medium",
        triggeringSignals: [],
        evidenceRefs: [],
        recommendedEvidenceNeeds: [],
        clarificationTasks: []
      },
      {
        key: "data_storage_risk",
        label: "Data Storage Risk",
        reason: "Stores customer PII indefinitely",
        severity: "HIGH",
        confidence: 0.8,
        evidenceStrength: "medium",
        triggeringSignals: [],
        evidenceRefs: [],
        recommendedEvidenceNeeds: [],
        clarificationTasks: []
      }
    ];

    const result = FoundationBuilder.build({
      riskAreas,
      capabilities: [],
      operationalModel: { storesCustomerData: true } as any,
      evidenceRefs: [],
      citations: [],
      sourcePages: []
    });

    const aiTask = result.clarificationTasks.find(t => t.id === "task_ai_training_confirmation");
    const tenantTask = result.clarificationTasks.find(t => t.id === "task_tenant_isolation_confirmation");
    const supportTask = result.clarificationTasks.find(t => t.id === "task_support_access_confirmation");
    const retentionTask = result.clarificationTasks.find(t => t.id === "task_data_retention_confirmation");

    expect(aiTask).toBeDefined();
    expect(tenantTask).toBeDefined();
    expect(supportTask).toBeDefined();
    expect(retentionTask).toBeDefined();

    // Verify premium fields on AI task
    expect(aiTask?.whyItMatters).toContain("strictly reject vendor data training");
    expect(aiTask?.whatItUnlocks).toContain("AI Safety and Compliance");
    expect(aiTask?.confidenceDelta).toBe(18);

    // Verify premium fields on tenant isolation task
    expect(tenantTask?.whyItMatters).toContain("require documented architectural proof");
    expect(tenantTask?.whatItUnlocks).toContain("Infrastructure trust clearance");
    expect(tenantTask?.confidenceDelta).toBe(22);

    // Verify premium fields on support access task
    expect(supportTask?.whyItMatters).toContain("enforce strict zero-access");
    expect(supportTask?.whatItUnlocks).toContain("Support access auditing");
    expect(supportTask?.confidenceDelta).toBe(15);

    // Verify premium fields on retention task
    expect(retentionTask?.whyItMatters).toContain("demand rigorous legal guarantees");
    expect(retentionTask?.whatItUnlocks).toContain("Data disposal compliance");
    expect(retentionTask?.confidenceDelta).toBe(12);
  });
});
