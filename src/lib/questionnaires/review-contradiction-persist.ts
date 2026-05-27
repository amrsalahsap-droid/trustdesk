import type { Prisma } from "@prisma/client";
import type { ContradictionResultDTO, SaveContradictionInput } from "@/lib/contradiction/persistence-types";
import type {
  ReviewCanonicalContradictionDTO,
  ReviewSemanticJudgeDTO,
} from "@/lib/questionnaires/types";

type CheckedContradiction = Extract<ReviewCanonicalContradictionDTO, { status: "checked" }>;

/** Hydrate judge output from DB JSON (e.g. after upsert short-circuit). */
export function parseSemanticJudgeFromJson(json: unknown): ReviewSemanticJudgeDTO | undefined {
  if (!json || typeof json !== "object" || Array.isArray(json)) return undefined;
  const o = json as Record<string, unknown>;
  const contradictionLikely = o.contradictionLikely === true;
  const confidence =
    typeof o.confidence === "number" && Number.isFinite(o.confidence)
      ? Math.min(1, Math.max(0, o.confidence))
      : 0;
  const reason = typeof o.reason === "string" ? o.reason : "";
  const raw = o.supportingExcerpts;
  const supportingExcerpts: ReviewSemanticJudgeDTO["supportingExcerpts"] = [];
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (!item || typeof item !== "object") continue;
      const src = (item as { source?: unknown }).source;
      const text = (item as { text?: unknown }).text;
      if (src !== "row" && src !== "canonical") continue;
      if (typeof text !== "string") continue;
      supportingExcerpts.push({ source: src, text });
    }
  }
  return { contradictionLikely, confidence, reason, supportingExcerpts };
}

export interface ReviewRowPersistContext {
  workspaceId: string;
  questionnaireId: string;
  questionnaireItemId: string;
  topicId?: string | null;
  topicKey?: string | null;
  subControlKey?: string | null;
  finalAnswer: string;
  suggestedAnswer: string;
}

/**
 * Builds persistence input from a checked review contradiction DTO.
 * Returns null when there is no canonical answer id (cannot satisfy FK).
 */
export function buildSaveContradictionInputFromReviewRow(
  row: ReviewRowPersistContext,
  checked: CheckedContradiction,
): SaveContradictionInput | null {
  if (!checked.canonicalAnswerId) return null;

  const primary = checked.hits[0];
  const rowText = row.finalAnswer?.trim() || row.suggestedAnswer?.trim() || "";
  const approvedAt =
    checked.canonicalApprovedAt != null && checked.canonicalApprovedAt !== ""
      ? new Date(checked.canonicalApprovedAt)
      : undefined;

  return {
    workspaceId: row.workspaceId,
    questionnaireId: row.questionnaireId,
    questionnaireItemId: row.questionnaireItemId,
    contradictionFound: checked.contradictionFound,
    contradictionType: checked.contradictionType ?? undefined,
    severity: checked.severity ?? undefined,
    message: checked.message ?? undefined,
    reason: checked.reason ?? undefined,
    rowAnswerExcerpt: primary?.rowExcerpt ?? rowText.slice(0, 500),
    canonicalAnswerId: checked.canonicalAnswerId,
    canonicalAnswerExcerpt: primary?.canonicalExcerpt ?? checked.canonicalAnswerExcerpt ?? undefined,
    canonicalVersionNumber: checked.canonicalVersionNumber ?? 1,
    canonicalApprovedAt: approvedAt,
    canonicalGovernanceStatus: checked.canonicalGovernanceStatus ?? undefined,
    topicId: checked.topicId ?? row.topicId ?? undefined,
    topicKey: row.topicKey ?? undefined,
    subControlKey: row.subControlKey ?? undefined,
    detectorVersion: checked.detectorVersion,
    ruleId: primary?.ruleId ?? checked.primaryRuleId ?? undefined,
    rulePackVersion: checked.rulePackVersion,
    ...(checked.semanticJudge !== undefined
      ? { semanticJudgeJson: checked.semanticJudge as unknown as Prisma.InputJsonValue }
      : {}),
  };
}

export function withContradictionPersistence(
  checked: CheckedContradiction,
  persisted: ContradictionResultDTO,
): CheckedContradiction {
  const fromDb = parseSemanticJudgeFromJson(persisted.semanticJudgeJson);
  return {
    ...checked,
    ...(checked.semanticJudge === undefined && fromDb ? { semanticJudge: fromDb } : {}),
    persistence: {
      resultId: persisted.id,
      resolutionStatus: persisted.resolutionStatus,
      resolvedAt: persisted.resolvedAt?.toISOString() ?? null,
      resolutionAction: persisted.resolutionAction,
    },
  };
}
