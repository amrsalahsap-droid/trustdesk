/**
 * Tests for Workspace Preparation Service
 * 
 * Tests the onboarding → Answer Library orchestration functionality
 */

import { WorkspacePreparationService } from "../workspace-preparation-service";
import { TopicPackService } from "@/modules/knowledge/topics/topic-pack-service";
import { prisma } from "@/lib/db/prisma";
import type { TopicPackWithRationale } from "@/modules/knowledge/topics/topic-pack-service";

// Mock dependencies
jest.mock("@/lib/db/prisma");
jest.mock("@/lib/logging/logger");
jest.mock("@/lib/audit");

describe("WorkspacePreparationService", () => {
  const mockWorkspaceId = "test-workspace-id";
  const mockUserId = "test-user-id";
  const mockSessionId = "test-session-123";

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("prepareWorkspace", () => {
    it("should activate selected topics and create scaffolding", async () => {
      // Mock setup
      const selectedTopics = new Set(["api_security", "encryption_at_rest"]);
      const mockPacks: TopicPackWithRationale[] = [
        {
          id: "saas_enterprise",
          name: "Enterprise SaaS",
          description: "Enterprise topics",
          topics: [
            { key: "api_security", name: "API Security", description: "API controls" },
            { key: "encryption_at_rest", name: "Encryption", description: "Data encryption" },
          ],
          rules: { productTypes: ["saas"] },
          recommendationRationale: "SaaS product detected",
        },
      ];

      // Mock existing topics check
      (prisma.knowledgeTopic.findMany as jest.Mock).mockResolvedValue([]);

      // Mock global topics
      (prisma.knowledgeTopic.findMany as jest.Mock).mockResolvedValue([
        {
          key: "api_security",
          name: "API Security",
          description: "API controls",
          embedding: [0.1, 0.2, 0.3],
        },
        {
          key: "encryption_at_rest",
          name: "Encryption",
          description: "Data encryption",
          embedding: [0.4, 0.5, 0.6],
        },
      ]);

      // Mock topic creation
      (prisma.knowledgeTopic.create as jest.Mock).mockResolvedValue({
        id: "topic-1",
        key: "api_security",
        name: "API Security",
      });

      // Mock existing answer items
      (prisma.answerLibraryItem.findMany as jest.Mock).mockResolvedValue([]);

      // Mock topic lookup for scaffolding
      (prisma.knowledgeTopic.findFirst as jest.Mock).mockResolvedValue({
        id: "topic-1",
        key: "api_security",
        status: "ACTIVE",
      });

      // Mock answer item creation
      (prisma.answerLibraryItem.create as jest.Mock).mockResolvedValue({
        id: "answer-1",
        title: "Test Question",
        answer: "Test Answer",
      });

      // Mock workspace update for state tracking
      (prisma.workspace.update as jest.Mock).mockResolvedValue({});

      // Mock workspace lookup
      (prisma.workspace.findUnique as jest.Mock).mockResolvedValue({
        id: mockWorkspaceId,
        metadata: null,
      });

      // Execute
      const result = await WorkspacePreparationService.prepareWorkspace({
        workspaceId: mockWorkspaceId,
        userId: mockUserId,
        selectedTopicKeys: selectedTopics,
        recommendedTopicPacks: mockPacks,
        onboardingSessionId: mockSessionId,
      });

      // Assertions
      expect(result.topicsActivated).toBe(2);
      expect(result.scaffoldingCreated).toBeGreaterThan(0);
      expect(result.errors).toHaveLength(0);
      
      // Verify topic activation
      expect(prisma.knowledgeTopic.create).toHaveBeenCalledTimes(2);
      
      // Verify scaffolding creation
      expect(prisma.answerLibraryItem.create).toHaveBeenCalled();
      
      // Verify state tracking
      expect(prisma.workspace.update).toHaveBeenCalledWith({
        where: { id: mockWorkspaceId },
        data: {
          metadata: {
            workspacePreparation: expect.objectContaining({
              workspaceId: mockWorkspaceId,
              topicsActivated: true,
              answerLibrarySeeded: true,
              onboardingSeedVersion: "1.0.0",
              onboardingSessionId: mockSessionId,
            }),
          },
        },
      });
    });

    it("should skip existing topics and maintain idempotency", async () => {
      // Mock existing topics
      (prisma.knowledgeTopic.findMany as jest.Mock).mockResolvedValue([
        { key: "api_security", status: "ACTIVE" },
      ]);

      // Mock existing answer items
      (prisma.answerLibraryItem.findMany as jest.Mock).mockResolvedValue([
        { title: "What is your approach to API Security?" },
      ]);

      // Mock workspace lookup
      (prisma.workspace.findUnique as jest.Mock).mockResolvedValue({
        id: mockWorkspaceId,
        metadata: null,
      });

      const result = await WorkspacePreparationService.prepareWorkspace({
        workspaceId: mockWorkspaceId,
        userId: mockUserId,
        selectedTopicKeys: new Set(["api_security"]),
        recommendedTopicPacks: [],
      });

      expect(result.skippedExisting).toBeGreaterThan(0);
      expect(result.topicsActivated).toBe(0);
      expect(result.scaffoldingCreated).toBe(0);
    });

    it("should handle errors gracefully", async () => {
      // Mock database error
      (prisma.knowledgeTopic.findMany as jest.Mock).mockRejectedValue(
        new Error("Database connection failed")
      );

      const result = await WorkspacePreparationService.prepareWorkspace({
        workspaceId: mockWorkspaceId,
        userId: mockUserId,
        selectedTopicKeys: new Set(["api_security"]),
        recommendedTopicPacks: [],
      });

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("Database connection failed");
      expect(result.topicsActivated).toBe(0);
    });
  });

  describe("getPreparationState", () => {
    it("should return preparation state when exists", async () => {
      const mockState = {
        workspaceId: mockWorkspaceId,
        topicsActivated: true,
        answerLibrarySeeded: true,
        onboardingSeedVersion: "1.0.0",
        generatedTopicCount: 5,
        generatedCategoryCount: 3,
        lastPreparedAt: new Date(),
      };

      (prisma.workspace.findUnique as jest.Mock).mockResolvedValue({
        id: mockWorkspaceId,
        metadata: {
          workspacePreparation: mockState,
        },
      });

      const result = await WorkspacePreparationService.getPreparationState(mockWorkspaceId);

      expect(result).toEqual(mockState);
    });

    it("should return null when no preparation state exists", async () => {
      (prisma.workspace.findUnique as jest.Mock).mockResolvedValue({
        id: mockWorkspaceId,
        metadata: null,
      });

      const result = await WorkspacePreparationService.getPreparationState(mockWorkspaceId);

      expect(result).toBeNull();
    });
  });

  describe("isWorkspacePrepared", () => {
    it("should return true when workspace is fully prepared", async () => {
      (prisma.workspace.findUnique as jest.Mock).mockResolvedValue({
        id: mockWorkspaceId,
        metadata: {
          workspacePreparation: {
            topicsActivated: true,
            answerLibrarySeeded: true,
          },
        },
      });

      const result = await WorkspacePreparationService.isWorkspacePrepared(mockWorkspaceId);

      expect(result).toBe(true);
    });

    it("should return false when workspace is not fully prepared", async () => {
      (prisma.workspace.findUnique as jest.Mock).mockResolvedValue({
        id: mockWorkspaceId,
        metadata: {
          workspacePreparation: {
            topicsActivated: true,
            answerLibrarySeeded: false,
          },
        },
      });

      const result = await WorkspacePreparationService.isWorkspacePrepared(mockWorkspaceId);

      expect(result).toBe(false);
    });
  });

  describe("cleanupOnboardingGenerated", () => {
    it("should clean up onboarding-generated content", async () => {
      // Mock answer items
      (prisma.answerLibraryItem.findMany as jest.Mock).mockResolvedValue([
        { id: "answer-1" },
        { id: "answer-2" },
      ]);

      // Mock topics
      (prisma.knowledgeTopic.findMany as jest.Mock).mockResolvedValue([
        { id: "topic-1" },
        { id: "topic-2" },
      ]);

      // Mock deletions
      (prisma.answerLibraryItem.delete as jest.Mock).mockResolvedValue({});
      (prisma.knowledgeTopic.delete as jest.Mock).mockResolvedValue({});
      (prisma.workspace.update as jest.Mock).mockResolvedValue({});

      const result = await WorkspacePreparationService.cleanupOnboardingGenerated(
        mockWorkspaceId,
        mockSessionId
      );

      expect(result.deleted).toBe(4); // 2 answers + 2 topics
      expect(result.errors).toHaveLength(0);

      expect(prisma.answerLibraryItem.delete).toHaveBeenCalledTimes(2);
      expect(prisma.knowledgeTopic.delete).toHaveBeenCalledTimes(2);
    });
  });

  describe("scaffolding templates", () => {
    it("should generate appropriate templates for API Security", async () => {
      // This is tested indirectly through prepareWorkspace, but we can verify
      // the templates are created correctly by checking the generated questions
      
      (prisma.knowledgeTopic.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.knowledgeTopic.findMany as jest.Mock).mockResolvedValue([
        {
          key: "api_security",
          name: "API Security",
          description: "API controls",
          embedding: [0.1, 0.2, 0.3],
        },
      ]);
      (prisma.knowledgeTopic.create as jest.Mock).mockResolvedValue({
        id: "topic-1",
        key: "api_security",
      });
      (prisma.answerLibraryItem.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.knowledgeTopic.findFirst as jest.Mock).mockResolvedValue({
        id: "topic-1",
        key: "api_security",
        status: "ACTIVE",
      });
      (prisma.answerLibraryItem.create as jest.Mock).mockResolvedValue({
        id: "answer-1",
      });
      (prisma.workspace.findUnique as jest.Mock).mockResolvedValue({
        id: mockWorkspaceId,
        metadata: null,
      });
      (prisma.workspace.update as jest.Mock).mockResolvedValue({});

      await WorkspacePreparationService.prepareWorkspace({
        workspaceId: mockWorkspaceId,
        userId: mockUserId,
        selectedTopicKeys: new Set(["api_security"]),
        recommendedTopicPacks: [],
      });

      // Verify API-specific templates were created
      expect(prisma.answerLibraryItem.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            title: expect.stringContaining("API"),
            generationScope: "SEEDED",
            evidenceRequired: true,
          }),
        })
      );
    });
  });
});
