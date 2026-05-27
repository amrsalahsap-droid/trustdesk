/**
 * Contradiction Persistence Types
 *
 * Types for storing and retrieving structured contradiction results.
 * These types align with the ContradictionResult database model.
 */

/**
 * Resolution states for a detected contradiction.
 * Mirrors the Prisma enum until client is regenerated.
 */
export type ContradictionResolutionStatus =
  | "PENDING"
  | "ACKNOWLEDGED"
  | "RESOLVED_ROW"
  | "RESOLVED_CANONICAL"
  | "FALSE_POSITIVE"
  | "STALE";

import type { Prisma } from "@prisma/client";

/**
 * Input for saving a new contradiction detection result.
 */
export interface SaveContradictionInput {
  workspaceId: string;
  questionnaireId: string;
  questionnaireItemId: string;

  // Detection result
  contradictionFound: boolean;
  contradictionType?: string;
  severity?: string;
  message?: string;
  reason?: string;

  // Row answer excerpt
  rowAnswerExcerpt?: string;

  // Canonical truth snapshot
  canonicalAnswerId: string;
  canonicalAnswerExcerpt?: string;
  canonicalVersionNumber: number;
  canonicalApprovedAt?: Date;
  canonicalGovernanceStatus?: string;

  // Topic context
  topicId?: string;
  topicKey?: string;
  subControlKey?: string;

  // Detection metadata
  detectorVersion?: string;
  ruleId?: string;
  rulePackVersion?: string;

  // Link to previous result (for re-runs)
  previousResultId?: string;

  /** JSON snapshot of semantic judge output when the judge ran. */
  semanticJudgeJson?: Prisma.InputJsonValue;
}

/**
 * Input for updating an existing contradiction result (resolution).
 */
export interface UpdateContradictionInput {
  workspaceId: string;
  resolutionStatus: ContradictionResolutionStatus;
  resolvedByUserId?: string;
  resolutionNote?: string;
  resolutionAction?: string;
}

/**
 * Input for marking results as stale.
 */
export interface MarkStaleInput {
  workspaceId: string;
  canonicalAnswerId: string;
  newVersionNumber: number;
}

/**
 * A persisted contradiction result.
 */
export interface ContradictionResultDTO {
  id: string;
  workspaceId: string;
  questionnaireId: string;
  questionnaireItemId: string;

  // Detection result
  contradictionFound: boolean;
  contradictionType: string | null;
  severity: string | null;
  message: string | null;
  reason: string | null;

  // Row answer excerpt
  rowAnswerExcerpt: string | null;

  // Canonical truth snapshot
  canonicalAnswerId: string;
  canonicalAnswerExcerpt: string | null;
  canonicalVersionNumber: number;
  canonicalApprovedAt: Date | null;
  canonicalGovernanceStatus: string | null;

  // Topic context
  topicId: string | null;
  topicKey: string | null;
  subControlKey: string | null;

  // Detection metadata
  detectedAt: Date;
  detectorVersion: string;
  ruleId: string | null;
  rulePackVersion: string | null;

  // Resolution tracking
  resolutionStatus: ContradictionResolutionStatus;
  resolvedAt: Date | null;
  resolvedByUserId: string | null;
  resolutionNote: string | null;
  resolutionAction: string | null;

  // Re-run tracking
  previousResultId: string | null;
  isStale: boolean;

  semanticJudgeJson: Prisma.JsonValue | null;
}

/**
 * Query filters for retrieving contradiction results.
 */
export interface ContradictionQueryFilter {
  workspaceId: string;
  questionnaireId?: string;
  questionnaireItemId?: string;
  topicId?: string;
  subControlKey?: string;
  resolutionStatus?: ContradictionResolutionStatus | ContradictionResolutionStatus[];
  isStale?: boolean;
  contradictionFound?: boolean;
  severity?: string | string[];
  canonicalAnswerId?: string;
  detectedAfter?: Date;
  detectedBefore?: Date;
  resolvedAfter?: Date;
  resolvedBefore?: Date;
}

/**
 * Summary statistics for contradictions.
 */
export interface ContradictionSummary {
  totalDetected: number;
  pending: number;
  acknowledged: number;
  resolvedRow: number;
  resolvedCanonical: number;
  falsePositive: number;
  stale: number;
  bySeverity: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
  };
}

/**
 * Result of a re-run check.
 */
export interface RerunCheckResult {
  needsReRun: boolean;
  reason?: "canonical_updated" | "row_updated" | "rules_updated" | "stale";
  currentCanonicalVersion: number;
  detectedAgainstVersion: number;
}

/**
 * Distinguishes between evidence conflict and canonical contradiction.
 */
export type ConflictType = "evidence_conflict" | "canonical_contradiction";

/**
 * Extended row status including both conflict types.
 */
export interface RowConflictStatus {
  hasConflict: boolean;
  conflictTypes: ConflictType[];
  evidenceConflict: {
    note: string | null;
    status: string;
  } | null;
  canonicalContradiction: ContradictionResultDTO | null;
}
