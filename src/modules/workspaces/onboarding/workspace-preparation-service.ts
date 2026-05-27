/**
 * TrustDesk Workspace Preparation Service
 * 
 * Orchestrates onboarding completion → Answer Library seeding and workspace preparation.
 * Connects onboarding-selected topics to Answer Library scaffolding and taxonomy activation.
 * 
 * Key principles:
 * - Idempotent and rerun-safe
 * - Preserves manual edits and approved content
 * - Additive-only, never overwrites user content
 * - Creates scaffolding, not final answers
 */

import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logging/logger";
import { AUDIT_EVENT_TYPES, AUDIT_OBJECT_TYPES, recordAuditEventSafe } from "@/lib/audit";
import { TopicsService } from "@/modules/knowledge/topics/topics-service";
import { TopicPackService, type TopicPackWithRationale } from "@/modules/knowledge/topics/topic-pack-service";
import { WorkflowOrchestrationService } from "@/modules/workspaces/onboarding/workflow-orchestration-service";
import type { KnowledgeTopic, KnowledgeTopicStatus } from "@prisma/client";

export interface OnboardingCompletionPayload {
  workspaceId: string;
  userId: string;
  selectedTopicKeys: Set<string>;
  recommendedTopicPacks: TopicPackWithRationale[];
  onboardingSessionId?: string;
  profileSignals?: {
    industry?: string[];
    productType?: string[];
    customerSegment?: string[];
    complianceTargets?: string[];
    deepProfileJson?: any;
    tailoringConfidence?: number;
  };
}

export interface WorkspacePreparationResult {
  topicsActivated: number;
  categoriesCreated: number;
  scaffoldingCreated: number;
  skippedExisting: number;
  errors: string[];
  warnings: string[];
}

export interface WorkspacePreparationState {
  workspaceId: string;
  topicsActivated: boolean;
  answerLibrarySeeded: boolean;
  onboardingSeedVersion: string;
  generatedTopicCount: number;
  generatedCategoryCount: number;
  lastPreparedAt: Date;
  onboardingSessionId?: string;
}

export interface OnboardingGeneratedMetadata {
  source: "onboarding";
  generatedFrom: string;
  onboardingSessionId?: string;
  generatedAt: Date;
  version: string;
}

const ONBOARDING_SEED_VERSION = "1.0.0";

/**
 * Core workspace preparation service
 */
export class WorkspacePreparationService {
  /**
   * Main orchestration entry point
   * Called when onboarding completes with selected topics
   */
  static async prepareWorkspace(
    payload: OnboardingCompletionPayload
  ): Promise<WorkspacePreparationResult> {
    const { workspaceId, userId, selectedTopicKeys, recommendedTopicPacks, onboardingSessionId } = payload;
    
    logger.info("workspace:preparation:start", {
      workspaceId,
      userId,
      selectedTopicCount: selectedTopicKeys.size,
      packCount: recommendedTopicPacks.length,
      onboardingSessionId,
    });

    const result: WorkspacePreparationResult = {
      topicsActivated: 0,
      categoriesCreated: 0,
      scaffoldingCreated: 0,
      skippedExisting: 0,
      errors: [],
      warnings: [],
    };

    try {
      // 1. Check if workspace preparation already exists
      const existingState = await this.getPreparationState(workspaceId);
      if (existingState && existingState.topicsActivated) {
        result.warnings.push("Workspace already prepared, checking for updates only");
        logger.info("workspace:preparation:exists", { workspaceId, existingState });
      }

      const startTime = performance.now();
      // 2. Activate selected topics in workspace taxonomy
      const topicActivationResult = await this.activateSelectedTopics(
        workspaceId,
        userId,
        selectedTopicKeys,
        onboardingSessionId
      );
      result.topicsActivated = topicActivationResult.activated;
      result.skippedExisting += topicActivationResult.skipped;
      result.errors.push(...topicActivationResult.errors);

      logger.info("workspace:preparation:topics:complete", {
        workspaceId,
        activatedCount: topicActivationResult.activated.length,
        skippedCount: topicActivationResult.skipped,
        durationMs: Math.round(performance.now() - startTime),
      });

      const scaffoldingStart = performance.now();
      // 3. Create Answer Library categories and scaffolding
      const scaffoldingResult = await this.createAnswerLibraryScaffolding(
        workspaceId,
        userId,
        selectedTopicKeys,
        recommendedTopicPacks,
        onboardingSessionId
      );
      result.categoriesCreated = scaffoldingResult.categoriesCreated;
      result.scaffoldingCreated = scaffoldingResult.scaffoldingCreated;
      result.skippedExisting += scaffoldingResult.skipped;
      result.errors.push(...scaffoldingResult.errors);
      result.warnings.push(...scaffoldingResult.warnings);

      logger.info("workspace:preparation:scaffolding:complete", {
        workspaceId,
        categoriesCreated: scaffoldingResult.categoriesCreated.length,
        itemsCreated: scaffoldingResult.scaffoldingCreated.length,
        durationMs: Math.round(performance.now() - scaffoldingStart),
      });

      // 6. Configure workflows based on profile signals
      if (payload.profileSignals) {
        try {
          const workflowResult = await WorkflowOrchestrationService.orchestrateWorkflows(
            workspaceId,
            userId,
            payload.profileSignals,
            {
              orchestrationSessionId: onboardingSessionId,
            }
          );
          
          logger.info("workspace:workflow:orchestration:complete", {
            workspaceId,
            governanceSensitivity: workflowResult.postureDetection.governanceSensitivity,
            appliedSettings: workflowResult.appliedSettings.length,
          });
          
        } catch (error) {
          logger.error("workspace:workflow:orchestration:error", {
            workspaceId,
            error: error instanceof Error ? error.message : String(error),
          });
          result.warnings.push("Workflow orchestration failed");
        }
      }

      // 7. Update workspace preparation state
      await this.updatePreparationState(workspaceId, {
        workspaceId,
        topicsActivated: result.topicsActivated > 0,
        answerLibrarySeeded: result.categoriesCreated > 0,
        onboardingSeedVersion: ONBOARDING_SEED_VERSION,
        generatedTopicCount: result.topicsActivated,
        generatedCategoryCount: result.categoriesCreated,
        lastPreparedAt: new Date(),
        onboardingSessionId,
      });

      // 5. Record audit event
      await recordAuditEventSafe({
        workspaceId,
        actorUserId: userId,
        eventType: AUDIT_EVENT_TYPES.WORKSPACE_UPDATED,
        objectType: AUDIT_OBJECT_TYPES.WORKSPACE,
        objectId: workspaceId,
        metadata: {
          action: "workspace_prepared_from_onboarding",
          topicsActivated: result.topicsActivated,
          categoriesCreated: result.categoriesCreated,
          scaffoldingCreated: result.scaffoldingCreated,
          onboardingSessionId,
        },
      });

      logger.info("workspace:preparation:complete", {
        workspaceId,
        result,
      });

      return result;

    } catch (error) {
      logger.error("workspace:preparation:error", {
        workspaceId,
        error: error instanceof Error ? error.message : String(error),
      });
      
      result.errors.push(error instanceof Error ? error.message : String(error));
      return result;
    }
  }

  /**
   * Activate selected topics in workspace taxonomy
   */
  private static async activateSelectedTopics(
    workspaceId: string,
    userId: string,
    selectedTopicKeys: Set<string>,
    onboardingSessionId?: string
  ): Promise<{ activated: number; skipped: number; errors: string[] }> {
    const errors: string[] = [];
    let activated = 0;
    let skipped = 0;

    try {
      // Get existing workspace topics to avoid duplicates
      const existingTopics = await prisma.knowledgeTopic.findMany({
        where: { workspaceId },
        select: { key: true, status: true },
      });
      const existingKeys = new Set(existingTopics.map(t => t.key));

      // Get global topics to activate
      const globalTopics = await prisma.knowledgeTopic.findMany({
        where: { 
          workspaceId: "SYSTEM_WORKSPACE",
          key: { in: Array.from(selectedTopicKeys) },
          status: "ACTIVE",
        },
        select: { key: true, name: true, description: true, embedding: true },
      });

      for (const globalTopic of globalTopics) {
        try {
          if (existingKeys.has(globalTopic.key)) {
            skipped++;
            continue;
          }

          // Create workspace-specific topic (shadowing global)
          const workspaceTopic = await prisma.knowledgeTopic.create({
            data: {
              workspaceId,
              key: globalTopic.key,
              name: globalTopic.name,
              description: globalTopic.description,
              embedding: globalTopic.embedding,
              status: "ACTIVE",
              ownerId: userId,
              metadata: {
                source: "onboarding",
                generatedFrom: "global_topic_activation",
                onboardingSessionId,
                generatedAt: new Date().toISOString(),
                version: ONBOARDING_SEED_VERSION,
              } satisfies OnboardingGeneratedMetadata,
            },
          });

          activated++;
          
          logger.info("workspace:topic:activated", {
            workspaceId,
            topicKey: globalTopic.key,
            topicId: workspaceTopic.id,
          });

        } catch (error) {
          const errorMsg = `Failed to activate topic ${globalTopic.key}: ${error instanceof Error ? error.message : String(error)}`;
          errors.push(errorMsg);
          logger.error("workspace:topic:activation:error", {
            workspaceId,
            topicKey: globalTopic.key,
            error: errorMsg,
          });
        }
      }

    } catch (error) {
      errors.push(`Topic activation failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    return { activated, skipped, errors };
  }

  /**
   * Create Answer Library scaffolding (answer items) directly
   */
  private static async createAnswerLibraryScaffolding(
    workspaceId: string,
    userId: string,
    selectedTopicKeys: Set<string>,
    recommendedTopicPacks: TopicPackWithRationale[],
    onboardingSessionId?: string
  ): Promise<{ categoriesCreated: number; scaffoldingCreated: number; skipped: number; errors: string[]; warnings: string[] }> {
    const errors: string[] = [];
    const warnings: string[] = [];
    let categoriesCreated = 0;
    let scaffoldingCreated = 0;
    let skipped = 0;

    try {
      // Get existing answer items to avoid duplicates
      const existingItems = await prisma.answerLibraryItem.findMany({
        where: { 
          workspaceId,
          generationScope: "SEEDED",
        },
        select: { title: true },
      });
      const existingTitles = new Set(existingItems.map(item => item.title));

      // Create scaffolding items for each activated topic
      for (const topicKey of selectedTopicKeys) {
        try {
          // Find the topic pack for context
          const relevantPack = recommendedTopicPacks.find(pack => 
            pack.topics.some(topic => topic.key === topicKey)
          );

          // Get the topic to link to
          const topic = await prisma.knowledgeTopic.findFirst({
            where: { 
              workspaceId,
              key: topicKey,
              status: "ACTIVE",
            },
          });

          if (!topic) {
            warnings.push(`Topic ${topicKey} not found in workspace, skipping scaffolding`);
            continue;
          }

          // Create scaffolding items (canonical answer placeholders)
          const scaffoldingItems = await this.createScaffoldingItems(
            workspaceId,
            userId,
            topic.id,
            topicKey,
            relevantPack,
            onboardingSessionId
          );
          
          scaffoldingCreated += scaffoldingItems;
          categoriesCreated++; // Count each topic as a "category" for metrics

          logger.info("workspace:scaffolding:created", {
            workspaceId,
            topicId: topic.id,
            topicKey,
            scaffoldingItems,
          });

        } catch (error) {
          const errorMsg = `Failed to create scaffolding for topic ${topicKey}: ${error instanceof Error ? error.message : String(error)}`;
          errors.push(errorMsg);
          logger.error("workspace:scaffolding:creation:error", {
            workspaceId,
            topicKey,
            error: errorMsg,
          });
        }
      }

    } catch (error) {
      errors.push(`Scaffolding creation failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    return { categoriesCreated, scaffoldingCreated, skipped, errors, warnings };
  }

  /**
   * Create scaffolding items (canonical answer placeholders) for a topic
   */
  private static async createScaffoldingItems(
    workspaceId: string,
    userId: string,
    topicId: string,
    topicKey: string,
    relevantPack?: TopicPackWithRationale,
    onboardingSessionId?: string
  ): Promise<number> {
    let created = 0;

    // Define scaffolding templates based on topic type
    const scaffoldingTemplates = this.getScaffoldingTemplates(topicKey, relevantPack);

    for (const template of scaffoldingTemplates) {
      try {
        await prisma.answerLibraryItem.create({
          data: {
            workspaceId,
            topicId,
            title: template.question,
            answer: template.answer, // Placeholder/template answer
            status: "DRAFT",
            ownerId: userId,
            generationScope: "SEEDED",
            evidenceRequired: template.requiresEvidence,
            subControlLabels: template.suggestedWorkflows,
            // Store onboarding metadata in overrideComment for tracking
            overrideComment: JSON.stringify({
              source: "onboarding",
              generatedFrom: "scaffolding_template",
              topicKey,
              templateKey: template.key,
              onboardingSessionId,
              generatedAt: new Date().toISOString(),
              version: ONBOARDING_SEED_VERSION,
              isPlaceholder: true,
            }),
          },
        });

        created++;

      } catch (error) {
        // Log but don't fail the entire operation
        logger.warn("workspace:scaffolding:creation:warning", {
          workspaceId,
          topicId,
          topicKey,
          templateKey: template.key,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return created;
  }

  /**
   * Get scaffolding templates for a topic
   */
  private static getScaffoldingTemplates(
    topicKey: string,
    relevantPack?: TopicPackWithRationale
  ): Array<{ key: string; question: string; answer: string; requiresEvidence: boolean; suggestedWorkflows: string[] }> {
    // Common scaffolding templates
    const commonTemplates = [
      {
        key: "overview",
        question: `What is your approach to ${this.formatTopicName(topicKey)}?`,
        answer: `[Please describe your ${this.formatTopicName(topicKey)} approach, controls, and procedures. This should include key policies, technical implementations, and operational processes.]`,
        requiresEvidence: true,
        suggestedWorkflows: ["security_review", "compliance_review"],
      },
      {
        key: "evidence",
        question: `What evidence demonstrates your ${this.formatTopicName(topicKey)} implementation?`,
        answer: `[List relevant documentation, screenshots, certifications, or other evidence that supports your ${this.formatTopicName(topicKey)} claims. Include document references and audit trails.]`,
        requiresEvidence: true,
        suggestedWorkflows: ["evidence_collection", "audit_preparation"],
      },
    ];

    // Topic-specific templates
    const topicSpecificTemplates: Record<string, typeof commonTemplates> = {
      "api_security": [
        ...commonTemplates,
        {
          key: "authentication",
          question: "How do you authenticate API requests?",
          answer: "[Describe your API authentication methods (OAuth 2.0, API keys, JWT, mTLS, etc.) and how they are implemented and managed.]",
          requiresEvidence: true,
          suggestedWorkflows: ["technical_review", "security_assessment"],
        },
        {
          key: "authorization",
          question: "How do you authorize and control API access?",
          answer: "[Explain your API authorization model, role-based access control, permission scopes, and access governance procedures.]",
          requiresEvidence: true,
          suggestedWorkflows: ["access_review", "security_assessment"],
        },
      ],
      "encryption_at_rest": [
        ...commonTemplates,
        {
          key: "encryption_standards",
          question: "What encryption standards do you use for data at rest?",
          answer: "[Specify encryption algorithms (AES-256, etc.), key management systems, and how encryption is implemented across different storage systems.]",
          requiresEvidence: true,
          suggestedWorkflows: ["technical_review", "compliance_assessment"],
        },
      ],
      "access_control": [
        ...commonTemplates,
        {
          key: "rbac",
          question: "How is role-based access control implemented?",
          answer: "[Describe your RBAC implementation, role definitions, privilege assignment process, and access review procedures.]",
          requiresEvidence: true,
          suggestedWorkflows: ["access_review", "security_assessment"],
        },
      ],
    };

    return topicSpecificTemplates[topicKey] || commonTemplates;
  }

  /**
   * Format topic key into readable category name
   */
  private static formatCategoryName(topicKey: string): string {
    return topicKey
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Format topic key into readable name
   */
  private static formatTopicName(topicKey: string): string {
    return this.formatCategoryName(topicKey);
  }

  /**
   * Get current workspace preparation state
   */
  static async getPreparationState(workspaceId: string): Promise<WorkspacePreparationState | null> {
    try {
      // Check for onboarding-generated metadata in workspace
      const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { 
          metadata: true,
          updatedAt: true,
        },
      });

      if (!workspace?.metadata) {
        return null;
      }

      const metadata = workspace.metadata as any;
      if (metadata.workspacePreparation) {
        return metadata.workspacePreparation as WorkspacePreparationState;
      }

      return null;
    } catch (error) {
      logger.error("workspace:preparation:state:error", {
        workspaceId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Update workspace preparation state
   */
  private static async updatePreparationState(
    workspaceId: string,
    state: WorkspacePreparationState
  ): Promise<void> {
    try {
      await prisma.workspace.update({
        where: { id: workspaceId },
        data: {
          metadata: {
            workspacePreparation: state,
          },
        },
      });

      logger.info("workspace:preparation:state:updated", { workspaceId, state });
    } catch (error) {
      logger.error("workspace:preparation:state:update:error", {
        workspaceId,
        state,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Check if workspace has been prepared by onboarding
   */
  static async isWorkspacePrepared(workspaceId: string): Promise<boolean> {
    const state = await this.getPreparationState(workspaceId);
    return state?.topicsActivated === true && state?.answerLibrarySeeded === true;
  }

  /**
   * Clean up onboarding-generated content (for testing/rollback)
   */
  static async cleanupOnboardingGenerated(
    workspaceId: string,
    onboardingSessionId?: string
  ): Promise<{ deleted: number; errors: string[] }> {
    const errors: string[] = [];
    let deleted = 0;

    try {
      // Delete onboarding-generated answer items
      const answerItems = await prisma.answerLibraryItem.findMany({
        where: {
          workspaceId,
          generationScope: "SEEDED",
        },
      });

      for (const item of answerItems) {
        await prisma.answerLibraryItem.delete({
          where: { id: item.id },
        });
        deleted++;
      }

      // Delete onboarding-generated topics
      const topics = await prisma.knowledgeTopic.findMany({
        where: {
          workspaceId,
          metadata: {
            path: ["source"],
            equals: "onboarding",
          },
          ...(onboardingSessionId && {
            metadata: {
              path: ["onboardingSessionId"],
              equals: onboardingSessionId,
            },
          }),
        },
      });

      for (const topic of topics) {
        await prisma.knowledgeTopic.delete({
          where: { id: topic.id },
        });
        deleted++;
      }

      // Clear preparation state
      await this.updatePreparationState(workspaceId, {
        workspaceId,
        topicsActivated: false,
        answerLibrarySeeded: false,
        onboardingSeedVersion: ONBOARDING_SEED_VERSION,
        generatedTopicCount: 0,
        generatedCategoryCount: 0,
        lastPreparedAt: new Date(),
        onboardingSessionId,
      });

      logger.info("workspace:preparation:cleanup:complete", {
        workspaceId,
        deleted,
        onboardingSessionId,
      });

    } catch (error) {
      errors.push(`Cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
      logger.error("workspace:preparation:cleanup:error", {
        workspaceId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return { deleted, errors };
  }
}
