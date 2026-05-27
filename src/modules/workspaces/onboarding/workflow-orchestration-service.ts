/**
 * TrustDesk Workflow Orchestration Service
 * 
 * Automatically configures governance and trust workflows from onboarding profile signals.
 * Implements "TrustDesk should prepare operational trust workflows automatically" principle.
 * 
 * Key principles:
 * - Detect enterprise/procurement posture from profile signals
 * - Auto-enable workflow defaults without forcing settings
 * - Prepare reviewer recommendations based on governance needs
 * - Configure export readiness defaults
 * - Preserve user control and manual overrides
 * - Idempotent and merge-safe operations
 */

import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logging/logger";
import { AUDIT_EVENT_TYPES, AUDIT_OBJECT_TYPES, recordAuditEventSafe } from "@/lib/audit";
import type { Workspace } from "@prisma/client";

export interface EnterprisePostureDetection {
  isEnterprise: boolean;
  isB2B: boolean;
  hasComplianceRequirements: boolean;
  hasSecurityPosture: boolean;
  hasProcurementSignals: boolean;
  governanceSensitivity: "low" | "medium" | "high";
  confidence: number;
  evidence: string[];
}

export interface WorkflowDefaults {
  approvalWorkflow: {
    enabled: boolean;
    requiredApprovers: number;
    evidenceBacked: boolean;
  };
  exportSettings: {
    evidenceBacked: boolean;
    readinessChecks: boolean;
    reviewBeforeExport: boolean;
  };
  governanceSettings: {
    enabled: boolean;
    reviewerReady: boolean;
    complianceChecks: boolean;
  };
}

export interface ReviewerRecommendation {
  type: "security" | "compliance" | "executive" | "technical";
  priority: "high" | "medium" | "low";
  reasoning: string;
  suggestedSkills: string[];
  required: boolean;
}

export interface WorkflowOrchestrationResult {
  workspaceId: string;
  postureDetection: EnterprisePostureDetection;
  configuredDefaults: WorkflowDefaults;
  reviewerRecommendations: ReviewerRecommendation[];
  appliedSettings: string[];
  skippedSettings: string[];
  userOverriddenSettings: string[];
  errors: string[];
  warnings: string[];
}

export interface WorkflowPreparationMetadata {
  autoConfiguredSettings: string[];
  configSource: "onboarding";
  onboardingAppliedDefaults: WorkflowDefaults;
  userOverriddenSettings: string[];
  orchestrationVersion: string;
  orchestratedAt: Date;
  orchestrationSessionId: string;
}

const ORCHESTRATION_VERSION = "1.0.0";

/**
 * Enterprise posture detection patterns and rules
 */
const ENTERPRISE_SIGNALS = {
  // B2B signals
  b2bKeywords: [
    "enterprise", "b2b", "business", "corporate", "organization", "company",
    "client", "customer", "partner", "vendor", "supplier", "procurement"
  ],
  
  // Enterprise customer signals
  enterpriseCustomerKeywords: [
    "fortune", "forbes", "enterprise", "large enterprise", "mid-market",
    "corporate", "multinational", "public company", "regulated"
  ],
  
  // Compliance signals
  complianceKeywords: [
    "soc2", "iso27001", "gdpr", "hipaa", "pci", "sox", "compliance",
    "audit", "regulation", "certified", "attestation"
  ],
  
  // Security posture signals
  securityKeywords: [
    "security", "information security", "cybersecurity", "infosec",
    "secure", "encrypted", "protected", "compliant", "risk management"
  ],
  
  // Procurement terminology
  procurementKeywords: [
    "procurement", "vendor management", "due diligence", "assessment",
    "questionnaire", "rfp", "rfi", "security review", "vendor assessment"
  ],
};

/**
 * Workflow defaults based on enterprise posture
 */
const WORKFLOW_DEFAULTS: Record<EnterprisePostureDetection["governanceSensitivity"], WorkflowDefaults> = {
  low: {
    approvalWorkflow: {
      enabled: false,
      requiredApprovers: 1,
      evidenceBacked: false,
    },
    exportSettings: {
      evidenceBacked: false,
      readinessChecks: false,
      reviewBeforeExport: false,
    },
    governanceSettings: {
      enabled: false,
      reviewerReady: false,
      complianceChecks: false,
    },
  },
  medium: {
    approvalWorkflow: {
      enabled: true,
      requiredApprovers: 1,
      evidenceBacked: true,
    },
    exportSettings: {
      evidenceBacked: true,
      readinessChecks: true,
      reviewBeforeExport: false,
    },
    governanceSettings: {
      enabled: true,
      reviewerReady: true,
      complianceChecks: true,
    },
  },
  high: {
    approvalWorkflow: {
      enabled: true,
      requiredApprovers: 2,
      evidenceBacked: true,
    },
    exportSettings: {
      evidenceBacked: true,
      readinessChecks: true,
      reviewBeforeExport: true,
    },
    governanceSettings: {
      enabled: true,
      reviewerReady: true,
      complianceChecks: true,
    },
  },
};

/**
 * Reviewer recommendations based on governance sensitivity
 */
const REVIEWER_RECOMMENDATIONS: Record<EnterprisePostureDetection["governanceSensitivity"], ReviewerRecommendation[]> = {
  low: [],
  medium: [
    {
      type: "security",
      priority: "medium",
      reasoning: "Security posture detected - consider adding a security reviewer",
      suggestedSkills: ["information security", "risk assessment", "compliance"],
      required: false,
    },
    {
      type: "technical",
      priority: "medium", 
      reasoning: "B2B environment - consider adding a technical reviewer",
      suggestedSkills: ["technical architecture", "system design", "security"],
      required: false,
    },
  ],
  high: [
    {
      type: "security",
      priority: "high",
      reasoning: "High governance sensitivity - security reviewer recommended",
      suggestedSkills: ["information security", "risk assessment", "compliance auditing"],
      required: true,
    },
    {
      type: "compliance",
      priority: "high",
      reasoning: "Compliance requirements detected - compliance reviewer recommended",
      suggestedSkills: ["regulatory compliance", "audit management", "legal"],
      required: true,
    },
    {
      type: "executive",
      priority: "medium",
      reasoning: "Enterprise environment - executive oversight recommended",
      suggestedSkills: ["governance", "risk management", "business operations"],
      required: false,
    },
  ],
};

/**
 * Core workflow orchestration service
 */
export class WorkflowOrchestrationService {
  /**
   * Main orchestration entry point
   * Called during onboarding completion to configure workflows based on profile signals
   */
  static async orchestrateWorkflows(
    workspaceId: string,
    userId: string,
    profileSignals: {
      industry?: string[];
      productType?: string[];
      customerSegment?: string[];
      complianceTargets?: string[];
      deepProfileJson?: any;
      tailoringConfidence?: number;
    },
    options: {
      orchestrationSessionId?: string;
      forceReconfigure?: boolean;
    } = {}
  ): Promise<WorkflowOrchestrationResult> {
    const orchestrationSessionId = options.orchestrationSessionId || `workflow-${Date.now()}`;
    const orchestrationStartMs = performance.now();
    
    logger.info("workflow:orchestration:start", {
      workspaceId,
      userId,
      orchestrationSessionId,
      profileSignals,
    });

    const result: WorkflowOrchestrationResult = {
      workspaceId,
      postureDetection: {
        isEnterprise: false,
        isB2B: false,
        hasComplianceRequirements: false,
        hasSecurityPosture: false,
        hasProcurementSignals: false,
        governanceSensitivity: "low",
        confidence: 0,
        evidence: [],
      },
      configuredDefaults: WORKFLOW_DEFAULTS.low,
      reviewerRecommendations: [],
      appliedSettings: [],
      skippedSettings: [],
      userOverriddenSettings: [],
      errors: [],
      warnings: [],
    };

    try {
      // 1. Get current workspace and existing settings
      const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        include: {
          members: {
            where: { status: "ACTIVE" },
            select: { id: true, role: true },
          },
        },
      });

      if (!workspace) {
        throw new Error(`Workspace ${workspaceId} not found`);
      }

      // 2. Detect enterprise posture
      const postureDetection = await this.detectEnterprisePosture(profileSignals, workspace);
      result.postureDetection = postureDetection;

      // 3. Determine workflow defaults
      const recommendedDefaults = WORKFLOW_DEFAULTS[postureDetection.governanceSensitivity];
      result.configuredDefaults = recommendedDefaults;

      // 4. Get reviewer recommendations
      const reviewerRecommendations = REVIEWER_RECOMMENDATIONS[postureDetection.governanceSensitivity];
      result.reviewerRecommendations = reviewerRecommendations;

      // 5. Apply workflow defaults (with override preservation)
      const appliedSettings = await this.applyWorkflowDefaults(
        workspaceId,
        userId,
        recommendedDefaults,
        options.forceReconfigure
      );
      result.appliedSettings = appliedSettings.applied;
      result.skippedSettings = appliedSettings.skipped;
      result.userOverriddenSettings = appliedSettings.overridden;

      // 6. Store orchestration metadata
      await this.storeOrchestrationMetadata(
        workspaceId,
        {
          autoConfiguredSettings: appliedSettings.applied,
          configSource: "onboarding",
          onboardingAppliedDefaults: recommendedDefaults,
          userOverriddenSettings: appliedSettings.overridden,
          orchestrationVersion: ORCHESTRATION_VERSION,
          orchestratedAt: new Date(),
          orchestrationSessionId,
        }
      );

      // 7. Record audit event
      await recordAuditEventSafe({
        workspaceId,
        actorUserId: userId,
        eventType: AUDIT_EVENT_TYPES.WORKSPACE_UPDATED,
        objectType: AUDIT_OBJECT_TYPES.WORKSPACE,
        objectId: workspaceId,
        metadata: {
          action: "workflows_orchestrated_from_onboarding",
          postureDetection,
          appliedSettings: appliedSettings.applied,
          governanceSensitivity: postureDetection.governanceSensitivity,
          orchestrationSessionId,
        },
      });

      logger.info("workflow:orchestration:complete", {
        workspaceId,
        governanceSensitivity: result.postureDetection.governanceSensitivity,
        appliedSettings: result.appliedSettings.length,
        durationMs: Math.round(performance.now() - orchestrationStartMs),
      });

      return result;

    } catch (error) {
      logger.error("workflow:orchestration:error", {
        workspaceId,
        error: error instanceof Error ? error.message : String(error),
      });
      
      result.errors.push(error instanceof Error ? error.message : String(error));
      return result;
    }
  }

  /**
   * Detect enterprise posture from profile signals
   */
  private static async detectEnterprisePosture(
    profileSignals: any,
    workspace: Workspace
  ): Promise<EnterprisePostureDetection> {
    const evidence: string[] = [];
    let confidence = 0;
    
    // Analyze all text sources
    const textSources = [
      ...(profileSignals.industry || []),
      ...(profileSignals.productType || []),
      ...(profileSignals.customerSegment || []),
      ...(profileSignals.complianceTargets || []),
      workspace.name,
      workspace.website || "",
      JSON.stringify(profileSignals.deepProfileJson || {}),
    ].join(" ").toLowerCase();

    const detection: EnterprisePostureDetection = {
      isEnterprise: false,
      isB2B: false,
      hasComplianceRequirements: false,
      hasSecurityPosture: false,
      hasProcurementSignals: false,
      governanceSensitivity: "low",
      confidence: 0,
      evidence: [],
    };

    // Check B2B signals
    const b2bMatches = ENTERPRISE_SIGNALS.b2bKeywords.filter(keyword => 
      textSources.includes(keyword.toLowerCase())
    );
    if (b2bMatches.length > 0) {
      detection.isB2B = true;
      confidence += 0.3;
      evidence.push(`B2B signals: ${b2bMatches.join(", ")}`);
    }

    // Check enterprise customer signals
    const enterpriseCustomerMatches = ENTERPRISE_SIGNALS.enterpriseCustomerKeywords.filter(keyword => 
      textSources.includes(keyword.toLowerCase())
    );
    if (enterpriseCustomerMatches.length > 0) {
      detection.isEnterprise = true;
      confidence += 0.4;
      evidence.push(`Enterprise customer signals: ${enterpriseCustomerMatches.join(", ")}`);
    }

    // Check compliance signals
    const complianceMatches = ENTERPRISE_SIGNALS.complianceKeywords.filter(keyword => 
      textSources.includes(keyword.toLowerCase())
    );
    if (complianceMatches.length > 0 || (profileSignals.complianceTargets && profileSignals.complianceTargets.length > 0)) {
      detection.hasComplianceRequirements = true;
      confidence += 0.3;
      evidence.push(`Compliance signals: ${complianceMatches.join(", ")}`);
    }

    // Check security posture signals
    const securityMatches = ENTERPRISE_SIGNALS.securityKeywords.filter(keyword => 
      textSources.includes(keyword.toLowerCase())
    );
    if (securityMatches.length > 0) {
      detection.hasSecurityPosture = true;
      confidence += 0.2;
      evidence.push(`Security posture signals: ${securityMatches.join(", ")}`);
    }

    // Check procurement signals
    const procurementMatches = ENTERPRISE_SIGNALS.procurementKeywords.filter(keyword => 
      textSources.includes(keyword.toLowerCase())
    );
    if (procurementMatches.length > 0) {
      detection.hasProcurementSignals = true;
      confidence += 0.2;
      evidence.push(`Procurement signals: ${procurementMatches.join(", ")}`);
    }

    // Determine governance sensitivity
    if (detection.hasComplianceRequirements && detection.isEnterprise) {
      detection.governanceSensitivity = "high";
      confidence += 0.1;
    } else if (detection.isB2B && (detection.hasComplianceRequirements || detection.hasSecurityPosture)) {
      detection.governanceSensitivity = "medium";
      confidence += 0.05;
    } else {
      detection.governanceSensitivity = "low";
    }

    detection.confidence = Math.min(confidence, 1.0);
    detection.evidence = evidence;

    return detection;
  }

  /**
   * Apply workflow defaults with override preservation
   */
  private static async applyWorkflowDefaults(
    workspaceId: string,
    userId: string,
    defaults: WorkflowDefaults,
    forceReconfigure: boolean = false
  ): Promise<{ applied: string[]; skipped: string[]; overridden: string[] }> {
    const applied: string[] = [];
    const skipped: string[] = [];
    const overridden: string[] = [];

    try {
      // Get current workspace settings
      const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: {
          onboardingIntelMetaJson: true,
        },
      });

      const currentMetadata = workspace?.onboardingIntelMetaJson as any || {};
      const userOverrides = currentMetadata.userOverrides || {};

      // Apply approval workflow settings
      if (defaults.approvalWorkflow.enabled) {
        const settingKey = "approvalWorkflow.enabled";
        if (!userOverrides[settingKey] || forceReconfigure) {
          // This would integrate with the actual workflow system
          // For now, we'll store in metadata
          applied.push(settingKey);
        } else {
          overridden.push(settingKey);
        }
      }

      // Apply export settings
      if (defaults.exportSettings.evidenceBacked) {
        const settingKey = "exportSettings.evidenceBacked";
        if (!userOverrides[settingKey] || forceReconfigure) {
          applied.push(settingKey);
        } else {
          overridden.push(settingKey);
        }
      }

      if (defaults.exportSettings.readinessChecks) {
        const settingKey = "exportSettings.readinessChecks";
        if (!userOverrides[settingKey] || forceReconfigure) {
          applied.push(settingKey);
        } else {
          overridden.push(settingKey);
        }
      }

      if (defaults.exportSettings.reviewBeforeExport) {
        const settingKey = "exportSettings.reviewBeforeExport";
        if (!userOverrides[settingKey] || forceReconfigure) {
          applied.push(settingKey);
        } else {
          overridden.push(settingKey);
        }
      }

      // Apply governance settings
      if (defaults.governanceSettings.enabled) {
        const settingKey = "governanceSettings.enabled";
        if (!userOverrides[settingKey] || forceReconfigure) {
          applied.push(settingKey);
        } else {
          overridden.push(settingKey);
        }
      }

      if (defaults.governanceSettings.reviewerReady) {
        const settingKey = "governanceSettings.reviewerReady";
        if (!userOverrides[settingKey] || forceReconfigure) {
          applied.push(settingKey);
        } else {
          overridden.push(settingKey);
        }
      }

      if (defaults.governanceSettings.complianceChecks) {
        const settingKey = "governanceSettings.complianceChecks";
        if (!userOverrides[settingKey] || forceReconfigure) {
          applied.push(settingKey);
        } else {
          overridden.push(settingKey);
        }
      }

      // Update workspace metadata with applied settings
      await prisma.workspace.update({
        where: { id: workspaceId },
        data: {
          onboardingIntelMetaJson: {
            ...currentMetadata,
            workflowDefaults: defaults,
            appliedSettings: applied,
            lastWorkflowUpdate: new Date().toISOString(),
          },
        },
      });

    } catch (error) {
      logger.error("workflow:apply:defaults:error", {
        workspaceId,
        error: error instanceof Error ? error.message : String(error),
      });
      skipped.push("all_settings_due_to_error");
    }

    return { applied, skipped, overridden };
  }

  /**
   * Store orchestration metadata
   */
  private static async storeOrchestrationMetadata(
    workspaceId: string,
    metadata: WorkflowPreparationMetadata
  ): Promise<void> {
    try {
      const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { onboardingIntelMetaJson: true },
      });

      const currentMetadata = workspace?.onboardingIntelMetaJson as any || {};

      await prisma.workspace.update({
        where: { id: workspaceId },
        data: {
          onboardingIntelMetaJson: {
            ...currentMetadata,
            workflowPreparation: metadata,
          },
        },
      });

    } catch (error) {
      logger.error("workflow:metadata:store:error", {
        workspaceId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Get workflow orchestration result for a workspace
   */
  static async getOrchestrationResult(
    workspaceId: string
  ): Promise<WorkflowOrchestrationResult | null> {
    try {
      const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { onboardingIntelMetaJson: true },
      });

      const metadataJson = workspace?.onboardingIntelMetaJson as any;
      if (!metadataJson?.workflowPreparation) {
        return null;
      }

      const metadata = metadataJson.workflowPreparation as WorkflowPreparationMetadata;

      return {
        workspaceId,
        postureDetection: {
          isEnterprise: false,
          isB2B: false,
          hasComplianceRequirements: false,
          hasSecurityPosture: false,
          hasProcurementSignals: false,
          governanceSensitivity: "low",
          confidence: 0,
          evidence: [],
        },
        configuredDefaults: metadata.onboardingAppliedDefaults,
        reviewerRecommendations: [],
        appliedSettings: metadata.autoConfiguredSettings,
        skippedSettings: [],
        userOverriddenSettings: metadata.userOverriddenSettings,
        errors: [],
        warnings: [],
      };

    } catch (error) {
      logger.error("workflow:result:get:error", {
        workspaceId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Override workflow settings (user manual configuration)
   */
  static async overrideWorkflowSettings(
    workspaceId: string,
    userId: string,
    overrides: Record<string, any>
  ): Promise<{ success: boolean; errors: string[] }> {
    const errors: string[] = [];

    try {
      const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { onboardingIntelMetaJson: true },
      });

      const currentMetadata = workspace?.onboardingIntelMetaJson as any || {};
      const userOverrides = currentMetadata.userOverrides || {};

      // Add new overrides
      const updatedOverrides = {
        ...userOverrides,
        ...overrides,
        overriddenAt: new Date().toISOString(),
        overriddenBy: userId,
      };

      await prisma.workspace.update({
        where: { id: workspaceId },
        data: {
          onboardingIntelMetaJson: {
            ...currentMetadata,
            userOverrides: updatedOverrides,
          },
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
          action: "workflow_settings_overridden",
          overriddenSettings: Object.keys(overrides),
        },
      });

      logger.info("workflow:override:success", {
        workspaceId,
        userId,
        overriddenSettings: Object.keys(overrides),
      });

      return { success: true, errors };

    } catch (error) {
      const errorMsg = `Override failed: ${error instanceof Error ? error.message : String(error)}`;
      errors.push(errorMsg);
      logger.error("workflow:override:error", {
        workspaceId,
        error: errorMsg,
      });

      return { success: false, errors };
    }
  }

  /**
   * Get reviewer recommendations for a workspace
   */
  static async getReviewerRecommendations(
    workspaceId: string
  ): Promise<ReviewerRecommendation[]> {
    try {
      const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { onboardingIntelMetaJson: true },
      });

      const metadataJson = workspace?.onboardingIntelMetaJson as any;
      if (!metadataJson?.workflowPreparation) {
        return [];
      }

      const metadata = metadataJson.workflowPreparation as WorkflowPreparationMetadata;
      const governanceSensitivity = this.determineGovernanceSensitivity(metadata.onboardingAppliedDefaults);

      return REVIEWER_RECOMMENDATIONS[governanceSensitivity];

    } catch (error) {
      logger.error("workflow:reviewers:get:error", {
        workspaceId,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * Determine governance sensitivity from workflow defaults
   */
  private static determineGovernanceSensitivity(defaults: WorkflowDefaults): EnterprisePostureDetection["governanceSensitivity"] {
    if (defaults.governanceSettings.enabled && defaults.exportSettings.reviewBeforeExport) {
      return "high";
    } else if (defaults.approvalWorkflow.enabled && defaults.exportSettings.evidenceBacked) {
      return "medium";
    } else {
      return "low";
    }
  }

  /**
   * Reset workflow orchestration (for testing/rollback)
   */
  static async resetWorkflowOrchestration(
    workspaceId: string,
    userId: string
  ): Promise<{ success: boolean; errors: string[] }> {
    const errors: string[] = [];

    try {
      const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { onboardingIntelMetaJson: true },
      });

      const currentMetadata = workspace?.onboardingIntelMetaJson as any || {};

      // Remove workflow preparation metadata
      const { workflowPreparation, ...remainingMetadata } = currentMetadata;

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
          action: "workflow_orchestration_reset",
        },
      });

      logger.info("workflow:reset:success", {
        workspaceId,
        userId,
      });

      return { success: true, errors };

    } catch (error) {
      const errorMsg = `Reset failed: ${error instanceof Error ? error.message : String(error)}`;
      errors.push(errorMsg);
      logger.error("workflow:reset:error", {
        workspaceId,
        error: errorMsg,
      });

      return { success: false, errors };
    }
  }
}
