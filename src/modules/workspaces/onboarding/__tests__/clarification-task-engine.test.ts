import { describe, it, expect } from "vitest";
import { ClarificationTaskEngine } from "../clarification-task-engine";
import { DeepInferredProfile } from "../onboarding-core-types";

describe("ClarificationTaskEngine V2 Upgrade", () => {
  it("should generate AI Governance blockers with correct smart defaults and procurement modifiers", () => {
    const profile: DeepInferredProfile = {
      tailoringConfidence: 0.8,
      suggestedDocuments: [],
      pagesScanned: [],
      dataInteractionModel: {
        value: {
          usesAIOnCustomerData: true,
          accessesCustomerData: true,
        },
        confidence: 0.6, // Low confidence / hypothetical
        category: "HYPOTHESIZED",
      } as any,
    };

    const tasks = ClarificationTaskEngine.generateTasks(profile);
    
    const aiTask = tasks.find(t => t.id === "task_confirm_ai_usage");
    expect(aiTask).toBeDefined();
    expect(aiTask!.classification).toBe("blocker");
    expect(aiTask!.priority).toBe("HIGH");
    expect(aiTask!.status).toBe("inferred_need_confirm");
    expect(aiTask!.affectedTrustTopics).toContain("AI Safety");
    expect(aiTask!.affectedRisks).toContain("ai_training_risk");
    expect(aiTask!.confidenceDelta).toBe(0.45);
    expect(aiTask!.smartDefault).toContain("zero-retention API endpoints");
    expect(aiTask!.whyItMatters).toContain("strictly reject vendor data training");
  });

  it("should generate Cloud Connector blockers under least privilege criteria", () => {
    const profile: DeepInferredProfile = {
      tailoringConfidence: 0.8,
      suggestedDocuments: [],
      pagesScanned: [],
      structuredCapabilities: {
        value: [
          {
            key: "cloud_connector",
            label: "AWS Cloud Integration",
            confidence: 0.70,
            evidenceStrength: "medium",
          },
        ],
        confidence: 0.70,
        category: "DERIVED",
      } as any,
    };

    const tasks = ClarificationTaskEngine.generateTasks(profile);

    const connectorTask = tasks.find(t => t.id === "task_confirm_connector_perms");
    expect(connectorTask).toBeDefined();
    expect(connectorTask!.classification).toBe("blocker");
    expect(connectorTask!.affectedTrustTopics).toContain("Least Privilege");
    expect(connectorTask!.affectedRisks).toContain("privileged_access");
    expect(connectorTask!.smartDefault).toContain("restricted, read-only IAM security template");
  });

  it("should generate Support Impersonation blockers and JIT session controls", () => {
    const profile: DeepInferredProfile = {
      tailoringConfidence: 0.8,
      suggestedDocuments: [],
      pagesScanned: [],
      structuredCapabilities: {
        value: [
          {
            key: "support_access",
            label: "Administrative support console link",
            confidence: 0.60,
            evidenceStrength: "weak",
          },
        ],
        confidence: 0.60,
        category: "DERIVED",
      } as any,
    };

    const tasks = ClarificationTaskEngine.generateTasks(profile);

    const supportTask = tasks.find(t => t.id === "task_confirm_support_impersonation");
    expect(supportTask).toBeDefined();
    expect(supportTask!.classification).toBe("blocker");
    expect(supportTask!.affectedRisks).toContain("support_visibility");
    expect(supportTask!.smartDefault).toContain("time-bound JIT authorization token");
  });

  it("should prioritize blockers over enhancements and sort dynamically", () => {
    const profile: DeepInferredProfile = {
      tailoringConfidence: 0.8,
      suggestedDocuments: [],
      pagesScanned: [],
      dataInteractionModel: {
        value: {
          usesAIOnCustomerData: true,
          storesCustomerData: true,
        },
        confidence: 0.6,
        category: "HYPOTHESIZED",
      } as any,
      productSupportedFrameworks: {
        value: ["ISO 27001"],
        confidence: 0.9,
        category: "OBSERVED",
      } as any,
      vendorCertifications: {
        value: [],
        confidence: 1.0,
      } as any,
    };

    const tasks = ClarificationTaskEngine.generateTasks(profile);

    // Blocker tasks should be batch-sorted to the front
    expect(tasks[0].classification).toBe("blocker");
    expect(tasks[tasks.length - 1].classification).toBe("enhancement");
  });
});
