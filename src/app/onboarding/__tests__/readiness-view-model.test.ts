
import { describe, it, expect } from "vitest";
import { mapToReadinessViewModel } from "../onboarding-view-model-mapper";
import { 
  VendorIntelligenceProfile, 
  WorkspaceFoundationResult 
} from "@/modules/workspaces/onboarding/vendor-intelligence-types";

describe("mapToReadinessViewModel", () => {
  it("enforces UI view model consistency across all sections (Regression #5)", () => {
    const mockFoundation: WorkspaceFoundationResult = {
      securityPillarsIdentifiedCount: 7,
      autoReadyTopicsCount: 0,
      reviewSuggestedTopicsCount: 2,
      needsEvidenceTopicsCount: 5,
      totalRelevantTopicsCount: 7,
      evidenceNeedsCount: 3,
      clarificationTasksCount: 4,
      answerScaffoldsReadyCount: 1,
      capabilityEvidenceCount: 10,
      sourcePagesCount: 12,
      citationsCount: 15,
      generatedTopics: [],
      evidenceNeeds: [],
      clarificationTasks: [],
      answerScaffolds: [],
      generatedTopicKeys: [],
      reviewSuggestedTopicKeys: [],
      needsEvidenceTopicKeys: [],
      generatedEvidenceNeedKeys: [],
      generatedClarificationTaskKeys: [],
      sourceRiskAreaKeys: ["risk1", "risk2"],
      sourceCapabilityKeys: [],
      sourceEvidenceRefs: [],
      warnings: []
    };

    const mockProfile = {
      securityAndTrustModel: {
        procurementRiskAreas: [
          {
            key: "cloud_security",
            label: "Cloud Integration Security",
            reason: "Uses AWS connector",
            severity: "HIGH",
            confidence: 0.9,
            recommendedTopicKeys: ["topic1"],
            evidenceRefs: []
          }
        ]
      }
    };

    const viewModel = mapToReadinessViewModel(
      mockProfile as any, 
      mockFoundation, 
      0.88, 
      {} as any
    );

    expect(viewModel).not.toBeNull();
    if (viewModel) {
      // Hero counts
      expect(viewModel.foundation.securityPillarsIdentifiedCount).toBe(7);
      expect(viewModel.foundation.autoReadyTopicsCount).toBe(0);
      expect(viewModel.foundation.clarificationTasksCount).toBe(4);

      // Summary counts
      expect(viewModel.foundation.totalRelevantTopicsCount).toBe(7);
      expect(viewModel.foundation.reviewSuggestedTopicsCount).toBe(2);
      expect(viewModel.foundation.needsEvidenceTopicsCount).toBe(5);

      // Explorer counts
      expect(viewModel.evidenceExplorer.trustTopicCount).toBe(7);
      expect(viewModel.evidenceExplorer.sourcePageCount).toBe(12);
      expect(viewModel.evidenceExplorer.riskEvidenceCount).toBe(2);
      expect(viewModel.evidenceExplorer.intelligenceCoverage).toBeGreaterThanOrEqual(45);
      expect(viewModel.evidenceExplorer.intelligenceCoverage).toBeLessThanOrEqual(99);

      // Upgraded Procurement Operational Profile Assertions
      expect(viewModel.operationalProfile.customerDataInteraction).toBeDefined();
      expect(viewModel.operationalProfile.customerDataInteraction.status).toBeDefined();
      expect(viewModel.operationalProfile.customerDataInteraction.evidence).toBeDefined();

      expect(viewModel.operationalProfile.connectorScope).toBeDefined();
      expect(viewModel.operationalProfile.infrastructureInteraction).toBeDefined();
      expect(viewModel.operationalProfile.aiInteractionModel).toBeDefined();
      expect(viewModel.operationalProfile.persistenceBehavior).toBeDefined();
      expect(viewModel.operationalProfile.tenantModel.value).toBe("Multi-tenant inferred");
      expect(viewModel.operationalProfile.supportVisibility.value).toBe("Not confirmed");
      expect(viewModel.operationalProfile.exportability.value).toBe("Standard reports (PDF / XLSX)");
      expect(viewModel.operationalProfile.scanningBehavior).toBeDefined();
      expect(viewModel.operationalProfile.administrativeScope).toBeDefined();

      // Mapped Blast Radius Assertions
      expect(viewModel.riskAreas[0].blastRadius).toBeDefined();
      expect(viewModel.riskAreas[0].blastRadius?.exposureScope).toBe("Infrastructure read-only configuration scope");
      expect(viewModel.riskAreas[0].blastRadius?.operationalDependencyLevel).toBe("HIGH");
    }
  });
});
