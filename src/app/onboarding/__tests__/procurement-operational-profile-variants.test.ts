import { describe, it, expect } from "vitest";
import { mapToReadinessViewModel } from "../onboarding-view-model-mapper";
import { 
  VendorIntelligenceProfile, 
  WorkspaceFoundationResult 
} from "@/modules/workspaces/onboarding/vendor-intelligence-types";

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

describe("Procurement Operational Profile Variants", () => {
  it("maps SaaS cybersecurity platform properties correctly", () => {
    const profile: Partial<VendorIntelligenceProfile> = {
      businessModel: {
        businessDomain: "Cybersecurity",
        primaryIndustry: "Enterprise Software"
      },
      dataInteractionModel: {
        accessesCustomerData: { value: true, confidence: 0.9 },
        storesCustomerData: { value: true, confidence: 0.9 },
        processesSensitiveData: { value: false, confidence: 0.9 },
        scansInfrastructure: { value: false, confidence: 0.9 },
        usesAIOnCustomerData: { value: false, confidence: 0.9 }
      },
      deploymentAndIntegrationModel: {
        deploymentModes: [{ value: "Cloud / SaaS", confidence: 0.9 }],
        integrations: []
      }
    };

    const vm = mapToReadinessViewModel(profile as any, mockFoundation, 0.9, {});
    expect(vm).not.toBeNull();
    if (vm) {
      expect(vm.operationalProfile.customerDataInteraction.value).toBe("Indirect / Metadata-based");
      expect(vm.operationalProfile.customerDataInteraction.status).toBe("confirmed");
      expect(vm.operationalProfile.persistenceBehavior.value).toBe("Findings and metadata persisted");
      expect(vm.operationalProfile.aiInteractionModel.value).toBe("No AI interaction identified");
    }
  });

  it("maps AI Product features and AI interaction model correctly", () => {
    const profile: Partial<VendorIntelligenceProfile> = {
      businessModel: {
        businessDomain: "Artificial Intelligence",
        primaryIndustry: "B2B SaaS"
      },
      dataInteractionModel: {
        accessesCustomerData: { value: true, confidence: 0.9 },
        storesCustomerData: { value: true, confidence: 0.9 },
        processesSensitiveData: { value: true, confidence: 0.8 },
        scansInfrastructure: { value: false, confidence: 0.9 },
        usesAIOnCustomerData: { value: true, confidence: 0.95 }
      },
      deploymentAndIntegrationModel: {
        deploymentModes: [{ value: "Cloud / SaaS", confidence: 0.9 }],
        integrations: []
      }
    };

    const vm = mapToReadinessViewModel(profile as any, mockFoundation, 0.9, {});
    expect(vm).not.toBeNull();
    if (vm) {
      expect(vm.operationalProfile.aiInteractionModel.value).toBe("Inference observed, training unconfirmed");
      expect(vm.operationalProfile.aiInteractionModel.status).toBe("inferred");
    }
  });

  it("maps Infrastructure Scanner connector scope correctly", () => {
    const profile: Partial<VendorIntelligenceProfile> = {
      businessModel: {
        businessDomain: "Vulnerability Scanning",
        primaryIndustry: "Cybersecurity"
      },
      dataInteractionModel: {
        accessesCustomerData: { value: true, confidence: 0.9 },
        storesCustomerData: { value: true, confidence: 0.9 },
        processesSensitiveData: { value: false, confidence: 0.9 },
        scansInfrastructure: { value: true, confidence: 0.95 },
        usesAIOnCustomerData: { value: false, confidence: 0.9 }
      },
      deploymentAndIntegrationModel: {
        deploymentModes: [{ value: "Cloud / SaaS", confidence: 0.9 }],
        integrations: [{ type: "cloud", value: "aws" }]
      }
    };

    const vm = mapToReadinessViewModel(profile as any, mockFoundation, 0.9, {});
    expect(vm).not.toBeNull();
    if (vm) {
      expect(vm.operationalProfile.connectorScope.value).toBe("Read-only infrastructure scanning");
      expect(vm.operationalProfile.scanningBehavior.value).toBe("Active API-driven scanning");
      expect(vm.operationalProfile.scanningBehavior.status).toBe("confirmed");
    }
  });

  it("maps Cloud Governance platform parameters correctly", () => {
    const profile: Partial<VendorIntelligenceProfile> = {
      businessModel: {
        businessDomain: "Cloud Compliance",
        primaryIndustry: "Enterprise Software"
      },
      dataInteractionModel: {
        accessesCustomerData: { value: true, confidence: 0.9 },
        storesCustomerData: { value: true, confidence: 0.9 },
        processesSensitiveData: { value: true, confidence: 0.85 },
        scansInfrastructure: { value: true, confidence: 0.9 },
        usesAIOnCustomerData: { value: false, confidence: 0.9 }
      },
      deploymentAndIntegrationModel: {
        deploymentModes: [{ value: "Cloud / SaaS", confidence: 0.9 }],
        integrations: [{ type: "cloud", value: "azure" }]
      }
    };

    const vm = mapToReadinessViewModel(profile as any, mockFoundation, 0.9, {});
    expect(vm).not.toBeNull();
    if (vm) {
      expect(vm.operationalProfile.tenantModel.value).toBe("Multi-tenant inferred");
      expect(vm.operationalProfile.administrativeScope.value).toBe("Read-only auditor visibility");
      expect(vm.operationalProfile.administrativeScope.status).toBe("inferred");
    }
  });
});
