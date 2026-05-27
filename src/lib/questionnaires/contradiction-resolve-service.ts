import { uncheckedPrisma } from "@/lib/db/prisma";
import {
  forceDetectionAndPendingResolution,
  getContradictionForItem,
  upsertContradictionDetection,
} from "@/lib/contradiction/persistence-service";
import {
  auditTextPreview,
  buildContradictionDetectedAuditMetadata,
  buildResolveContradictionAuditMetadata,
} from "@/lib/audit/contradiction-audit";
import { safeParseOverridePayload } from "@/lib/knowledge/override-reason";
import { QuestionnaireMatchingService } from "@/modules/workspaces/intelligence/questionnaire-matching-service";
import {
  runRowCanonicalContradictionCheck,
  subControlKeyFromProvenance,
  type TopicForRetrieve,
} from "@/lib/questionnaires/review-contradiction";
import { buildSaveContradictionInputFromReviewRow } from "@/lib/questionnaires/review-contradiction-persist";

/** Prisma delegate; schema includes `ContradictionResult` — cast until client types match generated schema. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const contradictionResultDb = (uncheckedPrisma as any).contradictionResult as {
  findFirst: (args: unknown) => Promise<ContradictionRow | null>;
  update: (args: unknown) => Promise<ContradictionRow>;
};

type ContradictionRow = {
  id: string;
  resolutionStatus: string;
  questionnaireItemId: string;
  workspaceId: string;
  questionnaireId: string;
};

const NOTE_MAX = 1000;

function clipNote(s: string | null | undefined): string | null {
  if (s == null || s === "") return null;
  return s.length <= NOTE_MAX ? s : s.slice(0, NOTE_MAX - 3) + "...";
}

export type ContradictionResolveAction =
  | "KEEP_ROW"
  | "EDIT_ROW_ALIGN"
  | "REQUEST_CANONICAL_UPDATE"
  | "FALSE_POSITIVE";

export interface ContradictionResolveBody {
  action: ContradictionResolveAction;
  resultId?: string | null;
  resolutionNote?: string | null;
  finalAnswer?: string;
  overrideReasonCategory?:
    | "BUYER_REQUESTED_DETAIL"
    | "LEGAL_REQUIRED_CHANGE"
    | "PRODUCT_LIMITATION_DISCLOSURE"
    | "TEMPORARY_EXCEPTION"
    | "WORDING_CLARIFICATION"
    | "OTHER_WITH_COMMENT"
    | null;
  overrideComment?: string | null;
}

export class ContradictionResolveError extends Error {
  constructor(
    public code: string,
    message: string,
    public httpStatus = 400,
  ) {
    super(message);
    this.name = "ContradictionResolveError";
  }
}

/** Audit payloads for the resolve route (`primary` + optional post-edit DETECTED). */
export interface ContradictionResolveExecutionResult {
  resultId: string;
  previousResolutionStatus: string;
  primaryAuditMetadata: Record<string, unknown>;
  postEditDetectedMetadata: Record<string, unknown> | null;
}

async function resolveTopicKeyForRules(
  workspaceId: string,
  item: { topicKey: string | null; topicId: string | null },
): Promise<string | null> {
  const tk = item.topicKey?.trim();
  if (tk) return tk;
  if (!item.topicId) return null;
  const topic = await uncheckedPrisma.knowledgeTopic.findFirst({
    where: { id: item.topicId, OR: [{ workspaceId }, { workspaceId: null }] },
    select: { key: true },
  });
  return topic?.key?.trim() ?? null;
}

function minimalAuditFallback(
  questionnaireId: string,
  questionnaireItemId: string,
  resultId: string,
  previousResolutionStatus: string,
  resolutionAction: string,
): Record<string, unknown> {
  return {
    questionnaireId,
    questionnaireItemId,
    contradictionResultId: resultId,
    previousResolutionStatus,
    resolutionAction,
  };
}

/**
 * Applies a canonical-contradiction resolution (transactional item + result updates).
 * For `EDIT_ROW_ALIGN`, re-runs detection after commit and may reopen `PENDING` if still contradictory.
 */
export async function executeContradictionResolve(args: {
  workspaceId: string;
  questionnaireId: string;
  questionnaireItemId: string;
  userId: string;
  body: ContradictionResolveBody;
}): Promise<ContradictionResolveExecutionResult> {
  const { workspaceId, questionnaireId, questionnaireItemId, userId, body } = args;

  const result = await contradictionResultDb.findFirst({
    where: {
      questionnaireItemId,
      ...(body.resultId ? { id: body.resultId } : {}),
      workspaceId,
      questionnaireId,
    },
  });

  if (!result) {
    throw new ContradictionResolveError("NOT_FOUND", "Contradiction result not found for this row", 404);
  }

  if (result.resolutionStatus !== "PENDING" && result.resolutionStatus !== "STALE") {
    throw new ContradictionResolveError("CONFLICT", "Contradiction is already resolved", 409);
  }

  const item = await uncheckedPrisma.questionnaireItem.findFirst({
    where: { id: questionnaireItemId, workspaceId, questionnaireId },
  });

  if (!item) {
    throw new ContradictionResolveError("NOT_FOUND", "Questionnaire item not found", 404);
  }

  const previousResolutionStatus = result.resolutionStatus;

  await uncheckedPrisma.$transaction(async (tx) => {
    switch (body.action) {
      case "FALSE_POSITIVE": {
        await (tx as unknown as { contradictionResult: { update: typeof contradictionResultDb.update } })
          .contradictionResult.update({
            where: { id: result.id, workspaceId },
            data: {
              resolutionStatus: "FALSE_POSITIVE",
              resolvedAt: new Date(),
              resolvedByUserId: userId,
              resolutionNote: clipNote(body.resolutionNote),
              resolutionAction: "FALSE_POSITIVE",
            },
          });
        break;
      }
      case "KEEP_ROW": {
        if (!body.overrideReasonCategory) {
          throw new ContradictionResolveError("VALIDATION_ERROR", "overrideReasonCategory is required", 400);
        }
        const parsed = safeParseOverridePayload({
          overrideReasonCategory: body.overrideReasonCategory,
          overrideComment: body.overrideComment ?? null,
          overrideScope: "QUESTIONNAIRE_ONLY",
        });
        if (!parsed.success) {
          throw new ContradictionResolveError("VALIDATION_ERROR", "Invalid override payload", 400);
        }
        await tx.questionnaireItem.update({
          where: { id: questionnaireItemId, workspaceId },
          data: {
            overrideReasonCategory: parsed.data.overrideReasonCategory,
            overrideComment: parsed.data.overrideComment?.trim() || null,
            overrideScope: "QUESTIONNAIRE_ONLY",
            overrideAt: new Date(),
            overrideByUserId: userId,
          },
        });
        await (tx as unknown as { contradictionResult: { update: typeof contradictionResultDb.update } })
          .contradictionResult.update({
            where: { id: result.id, workspaceId },
            data: {
              resolutionStatus: "ACKNOWLEDGED",
              resolvedAt: new Date(),
              resolvedByUserId: userId,
              resolutionNote: clipNote(body.resolutionNote ?? body.overrideComment),
              resolutionAction: "KEEP_ROW",
            },
          });
        break;
      }
      case "REQUEST_CANONICAL_UPDATE": {
        if (!body.overrideReasonCategory) {
          throw new ContradictionResolveError("VALIDATION_ERROR", "overrideReasonCategory is required", 400);
        }
        const parsed = safeParseOverridePayload({
          overrideReasonCategory: body.overrideReasonCategory,
          overrideComment: body.overrideComment ?? null,
          overrideScope: "REQUEST_CANONICAL_UPDATE",
        });
        if (!parsed.success) {
          throw new ContradictionResolveError("VALIDATION_ERROR", "Invalid override payload", 400);
        }
        await tx.questionnaireItem.update({
          where: { id: questionnaireItemId, workspaceId },
          data: {
            overrideReasonCategory: parsed.data.overrideReasonCategory,
            overrideComment: parsed.data.overrideComment?.trim() || null,
            overrideScope: "REQUEST_CANONICAL_UPDATE",
            overrideAt: new Date(),
            overrideByUserId: userId,
          },
        });
        await (tx as unknown as { contradictionResult: { update: typeof contradictionResultDb.update } })
          .contradictionResult.update({
            where: { id: result.id, workspaceId },
            data: {
              resolutionStatus: "ACKNOWLEDGED",
              resolvedAt: new Date(),
              resolvedByUserId: userId,
              resolutionNote: clipNote(body.resolutionNote ?? body.overrideComment),
              resolutionAction: "REQUEST_CANONICAL_UPDATE",
            },
          });
        break;
      }
      case "EDIT_ROW_ALIGN": {
        if (body.finalAnswer === undefined) {
          throw new ContradictionResolveError("VALIDATION_ERROR", "finalAnswer is required for EDIT_ROW_ALIGN", 400);
        }
        const finalAnswer = body.finalAnswer;
        let verificationStatus = item.verificationStatus;
        if (finalAnswer !== item.suggestedAnswer) {
          const hasSuggestion = !!(item.suggestedAnswer?.trim());
          verificationStatus = hasSuggestion ? "MANUAL_OVERRIDE" : "EDITED";
        } else {
          verificationStatus = "ACCEPTED";
        }
        const rawPatch = { finalAnswer, verificationStatus };
        const finalPatch = QuestionnaireMatchingService.enforceItemInvariants(item, rawPatch);
        await tx.questionnaireItem.update({
          where: { id: questionnaireItemId, workspaceId },
          data: finalPatch,
        });
        await (tx as unknown as { contradictionResult: { update: typeof contradictionResultDb.update } })
          .contradictionResult.update({
            where: { id: result.id, workspaceId },
            data: {
              resolutionStatus: "RESOLVED_ROW",
              resolvedAt: new Date(),
              resolvedByUserId: userId,
              resolutionNote: clipNote(body.resolutionNote),
              resolutionAction: "EDIT_ROW_ALIGN",
            },
          });
        break;
      }
    }
  });

  if (body.action !== "EDIT_ROW_ALIGN") {
    const afterDto = await getContradictionForItem(workspaceId, questionnaireItemId);
    if (!afterDto) {
      return {
        resultId: result.id,
        previousResolutionStatus,
        primaryAuditMetadata: minimalAuditFallback(
          questionnaireId,
          questionnaireItemId,
          result.id,
          previousResolutionStatus,
          body.action,
        ),
        postEditDetectedMetadata: null,
      };
    }
    return {
      resultId: result.id,
      previousResolutionStatus,
      primaryAuditMetadata: buildResolveContradictionAuditMetadata({
        questionnaireId,
        questionnaireItemId,
        dto: afterDto,
        itemTopicId: item.topicId,
        itemTopicKey: item.topicKey,
        resolutionAction: body.action,
        previousResolutionStatus,
        overrideReasonCategory: body.overrideReasonCategory,
        overrideComment: body.overrideComment,
        resolutionNote: body.resolutionNote,
      }),
      postEditDetectedMetadata: null,
    };
  }

  let postEditDetectedMetadata: Record<string, unknown> | null = null;
  let primaryAuditMetadata: Record<string, unknown>;

  const updatedItem = await uncheckedPrisma.questionnaireItem.findFirst({
    where: { id: questionnaireItemId, workspaceId, questionnaireId },
  });

  if (!updatedItem) {
    return {
      resultId: result.id,
      previousResolutionStatus,
      primaryAuditMetadata: minimalAuditFallback(
        questionnaireId,
        questionnaireItemId,
        result.id,
        previousResolutionStatus,
        "EDIT_ROW_ALIGN",
      ),
      postEditDetectedMetadata: null,
    };
  }

  const topicKeyForRules = await resolveTopicKeyForRules(workspaceId, {
    topicKey: updatedItem.topicKey,
    topicId: updatedItem.topicId,
  });
  const topicForRetrieve: TopicForRetrieve | null = updatedItem.topicId
    ? { topicId: updatedItem.topicId }
    : updatedItem.topicKey
      ? { topicKey: updatedItem.topicKey }
      : null;
  const linkedSub = subControlKeyFromProvenance(updatedItem.provenanceJson);

  const recheck = await runRowCanonicalContradictionCheck({
    workspaceId,
    questionnaireId,
    questionnaireItemId,
    question: updatedItem.question,
    finalAnswer: updatedItem.finalAnswer,
    suggestedAnswer: updatedItem.suggestedAnswer,
    importedAnswer: updatedItem.importedAnswer,
    suggestedAnswerId: updatedItem.suggestedAnswerId,
    verificationStatus: updatedItem.verificationStatus,
    topicForRetrieve,
    topicKeyForRules,
    subControlKey: linkedSub,
  });

  if (recheck.status === "checked") {
    const saveIn = buildSaveContradictionInputFromReviewRow(
      {
        workspaceId,
        questionnaireId,
        questionnaireItemId,
        topicId: updatedItem.topicId,
        topicKey: updatedItem.topicKey,
        subControlKey: linkedSub,
        finalAnswer: updatedItem.finalAnswer,
        suggestedAnswer: updatedItem.suggestedAnswer,
      },
      recheck,
    );
    if (saveIn) {
      if (recheck.contradictionFound) {
        await forceDetectionAndPendingResolution(result.id, saveIn);
      } else {
        await upsertContradictionDetection(saveIn);
      }
    }
  }

  const metaDto = await getContradictionForItem(workspaceId, questionnaireItemId);
  if (!metaDto) {
    primaryAuditMetadata = minimalAuditFallback(
      questionnaireId,
      questionnaireItemId,
      result.id,
      previousResolutionStatus,
      "EDIT_ROW_ALIGN",
    );
    return { resultId: result.id, previousResolutionStatus, primaryAuditMetadata, postEditDetectedMetadata };
  }

  if (recheck.status === "checked") {
    if (recheck.contradictionFound) {
      if (metaDto.contradictionFound) {
        postEditDetectedMetadata = buildContradictionDetectedAuditMetadata(
          questionnaireId,
          questionnaireItemId,
          metaDto,
          "still_conflicting_after_edit",
        );
      }
      primaryAuditMetadata = buildResolveContradictionAuditMetadata({
        questionnaireId,
        questionnaireItemId,
        dto: metaDto,
        itemTopicId: updatedItem.topicId,
        itemTopicKey: updatedItem.topicKey,
        resolutionAction: "EDIT_ROW_ALIGN",
        previousResolutionStatus,
        resolutionNote: body.resolutionNote,
        outcome: "still_conflicting_reopened",
        contradictionFoundAfter: true,
        finalAnswerPreview: auditTextPreview(body.finalAnswer) ?? null,
      });
    } else {
      primaryAuditMetadata = buildResolveContradictionAuditMetadata({
        questionnaireId,
        questionnaireItemId,
        dto: metaDto,
        itemTopicId: updatedItem.topicId,
        itemTopicKey: updatedItem.topicKey,
        resolutionAction: "EDIT_ROW_ALIGN",
        previousResolutionStatus,
        resolutionNote: body.resolutionNote,
        outcome: "cleared_by_alignment",
        contradictionFoundAfter: false,
        finalAnswerPreview: auditTextPreview(body.finalAnswer) ?? null,
      });
    }
  } else {
    primaryAuditMetadata = buildResolveContradictionAuditMetadata({
      questionnaireId,
      questionnaireItemId,
      dto: metaDto,
      itemTopicId: updatedItem.topicId,
      itemTopicKey: updatedItem.topicKey,
      resolutionAction: "EDIT_ROW_ALIGN",
      previousResolutionStatus,
      resolutionNote: body.resolutionNote,
      outcome: "edit_align_recheck_unavailable",
      contradictionFoundAfter: metaDto.contradictionFound,
      finalAnswerPreview: auditTextPreview(body.finalAnswer) ?? null,
    });
  }

  return {
    resultId: result.id,
    previousResolutionStatus,
    primaryAuditMetadata,
    postEditDetectedMetadata,
  };
}
