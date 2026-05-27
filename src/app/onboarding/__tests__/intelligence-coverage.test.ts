import { describe, it, expect } from "vitest";
import { mapToReadinessViewModel } from "../onboarding-view-model-mapper";
import { WorkspaceFoundationResult } from "@/modules/workspaces/onboarding/vendor-intelligence-types";

describe("Intelligence Coverage Decoupling", () => {
  it("computes high coverage for a highly documented domain", () => {
    const mockFoundation: WorkspaceFoundationResult = {
      securityPillarsIdentifiedCount: 5,
      autoReadyTopicsCount: 2,
      reviewSuggestedTopicsCount: 2,
      needsEvidenceTopicsCount: 1,
      totalRelevantTopicsCount: 12, // high topic count
      evidenceNeedsCount: 2,
      clarificationTasksCount: 2,
      answerScaffoldsReadyCount: 1,
      capabilityEvidenceCount: 5,
      sourcePagesCount: 25, // high source pages
      citationsCount: 40, // high citations
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

    const profile = {
      productsAndServices: {
        capabilities: [
          {
            key: "sensitive_data_discovery",
            label: "Sensitive Data Discovery",
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

    const vm = mapToReadinessViewModel(profile as any, mockFoundation, 0.9, {});
    expect(vm).not.toBeNull();
    if (vm) {
      // With high count of pages, citations, topics, and authoritative source, coverage should be very high
      expect(vm.evidenceExplorer.intelligenceCoverage).toBeGreaterThanOrEqual(85);
    }
  });

  it("computes low coverage for a sparse domain", () => {
    const mockFoundation: WorkspaceFoundationResult = {
      securityPillarsIdentifiedCount: 1,
      autoReadyTopicsCount: 0,
      reviewSuggestedTopicsCount: 0,
      needsEvidenceTopicsCount: 1,
      totalRelevantTopicsCount: 1, // sparse
      evidenceNeedsCount: 0,
      clarificationTasksCount: 0,
      answerScaffoldsReadyCount: 0,
      capabilityEvidenceCount: 1,
      sourcePagesCount: 1, // sparse
      citationsCount: 1, // sparse
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

    const profile = {
      productsAndServices: {
        capabilities: []
      }
    };

    const vm = mapToReadinessViewModel(profile as any, mockFoundation, 0.5, {});
    expect(vm).not.toBeNull();
    if (vm) {
      expect(vm.evidenceExplorer.intelligenceCoverage).toBeLessThanOrEqual(55);
    }
  });

  it("handles weak evidence + high coverage correctly", () => {
    const mockFoundation: WorkspaceFoundationResult = {
      securityPillarsIdentifiedCount: 4,
      autoReadyTopicsCount: 1,
      reviewSuggestedTopicsCount: 1,
      needsEvidenceTopicsCount: 2,
      totalRelevantTopicsCount: 8,
      evidenceNeedsCount: 2,
      clarificationTasksCount: 2,
      answerScaffoldsReadyCount: 1,
      capabilityEvidenceCount: 5,
      sourcePagesCount: 18, // high page count
      citationsCount: 20, // high citations count
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

    // Capabilties contain marketing-only copy (weak evidence!)
    const profile = {
      productsAndServices: {
        capabilities: [
          {
            key: "compliance_management",
            label: "Compliance Management",
            confidence: 0.8,
            evidenceRefs: [
              {
                url: "https://cybral.com/marketing-features",
                title: "Cybral Homepage - Standard Features",
                snippet: "We offer complete compliance dashboards for modern enterprise teams.",
                confidence: 0.82
              }
            ]
          }
        ]
      }
    };

    const vm = mapToReadinessViewModel(profile as any, mockFoundation, 0.7, {});
    expect(vm).not.toBeNull();
    if (vm) {
      // Evidence quality remains low (weak!)
      expect(vm.capabilities[0].evidenceStrength).toBe("Detected");

      // But intelligence coverage is high due to comprehensive scan crawl completeness
      expect(vm.evidenceExplorer.intelligenceCoverage).toBeGreaterThanOrEqual(70);
    }
  });

  it("handles strong evidence + low coverage correctly", () => {
    const mockFoundation: WorkspaceFoundationResult = {
      securityPillarsIdentifiedCount: 2,
      autoReadyTopicsCount: 1,
      reviewSuggestedTopicsCount: 0,
      needsEvidenceTopicsCount: 1,
      totalRelevantTopicsCount: 1,
      evidenceNeedsCount: 1,
      clarificationTasksCount: 1,
      answerScaffoldsReadyCount: 1,
      capabilityEvidenceCount: 2,
      sourcePagesCount: 1, // very low crawl coverage!
      citationsCount: 1,
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

    // Scanned document is highly authoritative (strong evidence!)
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
      // Capabilitiy strength is strong/authoritative
      expect(vm.capabilities[0].evidenceStrength).toBe("Strong");

      // But intelligence coverage remains low due to sparse crawling footprint
      expect(vm.evidenceExplorer.intelligenceCoverage).toBeLessThanOrEqual(70);
    }
  });
});
