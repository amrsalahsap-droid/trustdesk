/**
 * Contradiction Persistence Service
 *
 * Provides structured storage for canonical answer contradiction detection results.
 * Enables re-runs, audit trails, and canonical version tracking.
 *
 * Key capabilities:
 * - Save contradiction detection results with full canonical version pinning
 * - Update resolution status with audit trail
 * - Query contradictions with flexible filtering
 * - Detect stale results when canonical answers change
 * - Distinguish from evidence-level conflicts
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type {
  SaveContradictionInput,
  UpdateContradictionInput,
  MarkStaleInput,
  ContradictionResultDTO,
  ContradictionQueryFilter,
  ContradictionSummary,
  RerunCheckResult,
  RowConflictStatus,
  ContradictionResolutionStatus,
} from "./persistence-types";

/** Maximum length for text excerpts stored in the database. */
const MAX_EXCERPT_LENGTH = 1000;

/** Truncates text to maximum excerpt length. */
function excerpt(text: string | null | undefined): string | null {
  if (!text) return null;
  if (text.length <= MAX_EXCERPT_LENGTH) return text;
  return text.slice(0, MAX_EXCERPT_LENGTH - 3) + "...";
}

const TERMINAL_RESOLUTION: ContradictionResolutionStatus[] = [
  "ACKNOWLEDGED",
  "RESOLVED_ROW",
  "RESOLVED_CANONICAL",
  "FALSE_POSITIVE",
];

function isTerminalResolutionStatus(s: string): s is ContradictionResolutionStatus {
  return (TERMINAL_RESOLUTION as readonly string[]).includes(s);
}

/** Prisma payload for detection fields only (no resolution columns). */
function toPrismaDetectionSlice(input: SaveContradictionInput) {
  return {
    workspaceId: input.workspaceId,
    questionnaireId: input.questionnaireId,
    contradictionFound: input.contradictionFound,
    contradictionType: input.contradictionType ?? null,
    severity: input.severity ?? null,
    message: excerpt(input.message),
    reason: excerpt(input.reason),
    rowAnswerExcerpt: excerpt(input.rowAnswerExcerpt),
    canonicalAnswerId: input.canonicalAnswerId,
    canonicalAnswerExcerpt: excerpt(input.canonicalAnswerExcerpt),
    canonicalVersionNumber: input.canonicalVersionNumber,
    canonicalApprovedAt: input.canonicalApprovedAt ?? null,
    canonicalGovernanceStatus: input.canonicalGovernanceStatus ?? null,
    topicId: input.topicId ?? null,
    topicKey: input.topicKey ?? null,
    subControlKey: input.subControlKey ?? null,
    detectorVersion: input.detectorVersion ?? "1.0.0",
    ruleId: input.ruleId ?? null,
    rulePackVersion: input.rulePackVersion ?? null,
    previousResultId: input.previousResultId ?? null,
    semanticJudgeJson:
      input.semanticJudgeJson == null
        ? Prisma.DbNull
        : (input.semanticJudgeJson as Prisma.InputJsonValue),
  };
}

/**
 * Upserts detection for a questionnaire row without clobbering a terminal resolution
 * when canonical id/version and contradiction flag are unchanged.
 */
export async function upsertContradictionDetection(
  input: SaveContradictionInput,
): Promise<ContradictionResultDTO> {
  const slice = toPrismaDetectionSlice(input);

  const existing = await prisma.contradictionResult.findFirst({
    where: { 
      questionnaireItemId: input.questionnaireItemId,
      workspaceId: input.workspaceId
    },
  });

  if (!existing) {
    const row = await prisma.contradictionResult.create({
      data: {
        ...slice,
        questionnaireItemId: input.questionnaireItemId,
        resolutionStatus: "PENDING",
        resolvedAt: null,
        resolvedByUserId: null,
        resolutionNote: null,
        resolutionAction: null,
        isStale: false,
      },
    });
    return mapToDTO(row);
  }

  const sameCanon =
    existing.canonicalAnswerId === input.canonicalAnswerId &&
    existing.canonicalVersionNumber === input.canonicalVersionNumber;

  const terminal = isTerminalResolutionStatus(existing.resolutionStatus);
  if (terminal && sameCanon && existing.contradictionFound === input.contradictionFound) {
    return mapToDTO(existing);
  }

  if (terminal && sameCanon && existing.contradictionFound !== input.contradictionFound) {
    if (input.contradictionFound) {
      const row = await prisma.contradictionResult.update({
        where: { id: existing.id, workspaceId: input.workspaceId },
        data: {
          ...slice,
          resolutionStatus: "PENDING",
          resolvedAt: null,
          resolvedByUserId: null,
          resolutionNote: null,
          resolutionAction: null,
          isStale: false,
        },
      });
      return mapToDTO(row);
    }
    const row = await prisma.contradictionResult.update({
      where: { id: existing.id, workspaceId: input.workspaceId },
      data: slice,
    });
    return mapToDTO(row);
  }

  if (terminal && !sameCanon) {
    const row = await prisma.contradictionResult.update({
      where: { id: existing.id, workspaceId: input.workspaceId },
      data: {
        ...slice,
        resolutionStatus: "STALE",
        isStale: true,
        resolvedAt: null,
        resolvedByUserId: null,
        resolutionNote: null,
        resolutionAction: null,
      },
    });
    return mapToDTO(row);
  }

  if (existing.resolutionStatus === "PENDING") {
    const row = await prisma.contradictionResult.update({
      where: { id: existing.id, workspaceId: input.workspaceId },
      data: slice,
    });
    return mapToDTO(row);
  }

  // STALE — refresh detection; re-open queue when a contradiction is still present
  if (existing.resolutionStatus === "STALE") {
    const reopen =
      input.contradictionFound === true
        ? ({
            resolutionStatus: "PENDING" as const,
            resolvedAt: null,
            resolvedByUserId: null,
            resolutionNote: null,
            resolutionAction: null,
            isStale: false,
          } as const)
        : ({ isStale: false } as const);
    const row = await prisma.contradictionResult.update({
      where: { id: existing.id, workspaceId: input.workspaceId },
      data: { ...slice, ...reopen },
    });
    return mapToDTO(row);
  }

  const row = await prisma.contradictionResult.update({
    where: { id: existing.id, workspaceId: input.workspaceId },
    data: slice,
  });
  return mapToDTO(row);
}

/**
 * Overwrites detection fields and forces resolution back to PENDING (e.g. after edit-align, engine still disagrees).
 */
export async function forceDetectionAndPendingResolution(
  resultId: string,
  input: SaveContradictionInput,
): Promise<ContradictionResultDTO> {
  const slice = toPrismaDetectionSlice(input);
  const row = await prisma.contradictionResult.update({
    where: { id: resultId, workspaceId: input.workspaceId },
    data: {
      ...slice,
      resolutionStatus: "PENDING",
      resolvedAt: null,
      resolvedByUserId: null,
      resolutionNote: null,
      resolutionAction: null,
      isStale: false,
    },
  });
  return mapToDTO(row);
}

/**
 * Saves a contradiction detection result.
 * Delegates to {@link upsertContradictionDetection} so resolutions are preserved when appropriate.
 */
export async function saveContradictionResult(
  input: SaveContradictionInput,
): Promise<ContradictionResultDTO> {
  return upsertContradictionDetection(input);
}

/**
 * Saves a "no contradiction found" result.
 * This clears any previous contradiction for the row.
 *
 * @param input Partial input (only identifiers needed)
 * @returns The persisted result
 */
export async function saveNoContradiction(
  input: Pick<SaveContradictionInput, "workspaceId" | "questionnaireId" | "questionnaireItemId"> &
    Partial<SaveContradictionInput>,
): Promise<ContradictionResultDTO> {
  return upsertContradictionDetection({
    ...input,
    contradictionFound: false,
    contradictionType: undefined,
    severity: undefined,
    message: "No canonical contradiction detected",
    canonicalAnswerId: input.canonicalAnswerId ?? "unknown",
    canonicalVersionNumber: input.canonicalVersionNumber ?? 0,
  });
}

/**
 * Updates the resolution status of a contradiction result.
 *
 * @param resultId Contradiction result ID
 * @param input Resolution update
 * @returns Updated result
 */
export async function updateContradictionResolution(
  workspaceId: string,
  resultId: string,
  input: UpdateContradictionInput,
): Promise<ContradictionResultDTO | null> {
  const result = await prisma.contradictionResult.update({
    where: { id: resultId, workspaceId: input.workspaceId },
    data: {
      resolutionStatus: input.resolutionStatus,
      resolvedAt: new Date(),
      resolvedByUserId: input.resolvedByUserId ?? null,
      resolutionNote: excerpt(input.resolutionNote),
      resolutionAction: input.resolutionAction ?? null,
    },
  });

  return mapToDTO(result);
}

/**
 * Retrieves a contradiction result by ID.
 */
export async function getContradictionResult(
  workspaceId: string,
  resultId: string,
): Promise<ContradictionResultDTO | null> {
  const result = await prisma.contradictionResult.findFirst({
    where: { id: resultId, workspaceId },
  });

  return result ? mapToDTO(result) : null;
}

/**
 * Retrieves the contradiction result for a specific questionnaire item.
 */
export async function getContradictionForItem(
  workspaceId: string,
  questionnaireItemId: string,
): Promise<ContradictionResultDTO | null> {
  const result = await prisma.contradictionResult.findFirst({
    where: { questionnaireItemId, workspaceId },
  });

  return result ? mapToDTO(result) : null;
}

/**
 * Queries contradiction results with flexible filtering.
 */
export async function queryContradictions(
  filter: ContradictionQueryFilter,
): Promise<ContradictionResultDTO[]> {
  const where = buildWhereClause(filter);

  const results = await prisma.contradictionResult.findMany({
    where,
    orderBy: [
      { detectedAt: "desc" },
      { severity: "desc" },
    ],
  });

  return results.map(mapToDTO);
}

/**
 * Gets summary statistics for contradictions.
 */
export async function getContradictionSummary(
  workspaceId: string,
  questionnaireId?: string,
): Promise<ContradictionSummary> {
  const where = {
    workspaceId,
    ...(questionnaireId ? { questionnaireId } : {}),
  };

  const [
    total,
    pending,
    acknowledged,
    resolvedRow,
    resolvedCanonical,
    falsePositive,
    stale,
    critical,
    high,
    medium,
    low,
    info,
  ] = await Promise.all([
    prisma.contradictionResult.count({ where: { ...where, contradictionFound: true } }),
    prisma.contradictionResult.count({ where: { ...where, resolutionStatus: "PENDING" } }),
    prisma.contradictionResult.count({ where: { ...where, resolutionStatus: "ACKNOWLEDGED" } }),
    prisma.contradictionResult.count({ where: { ...where, resolutionStatus: "RESOLVED_ROW" } }),
    prisma.contradictionResult.count({ where: { ...where, resolutionStatus: "RESOLVED_CANONICAL" } }),
    prisma.contradictionResult.count({ where: { ...where, resolutionStatus: "FALSE_POSITIVE" } }),
    prisma.contradictionResult.count({ where: { ...where, isStale: true } }),
    prisma.contradictionResult.count({ where: { ...where, severity: "critical" } }),
    prisma.contradictionResult.count({ where: { ...where, severity: "high" } }),
    prisma.contradictionResult.count({ where: { ...where, severity: "medium" } }),
    prisma.contradictionResult.count({ where: { ...where, severity: "low" } }),
    prisma.contradictionResult.count({ where: { ...where, severity: "info" } }),
  ]);

  return {
    totalDetected: total,
    pending,
    acknowledged,
    resolvedRow,
    resolvedCanonical,
    falsePositive,
    stale,
    bySeverity: {
      critical,
      high,
      medium,
      low,
      info,
    },
  };
}

/**
 * Marks contradiction results as stale when their canonical answer is updated.
 */
export async function markResultsAsStale(
  input: MarkStaleInput,
): Promise<number> {
  const results = await prisma.contradictionResult.updateMany({
    where: {
      workspaceId: input.workspaceId,
      canonicalAnswerId: input.canonicalAnswerId,
      canonicalVersionNumber: { lt: input.newVersionNumber },
      isStale: false,
      resolutionStatus: { notIn: ["RESOLVED_ROW", "RESOLVED_CANONICAL", "FALSE_POSITIVE"] },
    },
    data: {
      isStale: true,
      resolutionStatus: "STALE",
    },
  });

  return results.count;
}

/**
 * Checks if a re-run is needed for a specific result.
 */
export async function checkRerunNeeded(
  workspaceId: string,
  resultId: string,
): Promise<RerunCheckResult> {
  const result = await prisma.contradictionResult.findFirst({
    where: { id: resultId, workspaceId },
    include: {
      canonicalAnswer: {
        select: {
          versionNumber: true,
          updatedAt: true,
        },
      },
      questionnaireItem: {
        select: {
          finalAnswer: true,
          updatedAt: true,
        },
      },
    },
  });

  if (!result) {
    return {
      needsReRun: true,
      reason: "stale",
      currentCanonicalVersion: 0,
      detectedAgainstVersion: 0,
    };
  }

  const currentVersion = result.canonicalAnswer?.versionNumber ?? result.canonicalVersionNumber;
  const detectedVersion = result.canonicalVersionNumber;

  // Canonical was updated
  if (currentVersion > detectedVersion) {
    return {
      needsReRun: true,
      reason: "canonical_updated",
      currentCanonicalVersion: currentVersion,
      detectedAgainstVersion: detectedVersion,
    };
  }

  // Result is marked stale
  if (result.isStale) {
    return {
      needsReRun: true,
      reason: "stale",
      currentCanonicalVersion: currentVersion,
      detectedAgainstVersion: detectedVersion,
    };
  }

  // Row answer was updated after detection
  if (result.questionnaireItem?.updatedAt && result.detectedAt) {
    if (result.questionnaireItem.updatedAt > result.detectedAt) {
      return {
        needsReRun: true,
        reason: "row_updated",
        currentCanonicalVersion: currentVersion,
        detectedAgainstVersion: detectedVersion,
      };
    }
  }

  return {
    needsReRun: false,
    currentCanonicalVersion: currentVersion,
    detectedAgainstVersion: detectedVersion,
  };
}

/**
 * Gets the complete conflict status for a questionnaire item.
 * Combines evidence conflict (from QuestionnaireItem) with canonical contradiction.
 */
export async function getRowConflictStatus(
  workspaceId: string,
  questionnaireItemId: string,
): Promise<RowConflictStatus> {
  const [item, contradiction] = await Promise.all([
    prisma.questionnaireItem.findFirst({
      where: { id: questionnaireItemId, workspaceId },
      select: {
        conflictNote: true,
        reviewStatus: true,
      },
    }),
    prisma.contradictionResult.findFirst({
      where: { questionnaireItemId, workspaceId },
    }),
  ]);

  const conflictTypes: Array<"evidence_conflict" | "canonical_contradiction"> = [];

  if (item?.reviewStatus === "conflict" && item?.conflictNote) {
    conflictTypes.push("evidence_conflict");
  }

  if (contradiction?.contradictionFound) {
    conflictTypes.push("canonical_contradiction");
  }

  return {
    hasConflict: conflictTypes.length > 0,
    conflictTypes,
    evidenceConflict: item?.reviewStatus === "conflict" ? {
      note: item.conflictNote,
      status: item.reviewStatus,
    } : null,
    canonicalContradiction: contradiction ? mapToDTO(contradiction) : null,
  };
}

/**
 * Deletes a contradiction result.
 */
export async function deleteContradictionResult(
  workspaceId: string,
  resultId: string,
): Promise<void> {
  await prisma.contradictionResult.deleteMany({
    where: { id: resultId, workspaceId },
  });
}

/**
 * Deletes all contradiction results for a questionnaire.
 */
export async function deleteContradictionsForQuestionnaire(
  workspaceId: string,
  questionnaireId: string,
): Promise<number> {
  const result = await prisma.contradictionResult.deleteMany({
    where: { questionnaireId, workspaceId },
  });

  return result.count;
}

// --- Helpers ---

/** Builds Prisma where clause from filter. */
function buildWhereClause(filter: ContradictionQueryFilter) {
  const where: Record<string, unknown> = {
    workspaceId: filter.workspaceId,
  };

  if (filter.questionnaireId) {
    where.questionnaireId = filter.questionnaireId;
  }

  if (filter.questionnaireItemId) {
    where.questionnaireItemId = filter.questionnaireItemId;
  }

  if (filter.topicId) {
    where.topicId = filter.topicId;
  }

  if (filter.subControlKey) {
    where.subControlKey = filter.subControlKey;
  }

  if (filter.canonicalAnswerId) {
    where.canonicalAnswerId = filter.canonicalAnswerId;
  }

  if (filter.isStale !== undefined) {
    where.isStale = filter.isStale;
  }

  if (filter.contradictionFound !== undefined) {
    where.contradictionFound = filter.contradictionFound;
  }

  if (filter.resolutionStatus) {
    if (Array.isArray(filter.resolutionStatus)) {
      where.resolutionStatus = { in: filter.resolutionStatus };
    } else {
      where.resolutionStatus = filter.resolutionStatus;
    }
  }

  if (filter.severity) {
    if (Array.isArray(filter.severity)) {
      where.severity = { in: filter.severity };
    } else {
      where.severity = filter.severity;
    }
  }

  if (filter.detectedAfter || filter.detectedBefore) {
    where.detectedAt = {};
    if (filter.detectedAfter) {
      (where.detectedAt as Record<string, Date>).gte = filter.detectedAfter;
    }
    if (filter.detectedBefore) {
      (where.detectedAt as Record<string, Date>).lte = filter.detectedBefore;
    }
  }

  if (filter.resolvedAfter || filter.resolvedBefore) {
    where.resolvedAt = {};
    if (filter.resolvedAfter) {
      (where.resolvedAt as Record<string, Date>).gte = filter.resolvedAfter;
    }
    if (filter.resolvedBefore) {
      (where.resolvedAt as Record<string, Date>).lte = filter.resolvedBefore;
    }
  }

  return where;
}

/** Maps database result to DTO. */
function mapToDTO(result: {
  id: string;
  workspaceId: string;
  questionnaireId: string;
  questionnaireItemId: string;
  contradictionFound: boolean;
  contradictionType: string | null;
  severity: string | null;
  message: string | null;
  reason: string | null;
  rowAnswerExcerpt: string | null;
  canonicalAnswerId: string;
  canonicalAnswerExcerpt: string | null;
  canonicalVersionNumber: number;
  canonicalApprovedAt: Date | null;
  canonicalGovernanceStatus: string | null;
  topicId: string | null;
  topicKey: string | null;
  subControlKey: string | null;
  detectedAt: Date;
  detectorVersion: string;
  ruleId: string | null;
  rulePackVersion: string | null;
  resolutionStatus: string;
  resolvedAt: Date | null;
  resolvedByUserId: string | null;
  resolutionNote: string | null;
  resolutionAction: string | null;
  previousResultId: string | null;
  isStale: boolean;
  semanticJudgeJson?: unknown | null;
}): ContradictionResultDTO {
  return {
    id: result.id,
    workspaceId: result.workspaceId,
    questionnaireId: result.questionnaireId,
    questionnaireItemId: result.questionnaireItemId,
    contradictionFound: result.contradictionFound,
    contradictionType: result.contradictionType,
    severity: result.severity,
    message: result.message,
    reason: result.reason,
    rowAnswerExcerpt: result.rowAnswerExcerpt,
    canonicalAnswerId: result.canonicalAnswerId,
    canonicalAnswerExcerpt: result.canonicalAnswerExcerpt,
    canonicalVersionNumber: result.canonicalVersionNumber,
    canonicalApprovedAt: result.canonicalApprovedAt,
    canonicalGovernanceStatus: result.canonicalGovernanceStatus,
    topicId: result.topicId,
    topicKey: result.topicKey,
    subControlKey: result.subControlKey,
    detectedAt: result.detectedAt,
    detectorVersion: result.detectorVersion,
    ruleId: result.ruleId,
    rulePackVersion: result.rulePackVersion,
    resolutionStatus: result.resolutionStatus as ContradictionResolutionStatus,
    resolvedAt: result.resolvedAt,
    resolvedByUserId: result.resolvedByUserId,
    resolutionNote: result.resolutionNote,
    resolutionAction: result.resolutionAction,
    previousResultId: result.previousResultId,
    isStale: result.isStale,
    semanticJudgeJson: result.semanticJudgeJson ?? null,
  };
}
