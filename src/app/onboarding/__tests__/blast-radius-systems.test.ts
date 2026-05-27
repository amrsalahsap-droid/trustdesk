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

describe("Blast Radius Intelligence Systems", () => {
  it("generates correct blast radius for cloud scanning systems", () => {
    const profile = {
      securityAndTrustModel: {
        procurementRiskAreas: [
          {
            key: "cloud_security_risk",
            label: "Cloud Connector Governance",
            reason: "Platform scans public cloud assets",
            severity: "HIGH",
            confidence: 0.95
          }
        ]
      }
    };

    const vm = mapToReadinessViewModel(profile as any, mockFoundation, 0.9, {});
    expect(vm).not.toBeNull();
    if (vm) {
      const risk = vm.riskAreas[0];
      expect(risk.blastRadius).toBeDefined();
      expect(risk.blastRadius?.exposureScope).toBe("Infrastructure read-only configuration scope");
      expect(risk.blastRadius?.operationalDependencyLevel).toBe("HIGH");
      expect(risk.blastRadius?.affectedAssets).toContain("Cloud API Scanners");
      expect(risk.blastRadius?.affectedDataClasses).toContain("Cloud Asset Metadata");
      expect(risk.blastRadius?.infrastructureReach).toContain("Restricted to target public cloud accounts");
      expect(risk.blastRadius?.dataVisibility).toContain("Cloud provider resource lists");
    }
  });

  it("generates correct blast radius for AI systems", () => {
    const profile = {
      securityAndTrustModel: {
        procurementRiskAreas: [
          {
            key: "ai_model_risk",
            label: "AI Processing Transparency",
            reason: "System utilizes inferences on customer metadata",
            severity: "MEDIUM",
            confidence: 0.9
          }
        ]
      }
    };

    const vm = mapToReadinessViewModel(profile as any, mockFoundation, 0.9, {});
    expect(vm).not.toBeNull();
    if (vm) {
      const risk = vm.riskAreas[0];
      expect(risk.blastRadius).toBeDefined();
      expect(risk.blastRadius?.exposureScope).toBe("AI model tailoring context and prompt-level parameters");
      expect(risk.blastRadius?.operationalDependencyLevel).toBe("MEDIUM");
      expect(risk.blastRadius?.affectedAssets).toContain("Inference Engines");
      expect(risk.blastRadius?.customerImpactSummary).toContain("model training data is entirely segmented");
      expect(risk.blastRadius?.tenantImpact).toContain("isolated to the current tenant workspace");
    }
  });

  it("generates correct blast radius for export/report systems", () => {
    const profile = {
      securityAndTrustModel: {
        procurementRiskAreas: [
          {
            key: "data_export_risk",
            label: "Compliance Report Exporting",
            reason: "Users generate PDF and CSV compliance summary files",
            severity: "HIGH",
            confidence: 0.88
          }
        ]
      }
    };

    const vm = mapToReadinessViewModel(profile as any, mockFoundation, 0.9, {});
    expect(vm).not.toBeNull();
    if (vm) {
      const risk = vm.riskAreas[0];
      expect(risk.blastRadius).toBeDefined();
      expect(risk.blastRadius?.exposureScope).toBe("Workspace-specific report packages and export artifacts");
      expect(risk.blastRadius?.operationalDependencyLevel).toBe("HIGH");
      expect(risk.blastRadius?.affectedAssets).toContain("PDF/CSV Generation workers");
      expect(risk.blastRadius?.persistenceImpact).toContain("retained in secure, time-expiring storage buckets");
    }
  });

  it("generates correct blast radius for multi-tenant SaaS systems", () => {
    const profile = {
      securityAndTrustModel: {
        procurementRiskAreas: [
          {
            key: "tenant_isolation_risk",
            label: "Workspace Access Controls",
            reason: "Workspace admin inviting reviewers and assigning roles",
            severity: "CRITICAL",
            confidence: 0.97
          }
        ]
      }
    };

    const vm = mapToReadinessViewModel(profile as any, mockFoundation, 0.9, {});
    expect(vm).not.toBeNull();
    if (vm) {
      const risk = vm.riskAreas[0];
      expect(risk.blastRadius).toBeDefined();
      expect(risk.blastRadius?.exposureScope).toBe("Workspace authorization profile and user membership limits");
      expect(risk.blastRadius?.operationalDependencyLevel).toBe("CRITICAL");
      expect(risk.blastRadius?.affectedAssets).toContain("Identity Provider Mappings");
      expect(risk.blastRadius?.tenantImpact).toContain("completely block cross-tenant exposure");
    }
  });
});
