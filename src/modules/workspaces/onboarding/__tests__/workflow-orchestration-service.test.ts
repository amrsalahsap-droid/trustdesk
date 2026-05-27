/**
 * Tests for Workflow Orchestration Service
 * 
 * Tests the automatic workflow configuration from onboarding profile signals
 */

import { WorkflowOrchestrationService } from "../workflow-orchestration-service";
import { prisma } from "@/lib/db/prisma";

// Mock dependencies
jest.mock("@/lib/db/prisma");
jest.mock("@/lib/logging/logger");
jest.mock("@/lib/audit");

describe("WorkflowOrchestrationService", () => {
  const mockWorkspaceId = "test-workspace-id";
  const mockUserId = "test-user-id";
  const mockSessionId = "test-session-123";

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("orchestrateWorkflows", () => {
    it("should detect enterprise posture and configure workflows", async () => {
      // Mock workspace
      const mockWorkspace = {
        id: mockWorkspaceId,
        name: "Enterprise Corp",
        website: "https://enterprise.com",
        industry: ["enterprise", "b2b"],
        productType: ["saas"],
        customerSegment: ["enterprise"],
        complianceTargets: ["soc2", "iso27001"],
      };

      // Mock workspace lookup
      (prisma.workspace.findUnique as jest.Mock).mockResolvedValue(mockWorkspace);

      // Mock workspace update for settings
      (prisma.workspace.update as jest.Mock).mockResolvedValue({});

      // Mock workspace update for metadata
      (prisma.workspace.update as jest.Mock).mockResolvedValue({});

      const profileSignals = {
        industry: ["enterprise", "b2b"],
        productType: ["saas"],
        customerSegment: ["enterprise"],
        complianceTargets: ["soc2", "iso27001"],
        deepProfileJson: { analysis: "enterprise detected" },
      };

      // Execute
      const result = await WorkflowOrchestrationService.orchestrateWorkflows(
        mockWorkspaceId,
        mockUserId,
        profileSignals,
        {
          orchestrationSessionId: mockSessionId,
        }
      );

      // Assertions
      expect(result.postureDetection.isEnterprise).toBe(true);
      expect(result.postureDetection.isB2B).toBe(true);
      expect(result.postureDetection.hasComplianceRequirements).toBe(true);
      expect(result.postureDetection.governanceSensitivity).toBe("high");
      expect(result.postureDetection.confidence).toBeGreaterThan(0.8);

      expect(result.configuredDefaults.approvalWorkflow.enabled).toBe(true);
      expect(result.configuredDefaults.approvalWorkflow.requiredApprovers).toBe(2);
      expect(result.configuredDefaults.exportSettings.evidenceBacked).toBe(true);
      expect(result.configuredDefaults.exportSettings.reviewBeforeExport).toBe(true);
      expect(result.configuredDefaults.governanceSettings.enabled).toBe(true);

      expect(result.reviewerRecommendations).toHaveLength(3);
      expect(result.reviewerRecommendations[0].type).toBe("security");
      expect(result.reviewerRecommendations[0].required).toBe(true);
      expect(result.reviewerRecommendations[1].type).toBe("compliance");
      expect(result.reviewerRecommendations[1].required).toBe(true);

      expect(result.appliedSettings).toContain("approvalWorkflow.enabled");
      expect(result.appliedSettings).toContain("exportSettings.evidenceBacked");
      expect(result.errors).toHaveLength(0);
    });

    it("should detect B2B posture and configure medium sensitivity workflows", async () => {
      const mockWorkspace = {
        id: mockWorkspaceId,
        name: "B2B Solutions",
        website: "https://b2b-solutions.com",
        industry: ["technology"],
        productType: ["saas"],
        customerSegment: ["business"],
        complianceTargets: [],
      };

      (prisma.workspace.findUnique as jest.Mock).mockResolvedValue(mockWorkspace);
      (prisma.workspace.update as jest.Mock).mockResolvedValue({});

      const profileSignals = {
        industry: ["technology"],
        productType: ["saas"],
        customerSegment: ["business"],
        complianceTargets: [],
      };

      const result = await WorkflowOrchestrationService.orchestrateWorkflows(
        mockWorkspaceId,
        mockUserId,
        profileSignals
      );

      expect(result.postureDetection.isB2B).toBe(true);
      expect(result.postureDetection.governanceSensitivity).toBe("medium");
      expect(result.configuredDefaults.approvalWorkflow.enabled).toBe(true);
      expect(result.configuredDefaults.approvalWorkflow.requiredApprovers).toBe(1);
      expect(result.configuredDefaults.exportSettings.reviewBeforeExport).toBe(false);

      expect(result.reviewerRecommendations).toHaveLength(2);
      expect(result.reviewerRecommendations[0].type).toBe("security");
      expect(result.reviewerRecommendations[0].required).toBe(false);
    });

    it("should detect low sensitivity for consumer products", async () => {
      const mockWorkspace = {
        id: mockWorkspaceId,
        name: "Consumer App",
        website: "https://consumer-app.com",
        industry: ["consumer"],
        productType: ["mobile"],
        customerSegment: ["consumer"],
        complianceTargets: [],
      };

      (prisma.workspace.findUnique as jest.Mock).mockResolvedValue(mockWorkspace);
      (prisma.workspace.update as jest.Mock).mockResolvedValue({});

      const profileSignals = {
        industry: ["consumer"],
        productType: ["mobile"],
        customerSegment: ["consumer"],
        complianceTargets: [],
      };

      const result = await WorkflowOrchestrationService.orchestrateWorkflows(
        mockWorkspaceId,
        mockUserId,
        profileSignals
      );

      expect(result.postureDetection.governanceSensitivity).toBe("low");
      expect(result.configuredDefaults.approvalWorkflow.enabled).toBe(false);
      expect(result.configuredDefaults.exportSettings.evidenceBacked).toBe(false);
      expect(result.reviewerRecommendations).toHaveLength(0);
    });

    it("should preserve user overrides on rerun", async () => {
      const mockWorkspace = {
        id: mockWorkspaceId,
        name: "Enterprise Corp",
        industry: ["enterprise"],
        productType: ["saas"],
        customerSegment: ["enterprise"],
        complianceTargets: ["soc2"],
      };

      // Mock workspace with existing user overrides
      (prisma.workspace.findUnique as jest.Mock)
        .mockResolvedValueOnce(mockWorkspace)
        .mockResolvedValueOnce({
          onboardingIntelMetaJson: {
            userOverrides: {
              "approvalWorkflow.enabled": false,
              "exportSettings.reviewBeforeExport": false,
            },
          },
        });

      (prisma.workspace.update as jest.Mock).mockResolvedValue({});

      const profileSignals = {
        industry: ["enterprise"],
        productType: ["saas"],
        customerSegment: ["enterprise"],
        complianceTargets: ["soc2"],
      };

      const result = await WorkflowOrchestrationService.orchestrateWorkflows(
        mockWorkspaceId,
        mockUserId,
        profileSignals
      );

      expect(result.userOverriddenSettings).toContain("approvalWorkflow.enabled");
      expect(result.userOverriddenSettings).toContain("exportSettings.reviewBeforeExport");
      expect(result.skippedSettings).toContain("approvalWorkflow.enabled");
      expect(result.skippedSettings).toContain("exportSettings.reviewBeforeExport");
    });

    it("should handle workspace not found error", async () => {
      (prisma.workspace.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await WorkflowOrchestrationService.orchestrateWorkflows(
        mockWorkspaceId,
        mockUserId,
        {}
      );

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("not found");
      expect(result.postureDetection.governanceSensitivity).toBe("low");
    });
  });

  describe("overrideWorkflowSettings", () => {
    it("should allow users to override workflow settings", async () => {
      (prisma.workspace.findUnique as jest.Mock).mockResolvedValue({
        onboardingIntelMetaJson: {
          userOverrides: {
            "approvalWorkflow.enabled": true,
          },
        },
      });

      (prisma.workspace.update as jest.Mock).mockResolvedValue({});

      const result = await WorkflowOrchestrationService.overrideWorkflowSettings(
        mockWorkspaceId,
        mockUserId,
        {
          "approvalWorkflow.enabled": false,
          "exportSettings.evidenceBacked": false,
        }
      );

      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);

      expect(prisma.workspace.update).toHaveBeenCalledWith({
        where: { id: mockWorkspaceId },
        data: {
          onboardingIntelMetaJson: expect.objectContaining({
            userOverrides: expect.objectContaining({
              "approvalWorkflow.enabled": false,
              "exportSettings.evidenceBacked": false,
              overriddenAt: expect.any(String),
              overriddenBy: mockUserId,
            }),
          }),
        },
      });
    });
  });

  describe("getOrchestrationResult", () => {
    it("should return orchestration result when metadata exists", async () => {
      const mockMetadata = {
        workflowPreparation: {
          autoConfiguredSettings: ["approvalWorkflow.enabled"],
          configSource: "onboarding",
          onboardingAppliedDefaults: {
            approvalWorkflow: { enabled: true, requiredApprovers: 2, evidenceBacked: true },
            exportSettings: { evidenceBacked: true, readinessChecks: true, reviewBeforeExport: true },
            governanceSettings: { enabled: true, reviewerReady: true, complianceChecks: true },
          },
          userOverriddenSettings: [],
          orchestrationVersion: "1.0.0",
          orchestratedAt: new Date(),
          orchestrationSessionId: "session-123",
        },
      };

      (prisma.workspace.findUnique as jest.Mock).mockResolvedValue({
        onboardingIntelMetaJson: mockMetadata,
      });

      const result = await WorkflowOrchestrationService.getOrchestrationResult(mockWorkspaceId);

      expect(result).not.toBeNull();
      expect(result!.appliedSettings).toContain("approvalWorkflow.enabled");
      expect(result!.configuredDefaults.approvalWorkflow.enabled).toBe(true);
    });

    it("should return null when no orchestration metadata exists", async () => {
      (prisma.workspace.findUnique as jest.Mock).mockResolvedValue({
        onboardingIntelMetaJson: {},
      });

      const result = await WorkflowOrchestrationService.getOrchestrationResult(mockWorkspaceId);

      expect(result).toBeNull();
    });
  });

  describe("getReviewerRecommendations", () => {
    it("should return reviewer recommendations based on governance sensitivity", async () => {
      const mockMetadata = {
        workflowPreparation: {
          onboardingAppliedDefaults: {
            approvalWorkflow: { enabled: true, requiredApprovers: 2, evidenceBacked: true },
            exportSettings: { evidenceBacked: true, readinessChecks: true, reviewBeforeExport: true },
            governanceSettings: { enabled: true, reviewerReady: true, complianceChecks: true },
          },
        },
      };

      (prisma.workspace.findUnique as jest.Mock).mockResolvedValue({
        onboardingIntelMetaJson: mockMetadata,
      });

      const recommendations = await WorkflowOrchestrationService.getReviewerRecommendations(mockWorkspaceId);

      expect(recommendations).toHaveLength(3);
      expect(recommendations[0].type).toBe("security");
      expect(recommendations[0].priority).toBe("high");
      expect(recommendations[0].required).toBe(true);
      expect(recommendations[1].type).toBe("compliance");
      expect(recommendations[1].required).toBe(true);
    });

    it("should return empty recommendations for low sensitivity", async () => {
      const mockMetadata = {
        workflowPreparation: {
          onboardingAppliedDefaults: {
            approvalWorkflow: { enabled: false, requiredApprovers: 1, evidenceBacked: false },
            exportSettings: { evidenceBacked: false, readinessChecks: false, reviewBeforeExport: false },
            governanceSettings: { enabled: false, reviewerReady: false, complianceChecks: false },
          },
        },
      };

      (prisma.workspace.findUnique as jest.Mock).mockResolvedValue({
        onboardingIntelMetaJson: mockMetadata,
      });

      const recommendations = await WorkflowOrchestrationService.getReviewerRecommendations(mockWorkspaceId);

      expect(recommendations).toHaveLength(0);
    });
  });

  describe("resetWorkflowOrchestration", () => {
    it("should remove workflow orchestration metadata", async () => {
      const mockMetadata = {
        workflowPreparation: {
          orchestrationSessionId: "session-123",
        },
        otherData: "preserve this",
      };

      (prisma.workspace.findUnique as jest.Mock).mockResolvedValue({
        onboardingIntelMetaJson: mockMetadata,
      });

      (prisma.workspace.update as jest.Mock).mockResolvedValue({});

      const result = await WorkflowOrchestrationService.resetWorkflowOrchestration(
        mockWorkspaceId,
        mockUserId
      );

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
  });

  describe("enterprise posture detection", () => {
    it("should detect enterprise signals from profile", async () => {
      const testCases = [
        {
          profile: {
            industry: ["enterprise"],
            customerSegment: ["fortune", "multinational"],
            complianceTargets: ["soc2", "iso27001"],
          },
          expectedSensitivity: "high",
          expectedConfidence: 0.9,
        },
        {
          profile: {
            industry: ["technology"],
            customerSegment: ["business"],
            complianceTargets: ["soc2"],
          },
          expectedSensitivity: "medium",
          expectedConfidence: 0.75,
        },
        {
          profile: {
            industry: ["consumer"],
            customerSegment: ["consumer"],
            complianceTargets: [],
          },
          expectedSensitivity: "low",
          expectedConfidence: 0.0,
        },
      ];

      for (const testCase of testCases) {
        const mockWorkspace = {
          id: mockWorkspaceId,
          name: "Test Workspace",
          website: "https://test.com",
        };

        (prisma.workspace.findUnique as jest.Mock).mockResolvedValue(mockWorkspace);
        (prisma.workspace.update as jest.Mock).mockResolvedValue({});

        const result = await WorkflowOrchestrationService.orchestrateWorkflows(
          mockWorkspaceId,
          mockUserId,
          testCase.profile
        );

        expect(result.postureDetection.governanceSensitivity).toBe(testCase.expectedSensitivity);
        expect(result.postureDetection.confidence).toBeCloseTo(testCase.expectedConfidence, 1);
      }
    });
  });

  describe("workflow defaults configuration", () => {
    it("should configure appropriate defaults for each sensitivity level", async () => {
      const mockWorkspace = {
        id: mockWorkspaceId,
        name: "Test Workspace",
        website: "https://test.com",
      };

      (prisma.workspace.findUnique as jest.Mock).mockResolvedValue(mockWorkspace);
      (prisma.workspace.update as jest.Mock).mockResolvedValue({});

      // Test low sensitivity
      const lowResult = await WorkflowOrchestrationService.orchestrateWorkflows(
        mockWorkspaceId,
        mockUserId,
        { industry: ["consumer"], customerSegment: ["consumer"] }
      );
      expect(lowResult.configuredDefaults.approvalWorkflow.enabled).toBe(false);
      expect(lowResult.configuredDefaults.exportSettings.evidenceBacked).toBe(false);

      // Test medium sensitivity
      const mediumResult = await WorkflowOrchestrationService.orchestrateWorkflows(
        mockWorkspaceId,
        mockUserId,
        { industry: ["technology"], customerSegment: ["business"], complianceTargets: ["soc2"] }
      );
      expect(mediumResult.configuredDefaults.approvalWorkflow.enabled).toBe(true);
      expect(mediumResult.configuredDefaults.approvalWorkflow.requiredApprovers).toBe(1);
      expect(mediumResult.configuredDefaults.exportSettings.reviewBeforeExport).toBe(false);

      // Test high sensitivity
      const highResult = await WorkflowOrchestrationService.orchestrateWorkflows(
        mockWorkspaceId,
        mockUserId,
        { industry: ["enterprise"], customerSegment: ["fortune"], complianceTargets: ["soc2", "iso27001"] }
      );
      expect(highResult.configuredDefaults.approvalWorkflow.enabled).toBe(true);
      expect(highResult.configuredDefaults.approvalWorkflow.requiredApprovers).toBe(2);
      expect(highResult.configuredDefaults.exportSettings.reviewBeforeExport).toBe(true);
    });
  });
});
