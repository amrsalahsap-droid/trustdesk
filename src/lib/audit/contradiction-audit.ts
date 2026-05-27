import type { ContradictionResultDTO } from "@/lib/contradiction/persistence-types";

const PREVIEW_LEN = 240;

/** Short string for audit metadata (avoids huge blobs in JSON). */
export function auditTextPreview(s: string | null | undefined): string | null {
  if (s == null || s === "") return null;
  const t = s.trim();
  return t.length <= PREVIEW_LEN ? t : t.slice(0, PREVIEW_LEN - 3) + "...";
}

/** Flat primitives for `recordAuditEventSafe` / Audit Center (nested objects sanitize poorly). */
export function contradictionAuditBaseFields(
  questionnaireId: string,
  questionnaireItemId: string,
  dto: ContradictionResultDTO,
): Record<string, unknown> {
  return {
    questionnaireId,
    questionnaireItemId,
    contradictionResultId: dto.id,
    topicId: dto.topicId,
    topicKey: dto.topicKey,
    subControlKey: dto.subControlKey,
    contradictionType: dto.contradictionType,
    severity: dto.severity,
    ruleId: dto.ruleId,
    rulePackVersion: dto.rulePackVersion,
    detectorVersion: dto.detectorVersion,
    canonicalAnswerId: dto.canonicalAnswerId,
    canonicalVersionNumber: dto.canonicalVersionNumber,
  };
}

/**
 * Emit DETECTED when review persistence reports a contradiction the user should treat as newly surfaced.
 * Skips routine refresh of an already-open PENDING contradiction.
 */
export function shouldEmitMaterialContradictionDetected(
  prior: ContradictionResultDTO | null,
  persisted: ContradictionResultDTO,
): boolean {
  if (!persisted.contradictionFound) return false;
  if (!prior) return true;
  if (!prior.contradictionFound) return true;
  if (persisted.resolutionStatus === "PENDING" && prior.resolutionStatus !== "PENDING") return true;
  return false;
}

/** Metadata for QUESTIONNAIRE_ITEM_CONTRADICTION_DETECTED after edit-align still conflicts. */
export function buildContradictionDetectedAuditMetadata(
  questionnaireId: string,
  questionnaireItemId: string,
  dto: ContradictionResultDTO,
  detectedReason: string,
): Record<string, unknown> {
  return {
    ...contradictionAuditBaseFields(questionnaireId, questionnaireItemId, dto),
    detectedReason,
  };
}

/** Metadata for resolve / dismiss / canonical-request audit rows. */
export function buildResolveContradictionAuditMetadata(args: {
  questionnaireId: string;
  questionnaireItemId: string;
  dto: ContradictionResultDTO;
  itemTopicId: string | null;
  itemTopicKey: string | null;
  resolutionAction: string;
  previousResolutionStatus: string;
  overrideReasonCategory?: string | null;
  overrideComment?: string | null;
  resolutionNote?: string | null;
  outcome?: string;
  contradictionFoundAfter?: boolean;
  finalAnswerPreview?: string | null;
}): Record<string, unknown> {
  const {
    questionnaireId,
    questionnaireItemId,
    dto,
    itemTopicId,
    itemTopicKey,
    resolutionAction,
    previousResolutionStatus,
    overrideReasonCategory,
    overrideComment,
    resolutionNote,
    outcome,
    contradictionFoundAfter,
    finalAnswerPreview,
  } = args;
  const base = contradictionAuditBaseFields(questionnaireId, questionnaireItemId, dto);
  const meta: Record<string, unknown> = {
    ...base,
    previousResolutionStatus,
    resolutionAction,
  };
  if (itemTopicId && meta.topicId == null) meta.topicId = itemTopicId;
  if (itemTopicKey && meta.topicKey == null) meta.topicKey = itemTopicKey;
  if (overrideReasonCategory != null) meta.overrideReasonCategory = overrideReasonCategory;
  if (resolutionAction === "FALSE_POSITIVE") {
    meta.resolutionNotePreview = auditTextPreview(resolutionNote) ?? null;
  } else {
    meta.commentPreview = auditTextPreview(overrideComment ?? resolutionNote) ?? null;
  }
  if (outcome != null) meta.outcome = outcome;
  if (contradictionFoundAfter !== undefined) meta.contradictionFoundAfter = contradictionFoundAfter;
  if (finalAnswerPreview != null) meta.finalAnswerPreview = finalAnswerPreview;
  return meta;
}
