/**
 * Onboarding CTA Action Handler
 * 
 * Centralized handler for all onboarding recommendation screen CTAs.
 * Ensures setup-phase safety by keeping all actions within onboarding
 * until explicit setup completion.
 */

import { logger } from "@/lib/logging/logger";
import { AUDIT_EVENT_TYPES, AUDIT_OBJECT_TYPES } from "@/lib/audit/audit-event-types";
import type { WorkspaceRole } from "@prisma/client";

const isServer = typeof window === "undefined";

export type OnboardingActionType = 
  | "review_profile"
  | "upload_evidence" 
  | "upload_specific_document"
  | "import_questionnaire_setup"
  | "invite_reviewer"
  | "review_topics"
  | "configure_workflow"
  | "view_document_details"
  | "view_topic_reason"
  | "complete_setup";

export interface OnboardingAction {
  id?: string;
  type: OnboardingActionType;
  title: string;
  description: string;
  actionLabel: string;
  priority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "OPTIONAL";
  reason: string;
  linkedRecommendationIds?: string[];
  metadata?: Record<string, any>;
}

export interface OnboardingActionResult {
  success: boolean;
  error?: string;
  message?: string;
  nextAction?: string;
  shouldRedirect?: boolean;
  redirectUrl?: string;
  metadata?: Record<string, any>;
}

export interface OnboardingState {
  workspaceId: string;
  userId: string;
  currentStage: "initial_setup" | "profile_review" | "evidence_building" | "library_seeding" | "questionnaire_prep" | "trust_center" | "ongoing_governance" | "completed";
  selectedTopics: Set<string>;
  uploadedDocuments: string[];
  configuredWorkflows: string[];
  invitedReviewers: string[];
  completedActions: string[];
  lastActivity: Date;
}

/**
 * Central handler for all onboarding CTAs
 */
export class OnboardingCTAHandler {
  private static instance: OnboardingCTAHandler | null = null;
  
  /**
   * Get singleton instance
   */
  static getInstance(): OnboardingCTAHandler {
    if (!this.instance) {
      this.instance = new OnboardingCTAHandler();
    }
    return this.instance;
  }

  /**
   * Handle onboarding action with safety checks
   */
  async handleAction(
    action: OnboardingAction,
    context: {
      workspaceId: string;
      userId: string;
      recommendationId?: string;
      documentId?: string;
      topicKey?: string;
      [key: string]: any;
    }
  ): Promise<OnboardingActionResult> {
    try {
      logger.info("onboarding:cta:handle", {
        action: action.type,
        workspaceId: context.workspaceId,
        userId: context.userId,
      });

      // Get current onboarding state
      const currentState = await this.getOnboardingState(context.workspaceId, context.userId);
      
      // Validate action is allowed in current stage
      const stageValidation = this.validateActionForStage(action, currentState);
      if (!stageValidation.allowed) {
        return {
          success: false,
          error: `Action not allowed in current stage: ${stageValidation.reason}`,
          message: stageValidation.reason,
        };
      }

      // Execute the action
      const result = await this.executeAction(action, context, currentState);
      
      // Update onboarding state if successful
      if (result.success) {
        await this.updateOnboardingState(context.workspaceId, context.userId, action, result);
      }

      // Record audit event
      if (isServer) {
        const { recordAuditEventSafe } = await import("@/lib/audit");
        await recordAuditEventSafe({
          workspaceId: context.workspaceId,
          actorUserId: context.userId,
          eventType: result.success ? AUDIT_EVENT_TYPES.KNOWLEDGE_TOPIC_CREATED : AUDIT_EVENT_TYPES.SOURCE_DOCUMENT_UPLOAD_FAILED,
          objectType: AUDIT_OBJECT_TYPES.WORKSPACE,
          objectId: context.workspaceId,
          metadata: {
            action: action.type,
            success: result.success,
            error: result.error,
            recommendationId: context.recommendationId,
            documentId: context.documentId,
            topicKey: context.topicKey,
          },
        });
      }

      return result;

    } catch (error) {
      logger.error("onboarding:cta:error", {
        action: action.type,
        workspaceId: context.workspaceId,
        userId: context.userId,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        message: "An unexpected error occurred",
      };
    }
  }

  /**
   * Validate if action is allowed in current onboarding stage
   */
  private validateActionForStage(
    action: OnboardingAction,
    state: OnboardingState
  ): { allowed: boolean; reason: string } {
    switch (action.type) {
      case "complete_setup":
        // Only allow completion if sufficient progress
        const hasProgress = state.selectedTopics.size > 0 || 
                           state.uploadedDocuments.length > 0 || 
                           state.configuredWorkflows.length > 0;
        
        if (!hasProgress) {
          return {
            allowed: false,
            reason: "Complete setup requires at least one topic selection, document upload, or workflow configuration"
          };
        }
        return { allowed: true, reason: "" };

      case "review_profile":
      case "upload_evidence":
      case "upload_specific_document":
      case "import_questionnaire_setup":
      case "invite_reviewer":
      case "review_topics":
      case "configure_workflow":
      case "view_document_details":
      case "view_topic_reason":
        // Always allowed during setup phase
        return { allowed: true, reason: "" };

      default:
        return {
          allowed: false,
          reason: `Unknown action type: ${action.type}`
        };
    }
  }

  /**
   * Execute specific action implementation
   */
  private async executeAction(
    action: OnboardingAction,
    context: any,
    state: OnboardingState
  ): Promise<OnboardingActionResult> {
    switch (action.type) {
      case "review_profile":
        return this.handleReviewProfile(context, state);
        
      case "upload_evidence":
        return this.handleUploadEvidence(context, state);
        
      case "upload_specific_document":
        return this.handleUploadSpecificDocument(context, state, action);
        
      case "import_questionnaire_setup":
        return this.handleImportQuestionnaireSetup(context, state);
        
      case "invite_reviewer":
        return this.handleInviteReviewer(context, state, action);
        
      case "review_topics":
        return this.handleReviewTopics(context, state);
        
      case "configure_workflow":
        return this.handleConfigureWorkflow(context, state);
        
      case "view_document_details":
        return this.handleViewDocumentDetails(context, state);
        
      case "view_topic_reason":
        return this.handleViewTopicReason(context, state);
        
      case "complete_setup":
        return this.handleCompleteSetup(context, state);
        
      default:
        return {
          success: false,
          error: `Unsupported action type: ${action.type}`,
        };
    }
  }

  /**
   * Handle profile review - opens profile review modal
   */
  private async handleReviewProfile(
    context: any,
    state: OnboardingState
  ): Promise<OnboardingActionResult> {
    // In setup phase, this should probably just take the user back to the profile step
    // which is handled by the parent component changing its step state.
    return {
      success: true,
      message: "Returning to profile review",
      nextAction: "switch_step_profile"
    };
  }

  /**
   * Handle evidence upload - opens evidence upload modal
   */
  private async handleUploadEvidence(
    context: any,
    state: OnboardingState
  ): Promise<OnboardingActionResult> {
    return {
      success: true,
      message: "Evidence upload modal requested",
      nextAction: "open_modal_evidence",
      metadata: {
        recommendationId: context.recommendationId,
        linkedTopicKeys: context.topicKeys || context.metadata?.topicKeys || [],
      }
    };
  }

  /**
   * Handle specific document upload - uploads specific document type
   */
  private async handleUploadSpecificDocument(
    context: any,
    state: OnboardingState,
    action: OnboardingAction
  ): Promise<OnboardingActionResult> {
    const documentType =
      action.metadata?.documentType ||
      context.documentType ||
      action.title;
    const recommendationId =
      context.recommendationId ||
      action.linkedRecommendationIds?.[0] ||
      action.id;

    return {
      success: true,
      message: `Upload ${documentType} requested`,
      nextAction: "open_modal_evidence_specific",
      metadata: {
        documentType,
        recommendationId,
        linkedTopicKeys:
          context.topicKeys ||
          action.metadata?.topicKeys ||
          context.metadata?.topicKeys ||
          [],
        evidenceCategory: action.metadata?.evidenceCategory || context.evidenceCategory,
      },
    };
  }

  /**
   * Handle questionnaire import setup - opens questionnaire import modal
   */
  private async handleImportQuestionnaireSetup(
    context: any,
    state: OnboardingState
  ): Promise<OnboardingActionResult> {
    return {
      success: true,
      message: "Questionnaire import requested",
      nextAction: "open_modal_questionnaire"
    };
  }

  /**
   * Handle reviewer invitation - opens reviewer invite modal
   */
  private async handleInviteReviewer(
    context: any,
    state: OnboardingState,
    action: OnboardingAction
  ): Promise<OnboardingActionResult> {
    const recommendationId =
      context.recommendationId || action.linkedRecommendationIds?.[0];
    const suggestedRole =
      (context.metadata?.suggestedRole as WorkspaceRole | undefined) || "CONTRIBUTOR";
    return {
      success: true,
      message: "Reviewer invitation requested",
      nextAction: "open_modal_invite",
      metadata: {
        recommendationId,
        suggestedRole,
      },
    };
  }

  /**
   * Handle topics review - opens topics review modal
   */
  private async handleReviewTopics(
    context: any,
    state: OnboardingState
  ): Promise<OnboardingActionResult> {
    // If we have selected topics in the context, it means we're saving them
    if (context.selectedTopics && Array.isArray(context.selectedTopics)) {
      try {
        const response = await fetch("/api/onboarding/topics", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspaceId: context.workspaceId,
            topicKeys: context.selectedTopics,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Failed to persist topics");
        }

        return {
          success: true,
          message: `Successfully saved ${context.selectedTopics.length} topics`,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Failed to save topics",
        };
      }
    }

    return {
      success: true,
      message: "Topics review requested",
      nextAction: "open_modal_topics"
    };
  }

  /**
   * Handle workflow configuration - opens workflow config modal
   */
  private async handleConfigureWorkflow(
    context: any,
    state: OnboardingState
  ): Promise<OnboardingActionResult> {
    return {
      success: true,
      message: "Workflow configuration requested",
      nextAction: "open_modal_workflow"
    };
  }

  /**
   * Handle document details view - opens document details modal
   */
  private async handleViewDocumentDetails(
    context: any,
    state: OnboardingState
  ): Promise<OnboardingActionResult> {
    return {
      success: true,
      message: "Document details requested",
      nextAction: "open_modal_document_details"
    };
  }

  /**
   * Handle topic reason view - shows topic recommendation details
   */
  private async handleViewTopicReason(
    context: any,
    state: OnboardingState
  ): Promise<OnboardingActionResult> {
    return {
      success: true,
      message: "Topic reason requested",
      nextAction: "expand_topic_card"
    };
  }

  /**
   * Handle complete setup - triggers workspace preparation orchestration
   */
  private async handleCompleteSetup(
    context: any,
    state: OnboardingState
  ): Promise<OnboardingActionResult> {
    try {
      // Trigger workspace preparation orchestration via API
      const response = await fetch("/api/onboarding/orchestrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: context.workspaceId,
          selectedTopicKeys: Array.from(state.selectedTopics),
          recommendedTopicPacks: [], // TODO: Get from context if needed
          profileSignals: {}, // TODO: Get from context if needed
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Workspace preparation failed");
      }

      const result = await response.json();

      if (result.success) {
        return {
          success: true,
          message: "Workspace preparation completed successfully",
          shouldRedirect: true,
          redirectUrl: "/app", // Only redirect after successful orchestration
        };
      } else {
        return {
          success: false,
          error: "Workspace preparation failed",
          message: result.orchestration?.finalState?.errors?.join(", ") || "Unknown error",
        };
      }

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        message: "Failed to complete setup",
      };
    }
  }

  /**
   * Get current onboarding state
   */
  private async getOnboardingState(
    workspaceId: string,
    userId: string
  ): Promise<OnboardingState> {
    // In setup phase, we can try to restore state from workspace metadata
    try {
      const response = await fetch(`/api/onboarding/workspace?workspaceId=${workspaceId}`);
      if (response.ok) {
        const data = await response.json();
        const metadata = data.workspace?.onboardingIntelMetaJson || {};
        
        return {
          workspaceId,
          userId,
          currentStage: metadata.currentStage || "initial_setup",
          selectedTopics: new Set(metadata.selectedTopicKeys || []),
          uploadedDocuments: metadata.uploadedDocuments || [],
          configuredWorkflows: metadata.configuredWorkflows || [],
          invitedReviewers: metadata.invitedReviewers || [],
          completedActions: metadata.completedActions || [],
          lastActivity: new Date(metadata.lastActivity || Date.now()),
        };
      }
    } catch (error) {
      console.warn("Failed to fetch onboarding state, using default", error);
    }

    return {
      workspaceId,
      userId,
      currentStage: "initial_setup",
      selectedTopics: new Set(),
      uploadedDocuments: [],
      configuredWorkflows: [],
      invitedReviewers: [],
      completedActions: [],
      lastActivity: new Date(),
    };
  }

  /**
   * Update onboarding state after action completion
   */
  private async updateOnboardingState(
    workspaceId: string,
    userId: string,
    action: OnboardingAction,
    result: OnboardingActionResult
  ): Promise<void> {
    // Log the action
    logger.info("onboarding:state:update", {
      workspaceId,
      userId,
      action: action.type,
      success: result.success,
      message: result.message,
    });

    // Optionally update workspace metadata for non-topic actions
    if (result.success && action.type !== "review_topics") {
      try {
        await fetch(`/api/onboarding/workspace`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspaceId,
            actionType: action.type,
            metadata: action.metadata,
          }),
        });
      } catch (err) {
        console.warn("Failed to update onboarding state in background", err);
      }
    }
  }

  /**
   * Mark a recommendation as satisfied
   */
  private async markRecommendationSatisfied(
    recommendationId: string,
    workspaceId: string,
    userId: string
  ): Promise<void> {
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/recommendations/${recommendationId}/satisfy`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId,
          satisfiedAt: new Date().toISOString(),
        }),
      });

      if (!response.ok) {
        console.error("Failed to mark recommendation as satisfied:", await response.text());
      }
    } catch (error) {
      console.error("Error marking recommendation as satisfied:", error);
    }
  }

  /**
   * Update onboarding stage
   */
  private async updateOnboardingStage(
    workspaceId: string,
    userId: string,
    stage: OnboardingState["currentStage"]
  ): Promise<void> {
    // TODO: Implement proper stage persistence
    logger.info("onboarding:stage:update", {
      workspaceId,
      userId,
      stage,
    });
  }

  /**
   * Map recommendation action to onboarding action
   */
  static mapRecommendationAction(actionType: string): OnboardingActionType | null {
    const mapping: Record<string, OnboardingActionType> = {
      "upload_document": "upload_evidence",
      "import_questionnaire": "import_questionnaire_setup",
      "review_topics": "review_topics",
      "invite_reviewer": "invite_reviewer",
      "configure_workspace": "configure_workflow",
      "manual_profile_review": "review_profile",
      "continue_setup": "complete_setup",
    };

    return mapping[actionType] || null;
  }
}
