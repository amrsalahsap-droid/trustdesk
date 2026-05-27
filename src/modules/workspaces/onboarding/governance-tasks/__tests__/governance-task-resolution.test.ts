import { describe, it, expect } from "vitest";
import { GovernanceTaskResolutionEngine } from "../governance-task-resolution-engine";
import { ClarificationTask } from "../../vendor-intelligence-types";

describe("GovernanceTaskResolutionEngine", () => {
  it("should merge duplicate AI training tasks into a single canonical task", () => {
    const tasks: ClarificationTask[] = [
      {
        id: "task_ai_clarification",
        title: "Confirm whether customer data is used to train AI models",
        description: "Verify if customer-provided data inputs are utilized for artificial intelligence model training.",
        priority: "CRITICAL",
        status: "pending",
        triggeringSignals: ["usesAIOnCustomerData"],
        suggestedAction: "Update AI Ethics/DPA Policy",
        classification: "blocker",
        whyItMatters: "Enterprise security and legal reviewers strictly reject vendor data training on shared generative LLMs.",
        whatItUnlocks: "Unlocks the AI Safety and Compliance review pillar.",
        affectedRisks: ["AI Training Risk"],
        affectedTrustTopics: ["AI Safety"],
        confidenceDelta: 10
      },
      {
        id: "task_ai_model_training",
        title: "Confirm whether customer data is used to train AI models",
        description: "Does the vendor use customer data to train or fine-tune AI models? Confirm model restrictions.",
        priority: "HIGH",
        status: "pending",
        triggeringSignals: ["ai_training_risk"],
        suggestedAction: "Update AI Ethics/DPA Policy",
        classification: "blocker",
        whyItMatters: "Enterprise procurement teams frequently block AI vendors that cannot explicitly confirm training restrictions.",
        whatItUnlocks: "AI governance readiness, procurement approval acceleration",
        affectedRisks: ["Customer Data Exposure"],
        affectedTrustTopics: ["Subprocessors"],
        confidenceDelta: 18
      }
    ];

    const resolved = GovernanceTaskResolutionEngine.resolve(tasks);

    // Should merge both AI tasks into exactly one
    expect(resolved).toHaveLength(1);
    const merged = resolved[0];

    expect(merged.id).toBe("task_ai_training_confirmation");
    expect(merged.title).toBe("Confirm whether customer data is used to train AI models");
    expect(merged.classification).toBe("blocker");
    
    // Priority should use the highest: CRITICAL > HIGH
    expect(merged.priority).toBe("CRITICAL");

    // Merged affected risks (deduplicated)
    expect(merged.affectedRisks).toContain("AI Training Risk");
    expect(merged.affectedRisks).toContain("Customer Data Exposure");
    expect(merged.affectedRisks).toHaveLength(2);

    // Merged affected trust topics (deduplicated)
    expect(merged.affectedTrustTopics).toContain("AI Safety");
    expect(merged.affectedTrustTopics).toContain("Subprocessors");
    expect(merged.affectedTrustTopics).toHaveLength(2);

    // Merged triggering signals (deduplicated)
    expect(merged.triggeringSignals).toContain("usesAIOnCustomerData");
    expect(merged.triggeringSignals).toContain("ai_training_risk");
    expect(merged.triggeringSignals).toHaveLength(2);

    // Max confidence delta preserved
    expect(merged.confidenceDelta).toBe(18);
  });

  it("should preserve unique unmapped/provisional tasks without dropping them", () => {
    const tasks: ClarificationTask[] = [
      {
        id: "task_custom_unmapped",
        title: "Custom Security Review Checklist",
        description: "Verify proprietary operational requirements.",
        priority: "MEDIUM",
        status: "pending",
        triggeringSignals: ["custom_trigger"],
        suggestedAction: "Complete the checklist",
        classification: "enhancement",
        affectedRisks: ["Custom Risk"]
      }
    ];

    const resolved = GovernanceTaskResolutionEngine.resolve(tasks);
    expect(resolved).toHaveLength(1);
    expect(resolved[0].id).toBe("task_custom_unmapped");
    expect(resolved[0].title).toBe("Custom Security Review Checklist");
  });

  it("should correctly sort blocker tasks and high-priority tasks to the front", () => {
    const tasks: ClarificationTask[] = [
      {
        id: "task_data_retention",
        title: "Formulate end-of-contract customer data deletion protocols",
        description: "Confirm retention timelines.",
        priority: "MEDIUM",
        status: "pending",
        triggeringSignals: ["storesCustomerData"],
        suggestedAction: "Update Policy",
        classification: "enhancement",
        confidenceDelta: 12
      },
      {
        id: "task_ai_clarification",
        title: "Confirm whether customer data is used to train AI models",
        description: "Verify if AI trains on customer data.",
        priority: "CRITICAL",
        status: "pending",
        triggeringSignals: ["usesAIOnCustomerData"],
        suggestedAction: "Update AI Policy",
        classification: "blocker",
        confidenceDelta: 18
      }
    ];

    const resolved = GovernanceTaskResolutionEngine.resolve(tasks);
    expect(resolved).toHaveLength(2);
    // Blocker task should be first
    expect(resolved[0].id).toBe("task_ai_training_confirmation");
    expect(resolved[1].id).toBe("task_data_retention_confirmation");
  });
});
