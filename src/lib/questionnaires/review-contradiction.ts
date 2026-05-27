/**
 * Canonical contradiction checks for questionnaire review rows.
 * Compares row answers to approved internal canonical answers using topic rule packs.
 */

import { detect } from "@/lib/contradiction/detection-service";
import type {
  QuestionnaireRow,
  ContradictionHit,
  ContradictionDetectionResult,
} from "@/lib/contradiction/detection-types";
import { retrieveInternalCanonical } from "@/lib/contradiction/canonical-retrieval";
import type {
  CanonicalAnswerMetadata,
  CanonicalRetrievalResult,
} from "@/lib/contradiction/canonical-retrieval";
import { loadRulePackSafe } from "@/lib/contradiction/rule-loader";
import {
  passesSemanticJudgeTextGate,
  runSemanticContradictionJudge,
  SEMANTIC_CONTRADICTION_RULE_ID,
  SEMANTIC_JUDGE_LIKELY_THRESHOLD,
  semanticConfidenceToSeverity,
} from "@/lib/contradiction/semantic-contradiction-judge";
import { prisma, uncheckedPrisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logging/logger";
import type {
  ReviewCanonicalContradictionDTO,
  ReviewCanonicalContradictionHitDTO,
  ReviewSemanticJudgeDTO,
} from "@/lib/questionnaires/types";
import { COMMITTED_VERIFICATION_STATUSES } from "@/lib/questionnaires/row-state";

const MAX_HITS = 25;

export type TopicForRetrieve = { topicId: string } | { topicKey: string };

export interface ContradictionCheckDeps {
  retrieveInternalCanonical: typeof retrieveInternalCanonical;
  loadRulePackSafe: typeof loadRulePackSafe;
  detect: typeof detect;
  /** Load topic flag; inject in tests. Must scope by workspace for tenant middleware. */
  loadSemanticAssistEnabledForTopic?: (workspaceId: string, topicId: string) => Promise<boolean>;
  runSemanticContradictionJudge?: typeof runSemanticContradictionJudge;
}

async function defaultLoadSemanticAssistEnabledForTopic(
  workspaceId: string,
  topicId: string,
): Promise<boolean> {
  try {
    // Tenant middleware requires a resolvable workspaceId on the where-clause (not OR with null-only branches).
    let row = await prisma.knowledgeTopic.findFirst({
      where: {
        id: topicId,
        workspaceId: { in: [workspaceId, "SYSTEM_WORKSPACE"] },
      },
      select: { contradictionSemanticAssistEnabled: true },
    });
    if (!row) {
      row = await uncheckedPrisma.knowledgeTopic.findFirst({
        where: { id: topicId, workspaceId: null },
        select: { contradictionSemanticAssistEnabled: true },
      });
    }
    return row?.contradictionSemanticAssistEnabled === true;
  } catch {
    return false;
  }
}

export const defaultContradictionCheckDeps: ContradictionCheckDeps = {
  retrieveInternalCanonical,
  loadRulePackSafe,
  detect,
  loadSemanticAssistEnabledForTopic: defaultLoadSemanticAssistEnabledForTopic,
  runSemanticContradictionJudge,
};


export interface RunRowCanonicalContradictionCheckInput {
  workspaceId: string;
  questionnaireId: string;
  questionnaireItemId: string;
  question: string;
  finalAnswer: string;
  suggestedAnswer: string;
  /**
   * Manual answer captured from the uploaded spreadsheet row (`QuestionnaireItem.importedAnswer`).
   * Treated as a committed row answer because the customer already typed it; we want the
   * engine to be able to detect "imported manual answer contradicts canonical" BEFORE the
   * reviewer makes an explicit selection.
   */
  importedAnswer?: string | null;
  /** Library answer id backing the suggestion, if any. Used to decide whether the
   * suggestion has been committed as the row's answer. */
  suggestedAnswerId?: string | null;
  /** Item's current `verificationStatus`. When not provided, the suggestion is treated
   * as uncommitted (conservative default for callers that did not yet thread it through). */
  verificationStatus?: string | null;
  /** For `retrieveInternalCanonical` — at least one required when running checks. */
  topicForRetrieve: TopicForRetrieve | null;
  /** Topic key matching `src/lib/contradiction/rules/{key}.json` (e.g. access_control). */
  topicKeyForRules: string | null;
  subControlKey?: string | null;
  deps?: Partial<ContradictionCheckDeps>;
}

function mapHit(h: ContradictionHit): ReviewCanonicalContradictionHitDTO {
  return {
    ruleId: h.ruleId,
    ruleDescription: h.ruleDescription,
    contradictionType: h.contradictionType,
    severity: h.severity,
    message: h.message,
    reason: h.reason,
    rowExcerpt: h.rowExcerpt,
    canonicalExcerpt: h.canonicalExcerpt,
    confidence: h.confidence,
  };
}

function checkedBaseFromDetection(
  dr: ContradictionDetectionResult,
  hits: ReviewCanonicalContradictionHitDTO[],
  canonical: CanonicalAnswerMetadata,
): Extract<ReviewCanonicalContradictionDTO, { status: "checked" }> {
  const primaryRuleId = hits[0]?.ruleId ?? null;
  return {
    status: "checked",
    contradictionFound: dr.contradictionFound,
    canonicalUnavailable: false,
    severity: dr.severity,
    contradictionType: dr.contradictionType,
    message: dr.message,
    reason: dr.reason,
    hits,
    rulesEvaluated: dr.rulesEvaluated,
    rulePackVersion: dr.detectionMeta.rulePackVersion,
    detectorVersion: dr.detectionMeta.detectorVersion,
    canonicalAnswerId: canonical.answerId,
    canonicalAnswerExcerpt: dr.canonicalExcerpt ?? canonical.answer?.slice(0, 400) ?? null,
    canonicalVersionNumber: canonical.versionNumber,
    topicId: canonical.topicId,
    canonicalApprovedAt: canonical.approvedAt?.toISOString() ?? null,
    canonicalGovernanceStatus: canonical.governanceStatus,
    primaryRuleId,
  };
}

/**
 * Runs deterministic canonical contradiction detection for one review row.
 * Never throws; returns `error` status on unexpected failures.
 */
export async function runRowCanonicalContradictionCheck(
  input: RunRowCanonicalContradictionCheckInput,
): Promise<ReviewCanonicalContradictionDTO> {
  const deps: ContradictionCheckDeps = { ...defaultContradictionCheckDeps, ...input.deps };

  // Row-answer precedence (most committed → least):
  //   1. `finalAnswer`       — the reviewer's chosen text.
  //   2. `importedAnswer`    — the customer's uploaded manual answer (always counts as
  //      committed: it is the source-of-truth from the spreadsheet, and we want to
  //      surface contradictions against it BEFORE the reviewer chooses a source so the
  //      bug "silent AI replacement hides the contradiction" cannot recur).
  //   3. `suggestedAnswer`   — AI draft, only when the reviewer has explicitly
  //      committed to it (ACCEPTED / EDITED / MANUAL_OVERRIDE).
  const hasCommittedSuggestion =
    Boolean(input.suggestedAnswerId) &&
    typeof input.verificationStatus === "string" &&
    COMMITTED_VERIFICATION_STATUSES.has(input.verificationStatus);
  const trimmedFinal = input.finalAnswer?.trim() ?? "";
  const trimmedImported = input.importedAnswer?.trim() ?? "";
  const trimmedSuggested = hasCommittedSuggestion
    ? (input.suggestedAnswer?.trim() ?? "")
    : "";
  const rowAnswer = trimmedFinal || trimmedImported || trimmedSuggested || "";
  if (!rowAnswer) {
    return { status: "skipped", reason: "empty_row_answer" };
  }

  if (!input.topicForRetrieve) {
    return { status: "skipped", reason: "missing_topic" };
  }

  if (!input.topicKeyForRules?.trim()) {
    return { status: "skipped", reason: "missing_topic_key_for_rules" };
  }

  const packResult = deps.loadRulePackSafe(input.topicKeyForRules.trim());
  if (!packResult.success || !packResult.pack) {
    return { status: "no_rule_pack" };
  }

  let retrieval: CanonicalRetrievalResult;
  try {
    retrieval = await deps.retrieveInternalCanonical(
      input.workspaceId,
      input.topicForRetrieve,
      input.subControlKey ?? null,
    );
  } catch (e) {
    logger.warn("questionnaire.review:canonical_retrieval_failed", {
      workspaceId: input.workspaceId,
      questionnaireId: input.questionnaireId,
      questionnaireItemId: input.questionnaireItemId,
      error: e instanceof Error ? e.message : String(e),
    });
    return {
      status: "error",
      message: "Canonical retrieval failed",
    };
  }

  if (retrieval.kind !== "success") {
    return {
      status: "no_canonical",
      reason: retrieval.reason,
      code: retrieval.code,
    };
  }

  const canonical = retrieval.canonical;
  // Pass the precedence-resolved row text into the engine as `finalAnswer` so
  // `detect()` compares canonical against the content we actually consider the
  // row's voice (final > imported > committed-suggestion). The raw inputs are
  // retained for display metadata but the contradiction engine only needs the
  // resolved string.
  const row: QuestionnaireRow = {
    id: input.questionnaireItemId,
    question: input.question,
    finalAnswer: rowAnswer,
    suggestedAnswer: "",
    topicKey: input.topicKeyForRules ?? undefined,
    subControlKey: input.subControlKey ?? null,
  };

  const loadFlag =
    deps.loadSemanticAssistEnabledForTopic ?? defaultLoadSemanticAssistEnabledForTopic;

  try {
    const result = deps.detect(row, canonical, packResult.pack);

    if ("canonicalUnavailable" in result && result.canonicalUnavailable) {
      return {
        status: "checked",
        contradictionFound: false,
        canonicalUnavailable: true,
        severity: null,
        contradictionType: null,
        message: result.message ?? null,
        reason: result.reason ?? null,
        hits: [],
        rulesEvaluated: result.rulesEvaluated,
        rulePackVersion: result.detectionMeta.rulePackVersion,
        detectorVersion: result.detectionMeta.detectorVersion,
        canonicalAnswerId: canonical.answerId,
        canonicalAnswerExcerpt: canonical.answer?.slice(0, 400) ?? null,
        canonicalVersionNumber: canonical.versionNumber,
        topicId: canonical.topicId,
        canonicalApprovedAt: canonical.approvedAt?.toISOString() ?? null,
        canonicalGovernanceStatus: canonical.governanceStatus,
        primaryRuleId: null,
      };
    }

    const dr = result as ContradictionDetectionResult;
    const hits = (dr.hits ?? []).slice(0, MAX_HITS).map(mapHit);

    if (hits.length > 0) {
      return checkedBaseFromDetection(dr, hits, canonical);
    }

    const topicSemanticOn = await loadFlag(input.workspaceId, canonical.topicId);
    const rulesRan = dr.rulesEvaluated > 0;
    const textOk = passesSemanticJudgeTextGate(rowAnswer, canonical.answer ?? "");

    let semanticJudge: ReviewSemanticJudgeDTO | undefined;
    if (topicSemanticOn && rulesRan && textOk) {
      const judgeFn = deps.runSemanticContradictionJudge ?? runSemanticContradictionJudge;
      semanticJudge = await judgeFn({
        workspaceId: input.workspaceId,
        questionnaireItemId: input.questionnaireItemId,
        question: input.question,
        rowAnswer,
        canonicalAnswer: canonical.answer ?? "",
        topicKey: input.topicKeyForRules.trim(),
      });
    }

    if (
      semanticJudge &&
      semanticJudge.contradictionLikely &&
      semanticJudge.confidence >= SEMANTIC_JUDGE_LIKELY_THRESHOLD
    ) {
      const sev = semanticConfidenceToSeverity(semanticJudge.confidence);
      const rowEx =
        semanticJudge.supportingExcerpts.find((e) => e.source === "row")?.text ??
        rowAnswer.slice(0, 400);
      const canonEx =
        semanticJudge.supportingExcerpts.find((e) => e.source === "canonical")?.text ??
        (canonical.answer ?? "").slice(0, 400);
      const syntheticHit: ReviewCanonicalContradictionHitDTO = {
        ruleId: SEMANTIC_CONTRADICTION_RULE_ID,
        ruleDescription: "Semantic contradiction assist (LLM)",
        contradictionType: "semantic_assist",
        severity: sev,
        message: `[Semantic assist] ${semanticJudge.reason}`,
        reason: semanticJudge.reason,
        rowExcerpt: rowEx,
        canonicalExcerpt: canonEx,
        confidence: semanticJudge.confidence,
      };

      return {
        ...checkedBaseFromDetection(
          {
            ...dr,
            contradictionFound: true,
            severity: sev,
            contradictionType: "semantic_assist",
            message: `[Semantic assist] ${semanticJudge.reason}`,
            reason: semanticJudge.reason,
            canonicalExcerpt: dr.canonicalExcerpt,
          },
          [syntheticHit],
          canonical,
        ),
        semanticJudge,
      };
    }

    const base = checkedBaseFromDetection(dr, hits, canonical);
    return semanticJudge !== undefined ? { ...base, semanticJudge } : base;
  } catch (e) {
    logger.warn("questionnaire.review:contradiction_detect_failed", {
      workspaceId: input.workspaceId,
      questionnaireId: input.questionnaireId,
      questionnaireItemId: input.questionnaireItemId,
      topicKey: input.topicKeyForRules,
      error: e instanceof Error ? e.message : String(e),
    });
    return {
      status: "error",
      message: e instanceof Error ? e.message : "Contradiction detection failed",
    };
  }
}

/**
 * Parses provenance JSON for the first source sub-control key.
 */
export function subControlKeyFromProvenance(provenanceJson: unknown): string | null {
  if (!provenanceJson || typeof provenanceJson !== "object") return null;
  const keys = (provenanceJson as { sourceSubControlKeys?: unknown }).sourceSubControlKeys;
  if (!Array.isArray(keys) || keys.length === 0) return null;
  const first = keys[0];
  return typeof first === "string" && first.trim() ? first.trim() : null;
}
