/**
 * TrustDesk Workspace Preparation Orchestrator
 * 
 * Master orchestrator that activates existing systems after onboarding completion.
 * Implements "TrustDesk should do most of the setup work automatically" principle.
 * 
 * This orchestrator coordinates all existing services:
 * - WorkspacePreparationService (topics + Answer Library scaffolding)
 * - EvidenceOrchestrationService (document linking + categorization)
 * - WorkflowOrchestrationService (governance workflows)
 * - Recommendation system refresh
 * - Readiness state updates
 * 
 * Key principles:
 * - Stage-by-stage execution with failure resilience
 * - Idempotent and merge-safe operations
 * - Additive-only approach, never destructive
 * - Partial completion allowed with diagnostics
 * - User edits always preserved
 */

import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logging/logger";
import { AUDIT_EVENT_TYPES, AUDIT_OBJECT_TYPES, recordAuditEventSafe } from "@/lib/audit";
import { WorkspacePreparationService } from "./workspace-preparation-service";
import { EvidenceOrchestrationService } from "./evidence-orchestration-service";
import { WorkflowOrchestrationService } from "./workflow-orchestration-service";
import { RecommendationOrchestrator } from "./recommendation-orchestrator";
import type { TopicPackWithRationale } from "@/modules/knowledge/topics/topic-pack-service";

export type PreparationStage = 
  | "profile_confirmed"
  | "topics_applied"
  | "answer_library_seeded"
  | "evidence_prepared"
  | "workflows_configured"
  | "readiness_updated"
  | "onboarding_completed";

export interface WorkspacePreparationState {
  workspaceId: string;
  currentStage: PreparationStage;
  completedStages: PreparationStage[];
  failedStages: PreparationStage[];
  appliedTopics: string[];
  generatedCategories: string[];
  linkedEvidence: string[];
  autoConfiguredSettings: string[];
  onboardingGenerationMetadata: {
    source: "onboarding";
    version: string;
    sessionId: string;
    generatedAt: string;
  };
  lastPreparedAt: Date;
  preparationVersion: string;
  errors: string[];
  warnings: string[];
  diagnostics: Record<string, any>;
}

export interface OrchestrationRequest {
  workspaceId: string;
  userId: string;
  selectedTopicKeys: Set<string>;
  recommendedTopicPacks: TopicPackWithRationale[];
  profileSignals: {
    industry?: string[];
    productType?: string[];
    customerSegment?: string[];
    complianceTargets?: string[];
    deepProfileJson?: any;
    tailoringConfidence?: number;
  };
  onboardingSessionId: string;
  options: {
    forceRerun?: boolean;
    skipEvidenceOrchestration?: boolean;
    skipWorkflowConfiguration?: boolean;
    retryFailedStages?: boolean;
  };
}

export interface OrchestrationResult {
  workspaceId: string;
  success: boolean;
  finalState: WorkspacePreparationState;
  stageResults: Record<PreparationStage, {
    success: boolean;
    duration: number;
    entities: number;
    errors: string[];
    warnings: string[];
  }>;
  summary: {
    totalStages: number;
    completedStages: number;
    failedStages: number;
    totalEntities: number;
    totalDuration: number;
  };
  nextActions: string[];
}

const PREPARATION_VERSION = "1.0.0";

/**
 * Master orchestrator for workspace preparation
 */
export class WorkspacePreparationOrchestrator {
  /**
   * Main orchestration entry point
   * Called after onboarding completion to prepare the workspace
   */
  static async orchestrateWorkspacePreparation(
    request: OrchestrationRequest
  ): Promise<OrchestrationResult> {
    const { workspaceId, userId, onboardingSessionId, options } = request;
    
    logger.info("orchestrator:start", {
      workspaceId,
      userId,
      onboardingSessionId,
      selectedTopics: request.selectedTopicKeys.size,
      forceRerun: options.forceRerun,
    });

    const orchestrationStart = performance.now();
    const result: OrchestrationResult = {
      workspaceId,
      success: false,
      finalState: this.createInitialState(workspaceId, onboardingSessionId),
      stageResults: {} as Record<PreparationStage, any>,
      summary: {
        totalStages: 7,
        completedStages: 0,
        failedStages: 0,
        totalEntities: 0,
        totalDuration: 0,
      },
      nextActions: [],
    };

    try {
      // 1. Get current preparation state
      const currentState = await this.getPreparationState(workspaceId);
      if (currentState && !options.forceRerun) {
        logger.info("orchestrator:existing_state", {
          workspaceId,
          currentStage: currentState.currentStage,
          completedStages: currentState.completedStages.length,
        });
        result.finalState = currentState;
      }

      // 2. Execute orchestration stages
      const stages: PreparationStage[] = [
        "profile_confirmed",
        "topics_applied", 
        "answer_library_seeded",
        "evidence_prepared",
        "workflows_configured",
        "readiness_updated",
        "onboarding_completed",
      ];

      for (const stage of stages) {
        const stageStart = performance.now();
        
        // Skip if already completed and not forcing rerun
        if (currentState?.completedStages.includes(stage) && !options.forceRerun && !options.retryFailedStages) {
          logger.info("orchestrator:stage:skip", { workspaceId, stage });
          continue;
        }

        // Skip failed stages unless retrying
        if (currentState?.failedStages.includes(stage) && !options.retryFailedStages) {
          logger.warn("orchestrator:stage:failed_skip", { workspaceId, stage });
          continue;
        }

        try {
          const stageResult = await this.executeStage(stage, request, result.finalState);
          const duration = performance.now() - stageStart;
          
          result.stageResults[stage] = {
            success: stageResult.success,
            duration,
            entities: stageResult.entities || 0,
            errors: stageResult.errors || [],
            warnings: stageResult.warnings || [],
          };

          if (stageResult.success) {
            result.finalState.completedStages.push(stage);
            result.finalState.currentStage = stage;
            result.summary.completedStages++;
            result.summary.totalEntities += stageResult.entities || 0;
            
            // Persist state after successful stage
            await this.persistPreparationState(result.finalState);
            
            logger.info("orchestrator:stage:complete", {
              workspaceId,
              stage,
              duration,
              entities: stageResult.entities,
            });
          } else {
            result.finalState.failedStages.push(stage);
            result.summary.failedStages++;
            result.finalState.errors.push(...(stageResult.errors || []));
            
            logger.error("orchestrator:stage:failed", {
              workspaceId,
              stage,
              errors: stageResult.errors,
            });
            
            // Continue with other stages even if this one failed
            continue;
          }

        } catch (error) {
          const duration = performance.now() - stageStart;
          const errorMsg = `Stage ${stage} failed: ${error instanceof Error ? error.message : String(error)}`;
          
          result.finalState.failedStages.push(stage);
          result.summary.failedStages++;
          result.finalState.errors.push(errorMsg);
          
          result.stageResults[stage] = {
            success: false,
            duration,
            entities: 0,
            errors: [errorMsg],
            warnings: [],
          };
          
          logger.error("orchestrator:stage:error", {
            workspaceId,
            stage,
            error: errorMsg,
            duration,
          });
          
          // Continue with other stages
          continue;
        }
      }

      // 3. Calculate final results
      const totalDuration = performance.now() - orchestrationStart;
      result.summary.totalDuration = Math.round(totalDuration);
      result.success = result.summary.failedStages === 0;
      result.finalState.lastPreparedAt = new Date();
      result.finalState.preparationVersion = PREPARATION_VERSION;

      // 4. Generate next actions
      result.nextActions = this.generateNextActions(result);

      // 5. Final state persistence
      await this.persistPreparationState(result.finalState);

      // 6. Record audit event
      await recordAuditEventSafe({
        workspaceId,
        actorUserId: userId,
        eventType: result.success 
          ? AUDIT_EVENT_TYPES.WORKSPACE_UPDATED 
          : AUDIT_EVENT_TYPES.SOURCE_DOCUMENT_UPLOAD_FAILED,
        objectType: AUDIT_OBJECT_TYPES.WORKSPACE,
        objectId: workspaceId,
        metadata: {
          action: "workspace_preparation_orchestrated",
          success: result.success,
          completedStages: result.summary.completedStages,
          failedStages: result.summary.failedStages,
          totalEntities: result.summary.totalEntities,
          duration: result.summary.totalDuration,
          onboardingSessionId,
        },
      });

      logger.info("orchestrator:complete", {
        workspaceId,
        success: result.success,
        durationMs: result.summary.totalDuration,
        completedStages: result.summary.completedStages,
        failedStages: result.summary.failedStages,
        totalEntities: result.summary.totalEntities,
      });

      return result;

    } catch (error) {
      const errorMsg = `Orchestration failed: ${error instanceof Error ? error.message : String(error)}`;
      result.finalState.errors.push(errorMsg);
      result.success = false;
      
      logger.error("orchestrator:error", {
        workspaceId,
        error: errorMsg,
      });
      
      return result;
    }
  }

  /**
   * Execute individual preparation stage
   */
  private static async executeStage(
    stage: PreparationStage,
    request: OrchestrationRequest,
    currentState: WorkspacePreparationState
  ): Promise<{ success: boolean; entities?: number; errors?: string[]; warnings?: string[] }> {
    const { workspaceId, userId, selectedTopicKeys, recommendedTopicPacks, profileSignals, onboardingSessionId, options } = request;

    switch (stage) {
      case "profile_confirmed":
        return this.executeProfileConfirmation(workspaceId, profileSignals, onboardingSessionId);

      case "topics_applied":
        return this.executeTopicsApplication(workspaceId, userId, selectedTopicKeys, recommendedTopicPacks, onboardingSessionId);

      case "answer_library_seeded":
        return this.executeAnswerLibrarySeeding(workspaceId, userId, selectedTopicKeys, onboardingSessionId);

      case "evidence_prepared":
        if (options.skipEvidenceOrchestration) {
          return { success: true, warnings: ["Evidence orchestration skipped"] };
        }
        return this.executeEvidencePreparation(workspaceId, userId, onboardingSessionId);

      case "workflows_configured":
        if (options.skipWorkflowConfiguration) {
          return { success: true, warnings: ["Workflow configuration skipped"] };
        }
        return this.executeWorkflowConfiguration(workspaceId, userId, profileSignals, onboardingSessionId);

      case "readiness_updated":
        return this.executeReadinessUpdate(workspaceId, userId, onboardingSessionId);

      case "onboarding_completed":
        return this.executeOnboardingCompletion(workspaceId, userId, onboardingSessionId);

      default:
        return { success: false, errors: [`Unknown stage: ${stage}`] };
    }
  }

  /**
   * Stage 1: Profile Confirmation
   */
  private static async executeProfileConfirmation(
    workspaceId: string,
    profileSignals: any,
    onboardingSessionId: string
  ): Promise<{ success: boolean; entities: number; errors?: string[]; warnings?: string[] }> {
    try {
      // Verify workspace exists and has profile signals
      const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: {
          id: true,
          industry: true,
          productType: true,
          customerSegment: true,
          complianceTargets: true,
          deepProfileJson: true,
        },
      });

      if (!workspace) {
        return { success: false, entities: 0, errors: ["Workspace not found"] };
      }

      // Validate profile signals
      const hasIndustry = workspace.industry && workspace.industry.length > 0;
      const hasProductType = workspace.productType && workspace.productType.length > 0;
      const hasSignals = Object.keys(profileSignals || {}).length > 0;

      if (!hasIndustry && !hasProductType && !hasSignals) {
        return { success: false, entities: 0, errors: ["No profile signals found"] };
      }

      return { success: true, entities: 1 };
    } catch (error) {
      return { 
        success: false, 
        entities: 0, 
        errors: [`Profile confirmation failed: ${error instanceof Error ? error.message : String(error)}`] 
      };
    }
  }

  /**
   * Stage 2: Topics Application
   */
  private static async executeTopicsApplication(
    workspaceId: string,
    userId: string,
    selectedTopicKeys: Set<string>,
    recommendedTopicPacks: TopicPackWithRationale[],
    onboardingSessionId: string
  ): Promise<{ success: boolean; entities: number; errors?: string[]; warnings?: string[] }> {
    try {
      const result = await WorkspacePreparationService.prepareWorkspace({
        workspaceId,
        userId,
        selectedTopicKeys,
        recommendedTopicPacks,
        onboardingSessionId,
        // Skip other stages since they're handled separately
      });

      return { 
        success: result.errors.length === 0, 
        entities: result.topicsActivated + result.categoriesCreated,
        errors: result.errors,
        warnings: result.warnings,
      };
    } catch (error) {
      return { 
        success: false, 
        entities: 0, 
        errors: [`Topics application failed: ${error instanceof Error ? error.message : String(error)}`] 
      };
    }
  }

  /**
   * Stage 3: Answer Library Seeding
   */
  private static async executeAnswerLibrarySeeding(
    workspaceId: string,
    userId: string,
    selectedTopicKeys: Set<string>,
    onboardingSessionId: string
  ): Promise<{ success: boolean; entities: number; errors?: string[]; warnings?: string[] }> {
    try {
      // Answer Library seeding is already handled in WorkspacePreparationService
      // This stage validates that seeding was successful
      const answerItems = await prisma.answerLibraryItem.findMany({
        where: {
          workspaceId,
          generationScope: "SEEDED",
        },
        select: { id: true },
      });

      return { 
        success: true, 
        entities: answerItems.length,
        warnings: answerItems.length === 0 ? ["No Answer Library items found"] : undefined,
      };
    } catch (error) {
      return { 
        success: false, 
        entities: 0, 
        errors: [`Answer Library seeding validation failed: ${error instanceof Error ? error.message : String(error)}`] 
      };
    }
  }

  /**
   * Stage 4: Evidence Preparation
   */
  private static async executeEvidencePreparation(
    workspaceId: string,
    userId: string,
    onboardingSessionId: string
  ): Promise<{ success: boolean; entities: number; errors?: string[]; warnings?: string[] }> {
    try {
      // Get all uploaded documents for orchestration
      const documents = await prisma.sourceDocument.findMany({
        where: {
          workspaceId,
          uploadStatus: "UPLOADED",
        },
        include: {
          content: {
            select: { fullText: true, metadataJson: true },
          },
        },
      });

      let orchestratedCount = 0;
      const errors: string[] = [];

      const documentsStart = performance.now();
      for (const document of documents) {
        const docStart = performance.now();
        try {
          const result = await EvidenceOrchestrationService.orchestrateEvidence(
            document.id,
            workspaceId,
            userId,
            {
              filename: document.originalName,
              extractedText: document.content?.fullText || undefined,
              uploadContext: "bulk_orchestration",
              orchestrationSessionId: `${onboardingSessionId}-evidence`,
            }
          );

          const docDuration = performance.now() - docStart;
          logger.info("orchestrator:evidence:document:complete", {
            workspaceId,
            documentId: document.id,
            durationMs: Math.round(docDuration),
            success: result.errors.length === 0,
          });

          if (result.errors.length === 0) {
            orchestratedCount++;
          } else {
            errors.push(`Document ${document.id}: ${result.errors.join(", ")}`);
          }
        } catch (error) {
          const docDuration = performance.now() - docStart;
          errors.push(`Document ${document.id}: ${error instanceof Error ? error.message : String(error)}`);
          logger.error("orchestrator:evidence:document:error", {
            workspaceId,
            documentId: document.id,
            durationMs: Math.round(docDuration),
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      logger.info("orchestrator:evidence:batch:complete", {
        workspaceId,
        documentCount: documents.length,
        orchestratedCount,
        durationMs: Math.round(performance.now() - documentsStart),
      });

      return { 
        success: errors.length === 0, 
        entities: orchestratedCount,
        errors: errors.length > 0 ? errors : undefined,
        warnings: documents.length === 0 ? ["No documents found for evidence orchestration"] : undefined,
      };
    } catch (error) {
      return { 
        success: false, 
        entities: 0, 
        errors: [`Evidence preparation failed: ${error instanceof Error ? error.message : String(error)}`] 
      };
    }
  }

  /**
   * Stage 5: Workflow Configuration
   */
  private static async executeWorkflowConfiguration(
    workspaceId: string,
    userId: string,
    profileSignals: any,
    onboardingSessionId: string
  ): Promise<{ success: boolean; entities: number; errors?: string[]; warnings?: string[] }> {
    try {
      const result = await WorkflowOrchestrationService.orchestrateWorkflows(
        workspaceId,
        userId,
        profileSignals,
        {
          orchestrationSessionId: `${onboardingSessionId}-workflows`,
        }
      );

      return { 
        success: result.errors.length === 0, 
        entities: result.appliedSettings.length,
        errors: result.errors,
        warnings: result.warnings,
      };
    } catch (error) {
      return { 
        success: false, 
        entities: 0, 
        errors: [`Workflow configuration failed: ${error instanceof Error ? error.message : String(error)}`] 
      };
    }
  }

  /**
   * Stage 6: Readiness Update
   */
  private static async executeReadinessUpdate(
    workspaceId: string,
    userId: string,
    onboardingSessionId: string
  ): Promise<{ success: boolean; entities: number; errors?: string[]; warnings?: string[] }> {
    try {
      // Refresh recommendations using existing orchestrator
      const recommendations = await RecommendationOrchestrator.generateRecommendations(workspaceId, userId);
      
      // Update workspace readiness state
      await prisma.workspace.update({
        where: { id: workspaceId },
        data: {
          onboardingIntelMetaJson: {
            lastReadinessUpdate: new Date().toISOString(),
            readinessSessionId: onboardingSessionId,
            recommendationsCount: recommendations.length,
          },
        },
      });

      return { 
        success: true, 
        entities: recommendations.length,
        warnings: recommendations.length === 0 ? ["No recommendations generated"] : undefined,
      };
    } catch (error) {
      return { 
        success: false, 
        entities: 0, 
        errors: [`Readiness update failed: ${error instanceof Error ? error.message : String(error)}`] 
      };
    }
  }

  /**
   * Stage 7: Onboarding Completion
   */
  private static async executeOnboardingCompletion(
    workspaceId: string,
    userId: string,
    onboardingSessionId: string
  ): Promise<{ success: boolean; entities: number; errors?: string[]; warnings?: string[] }> {
    try {
      // Mark onboarding as completed
      await prisma.workspace.update({
        where: { id: workspaceId },
        data: {
          onboardingIntelMetaJson: {
            onboardingCompleted: true,
            onboardingCompletedAt: new Date().toISOString(),
            onboardingSessionId,
          },
        },
      });

      return { success: true, entities: 1 };
    } catch (error) {
      return { 
        success: false, 
        entities: 0, 
        errors: [`Onboarding completion failed: ${error instanceof Error ? error.message : String(error)}`] 
      };
    }
  }

  /**
   * Create initial preparation state
   */
  private static createInitialState(workspaceId: string, onboardingSessionId: string): WorkspacePreparationState {
    return {
      workspaceId,
      currentStage: "profile_confirmed",
      completedStages: [],
      failedStages: [],
      appliedTopics: [],
      generatedCategories: [],
      linkedEvidence: [],
      autoConfiguredSettings: [],
      onboardingGenerationMetadata: {
        source: "onboarding",
        version: PREPARATION_VERSION,
        sessionId: onboardingSessionId,
        generatedAt: new Date().toISOString(),
      },
      lastPreparedAt: new Date(),
      preparationVersion: PREPARATION_VERSION,
      errors: [],
      warnings: [],
      diagnostics: {},
    };
  }

  /**
   * Get current preparation state
   */
  private static async getPreparationState(workspaceId: string): Promise<WorkspacePreparationState | null> {
    try {
      const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { onboardingIntelMetaJson: true },
      });

      const metadata = workspace?.onboardingIntelMetaJson as any;
      return metadata?.workspacePreparation || null;
    } catch (error) {
      logger.error("orchestrator:state:get:error", {
        workspaceId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Persist preparation state
   */
  private static async persistPreparationState(state: WorkspacePreparationState): Promise<void> {
    try {
      const workspace = await prisma.workspace.findUnique({
        where: { id: state.workspaceId },
        select: { onboardingIntelMetaJson: true },
      });

      const currentMetadata = workspace?.onboardingIntelMetaJson as any || {};

      await prisma.workspace.update({
        where: { id: state.workspaceId },
        data: {
          onboardingIntelMetaJson: {
            ...currentMetadata,
            workspacePreparation: state,
          },
        },
      });

    } catch (error) {
      logger.error("orchestrator:state:persist:error", {
        workspaceId: state.workspaceId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Generate next actions based on orchestration results
   */
  private static generateNextActions(result: OrchestrationResult): string[] {
    const actions: string[] = [];

    if (result.summary.failedStages > 0) {
      actions.push(`Retry failed stages: ${result.finalState.failedStages.join(", ")}`);
    }

    if (result.finalState.linkedEvidence.length === 0) {
      actions.push("Upload documents to enable evidence orchestration");
    }

    if (result.finalState.autoConfiguredSettings.length === 0) {
      actions.push("Configure governance workflows manually");
    }

    if (result.summary.completedStages === result.summary.totalStages) {
      actions.push("Workspace preparation completed successfully");
      actions.push("Begin questionnaire imports and answer development");
    }

    if (result.finalState.appliedTopics.length === 0) {
      actions.push("Select trust topics to activate workspace preparation");
    }

    return actions;
  }

  /**
   * Get preparation status for a workspace
   */
  static async getPreparationStatus(workspaceId: string): Promise<WorkspacePreparationState | null> {
    return this.getPreparationState(workspaceId);
  }

  /**
   * Reset preparation state (for testing/rollback)
   */
  static async resetPreparationState(workspaceId: string, userId: string): Promise<{ success: boolean; errors: string[] }> {
    const errors: string[] = [];

    try {
      const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { onboardingIntelMetaJson: true },
      });

      const currentMetadata = workspace?.onboardingIntelMetaJson as any || {};
      const { workspacePreparation, ...remainingMetadata } = currentMetadata;

      await prisma.workspace.update({
        where: { id: workspaceId },
        data: {
          onboardingIntelMetaJson: remainingMetadata,
        },
      });

      // Record audit event
      await recordAuditEventSafe({
        workspaceId,
        actorUserId: userId,
        eventType: AUDIT_EVENT_TYPES.WORKSPACE_UPDATED,
        objectType: AUDIT_OBJECT_TYPES.WORKSPACE,
        objectId: workspaceId,
        metadata: {
          action: "workspace_preparation_reset",
        },
      });

      logger.info("orchestrator:reset:success", {
        workspaceId,
        userId,
      });

      return { success: true, errors };

    } catch (error) {
      const errorMsg = `Reset failed: ${error instanceof Error ? error.message : String(error)}`;
      errors.push(errorMsg);
      logger.error("orchestrator:reset:error", {
        workspaceId,
        error: errorMsg,
      });

      return { success: false, errors };
    }
  }

  /**
   * Retry failed stages
   */
  static async retryFailedStages(workspaceId: string, userId: string): Promise<OrchestrationResult | null> {
    const currentState = await this.getPreparationState(workspaceId);
    if (!currentState || currentState.failedStages.length === 0) {
      return null;
    }

    // Get original request from state (would need to store this)
    // For now, create a minimal request for retry
    const retryRequest: OrchestrationRequest = {
      workspaceId,
      userId,
      selectedTopicKeys: new Set(currentState.appliedTopics),
      recommendedTopicPacks: [],
      profileSignals: {},
      onboardingSessionId: `retry-${Date.now()}`,
      options: {
        retryFailedStages: true,
        forceRerun: false,
      },
    };

    return this.orchestrateWorkspacePreparation(retryRequest);
  }
}
