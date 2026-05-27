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

describe("Evidence Authority Evaluation", () => {
  it("scores trust center evidence correctly", () => {
    const profile = {
      productsAndServices: {
        capabilities: [
          {
            key: "sensitive_data_discovery",
            label: "Sensitive Data Discovery",
            confidence: 0.95,
            evidenceRefs: [
              {
                url: "https://trust.cybral.com/security-architecture",
                title: "Cybral Trust Center - Security Policies",
                snippet: "All indexed tenant data is logically isolated using separate database schemas.",
                confidence: 0.96
              }
            ]
          }
        ]
      }
    };

    const vm = mapToReadinessViewModel(profile as any, mockFoundation, 0.95, {});
    expect(vm).not.toBeNull();
    if (vm) {
      const cap = vm.capabilities[0];
      expect(cap.evidenceRefs).toBeDefined();
      expect(cap.evidenceRefs?.length).toBe(1);

      const ref = cap.evidenceRefs?.[0];
      expect(ref?.authority).toBeDefined();
      expect(ref?.authority?.sourceType).toBe("Trust Center Details");
      expect(ref?.authority?.authorityLevel).toBe("AUTHORITATIVE");
      expect(ref?.authority?.confidenceImpact).toBe("+25%");
      expect(ref?.authority?.evidenceQuality).toBe("Authoritative Documentation");
      expect(ref?.authority?.whyTrusted).toContain("Direct operational security disclosures");
    }
  });

  it("scores API and developer documentation correctly", () => {
    const profile = {
      productsAndServices: {
        capabilities: [
          {
            key: "cloud_scanning",
            label: "Cloud Scanner API",
            confidence: 0.9,
            evidenceRefs: [
              {
                url: "https://docs.cybral.com/api/v1/scanners",
                title: "Cybral API Documentation - Scanner Limits",
                snippet: "Assumed IAM roles require strict read-only permissions for AWS assets.",
                confidence: 0.94
              }
            ]
          }
        ]
      }
    };

    const vm = mapToReadinessViewModel(profile as any, mockFoundation, 0.95, {});
    expect(vm).not.toBeNull();
    if (vm) {
      const cap = vm.capabilities[0];
      const ref = cap.evidenceRefs?.[0];
      expect(ref?.authority).toBeDefined();
      expect(ref?.authority?.sourceType).toBe("API Documentation");
      expect(ref?.authority?.authorityLevel).toBe("HIGH");
      expect(ref?.authority?.confidenceImpact).toBe("+18%");
      expect(ref?.authority?.evidenceQuality).toBe("Direct Technical Doc");
    }
  });

  it("scores homepage marketing copy correctly", () => {
    const profile = {
      productsAndServices: {
        capabilities: [
          {
            key: "compliance_management",
            label: "Compliance Management",
            confidence: 0.8,
            evidenceRefs: [
              {
                url: "https://cybral.com/marketing",
                title: "Cybral Homepage - Standard Features",
                snippet: "We offer complete compliance dashboards for modern enterprise teams.",
                confidence: 0.82
              }
            ]
          }
        ]
      }
    };

    const vm = mapToReadinessViewModel(profile as any, mockFoundation, 0.95, {});
    expect(vm).not.toBeNull();
    if (vm) {
      const cap = vm.capabilities[0];
      const ref = cap.evidenceRefs?.[0];
      expect(ref?.authority).toBeDefined();
      expect(ref?.authority?.sourceType).toBe("Homepage Marketing Copy");
      expect(ref?.authority?.authorityLevel).toBe("LOW");
      expect(ref?.authority?.confidenceImpact).toBe("+3%");
      expect(ref?.authority?.evidenceQuality).toBe("Marketing Assertion");
    }
  });

  it("scores conflicting evidence or unconfirmed technical claims correctly", () => {
    const profile = {
      productsAndServices: {
        capabilities: [
          {
            key: "model_tailoring",
            label: "Model Tailoring Risks",
            confidence: 0.6,
            evidenceRefs: [
              {
                url: "https://cybral.com/terms/unclear-model-usage",
                title: "Unconfirmed AI Model Persistence Details",
                snippet: "It is currently contradictive or unconfirmed whether tailoring logs persist indefinitely.",
                confidence: 0.55
              }
            ]
          }
        ]
      }
    };

    const vm = mapToReadinessViewModel(profile as any, mockFoundation, 0.95, {});
    expect(vm).not.toBeNull();
    if (vm) {
      const cap = vm.capabilities[0];
      const ref = cap.evidenceRefs?.[0];
      expect(ref?.authority).toBeDefined();
      expect(ref?.authority?.sourceType).toBe("Conflicting Signals");
      expect(ref?.authority?.authorityLevel).toBe("LOW");
      expect(ref?.authority?.confidenceImpact).toBe("-15%");
      expect(ref?.authority?.evidenceQuality).toBe("Conflicting Technical Claim");
    }
  });
});
