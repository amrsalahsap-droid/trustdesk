import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { buildAuthContext } from "@/lib/auth/build-context";
import { assertQuestionnaireReview } from "@/lib/auth/governance-actions";
import { guardPermission } from "@/lib/auth/guard";
import { Permission } from "@/lib/auth/permissions";
import { handleApiError } from "@/lib/api/error-handler";
import { recordAuditEventSafe, AUDIT_EVENT_TYPES, AUDIT_OBJECT_TYPES } from "@/lib/audit";
import {
  ContradictionResolveError,
  executeContradictionResolve,
} from "@/lib/questionnaires/contradiction-resolve-service";

const categoryEnum = z.enum([
  "BUYER_REQUESTED_DETAIL",
  "LEGAL_REQUIRED_CHANGE",
  "PRODUCT_LIMITATION_DISCLOSURE",
  "TEMPORARY_EXCEPTION",
  "WORDING_CLARIFICATION",
  "OTHER_WITH_COMMENT",
]);

const bodySchema = z
  .object({
    action: z.enum(["KEEP_ROW", "EDIT_ROW_ALIGN", "REQUEST_CANONICAL_UPDATE", "FALSE_POSITIVE"]),
    resultId: z.string().min(1).optional(),
    resolutionNote: z.string().max(8000).optional().nullable(),
    finalAnswer: z.string().optional(),
    overrideReasonCategory: categoryEnum.optional().nullable(),
    overrideComment: z.string().max(8000).optional().nullable(),
  })
  .superRefine((val, ctx) => {
    if (val.action === "FALSE_POSITIVE") {
      if (!val.resolutionNote?.trim()) {
        ctx.addIssue({
          code: "custom",
          message: "resolutionNote is required for FALSE_POSITIVE",
          path: ["resolutionNote"],
        });
      }
    }
    if (val.action === "KEEP_ROW" || val.action === "REQUEST_CANONICAL_UPDATE") {
      if (!val.overrideReasonCategory) {
        ctx.addIssue({
          code: "custom",
          message: "overrideReasonCategory is required",
          path: ["overrideReasonCategory"],
        });
      }
    }
    if (val.action === "EDIT_ROW_ALIGN" && val.finalAnswer === undefined) {
      ctx.addIssue({
        code: "custom",
        message: "finalAnswer is required for EDIT_ROW_ALIGN",
        path: ["finalAnswer"],
      });
    }
  });

export async function POST(
  request: Request,
  segment: { params: Promise<{ id: string; itemId: string }> },
) {
  try {
    const ctx = await buildAuthContext(request);
    assertQuestionnaireReview(ctx);
    const { id, itemId } = await segment.params;
    const raw = bodySchema.parse(await request.json());

    if (raw.action === "EDIT_ROW_ALIGN") {
      guardPermission(ctx, Permission.EDIT_ANSWERS);
    }

    const out = await executeContradictionResolve({
      workspaceId: ctx.workspaceId,
      questionnaireId: id,
      questionnaireItemId: itemId,
      userId: ctx.userId,
      body: raw,
    });

    /** Split taxonomy: legacy rows may still show RESOLVED with metadata.action for all paths. */
    const primaryEventType =
      raw.action === "FALSE_POSITIVE"
        ? AUDIT_EVENT_TYPES.QUESTIONNAIRE_ITEM_CONTRADICTION_DISMISSED
        : raw.action === "REQUEST_CANONICAL_UPDATE"
          ? AUDIT_EVENT_TYPES.QUESTIONNAIRE_ITEM_CANONICAL_UPDATE_REQUESTED
          : AUDIT_EVENT_TYPES.QUESTIONNAIRE_ITEM_CONTRADICTION_RESOLVED;

    await recordAuditEventSafe({
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.userId,
      eventType: primaryEventType,
      objectType: AUDIT_OBJECT_TYPES.QUESTIONNAIRE_ITEM,
      objectId: itemId,
      metadata: out.primaryAuditMetadata,
    });

    if (out.postEditDetectedMetadata) {
      await recordAuditEventSafe({
        workspaceId: ctx.workspaceId,
        actorUserId: ctx.userId,
        eventType: AUDIT_EVENT_TYPES.QUESTIONNAIRE_ITEM_CONTRADICTION_DETECTED,
        objectType: AUDIT_OBJECT_TYPES.QUESTIONNAIRE_ITEM,
        objectId: itemId,
        metadata: out.postEditDetectedMetadata,
      });
    }

    return NextResponse.json({
      ok: true,
      resultId: out.resultId,
      previousResolutionStatus: out.previousResolutionStatus,
    });
  } catch (e) {
    if (e instanceof ContradictionResolveError) {
      return NextResponse.json(
        { error: { code: e.code, message: e.message } },
        { status: e.httpStatus },
      );
    }
    if (e instanceof ZodError) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid request",
            issues: e.issues,
          },
        },
        { status: 400 },
      );
    }
    return handleApiError(e);
  }
}
