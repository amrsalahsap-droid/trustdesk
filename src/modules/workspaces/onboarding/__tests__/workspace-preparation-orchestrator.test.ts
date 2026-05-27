/**
 * Tests for Workspace Preparation Orchestrator
 * 
 * Tests the master orchestrator that coordinates all workspace preparation systems
 */

import { WorkspacePreparationOrchestrator } from "../workspace-preparation-orchestrator";
import { prisma } from "@/lib/db/prisma";
import { WorkspacePreparationService } from "../workspace-preparation-service";
import { EvidenceOrchestrationService } from "../evidence-orchestration-service";
import { WorkflowOrchestrationService } from "../workflow-orchestration-service";
import { RecommendationOrchestrator } from "../recommendation-orchestrator";

// Mock dependencies
jest.mock("@/lib/db/prisma");
jest.mock("@/lib/logging/logger");
jest.mock("@/lib/audit");
jest.mock("../workspace-preparation-service");
jest.mock("../evidence-orchestration-service");
jest.mock("../workflow-orchestration-service");
jest.mock("../recommendation-orchestrator");

describe("WorkspacePreparationOrchestrator", () => {
  const mockWorkspaceId = "test-workspace-id";
  const mockUserId = "test-user-id";
  const mockSessionId = "test-session-123";

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("orchestrateWorkspacePreparation", () => {
    it("should execute all stages successfully", async () => {
      // Mock workspace
      const mockWorkspace = {
        id: mockWorkspaceId,
        industry: ["enterprise"],
        productType: ["saas"],
        customerSegment: ["enterprise"],
        complianceTargets: ["soc2"],
        deepProfileJson: {},
      };

      // Mock workspace lookup
      (prisma.workspace.findUnique as jest.Mock).mockResolvedValue(mockWorkspace);

      // Mock no existing state
      (prisma.workspace.findUnique as jest.Mock)
        .mockResolvedValueOnce(mockWorkspace)
        .mockResolvedValueOnce({ onboardingIntelMetaJson: null })
        .mockResolvedValue({ onboardingIntelMetaJson: {} });

      // Mock individual service responses
      (WorkspacePreparationService.prepareWorkspace as jest.Mock).mockResolvedValue({
        topicsActivated: 3,
        categoriesCreated: 2,
        scaffoldingCreated: 8,
        skippedExisting: 0,
        errors: [],
        warnings: [],
      });

      (EvidenceOrchestrationService.orchestrateEvidence as jest.Mock).mockResolvedValue({
        documentType: "soc2_report",
        category: "Compliance",
        linkedTopics: ["enterprise_saas_security"],
        readinessImpact: { readinessScoreDelta: 0.1 },
        errors: [],
        warnings: [],
      });

      (WorkflowOrchestrationService.orchestrateWorkflows as jest.Mock).mockResolvedValue({
        postureDetection: { governanceSensitivity: "high" },
        configuredDefaults: { approvalWorkflow: { enabled: true } },
        reviewerRecommendations: [],
        appliedSettings: ["approvalWorkflow.enabled"],
        errors: [],
        warnings: [],
      });

      (RecommendationOrchestrator.generateRecommendations as jest.Mock).mockResolvedValue([
        { id: "rec1", type: "upload_documents" },
      ]);

      // Mock documents for evidence orchestration
      (prisma.sourceDocument.findMany as jest.Mock).mockResolvedValue([
        {
          id: "doc1",
          originalName: "SOC2.pdf",
          uploadStatus: "UPLOADED",
          content: { fullText: "SOC2 compliance report" },
        },
      ]);

      // Mock Answer Library items
      (prisma.answerLibraryItem.findMany as jest.Mock).mockResolvedValue([
        { id: "item1" },
        { id: "item2" },
      ]);

      // Mock workspace updates
      (prisma.workspace.update as jest.Mock).mockResolvedValue({});

      const request = {
        workspaceId: mockWorkspaceId,
        userId: mockUserId,
        selectedTopicKeys: new Set(["api_security", "encryption_at_rest"]),
        recommendedTopicPacks: [],
        profileSignals: {
          industry: ["enterprise"],
          productType: ["saas"],
          customerSegment: ["enterprise"],
          complianceTargets: ["soc2"],
        },
        onboardingSessionId: mockSessionId,
        options: {
          forceRerun: false,
          skipEvidenceOrchestration: false,
          skipWorkflowConfiguration: false,
          retryFailedStages: false,
        },
      };

      // Execute
      const result = await WorkspacePreparationOrchestrator.orchestrateWorkspacePreparation(request);

      // Assertions
      expect(result.success).toBe(true);
      expect(result.summary.completedStages).toBe(7);
      expect(result.summary.failedStages).toBe(0);
      expect(result.summary.totalEntities).toBeGreaterThan(0);
      expect(result.finalState.currentStage).toBe("onboarding_completed");
      expect(result.finalState.completedStages).toHaveLength(7);

      // Verify all stages were executed
      expect(WorkspacePreparationService.prepareWorkspace).toHaveBeenCalled();
      expect(EvidenceOrchestrationService.orchestrateEvidence).toHaveBeenCalled();
      expect(WorkflowOrchestrationService.orchestrateWorkflows).toHaveBeenCalled();
      expect(RecommendationOrchestrator.generateRecommendations).toHaveBeenCalled();

      // Verify state persistence
      expect(prisma.workspace.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockWorkspaceId },
          data: expect.objectContaining({
            onboardingIntelMetaJson: expect.objectContaining({
              workspacePreparation: expect.any(Object),
            }),
          }),
        })
      );
    });

    it("should skip completed stages when not forcing rerun", async () => {
      const mockWorkspace = {
        id: mockWorkspaceId,
        industry: ["enterprise"],
        productType: ["saas"],
      };

      // Mock existing completed state
      const existingState = {
        workspaceId: mockWorkspaceId,
        currentStage: "answer_library_seeded",
        completedStages: ["profile_confirmed", "topics_applied", "answer_library_seeded"],
        failedStages: [],
        appliedTopics: ["api_security"],
        generatedCategories: ["security"],
        linkedEvidence: [],
        autoConfiguredSettings: [],
        onboardingGenerationMetadata: {
          source: "onboarding",
          version: "1.0.0",
          sessionId: "previous-session",
          generatedAt: new Date().toISOString(),
        },
        lastPreparedAt: new Date(),
        preparationVersion: "1.0.0",
        errors: [],
        warnings: [],
        diagnostics: {},
      };

      (prisma.workspace.findUnique as jest.Mock)
        .mockResolvedValueOnce(mockWorkspace)
        .mockResolvedValueOnce({ onboardingIntelMetaJson: { workspacePreparation: existingState } })
        .mockResolvedValue({ onboardingIntelMetaJson: {} });

      (prisma.sourceDocument.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.answerLibraryItem.findMany as jest.Mock).mockResolvedValue([]);
      (WorkflowOrchestrationService.orchestrateWorkflows as jest.Mock).mockResolvedValue({
        appliedSettings: ["approvalWorkflow.enabled"],
        errors: [],
        warnings: [],
      });
      (RecommendationOrchestrator.generateRecommendations as jest.Mock).mockResolvedValue([]);
      (prisma.workspace.update as jest.Mock).mockResolvedValue({});

      const request = {
        workspaceId: mockWorkspaceId,
        userId: mockUserId,
        selectedTopicKeys: new Set(["api_security"]),
        recommendedTopicPacks: [],
        profileSignals: {},
        onboardingSessionId: mockSessionId,
        options: {
          forceRerun: false,
          skipEvidenceOrchestration: false,
          skipWorkflowConfiguration: false,
          retryFailedStages: false,
        },
      };

      const result = await WorkspacePreparationOrchestrator.orchestrateWorkspacePreparation(request);

      // Should only execute remaining stages
      expect(result.summary.completedStages).toBeGreaterThan(3);
      expect(WorkspacePreparationService.prepareWorkspace).not.toHaveBeenCalled();
      expect(WorkflowOrchestrationService.orchestrateWorkflows).toHaveBeenCalled();
    });

    it("should handle stage failures gracefully", async () => {
      const mockWorkspace = {
        id: mockWorkspaceId,
        industry: ["enterprise"],
        productType: ["saas"],
      };

      (prisma.workspace.findUnique as jest.Mock)
        .mockResolvedValueOnce(mockWorkspace)
        .mockResolvedValueOnce({ onboardingIntelMetaJson: null })
        .mockResolvedValue({ onboardingIntelMetaJson: {} });

      // Mock failure in topics application
      (WorkspacePreparationService.prepareWorkspace as jest.Mock).mockResolvedValue({
        topicsActivated: 0,
        categoriesCreated: 0,
        scaffoldingCreated: 0,
        skippedExisting: 0,
        errors: ["Failed to apply topics"],
        warnings: [],
      });

      // Mock success in other stages
      (prisma.answerLibraryItem.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.sourceDocument.findMany as jest.Mock).mockResolvedValue([]);
      (WorkflowOrchestrationService.orchestrateWorkflows as jest.Mock).mockResolvedValue({
        appliedSettings: [],
        errors: [],
        warnings: [],
      });
      (RecommendationOrchestrator.generateRecommendations as jest.Mock).mockResolvedValue([]);
      (prisma.workspace.update as jest.Mock).mockResolvedValue({});

      const request = {
        workspaceId: mockWorkspaceId,
        userId: mockUserId,
        selectedTopicKeys: new Set(["api_security"]),
        recommendedTopicPacks: [],
        profileSignals: {},
        onboardingSessionId: mockSessionId,
        options: {
          forceRerun: false,
          skipEvidenceOrchestration: false,
          skipWorkflowConfiguration: false,
          retryFailedStages: false,
        },
      };

      const result = await WorkspacePreparationOrchestrator.orchestrateWorkspacePreparation(request);

      expect(result.success).toBe(false);
      expect(result.summary.failedStages).toBeGreaterThan(0);
      expect(result.finalState.failedStages).toContain("topics_applied");
      expect(result.finalState.errors).toContain("Failed to apply topics");

      // Should continue with other stages
      expect(result.summary.completedStages).toBeGreaterThan(0);
    });

    it("should respect skip options", async () => {
      const mockWorkspace = {
        id: mockWorkspaceId,
        industry: ["enterprise"],
        productType: ["saas"],
      };

      (prisma.workspace.findUnique as jest.Mock)
        .mockResolvedValueOnce(mockWorkspace)
        .mockResolvedValueOnce({ onboardingIntelMetaJson: null })
        .mockResolvedValue({ onboardingIntelMetaJson: {} });

      (WorkspacePreparationService.prepareWorkspace as jest.Mock).mockResolvedValue({
        topicsActivated: 2,
        categoriesCreated: 1,
        scaffoldingCreated: 4,
        skippedExisting: 0,
        errors: [],
        warnings: [],
      });

      (prisma.answerLibraryItem.findMany as jest.Mock).mockResolvedValue([]);
      (RecommendationOrchestrator.generateRecommendations as jest.Mock).mockResolvedValue([]);
      (prisma.workspace.update as jest.Mock).mockResolvedValue({});

      const request = {
        workspaceId: mockWorkspaceId,
        userId: mockUserId,
        selectedTopicKeys: new Set(["api_security"]),
        recommendedTopicPacks: [],
        profileSignals: {},
        onboardingSessionId: mockSessionId,
        options: {
          forceRerun: false,
          skipEvidenceOrchestration: true,
          skipWorkflowConfiguration: true,
          retryFailedStages: false,
        },
      };

      const result = await WorkspacePreparationOrchestrator.orchestrateWorkspacePreparation(request);

      expect(result.success).toBe(true);
      expect(EvidenceOrchestrationService.orchestrateEvidence).not.toHaveBeenCalled();
      expect(WorkflowOrchestrationService.orchestrateWorkflows).not.toHaveBeenCalled();

      // Should have warnings for skipped stages
      const evidenceStage = result.stageResults.evidence_prepared;
      const workflowStage = result.stageResults.workflows_configured;
      expect(evidenceStage.warnings).toContain("Evidence orchestration skipped");
      expect(workflowStage.warnings).toContain("Workflow configuration skipped");
    });
  });

  describe("individual stage execution", () => {
    it("should execute profile confirmation successfully", async () => {
      const mockWorkspace = {
        id: mockWorkspaceId,
        industry: ["enterprise"],
        productType: ["saas"],
        customerSegment: ["enterprise"],
        complianceTargets: ["soc2"],
        deepProfileJson: {},
      };

      (prisma.workspace.findUnique as jest.Mock).mockResolvedValue(mockWorkspace);

      const result = await WorkspacePreparationOrchestrator.orchestrateWorkspacePreparation({
        workspaceId: mockWorkspaceId,
        userId: mockUserId,
        selectedTopicKeys: new Set(),
        recommendedTopicPacks: [],
        profileSignals: { industry: ["enterprise"] },
        onboardingSessionId: mockSessionId,
        options: {},
      });

      expect(result.stageResults.profile_confirmed.success).toBe(true);
      expect(result.stageResults.profile_confirmed.entities).toBe(1);
    });

    it("should fail profile confirmation with no signals", async () => {
      const mockWorkspace = {
        id: mockWorkspaceId,
        industry: [],
        productType: [],
        customerSegment: [],
        complianceTargets: [],
        deepProfileJson: null,
      };

      (prisma.workspace.findUnique as jest.Mock).mockResolvedValue(mockWorkspace);

      const result = await WorkspacePreparationOrchestrator.orchestrateWorkspacePreparation({
        workspaceId: mockWorkspaceId,
        userId: mockUserId,
        selectedTopicKeys: new Set(),
        recommendedTopicPacks: [],
        profileSignals: {},
        onboardingSessionId: mockSessionId,
        options: {},
      });

      expect(result.stageResults.profile_confirmed.success).toBe(false);
      expect(result.stageResults.profile_confirmed.errors).toContain("No profile signals found");
    });
  });

  describe("state management", () => {
    it("should persist preparation state after successful stages", async () => {
      const mockWorkspace = {
        id: mockWorkspaceId,
        industry: ["enterprise"],
        productType: ["saas"],
      };

      (prisma.workspace.findUnique as jest.Mock)
        .mockResolvedValueOnce(mockWorkspace)
        .mockResolvedValueOnce({ onboardingIntelMetaJson: null })
        .mockResolvedValue({ onboardingIntelMetaJson: {} });

      (WorkspacePreparationService.prepareWorkspace as jest.Mock).mockResolvedValue({
        topicsActivated: 2,
        categoriesCreated: 1,
        scaffoldingCreated: 4,
        skippedExisting: 0,
        errors: [],
        warnings: [],
      });

      (prisma.answerLibraryItem.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.sourceDocument.findMany as jest.Mock).mockResolvedValue([]);
      (WorkflowOrchestrationService.orchestrateWorkflows as jest.Mock).mockResolvedValue({
        appliedSettings: [],
        errors: [],
        warnings: [],
      });
      (RecommendationOrchestrator.generateRecommendations as jest.Mock).mockResolvedValue([]);
      (prisma.workspace.update as jest.Mock).mockResolvedValue({});

      const request = {
        workspaceId: mockWorkspaceId,
        userId: mockUserId,
        selectedTopicKeys: new Set(["api_security"]),
        recommendedTopicPacks: [],
        profileSignals: {},
        onboardingSessionId: mockSessionId,
        options: {},
      };

      await WorkspacePreparationOrchestrator.orchestrateWorkspacePreparation(request);

      // Verify state was persisted multiple times (after each successful stage)
      expect(prisma.workspace.update).toHaveBeenCalledTimes(
        expect.any(Number) // Should be called after each stage + final state
      );
    });

    it("should retrieve existing preparation state", async () => {
      const existingState = {
        workspaceId: mockWorkspaceId,
        currentStage: "topics_applied",
        completedStages: ["profile_confirmed"],
        failedStages: [],
        appliedTopics: ["api_security"],
        generatedCategories: ["security"],
        linkedEvidence: [],
        autoConfiguredSettings: [],
        onboardingGenerationMetadata: {
          source: "onboarding",
          version: "1.0.0",
          sessionId: "previous-session",
          generatedAt: new Date().toISOString(),
        },
        lastPreparedAt: new Date(),
        preparationVersion: "1.0.0",
        errors: [],
        warnings: [],
        diagnostics: {},
      };

      (prisma.workspace.findUnique as jest.Mock).mockResolvedValue({
        onboardingIntelMetaJson: { workspacePreparation: existingState },
      });

      const state = await WorkspacePreparationOrchestrator.getPreparationStatus(mockWorkspaceId);

      expect(state).toEqual(existingState);
    });

    it("should return null when no preparation state exists", async () => {
      (prisma.workspace.findUnique as jest.Mock).mockResolvedValue({
        onboardingIntelMetaJson: {},
      });

      const state = await WorkspacePreparationOrchestrator.getPreparationStatus(mockWorkspaceId);

      expect(state).toBeNull();
    });
  });

  describe("retry functionality", () => {
    it("should retry failed stages", async () => {
      const failedState = {
        workspaceId: mockWorkspaceId,
        currentStage: "evidence_prepared",
        completedStages: ["profile_confirmed", "topics_applied", "answer_library_seeded"],
        failedStages: ["evidence_prepared", "workflows_configured"],
        appliedTopics: ["api_security"],
        generatedCategories: ["security"],
        linkedEvidence: [],
        autoConfiguredSettings: [],
        onboardingGenerationMetadata: {
          source: "onboarding",
          version: "1.0.0",
          sessionId: "previous-session",
          generatedAt: new Date().toISOString(),
        },
        lastPreparedAt: new Date(),
        preparationVersion: "1.0.0",
        errors: ["Previous failures"],
        warnings: [],
        diagnostics: {},
      };

      const mockWorkspace = {
        id: mockWorkspaceId,
        industry: ["enterprise"],
        productType: ["saas"],
      };

      (prisma.workspace.findUnique as jest.Mock)
        .mockResolvedValueOnce(mockWorkspace)
        .mockResolvedValueOnce({ onboardingIntelMetaJson: { workspacePreparation: failedState } })
        .mockResolvedValue({ onboardingIntelMetaJson: {} });

      // Mock successful retry
      (prisma.sourceDocument.findMany as jest.Mock).mockResolvedValue([]);
      (EvidenceOrchestrationService.orchestrateEvidence as jest.Mock).mockResolvedValue({
        errors: [],
        warnings: [],
      });
      (WorkflowOrchestrationService.orchestrateWorkflows as jest.Mock).mockResolvedValue({
        appliedSettings: ["approvalWorkflow.enabled"],
        errors: [],
        warnings: [],
      });
      (RecommendationOrchestrator.generateRecommendations as jest.Mock).mockResolvedValue([]);
      (prisma.workspace.update as jest.Mock).mockResolvedValue({});

      const result = await WorkspacePreparationOrchestrator.retryFailedStages(mockWorkspaceId, mockUserId);

      expect(result).not.toBeNull();
      expect(result!.success).toBe(true);
      expect(result!.summary.completedStages).toBeGreaterThan(3);
    });

    it("should return null when no failed stages exist", async () => {
      const completedState = {
        workspaceId: mockWorkspaceId,
        currentStage: "onboarding_completed",
        completedStages: ["profile_confirmed", "topics_applied", "answer_library_seeded", "evidence_prepared", "workflows_configured", "readiness_updated", "onboarding_completed"],
        failedStages: [],
        appliedTopics: ["api_security"],
        generatedCategories: ["security"],
        linkedEvidence: [],
        autoConfiguredSettings: [],
        onboardingGenerationMetadata: {
          source: "onboarding",
          version: "1.0.0",
          sessionId: "session-123",
          generatedAt: new Date().toISOString(),
        },
        lastPreparedAt: new Date(),
        preparationVersion: "1.0.0",
        errors: [],
        warnings: [],
        diagnostics: {},
      };

      (prisma.workspace.findUnique as jest.Mock).mockResolvedValue({
        onboardingIntelMetaJson: { workspacePreparation: completedState },
      });

      const result = await WorkspacePreparationOrchestrator.retryFailedStages(mockWorkspaceId, mockUserId);

      expect(result).toBeNull();
    });
  });

  describe("reset functionality", () => {
    it("should reset preparation state successfully", async () => {
      const mockMetadata = {
        workspacePreparation: {
          workspaceId: mockWorkspaceId,
          completedStages: ["profile_confirmed"],
        },
        otherData: "preserve this",
      };

      (prisma.workspace.findUnique as jest.Mock).mockResolvedValue({
        onboardingIntelMetaJson: mockMetadata,
      });

      (prisma.workspace.update as jest.Mock).mockResolvedValue({});

      const result = await WorkspacePreparationOrchestrator.resetPreparationState(mockWorkspaceId, mockUserId);

      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);

      expect(prisma.workspace.update).toHaveBeenCalledWith({
        where: { id: mockWorkspaceId },
        data: {
          onboardingIntelMetaJson: {
            otherData: "preserve this",
          },
        },
      });
    });

    it("should handle reset errors gracefully", async () => {
      (prisma.workspace.findUnique as jest.Mock).mockRejectedValue(new Error("Database error"));

      const result = await WorkspacePreparationOrchestrator.resetPreparationState(mockWorkspaceId, mockUserId);

      expect(result.success).toBe(false);
      expect(result.errors).toContain("Reset failed: Database error");
    });
  });

  describe("next actions generation", () => {
    it("should generate appropriate next actions for successful completion", async () => {
      const mockWorkspace = {
        id: mockWorkspaceId,
        industry: ["enterprise"],
        productType: ["saas"],
      };

      (prisma.workspace.findUnique as jest.Mock)
        .mockResolvedValueOnce(mockWorkspace)
        .mockResolvedValueOnce({ onboardingIntelMetaJson: null })
        .mockResolvedValue({ onboardingIntelMetaJson: {} });

      (WorkspacePreparationService.prepareWorkspace as jest.Mock).mockResolvedValue({
        topicsActivated: 3,
        categoriesCreated: 2,
        scaffoldingCreated: 8,
        skippedExisting: 0,
        errors: [],
        warnings: [],
      });

      (prisma.answerLibraryItem.findMany as jest.Mock).mockResolvedValue([{ id: "item1" }]);
      (prisma.sourceDocument.findMany as jest.Mock).mockResolvedValue([{ id: "doc1" }]);
      (WorkflowOrchestrationService.orchestrateWorkflows as jest.Mock).mockResolvedValue({
        appliedSettings: ["approvalWorkflow.enabled"],
        errors: [],
        warnings: [],
      });
      (RecommendationOrchestrator.generateRecommendations as jest.Mock).mockResolvedValue([]);
      (prisma.workspace.update as jest.Mock).mockResolvedValue({});

      const request = {
        workspaceId: mockWorkspaceId,
        userId: mockUserId,
        selectedTopicKeys: new Set(["api_security"]),
        recommendedTopicPacks: [],
        profileSignals: {},
        onboardingSessionId: mockSessionId,
        options: {},
      };

      const result = await WorkspacePreparationOrchestrator.orchestrateWorkspacePreparation(request);

      expect(result.nextActions).toContain("Workspace preparation completed successfully");
      expect(result.nextActions).toContain("Begin questionnaire imports and answer development");
    });

    it("should generate retry actions for failed stages", async () => {
      const mockWorkspace = {
        id: mockWorkspaceId,
        industry: ["enterprise"],
        productType: ["saas"],
      };

      (prisma.workspace.findUnique as jest.Mock)
        .mockResolvedValueOnce(mockWorkspace)
        .mockResolvedValueOnce({ onboardingIntelMetaJson: null })
        .mockResolvedValue({ onboardingIntelMetaJson: {} });

      (WorkspacePreparationService.prepareWorkspace as jest.Mock).mockResolvedValue({
        topicsActivated: 0,
        categoriesCreated: 0,
        scaffoldingCreated: 0,
        skippedExisting: 0,
        errors: ["Failed to apply topics"],
        warnings: [],
      });

      (prisma.answerLibraryItem.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.sourceDocument.findMany as jest.Mock).mockResolvedValue([]);
      (WorkflowOrchestrationService.orchestrateWorkflows as jest.Mock).mockResolvedValue({
        appliedSettings: [],
        errors: [],
        warnings: [],
      });
      (RecommendationOrchestrator.generateRecommendations as jest.Mock).mockResolvedValue([]);
      (prisma.workspace.update as jest.Mock).mockResolvedValue({});

      const request = {
        workspaceId: mockWorkspaceId,
        userId: mockUserId,
        selectedTopicKeys: new Set(["api_security"]),
        recommendedTopicPacks: [],
        profileSignals: {},
        onboardingSessionId: mockSessionId,
        options: {},
      };

      const result = await WorkspacePreparationOrchestrator.orchestrateWorkspacePreparation(request);

      expect(result.nextActions).toContain("Retry failed stages: topics_applied");
    });
  });
});
