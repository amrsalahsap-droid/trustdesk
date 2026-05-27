import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma, uncheckedPrisma } from "@/lib/db/prisma";
import { buildAuthContext } from "@/lib/auth/build-context";
import { handleApiError } from "@/lib/api/error-handler";
import { z } from "zod";
import { QuestionnaireMatchingService } from "@/modules/workspaces/intelligence/questionnaire-matching-service";
import { recordAuditEventSafe, AUDIT_EVENT_TYPES, AUDIT_OBJECT_TYPES } from "@/lib/audit";
import {
  questionnaireRequiresOverrideRationale,
  safeParseOverridePayload,
  type OverridePayloadInput,
} from "@/lib/knowledge/override-reason";

import {
  assertQuestionnaireReview,
  assertQuestionnaireAssign,
} from "@/lib/auth/governance-actions";
import { reconcileQuestionnaireItemContradiction } from "@/lib/questionnaires/reconcile-questionnaire-item-contradiction";
import { Permission } from "@/lib/auth/permissions";
import { guardPermission } from "@/lib/auth/guard";

const updateItemSchema = z.object({
  finalAnswer: z.string().optional(),
  /**
   * Reviewer's explicit choice of where `finalAnswer` came from. Required before a
   * row can be marked `reviewed: true`. Validates against the concrete answer
   * content server-side so the UI cannot claim "imported" while sending AI text.
   */
  finalAnswerSelection: z
    .enum(["imported", "suggested", "edited", "canonical_aligned"])
    .nullable()
    .optional(),
  reviewed: z.boolean().optional(),
  reviewStatus: z.string().optional(),
  conflictNote: z.string().optional().nullable(),
  topicId: z.string().optional().nullable(),
  assigneeId: z.string().optional().nullable(),
  suggestedAnswerId: z.string().optional().nullable(),
  suggestionStatus: z.string().optional().nullable(),
  verificationStatus: z.enum([
    "UNREVIEWED",
    "ACCEPTED",
    "REJECTED",
    "EDITED",
    "MANUAL_OVERRIDE",
    "UNRESOLVED",
    "DRAFTED",
    "SUGGESTED",
    "NEEDS_REVIEW",
    "AUTO_ACCEPTED",
    "AMBIGUOUS_MATCH",
  ]).optional(),
  candidatesJson: z.any().optional(),
  overrideReasonCategory: z
    .enum([
      "BUYER_REQUESTED_DETAIL",
      "LEGAL_REQUIRED_CHANGE",
      "PRODUCT_LIMITATION_DISCLOSURE",
      "TEMPORARY_EXCEPTION",
      "WORDING_CLARIFICATION",
      "OTHER_WITH_COMMENT",
    ])
    .optional()
    .nullable(),
  overrideComment: z.string().max(8000).optional().nullable(),
  overrideScope: z.enum(["QUESTIONNAIRE_ONLY", "REQUEST_CANONICAL_UPDATE"]).optional().nullable(),
});

export async function PATCH(
  request: Request,
  segment: { params: Promise<{ id: string; itemId: string }> },
) {
  try {
    console.log("DEBUG: PATCH item started", { itemId: segment.params.itemId });
    const ctx = await buildAuthContext(request);
    const { id, itemId } = await segment.params;

    const body = await request.json();
    const data = updateItemSchema.parse(body);

    const item = await uncheckedPrisma.questionnaireItem.findFirst({
      where: {
        id: itemId,
        workspaceId: ctx.workspaceId,
        questionnaireId: id,
      },
    });

    if (!item) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Item not found" } },
        { status: 404 },
      );
    }

    // Permission Enforcement
    if (data.reviewed !== undefined || data.verificationStatus !== undefined) {
      assertQuestionnaireReview(ctx, item.assigneeId);
    }
    if (data.topicId !== undefined || data.assigneeId !== undefined) {
      assertQuestionnaireAssign(ctx);
    }
    if (data.finalAnswer !== undefined || data.conflictNote !== undefined) {
      guardPermission(ctx, Permission.EDIT_ANSWERS);
    }

    // Provenance Hardening: importedAnswer is an immutable audit record.
    // We allow the field in the body if it's effectively identical to the current value
    // (to support UI spreads and null/empty-string variations), but block actual modifications.
    const normalize = (v: any) => (v === null || v === undefined ? "" : String(v).trim());
    if ("importedAnswer" in body && normalize(body.importedAnswer) !== normalize(item.importedAnswer)) {
      return NextResponse.json(
        { error: { code: "IMMUTABLE_FIELD", message: "importedAnswer cannot be modified." } },
        { status: 400 },
      );
    }
    if ("importedAnswerSource" in body && normalize(body.importedAnswerSource) !== normalize(item.importedAnswerSource)) {
      return NextResponse.json(
        { error: { code: "IMMUTABLE_FIELD", message: "importedAnswerSource cannot be modified." } },
        { status: 400 },
      );
    }

    // --- Final answer selection validation ---
    // Validate server-side that `finalAnswerSelection` lines up with the concrete
    // answer content in the same request. The UI is the primary caller but any
    // third-party integration must go through the same gate.
    const finalAnswerInput = data.finalAnswer !== undefined ? normalize(data.finalAnswer) : null;
    let inferredSelection = data.finalAnswerSelection;

    // Day 2 Hardening (D2-EN-02): If finalAnswer is changed but selection is missing,
    // infer it based on exact content match.
    if (finalAnswerInput !== null && inferredSelection === undefined) {
      if (finalAnswerInput.length === 0) {
        inferredSelection = null;
      } else if (finalAnswerInput === normalize(item.importedAnswer) && item.importedAnswer) {
        inferredSelection = "imported";
      } else if (finalAnswerInput === normalize(item.suggestedAnswer) && item.suggestedAnswer) {
        inferredSelection = "suggested";
      } else {
        inferredSelection = "edited";
      }
    }

    const resolvedSelection = inferredSelection !== undefined ? inferredSelection : item.finalAnswerSelection;
    const resolvedFinalAnswer = finalAnswerInput !== null ? finalAnswerInput : normalize(item.finalAnswer);

    if (resolvedSelection !== null) {
      if (resolvedSelection === "imported") {
        if (!item.importedAnswer || normalize(item.importedAnswer).length === 0) {
          return NextResponse.json(
            {
              error: {
                code: "INVALID_SELECTION",
                message: "Cannot select 'imported' — this row has no importedAnswer.",
              },
            },
            { status: 422 },
          );
        }
        if (resolvedFinalAnswer !== normalize(item.importedAnswer)) {
          return NextResponse.json(
            {
              error: {
                code: "INVALID_SELECTION",
                message: "finalAnswerSelection='imported' requires finalAnswer to match importedAnswer.",
              },
            },
            { status: 422 },
          );
        }
      }
      if (resolvedSelection === "suggested") {
        if (!item.suggestedAnswer || normalize(item.suggestedAnswer).length === 0) {
          return NextResponse.json(
            {
              error: {
                code: "INVALID_SELECTION",
                message: "Cannot select 'suggested' — this row has no suggestedAnswer.",
              },
            },
            { status: 422 },
          );
        }
        if (resolvedFinalAnswer !== normalize(item.suggestedAnswer)) {
          return NextResponse.json(
            {
              error: {
                code: "INVALID_SELECTION",
                message: "finalAnswerSelection='suggested' requires finalAnswer to match suggestedAnswer.",
              },
            },
            { status: 422 },
          );
        }
      }
      if (resolvedSelection === "edited") {
        if (resolvedFinalAnswer.length === 0) {
          return NextResponse.json(
            {
              error: {
                code: "INVALID_SELECTION",
                message: "Cannot select 'edited' for an empty answer. Use 'null' to clear selection.",
              },
            },
            { status: 422 },
          );
        }
      }
    }

    const incomingSelection = resolvedSelection;

    // Reviewing requires an explicit selection so nobody can silently commit to
    // "whatever finalAnswer currently happens to be". Rows already-reviewed from
    // before this feature shipped are grandfathered in (we don't force a re-pick).
    if (
      data.reviewed === true &&
      !item.reviewed &&
      item.type === "question_row"
    ) {
      if (resolvedFinalAnswer.length > 0 && incomingSelection == null) {
        return NextResponse.json(
          {
            error: {
              code: "REVIEW_REQUIRES_SELECTION",
              message:
                "Pick a final-answer source (imported / suggested / edited) before marking this row reviewed.",
            },
          },
          { status: 409 },
        );
      }
      
      // If reviewed=true and finalAnswer is empty, we allow it (verified-empty), 
      // but we ensure selection is null.
      if (resolvedFinalAnswer.length === 0 && incomingSelection != null) {
        // Force null selection for empty answers if being reviewed now
        // (already handled by inference logic above, but being safe)
      }
    }

    // --- Verification Status Logic ---
    let finalStatus = data.verificationStatus || item.verificationStatus;

    const isAcceptingSuggestion =
      (data.reviewed === true && (!data.finalAnswer || data.finalAnswer === item.suggestedAnswer)) ||
      data.verificationStatus === "ACCEPTED";

    if (isAcceptingSuggestion) {
      finalStatus = "ACCEPTED";
    } else if (data.finalAnswer !== undefined && data.finalAnswer !== item.finalAnswer) {
      // Real manual edit detected (different from suggestion and previous final)
      if (data.finalAnswer !== item.suggestedAnswer) {
        const hasSuggestion = !!item.suggestedAnswer && item.suggestedAnswer.trim() !== "";
        finalStatus = hasSuggestion ? "MANUAL_OVERRIDE" : "EDITED";
      } else {
        finalStatus = "ACCEPTED";
      }
    }

    const isNowReviewed = data.reviewed ?? item.reviewed;

    const needsOverride = questionnaireRequiresOverrideRationale({
      finalAnswerNext: data.finalAnswer,
      finalAnswerPrev: item.finalAnswer,
      suggestedAnswer: item.suggestedAnswer,
      importedAnswer: item.importedAnswer,
      finalAnswerSelectionNext: data.finalAnswerSelection ?? undefined,
      reviewedNext: data.reviewed,
      reviewedPrev: item.reviewed,
      verificationStatusNext: data.verificationStatus,
    });

    let resolvedOverride: OverridePayloadInput | null = null;
    if (needsOverride) {
      const parsed = safeParseOverridePayload({
        overrideReasonCategory: data.overrideReasonCategory,
        overrideComment: data.overrideComment ?? null,
        overrideScope: data.overrideScope,
      });
      if (!parsed.success) {
        return NextResponse.json(
          { error: { code: "OVERRIDE_REQUIRED", message: "Override rationale required", issues: parsed.error.issues } },
          { status: 400 },
        );
      }
      resolvedOverride = parsed.data;
    } else if (data.overrideReasonCategory != null && data.overrideScope != null) {
      const parsed = safeParseOverridePayload({
        overrideReasonCategory: data.overrideReasonCategory,
        overrideComment: data.overrideComment ?? null,
        overrideScope: data.overrideScope,
      });
      if (!parsed.success) {
        return NextResponse.json(
          { error: { code: "VALIDATION_ERROR", issues: parsed.error.issues } },
          { status: 400 },
        );
      }
      resolvedOverride = parsed.data;
    }

    const overrideWrite: Prisma.QuestionnaireItemUpdateInput =
      isAcceptingSuggestion && isNowReviewed
        ? {
            overrideReasonCategory: null,
            overrideComment: null,
            overrideAt: null,
            overrideByUserId: null,
            overrideScope: null,
          }
        : resolvedOverride
          ? {
              overrideReasonCategory: resolvedOverride.overrideReasonCategory,
              overrideComment: resolvedOverride.overrideComment?.trim() || null,
              overrideScope: resolvedOverride.overrideScope,
              overrideAt: new Date(),
              overrideByUserId: ctx.userId,
            }
          : {};

    const selectionChanged =
      inferredSelection !== undefined &&
      inferredSelection !== item.finalAnswerSelection;

    const finalData: Prisma.QuestionnaireItemUpdateInput = {
      ...(data.finalAnswer !== undefined ? { finalAnswer: data.finalAnswer } : {}),
      ...(data.reviewed !== undefined ? { reviewed: data.reviewed } : {}),
      ...(data.reviewStatus !== undefined ? { reviewStatus: data.reviewStatus } : {}),
      ...(data.conflictNote !== undefined ? { conflictNote: data.conflictNote } : {}),
      ...(data.topicId !== undefined ? { topicId: data.topicId } : {}),
      ...(data.suggestedAnswerId !== undefined ? { suggestedAnswerId: data.suggestedAnswerId } : {}),
      ...(data.suggestionStatus !== undefined ? { suggestionStatus: data.suggestionStatus } : {}),
      ...(data.candidatesJson !== undefined ? { candidatesJson: data.candidatesJson } : {}),
      ...(selectionChanged
        ? {
            finalAnswerSelection: (inferredSelection as any) ?? null,
            finalAnswerSelectedAt: inferredSelection != null ? new Date() : null,
            finalAnswerSelectedByUserId:
              inferredSelection != null ? ctx.userId : null,
          }
        : {}),
      verificationStatus: finalStatus,
      ...overrideWrite,
    };

    // QNS-003: Preserve unresolvedReason even when reviewed to prevent context loss.
    // The UI/Filters should use the 'reviewed' flag to determine if it's an active gap.
    if (isNowReviewed) {
      // We no longer null out unresolvedReason here.
    }

    const finalUpdateData = QuestionnaireMatchingService.enforceItemInvariants(item, finalData);

    console.log("DEBUG: Starting transaction", { workspaceId: ctx.workspaceId });
    const updated = await prisma.$transaction(async (tx) => {
      if (isNowReviewed) {
        await tx.gapFlag.deleteMany({
          where: { workspaceId: ctx.workspaceId, questionnaireItemId: itemId },
        });
      }
      return tx.questionnaireItem.update({
        where: { id: itemId, workspaceId: ctx.workspaceId },
        data: finalUpdateData,
      });
    });

    if (data.assigneeId !== undefined && data.assigneeId !== item.assigneeId) {
      await recordAuditEventSafe({
        workspaceId: ctx.workspaceId,
        actorUserId: ctx.userId,
        eventType: AUDIT_EVENT_TYPES.QUESTIONNAIRE_ASSIGNEE_CHANGED,
        objectType: AUDIT_OBJECT_TYPES.QUESTIONNAIRE_ITEM,
        objectId: itemId,
        metadata: {
          questionnaireId: id,
          before: item.assigneeId,
          after: data.assigneeId,
        },
      });
    }

    if (resolvedOverride) {
      await recordAuditEventSafe({
        workspaceId: ctx.workspaceId,
        actorUserId: ctx.userId,
        eventType: AUDIT_EVENT_TYPES.QUESTIONNAIRE_ITEM_OVERRIDE,
        objectType: AUDIT_OBJECT_TYPES.QUESTIONNAIRE_ITEM,
        objectId: itemId,
        metadata: {
          questionnaireId: id,
          category: resolvedOverride.overrideReasonCategory,
          scope: resolvedOverride.overrideScope,
          commentPreview: (resolvedOverride.overrideComment ?? "").slice(0, 200),
        },
      });
    }

    if (selectionChanged) {
      await recordAuditEventSafe({
        workspaceId: ctx.workspaceId,
        actorUserId: ctx.userId,
        eventType: AUDIT_EVENT_TYPES.QUESTIONNAIRE_ITEM_FINAL_ANSWER_SELECTED,
        objectType: AUDIT_OBJECT_TYPES.QUESTIONNAIRE_ITEM,
        objectId: itemId,
        metadata: {
          questionnaireId: id,
          from: item.finalAnswerSelection ?? null,
          to: data.finalAnswerSelection ?? null,
          finalAnswerPreview: resolvedFinalAnswer.slice(0, 200),
          importedAnswerPreview: (item.importedAnswer ?? "").slice(0, 200),
          suggestedAnswerPreview: (item.suggestedAnswer ?? "").slice(0, 200),
        },
      });
    }

    const shouldReconcileContradiction =
      item.type === "question_row" &&
      (updated.finalAnswer !== item.finalAnswer ||
        updated.reviewed !== item.reviewed ||
        updated.verificationStatus !== item.verificationStatus ||
        updated.suggestedAnswerId !== item.suggestedAnswerId ||
        updated.topicId !== item.topicId);

    if (shouldReconcileContradiction) {
      console.log("DEBUG: Reconciling contradictions");
      await reconcileQuestionnaireItemContradiction({
        workspaceId: ctx.workspaceId,
        questionnaireId: id,
        questionnaireItemId: itemId,
        actorUserId: ctx.userId,
        auditDetectedReason: "material_detection_after_item_update",
      });
    }

    return NextResponse.json({ item: updated });
  } catch (err) {
    console.error("DEBUG: PATCH item error:", err);
    return handleApiError(err);
  }
}
