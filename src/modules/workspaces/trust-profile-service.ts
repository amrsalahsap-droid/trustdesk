import { type Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { AUDIT_EVENT_TYPES, AUDIT_OBJECT_TYPES, recordAuditEventSafe } from "@/lib/audit";
import { TopicPackService } from "../knowledge/topics/topic-pack-service";
import { DocumentRecommendationService } from "./onboarding/document-recommendation-service";
import { DocumentEnrichmentService } from "./onboarding/document-enrichment-service";
import { TailoringEngine } from "./onboarding/tailoring-engine";
import { InsufficientRoleError } from "@/lib/auth/errors";
import { ScopedResourceNotFoundError } from "@/lib/domain/scoped-resource-not-found";
import { logger } from "@/lib/logging/logger";
import { CompanyProfileService } from "./company-profile-service";
import { OnboardingIntelService } from "./onboarding/onboarding-intel-service";
import { effectiveOnboardingFlag } from "@/lib/feature-flags/onboarding-flags";
import {
  countObservedBusinessFields,
  countObservedComplianceFields,
  type DeepInferredProfile,
  type Signal,
} from "./onboarding/website-analysis-service";
import { ProfileFieldService, type ProfileFieldConfirmation, UnresolvedConflictsError } from "./profile-field-service";

export { UnresolvedConflictsError };

export type TrustProfileMetadata = {
  industry?: string[];
  productType?: string[];
  customerSegment?: string[];
  dataTypes?: string[];
  complianceTargets?: string[];
  /** Full DeepInferredProfile from analyze; validated before persisting to deepProfileJson */
  analyzedProfile?: unknown;
  /** Field-level confirmations from the review step */
  fieldConfirmations?: ProfileFieldConfirmation[];
};

function isAnalyzedProfilePayload(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const o = value as Record<string, unknown>;
  return "industry" in o || "productType" in o;
}

function isPersistableDeepProfile(
  analyzed: unknown,
  workspaceId: string,
): analyzed is DeepInferredProfile {
  if (!effectiveOnboardingFlag("failClosedInference", workspaceId)) return true;
  if (!analyzed || typeof analyzed !== "object" || Array.isArray(analyzed)) return false;
  const p = analyzed as DeepInferredProfile;
  const conf = typeof p.tailoringConfidence === "number" ? p.tailoringConfidence : 0;
  const busObs = countObservedBusinessFields(p);
  const compObs = countObservedComplianceFields(p);
  const persistBusiness =
    busObs >= 1 ||
    (conf >= 0.4 &&
      ((p.industry?.confidence ?? 0) >= 0.4 || (p.productType?.confidence ?? 0) >= 0.4));
  const persistCompliance = compObs >= 1 && conf >= 0.4;
  return persistBusiness || persistCompliance;
}

export class TrustProfileService {
  /**
   * Updates a workspace's business profile and records an audit event.
   * Returns tailored recommendations based on the new profile.
   */
  static async updateProfile(
    workspaceId: string,
    userId: string,
    metadata: TrustProfileMetadata,
  ) {
    try {
      const hasAnalyzedProfile = isAnalyzedProfilePayload(metadata.analyzedProfile);
      const persistDeep =
        hasAnalyzedProfile &&
        isPersistableDeepProfile(metadata.analyzedProfile, workspaceId);
      const fieldsConfirmed = {
        industry: (metadata.industry?.length ?? 0) > 0,
        productType: (metadata.productType?.length ?? 0) > 0,
        customerSegment: (metadata.customerSegment?.length ?? 0) > 0,
        dataTypes: (metadata.dataTypes?.length ?? 0) > 0,
        complianceTargets: (metadata.complianceTargets?.length ?? 0) > 0,
      };

      // 1. Verify membership and permissions (OWNER/ADMIN)
      const membership = await prisma.workspaceMembership.findFirst({
        where: {
          workspaceId,
          userId,
          status: "ACTIVE",
          role: { in: ["OWNER", "ADMIN"] },
        },
      });

      if (!membership) {
        throw new InsufficientRoleError("Insufficient permissions to update workspace profile");
      }

      // 2. Perform update (scalars + optional analyzed deep profile on confirm)
      const updateData: Prisma.WorkspaceUpdateInput = {
        industry: metadata.industry,
        productType: metadata.productType,
        customerSegment: metadata.customerSegment,
        dataTypes: metadata.dataTypes,
        complianceTargets: metadata.complianceTargets,
      };

      if (hasAnalyzedProfile && persistDeep) {
        updateData.deepProfileJson = metadata.analyzedProfile as Prisma.InputJsonValue;
      } else if (hasAnalyzedProfile && !persistDeep) {
        logger.warn("onboarding:profile:inference-suppressed", {
          workspaceId,
          reason: "fail_closed_or_weak_signals",
        });
      }

      const workspace = await prisma.workspace.update({
        where: { id: workspaceId },
        data: updateData,
      });

      if (!workspace) {
        throw new ScopedResourceNotFoundError("Workspace not found");
      }

      // 2a. Store AI suggestions as provisional profile fields
      if (hasAnalyzedProfile && metadata.analyzedProfile) {
        const profile = metadata.analyzedProfile as DeepInferredProfile;
        const signals: Record<string, Signal<unknown> | undefined> = {
          industry: profile.industry,
          productType: profile.productType,
          customerSegment: profile.customerSegment,
          dataTypes: profile.dataTypes,
          complianceSignals: profile.complianceSignals,
          userTypes: profile.userTypes,
          internalRoles: profile.internalRoles,
          operationalWorkflows: profile.operationalWorkflows,
          trustClaims: profile.trustClaims,
          riskAreas: profile.riskAreas,
        };
        const fieldInputs = ProfileFieldService.signalsToFieldInputs(signals);
        await ProfileFieldService.storeSuggestions(workspaceId, userId, fieldInputs);
      }

      // 2b. Process field-level confirmations if provided
      if (metadata.fieldConfirmations && metadata.fieldConfirmations.length > 0) {
        await ProfileFieldService.confirmFields(workspaceId, userId, metadata.fieldConfirmations);
      }

      logger.info("onboarding:profile:persisted", {
        workspaceId,
        hasAnalyzedProfile,
        hasDeepProfileWrite: persistDeep,
        fieldsConfirmed,
        fieldConfirmationsCount: metadata.fieldConfirmations?.length ?? 0,
      });

      // 3. Record Audit Event
      await recordAuditEventSafe({
        workspaceId,
        actorUserId: userId,
        eventType: AUDIT_EVENT_TYPES.WORKSPACE_PROFILE_UPDATED,
        objectType: AUDIT_OBJECT_TYPES.WORKSPACE,
        objectId: workspaceId,
        metadata: {
          industry: metadata.industry,
          productType: metadata.productType,
          customerSegment: metadata.customerSegment,
          hasAnalyzedProfile,
          persistedDeepProfile: persistDeep,
        },
      });

      const companyProfile = CompanyProfileService.build({
        id: workspace.id,
        name: workspace.name,
        industry: workspace.industry,
        productType: workspace.productType,
        customerSegment: workspace.customerSegment,
        dataTypes: workspace.dataTypes,
        complianceTargets: workspace.complianceTargets,
        deepProfileJson: workspace.deepProfileJson,
      });

      // 4. Generate Recommendations
      const packs = TopicPackService.getRecommendationsForProfile(companyProfile);

      const documents = DocumentRecommendationService.getRecommendationsForProfile(
        companyProfile,
      );

      // 5. Merge Intelligence (Confirmed + Inferred) — TailoringEngine delegates to CompanyProfileService
      const tailoredProfile = TailoringEngine.merge(workspace, workspace.deepProfileJson as any);

      // 6. Enrich Documents with AI intelligence (Two-Stage)
      const enrichment = await DocumentEnrichmentService.enrichDocuments(
        workspaceId,
        documents,
        companyProfile,
      );

      // Merge enrichment into documents
      const enrichedDocuments = documents.map(doc => {
        const guidance = enrichment[doc.id];
        if (guidance) {
          const seeded = guidance.seededTopics || [];
          return {
            ...doc,
            tailoredDescription: guidance.tailoredDescription,
            whyItMatters: guidance.whyItMatters,
            recommendedSections: guidance.recommendedSections,
            seededTopics: seeded.join(", "),
            seededTopicKeys: seeded,
            importanceIndicator: guidance.importanceIndicator,
            tailoringMode: tailoredProfile.mode,
            tailoringConfidence: tailoredProfile.confidence,
            brief: guidance.brief,
            whyItMattersForBusiness: guidance.whyItMattersForBusiness,
            workflowsToCover: guidance.workflowsToCover,
            rolesPersonas: guidance.rolesPersonas,
            sensitiveDataTypes: guidance.sensitiveDataTypes,
            trustComplianceClaims: guidance.trustComplianceClaims,
            helpsSeedTrustDeskTopics: guidance.helpsSeedTrustDeskTopics,
          };
        }
        return doc;
      });

      await OnboardingIntelService.persistSnapshotAfterProfileSave({
        workspaceId,
        hasDeepProfileWrite: persistDeep,
        tailoringConfidence: tailoredProfile.confidence,
      });

      return { workspace, packs, documents: enrichedDocuments, tailoredProfile };
    } catch (error) {
      logger.error("trust-profile:updateProfile:error", {
        workspaceId,
        error: String(error),
      });
      throw error;
    }
  }

  /**
   * Confirm all non-conflicted profile fields.
   * Returns which fields were confirmed and which were skipped due to conflicts.
   * 
   * @param strictMode - If true, throws UnresolvedConflictsError when conflicted fields exist.
   */
  static async confirmAllSafeFields(
    workspaceId: string,
    userId: string,
    strictMode: boolean = false,
  ): Promise<{ confirmed: string[]; skipped: string[] }> {
    return ProfileFieldService.confirmAllSafeFields(workspaceId, userId, strictMode);
  }

  /**
   * Validate that all fields can be safely confirmed.
   * Throws UnresolvedConflictsError if any conflicted or unresolved fields exist.
   */
  static async validateConfirmAll(workspaceId: string): Promise<void> {
    return ProfileFieldService.validateConfirmAll(workspaceId);
  }

  /**
   * Get all fields that require user review.
   */
  static async getUnresolvedFields(workspaceId: string): Promise<
    Array<{ fieldKey: string; reason: "conflict" | "low_confidence" | "needs_review"; suggestedValue?: unknown }>
  > {
    return ProfileFieldService.getUnresolvedFields(workspaceId);
  }

  /**
   * Update a single profile field.
   * Used for field-level editing in the onboarding review flow.
   */
  static async updateField(
    workspaceId: string,
    userId: string,
    fieldKey: string,
    value: unknown,
    status: import("@prisma/client").ProfileFieldStatus,
    options?: { preserveOriginal?: boolean },
  ): Promise<void> {
    return ProfileFieldService.updateField(
      workspaceId,
      userId,
      fieldKey as import("./profile-field-service").ProfileFieldKey,
      value,
      status,
      options,
    );
  }
}
