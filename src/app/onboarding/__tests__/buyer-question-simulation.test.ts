import { describe, it, expect } from "vitest";
import { mapToReadinessViewModel } from "../onboarding-view-model-mapper";
import { WorkspaceFoundationResult } from "@/modules/workspaces/onboarding/vendor-intelligence-types";

const mockFoundation: WorkspaceFoundationResult = {
  securityPillarsIdentifiedCount: 5,
  autoReadyTopicsCount: 2,
  reviewSuggestedTopicsCount: 2,
  needsEvidenceTopicsCount: 1,
  totalRelevantTopicsCount: 5,
  evidenceNeedsCount: 2,
  clarificationTasksCount: 2,
  answerScaffoldsReadyCount: 1,
  capabilityEvidenceCount: 5,
  sourcePagesCount: 10,
  citationsCount: 10,
  generatedTopics: [],
  evidenceNeeds: [],
  clarificationTasks: [],
  answerScaffolds: [],
  generatedTopicKeys: [],
  reviewSuggestedTopicKeys: [],
  needsEvidenceTopicKeys: [],
  generatedEvidenceNeedKeys: [],
  generatedClarificationTaskKeys: [],
  sourceRiskAreaKeys: [],
  sourceCapabilityKeys: [],
  sourceEvidenceRefs: [],
  warnings: []
};

describe("Buyer Question Simulation Systems", () => {
  it("simulates procurement questions for a cybersecurity SaaS product", () => {
    const profile = {
      businessModel: {
        businessDomain: "Cybersecurity",
        primaryIndustry: "Security Governance"
      },
      dataInteractionModel: {
        accessesCustomerData: { value: true, confidence: 0.95 },
        processesSensitiveData: { value: true, confidence: 0.9 },
        storesCustomerData: { value: true, confidence: 0.95 }
      }
    };

    const vm = mapToReadinessViewModel(profile as any, mockFoundation, 0.92, {});
    expect(vm).not.toBeNull();
    if (vm) {
      expect(vm.buyerQuestions.length).toBeGreaterThan(0);
      
      // Tenant Isolation concern must exist and be LIKELY
      const tenantQ = vm.buyerQuestions.find(q => q.id === "q_tenant_isolation");
      expect(tenantQ).toBeDefined();
      expect(tenantQ?.likelihood).toBe("LIKELY");
      expect(tenantQ?.importance).toBe("CRITICAL");
      expect(tenantQ?.expectedAnswerMaturity).toBe("ADVANCED");
      expect(tenantQ?.concernDomain).toBe("Tenant Isolation");

      // Support personnel access concern must exist and be LIKELY
      const supportQ = vm.buyerQuestions.find(q => q.id === "q_support_access");
      expect(supportQ).toBeDefined();
      expect(supportQ?.likelihood).toBe("LIKELY");
      expect(supportQ?.importance).toBe("HIGH");
    }
  });

  it("simulates procurement questions for an AI SaaS product", () => {
    const profile = {
      businessModel: {
        businessDomain: "AI Systems",
        primaryIndustry: "Artificial Intelligence"
      },
      dataInteractionModel: {
        usesAIOnCustomerData: { value: true, confidence: 0.98 }
      }
    };

    const vm = mapToReadinessViewModel(profile as any, mockFoundation, 0.88, {});
    expect(vm).not.toBeNull();
    if (vm) {
      // AI training concern must exist and be LIKELY
      const aiQ = vm.buyerQuestions.find(q => q.id === "q_ai_training");
      expect(aiQ).toBeDefined();
      expect(aiQ?.likelihood).toBe("LIKELY");
      expect(aiQ?.importance).toBe("CRITICAL");
      expect(aiQ?.relatedEvidence).toContain("AI Data Usage Policy");
    }
  });

  it("simulates procurement questions for an infrastructure monitoring product", () => {
    const profile = {
      businessModel: {
        businessDomain: "Infrastructure Monitoring",
        primaryIndustry: "Cloud Operations"
      },
      dataInteractionModel: {
        scansInfrastructure: { value: true, confidence: 0.95 }
      }
    };

    const vm = mapToReadinessViewModel(profile as any, mockFoundation, 0.9, {});
    expect(vm).not.toBeNull();
    if (vm) {
      // Cloud service connector read-only concern must be LIKELY
      const cloudQ = vm.buyerQuestions.find(q => q.id === "q_cloud_connectors");
      expect(cloudQ).toBeDefined();
      expect(cloudQ?.likelihood).toBe("LIKELY");
      expect(cloudQ?.importance).toBe("CRITICAL");
      expect(cloudQ?.relatedRisks).toContain("cloud_security");
    }
  });

  it("simulates procurement questions for a governance platform", () => {
    const profile = {
      businessModel: {
        businessDomain: "Compliance Governance",
        primaryIndustry: "Enterprise Risk"
      },
      dataInteractionModel: {
        accessesCustomerData: { value: false, confidence: 0.9 },
        usesAIOnCustomerData: { value: false, confidence: 0.9 },
        scansInfrastructure: { value: false, confidence: 0.9 }
      }
    };

    const vm = mapToReadinessViewModel(profile as any, mockFoundation, 0.85, {});
    expect(vm).not.toBeNull();
    if (vm) {
      expect(vm.buyerQuestions.length).toBeGreaterThan(0);

      // AI training and Cloud connectors should default to SPECULATIVE
      const aiQ = vm.buyerQuestions.find(q => q.id === "q_ai_training");
      expect(aiQ?.likelihood).toBe("SPECULATIVE");

      const cloudQ = vm.buyerQuestions.find(q => q.id === "q_cloud_connectors");
      expect(cloudQ?.likelihood).toBe("SPECULATIVE");

      // Audit logging concern should be present
      const auditQ = vm.buyerQuestions.find(q => q.id === "q_audit_logging");
      expect(auditQ).toBeDefined();
      expect(auditQ?.importance).toBe("HIGH");
      expect(auditQ?.likelihood).toBe("SPECULATIVE");
    }
  });
});
