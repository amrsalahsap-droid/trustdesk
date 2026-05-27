import { type Prisma, ProfileFieldStatus, ProfileFieldSourceType } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { AUDIT_EVENT_TYPES, AUDIT_OBJECT_TYPES, recordAuditEventSafe } from "@/lib/audit";
import { logger } from "@/lib/logging/logger";
import { type Signal, type SignalCitation, type SignalCandidate } from "./onboarding/website-analysis-service";

/**
 * Error thrown when attempting to confirm all fields but unresolved conflicts exist.
 */
export class UnresolvedConflictsError extends Error {
  public unresolvedFields: ProfileFieldKey[];
  public unresolvedFieldDetails: Array<{
    fieldKey: ProfileFieldKey;
    reason: "conflict" | "low_confidence" | "needs_review";
    suggestedValue?: unknown;
  }>;

  constructor(
    message: string,
    fields: Array<{
      fieldKey: ProfileFieldKey;
      reason: "conflict" | "low_confidence" | "needs_review";
      suggestedValue?: unknown;
    }>,
  ) {
    super(message);
    this.name = "UnresolvedConflictsError";
    this.unresolvedFields = fields.map((f) => f.fieldKey);
    this.unresolvedFieldDetails = fields;
  }
}

/**
 * Threshold for detecting conflicts between top candidates.
 * If the confidence gap between #1 and #2 is less than this (0.15 = 15%),
 * the field is marked as conflicted and requires user review.
 */
export const CONFLICT_DETECTION_THRESHOLD = 0.15; // 15 percentage points

/**
 * Minimum confidence for a high-confidence suggestion.
 * Below this, fields are marked as needs_review.
 */
export const LOW_CONFIDENCE_THRESHOLD = 0.4; // 40%

/**
 * Detects if a signal has conflicting candidates based on confidence proximity.
 * Returns conflict information if the top two candidates are within the threshold.
 */
function detectCandidateConflict<T>(
  candidates: SignalCandidate<T>[] | undefined,
  primaryValue: T,
): { hasConflict: boolean; rival?: { value: T; confidence: number } } {
  if (!candidates || candidates.length < 2) {
    return { hasConflict: false };
  }

  const top = candidates[0];
  const runnerUp = candidates[1];

  // Skip if runner-up is the same value as primary
  if (JSON.stringify(runnerUp.value) === JSON.stringify(primaryValue)) {
    return { hasConflict: false };
  }

  const confidenceGap = top.confidence - runnerUp.confidence;

  // If gap is smaller than threshold, it's a conflict
  if (confidenceGap < CONFLICT_DETECTION_THRESHOLD) {
    return {
      hasConflict: true,
      rival: {
        value: runnerUp.value,
        confidence: runnerUp.confidence,
      },
    };
  }

  return { hasConflict: false };
}

/**
 * Determines the appropriate status for a field based on confidence and conflicts.
 */
function determineFieldStatus(
  confidence: number,
  hasConflict: boolean,
  hasCandidates: boolean,
): ProfileFieldStatus {
  // If there's a conflict, it always needs review
  if (hasConflict) {
    return ProfileFieldStatus.NEEDS_REVIEW;
  }

  // Low confidence suggestions need review
  if (confidence < LOW_CONFIDENCE_THRESHOLD) {
    return ProfileFieldStatus.NEEDS_REVIEW;
  }

  // If we have candidates but no clear winner, needs review
  if (hasCandidates && confidence < 0.6) {
    return ProfileFieldStatus.NEEDS_REVIEW;
  }

  return ProfileFieldStatus.SUGGESTED;
}

export type ProfileFieldKey =
  | "industry"
  | "productType"
  | "customerSegment"
  | "dataTypes"
  | "complianceTargets"
  | "userTypes"
  | "internalRoles"
  | "operationalWorkflows"
  | "trustClaims"
  | "riskAreas";

export interface ProfileFieldInput {
  fieldKey: ProfileFieldKey;
  suggestedValue: unknown;
  confidence: number;
  sourceType: ProfileFieldSourceType;
  status: ProfileFieldStatus;
  citations?: SignalCitation[];
  conflictInfo?: unknown;
  /** All candidate values for enum fields, empty for array-valued fields */
  candidates?: SignalCandidate<unknown>[];
}

export interface ProfileFieldConfirmation {
  fieldKey: ProfileFieldKey;
  confirmedValue: unknown;
  status: typeof ProfileFieldStatus.CONFIRMED | typeof ProfileFieldStatus.EDITED | typeof ProfileFieldStatus.REJECTED;
}

function getConfidenceBand(confidence: number): string {
  if (confidence >= 0.7) return "high";
  if (confidence >= 0.4) return "medium";
  if (confidence > 0) return "low";
  return "none";
}

function mapSignalCategoryToSourceType(
  category: string | undefined,
): ProfileFieldSourceType {
  switch (category) {
    case "OBSERVED":
      return ProfileFieldSourceType.OBSERVED;
    case "DERIVED":
      return ProfileFieldSourceType.DERIVED;
    case "HYPOTHESIZED":
      return ProfileFieldSourceType.HYPOTHESIZED;
    case "CONFLICTED":
      return ProfileFieldSourceType.CONFLICTED;
    case "UNKNOWN":
      return ProfileFieldSourceType.UNKNOWN;
    default:
      return ProfileFieldSourceType.UNKNOWN;
  }
}

export class ProfileFieldService {
  /**
   * Store AI-generated suggestions as provisional profile fields.
   * Called after website analysis to save inferred signals.
   */
  static async storeSuggestions(
    workspaceId: string,
    userId: string,
    fields: ProfileFieldInput[],
  ): Promise<void> {
    try {
      await prisma.$transaction(
        fields.map((field) =>
          prisma.workspaceProfileField.upsert({
            where: {
              workspaceId_fieldKey: {
                workspaceId,
                fieldKey: field.fieldKey,
              },
            },
            create: {
              workspaceId,
              fieldKey: field.fieldKey,
              suggestedValue: field.suggestedValue as Prisma.InputJsonValue,
              confidence: field.confidence,
              confidenceBand: getConfidenceBand(field.confidence),
              sourceType: field.sourceType,
              status: field.status,
              citations: field.citations as Prisma.InputJsonValue,
              conflictInfo: field.conflictInfo as Prisma.InputJsonValue,
              candidates: field.candidates as Prisma.InputJsonValue,
            },
            update: {
              suggestedValue: field.suggestedValue as Prisma.InputJsonValue,
              confidence: field.confidence,
              confidenceBand: getConfidenceBand(field.confidence),
              sourceType: field.sourceType,
              status: field.status,
              confirmedValue: null,
              confirmedAt: null,
              rejectedAt: null,
              citations: field.citations as Prisma.InputJsonValue,
              conflictInfo: field.conflictInfo as Prisma.InputJsonValue,
              candidates: field.candidates as Prisma.InputJsonValue,
            },
          }),
        ),
      );

      logger.info("profile-field:suggestions-stored", {
        workspaceId,
        fieldCount: fields.length,
      });
    } catch (error) {
      logger.error("profile-field:store-suggestions-error", {
        workspaceId,
        error: String(error),
      });
      throw error;
    }
  }

  /**
   * Update a single profile field with new value and status.
   * Used for field-level editing in the onboarding review flow.
   */
  static async updateField(
    workspaceId: string,
    userId: string,
    fieldKey: ProfileFieldKey,
    value: unknown,
    status: ProfileFieldStatus,
    options?: {
      preserveOriginal?: boolean;
    },
  ): Promise<void> {
    try {
      const now = new Date();

      // Get the existing field to preserve original suggestion if needed
      const existingField = await prisma.workspaceProfileField.findUnique({
        where: {
          workspaceId_fieldKey: {
            workspaceId,
            fieldKey,
          },
        },
      });

      const updateData: Prisma.WorkspaceProfileFieldUpdateInput = {
        confirmedValue: value as Prisma.InputJsonValue,
        status,
        confirmedAt:
          status === ProfileFieldStatus.CONFIRMED ||
          status === ProfileFieldStatus.EDITED
            ? now
            : null,
        rejectedAt: status === ProfileFieldStatus.REJECTED ? now : null,
        // If edited or confirmed, mark source as MANUAL
        sourceType:
          status === ProfileFieldStatus.EDITED || status === ProfileFieldStatus.CONFIRMED
            ? ProfileFieldSourceType.MANUAL
            : existingField?.sourceType,
      };

      // If we want to preserve the original suggestion, ensure it's stored
      if (options?.preserveOriginal && existingField && !existingField.suggestedValue) {
        updateData.suggestedValue = existingField.suggestedValue;
      }

      await prisma.workspaceProfileField.update({
        where: {
          workspaceId_fieldKey: {
            workspaceId,
            fieldKey,
          },
        },
        data: updateData,
      });

      // Record audit event
      await recordAuditEventSafe({
        workspaceId,
        actorUserId: userId,
        eventType:
          status === ProfileFieldStatus.REJECTED
            ? AUDIT_EVENT_TYPES.SIGNAL_REJECTED
            : AUDIT_EVENT_TYPES.SIGNAL_CONFIRMED,
        objectType: AUDIT_OBJECT_TYPES.WORKSPACE,
        objectId: workspaceId,
        metadata: {
          fieldKey,
          status,
          confirmedValue: status !== ProfileFieldStatus.REJECTED ? value : null,
          previousStatus: existingField?.status,
          previousValue: existingField?.confirmedValue,
        },
      });

      // Update workspace scalar values
      await this.syncConfirmedValuesToWorkspace(workspaceId);

      logger.info("profile-field:field-updated", {
        workspaceId,
        fieldKey,
        status,
        userId,
      });
    } catch (error) {
      logger.error("profile-field:update-field-error", {
        workspaceId,
        fieldKey,
        status,
        error: String(error),
      });
      throw error;
    }
  }

  /**
   * Confirm, edit, or reject individual profile fields.
   * Updates both the field status and the workspace's scalar values.
   */
  static async confirmFields(
    workspaceId: string,
    userId: string,
    confirmations: ProfileFieldConfirmation[],
  ): Promise<void> {
    try {
      const now = new Date();

      await prisma.$transaction(
        confirmations.map((conf) =>
          prisma.workspaceProfileField.update({
            where: {
              workspaceId_fieldKey: {
                workspaceId,
                fieldKey: conf.fieldKey,
              },
            },
            data: {
              confirmedValue: conf.confirmedValue as Prisma.InputJsonValue,
              status: conf.status,
              confirmedAt:
                conf.status === ProfileFieldStatus.CONFIRMED ||
                conf.status === ProfileFieldStatus.EDITED
                  ? now
                  : null,
              rejectedAt: conf.status === ProfileFieldStatus.REJECTED ? now : null,
              // If edited, mark source as MANUAL
              sourceType:
                conf.status === ProfileFieldStatus.EDITED
                  ? ProfileFieldSourceType.MANUAL
                  : undefined,
            },
          }),
        ),
      );

      // Record audit event for each confirmed field
      for (const conf of confirmations) {
        await recordAuditEventSafe({
          workspaceId,
          actorUserId: userId,
          eventType:
            conf.status === ProfileFieldStatus.REJECTED
              ? "SIGNAL_REJECTED"
              : "SIGNAL_CONFIRMED",
          objectType: AUDIT_OBJECT_TYPES.WORKSPACE,
          objectId: workspaceId,
          metadata: {
            fieldKey: conf.fieldKey,
            status: conf.status,
            confirmedValue:
              conf.status !== ProfileFieldStatus.REJECTED ? conf.confirmedValue : null,
          },
        });
      }

      // Update workspace scalar values with confirmed fields
      await this.syncConfirmedValuesToWorkspace(workspaceId);

      logger.info("profile-field:fields-confirmed", {
        workspaceId,
        confirmationCount: confirmations.length,
      });
    } catch (error) {
      logger.error("profile-field:confirm-fields-error", {
        workspaceId,
        error: String(error),
      });
      throw error;
    }
  }

  /**
   * Sync all confirmed/edited field values to the Workspace model scalars.
   * This ensures backward compatibility with existing personalization logic.
   */
  static async syncConfirmedValuesToWorkspace(workspaceId: string): Promise<void> {
    const fields = await prisma.workspaceProfileField.findMany({
      where: {
        workspaceId,
        status: { in: [ProfileFieldStatus.CONFIRMED, ProfileFieldStatus.EDITED] },
      },
    });

    const updateData: Prisma.WorkspaceUpdateInput = {};

    for (const field of fields) {
      const value = field.confirmedValue;
      if (value === null || value === undefined) continue;

      switch (field.fieldKey) {
        case "industry":
          updateData.industry = value as string[];
          break;
        case "productType":
          updateData.productType = value as string[];
          break;
        case "customerSegment":
          updateData.customerSegment = value as string[];
          break;
        case "dataTypes":
          updateData.dataTypes = value as string[];
          break;
        case "complianceTargets":
          updateData.complianceTargets = value as string[];
          break;
        // Note: deep intelligence fields (userTypes, etc.) are not workspace scalars
        // They remain only in profileFields for now
      }
    }

    if (Object.keys(updateData).length > 0) {
      await prisma.workspace.update({
        where: { id: workspaceId },
        data: updateData,
      });
    }
  }

  /**
   * Get all profile fields for a workspace with their current status.
   */
  static async getFields(
    workspaceId: string,
    options?: { status?: ProfileFieldStatus[] },
  ): Promise<ProfileFieldData[]> {
    const where: Prisma.WorkspaceProfileFieldWhereInput = { workspaceId };
    if (options?.status) {
      where.status = { in: options.status };
    }

    const fields = await prisma.workspaceProfileField.findMany({
      where,
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    });

    return fields.map((f) => ({
      id: f.id,
      fieldKey: f.fieldKey as ProfileFieldKey,
      suggestedValue: f.suggestedValue as unknown,
      confirmedValue: f.confirmedValue as unknown,
      confidence: f.confidence,
      confidenceBand: f.confidenceBand,
      sourceType: f.sourceType,
      status: f.status,
      citations: f.citations as SignalCitation[] | undefined,
      conflictInfo: f.conflictInfo as unknown,
      candidates: f.candidates as SignalCandidate<unknown>[] | undefined,
      confirmedAt: f.confirmedAt,
      rejectedAt: f.rejectedAt,
      createdAt: f.createdAt,
      updatedAt: f.updatedAt,
    }));
  }

  /**
   * Get only the confirmed values for personalization purposes.
   */
  static async getConfirmedValues(
    workspaceId: string,
  ): Promise<Record<ProfileFieldKey, unknown>> {
    const fields = await prisma.workspaceProfileField.findMany({
      where: {
        workspaceId,
        status: { in: [ProfileFieldStatus.CONFIRMED, ProfileFieldStatus.EDITED] },
      },
    });

    const result: Partial<Record<ProfileFieldKey, unknown>> = {};
    for (const field of fields) {
      if (field.confirmedValue !== null && field.confirmedValue !== undefined) {
        result[field.fieldKey as ProfileFieldKey] = field.confirmedValue;
      }
    }
    return result as Record<ProfileFieldKey, unknown>;
  }

  /**
   * Check if a workspace has unconfirmed or conflicted fields.
   */
  static async hasUnconfirmedFields(workspaceId: string): Promise<boolean> {
    const count = await prisma.workspaceProfileField.count({
      where: {
        workspaceId,
        status: { in: [ProfileFieldStatus.SUGGESTED, ProfileFieldStatus.NEEDS_REVIEW] },
      },
    });
    return count > 0;
  }

  /**
   * Convert AI signals from website analysis to profile field inputs.
   * Detects conflicts and determines appropriate status for each field.
   */
  static signalsToFieldInputs(
    profile: Record<string, Signal<unknown> | undefined>,
  ): ProfileFieldInput[] {
    const fields: ProfileFieldInput[] = [];

    for (const [key, signal] of Object.entries(profile)) {
      if (!signal) continue;

      const fieldKey = key as ProfileFieldKey;
      const suggestedValue = signal.value;

      // Handle array vs scalar values
      let normalizedValue: unknown = suggestedValue;
      if (suggestedValue !== undefined && suggestedValue !== null) {
        if (typeof suggestedValue === "string") {
          normalizedValue = [suggestedValue];
        } else if (Array.isArray(suggestedValue)) {
          normalizedValue = suggestedValue;
        }
      }

      // Detect conflicts from candidates (for enum fields)
      const candidates = signal.candidates as SignalCandidate<unknown>[] | undefined;
      const conflictDetection = detectCandidateConflict(candidates, suggestedValue);
      
      // Determine status based on confidence and conflicts
      const status = determineFieldStatus(
        signal.confidence,
        conflictDetection.hasConflict,
        !!candidates && candidates.length > 0,
      );

      // Build conflict info including rival candidate
      const conflictInfo = conflictDetection.hasConflict
        ? {
            hasConflict: true,
            rival: conflictDetection.rival,
            allCandidates: candidates,
          }
        : signal.conflict;

      // Determine source type - mark as CONFLICTED if there's a conflict
      let sourceType = mapSignalCategoryToSourceType(signal.category);
      if (conflictDetection.hasConflict) {
        sourceType = ProfileFieldSourceType.CONFLICTED;
      }

      fields.push({
        fieldKey,
        suggestedValue: normalizedValue,
        confidence: signal.confidence,
        sourceType,
        status,
        citations: signal.citations,
        conflictInfo,
        candidates,
      });
    }

    return fields;
  }

  /**
   * Get all non-conflicted fields that can be safely confirmed.
   * Used for "confirm all" to skip conflicted fields.
   */
  static async getConfirmableFields(workspaceId: string): Promise<ProfileFieldData[]> {
    const fields = await this.getFields(workspaceId, {
      status: [ProfileFieldStatus.SUGGESTED],
    });

    // Filter out any with conflicted source type as extra safety
    return fields.filter(
      (f) => f.sourceType !== ProfileFieldSourceType.CONFLICTED && !f.conflictInfo,
    );
  }

  /**
   * Get all fields that require user review (conflicted, low confidence, or needs_review status).
   */
  static async getUnresolvedFields(
    workspaceId: string,
  ): Promise<Array<{ fieldKey: ProfileFieldKey; reason: "conflict" | "low_confidence" | "needs_review"; suggestedValue?: unknown }>> {
    const fields = await this.getFields(workspaceId, {
      status: [ProfileFieldStatus.NEEDS_REVIEW, ProfileFieldStatus.SUGGESTED],
    });

    const unresolved: Array<{
      fieldKey: ProfileFieldKey;
      reason: "conflict" | "low_confidence" | "needs_review";
      suggestedValue?: unknown;
    }> = [];

    for (const field of fields) {
      // Check for conflicted fields
      if (field.sourceType === ProfileFieldSourceType.CONFLICTED || field.conflictInfo) {
        unresolved.push({
          fieldKey: field.fieldKey,
          reason: "conflict",
          suggestedValue: field.suggestedValue,
        });
        continue;
      }

      // Check for low confidence
      if (field.confidence < LOW_CONFIDENCE_THRESHOLD) {
        unresolved.push({
          fieldKey: field.fieldKey,
          reason: "low_confidence",
          suggestedValue: field.suggestedValue,
        });
        continue;
      }

      // Check for needs_review status
      if (field.status === ProfileFieldStatus.NEEDS_REVIEW) {
        unresolved.push({
          fieldKey: field.fieldKey,
          reason: "needs_review",
          suggestedValue: field.suggestedValue,
        });
      }
    }

    return unresolved;
  }

  /**
   * Validate that all fields can be safely confirmed.
   * Throws UnresolvedConflictsError if any conflicted or unresolved fields exist.
   */
  static async validateConfirmAll(workspaceId: string): Promise<void> {
    const unresolved = await this.getUnresolvedFields(workspaceId);

    if (unresolved.length > 0) {
      const conflictedCount = unresolved.filter((f) => f.reason === "conflict").length;
      const lowConfCount = unresolved.filter((f) => f.reason === "low_confidence").length;

      let message = "Cannot confirm all fields. ";
      if (conflictedCount > 0) {
        message += `${conflictedCount} field(s) have unresolved conflicts requiring your selection. `;
      }
      if (lowConfCount > 0) {
        message += `${lowConfCount} field(s) have low confidence and need review. `;
      }
      if (unresolved.length > conflictedCount + lowConfCount) {
        message += `${unresolved.length - conflictedCount - lowConfCount} field(s) need review. `;
      }
      message += "Please resolve these fields individually or use Manual Edit.";

      throw new UnresolvedConflictsError(message, unresolved);
    }
  }

  /**
   * Confirm all non-conflicted fields.
   * 
   * @param strictMode - If true, throws UnresolvedConflictsError when conflicted fields exist.
   *                     If false, skips conflicted fields and returns them in skipped array.
   */
  static async confirmAllSafeFields(
    workspaceId: string,
    userId: string,
    strictMode: boolean = false,
  ): Promise<{ confirmed: ProfileFieldKey[]; skipped: ProfileFieldKey[] }> {
    // In strict mode, validate first
    if (strictMode) {
      await this.validateConfirmAll(workspaceId);
    }

    // Get all suggested fields
    const allFields = await this.getFields(workspaceId, {
      status: [ProfileFieldStatus.SUGGESTED, ProfileFieldStatus.NEEDS_REVIEW],
    });

    const toConfirm: ProfileFieldConfirmation[] = [];
    const skipped: ProfileFieldKey[] = [];

    for (const field of allFields) {
      // Skip conflicted fields or those with NEEDS_REVIEW status
      if (
        field.sourceType === ProfileFieldSourceType.CONFLICTED ||
        field.status === ProfileFieldStatus.NEEDS_REVIEW ||
        field.conflictInfo
      ) {
        skipped.push(field.fieldKey);
        continue;
      }

      toConfirm.push({
        fieldKey: field.fieldKey,
        confirmedValue: field.suggestedValue,
        status: ProfileFieldStatus.CONFIRMED,
      });
    }

    if (toConfirm.length > 0) {
      await this.confirmFields(workspaceId, userId, toConfirm);
    }

    return {
      confirmed: toConfirm.map((c) => c.fieldKey),
      skipped,
    };
  }
}

export interface ProfileFieldData {
  id: string;
  fieldKey: ProfileFieldKey;
  suggestedValue: unknown;
  confirmedValue: unknown;
  confidence: number;
  confidenceBand: string | null;
  sourceType: ProfileFieldSourceType;
  status: ProfileFieldStatus;
  citations?: SignalCitation[];
  conflictInfo?: unknown;
  /** All candidate values for enum fields */
  candidates?: SignalCandidate<unknown>[];
  confirmedAt: Date | null;
  rejectedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
