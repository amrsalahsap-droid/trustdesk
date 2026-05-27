import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { buildAuthContext } from "@/lib/auth/build-context";
import { handleApiError } from "@/lib/api/error-handler";
import type { QuestionnaireImportPreview } from "@/lib/questionnaires/types";
import { buildSpreadsheetPreview } from "@/modules/questionnaires/spreadsheet-preview";
import { validateQuestionnaireUpload } from "@/lib/questionnaires/validate-questionnaire-upload";
import { recordAuditEventSafe } from "@/lib/audit/record-audit-event";
import { AUDIT_EVENT_TYPES, AUDIT_OBJECT_TYPES } from "@/lib/audit/audit-event-types";

export async function GET(
  request: Request,
  segment: { params: Promise<{ jobId: string }> },
) {
  try {
    const ctx = await buildAuthContext(request);
    const { jobId } = await segment.params;

    const job = await prisma.questionnaireJob.findFirst({
      where: { id: jobId, workspaceId: ctx.workspaceId },
    });

    if (!job) {
      return NextResponse.json({ error: { code: "NOT_FOUND", message: "Import job not found" } }, { status: 404 });
    }

    const preview = job.previewJson as QuestionnaireImportPreview | null;
    
    // Patch: Filter out legacy issues from stale database snapshots
    const filteredIssues = preview?.issues?.filter(i => 
      i.title !== "Multiple sheets" && 
      i.title !== "Empty answer cells" &&
      !i.detail.includes("other tabs were not merged")
    ) || [];

    return NextResponse.json({
      job: {
        id: job.id,
        status: job.status,
        originalName: job.originalName,
        detectedSheetName: job.detectedSheetName,
        selectedSheetName: job.selectedSheetName,
        headerRowIndex: job.headerRowIndex,
        questionColIndex: job.questionColIndex,
        answerColIndex: job.answerColIndex,
        detectedHeaderRowIndex: job.detectedHeaderRowIndex,
        detectedQuestionColIndex: job.detectedQuestionColIndex,
        detectedAnswerColIndex: job.detectedAnswerColIndex,
        confidence: job.confidence,
        suggestNewAnswer: job.suggestNewAnswer,
        errorMessage: job.errorMessage,
      },
      preview: preview ? {
        ...preview,
        issues: filteredIssues,
        detectedHeaderRowIndex: job.detectedHeaderRowIndex,
        detectedQuestionColIndex: job.detectedQuestionColIndex,
        detectedAnswerColIndex: job.detectedAnswerColIndex,
      } : null,
    });
  } catch (err) {
    return handleApiError(err);
  }
}

/** Re-run detection on stored bytes (e.g. after changing sheet). */
export async function POST(
  request: Request,
  segment: { params: Promise<{ jobId: string }> },
) {
  try {
    const ctx = await buildAuthContext(request);
    const { jobId } = await segment.params;
    const body = (await request.json()) as { 
      selectedSheet?: string;
      headerRow1Based?: number;
      questionColIndex?: number;
      answerColIndex?: number;
    };

    const job = await prisma.questionnaireJob.findFirst({
      where: { id: jobId, workspaceId: ctx.workspaceId },
    });

    if (!job?.fileBytes) {
      return NextResponse.json({ error: { code: "NOT_FOUND", message: "No file data for this job" } }, { status: 404 });
    }

    const buf = Buffer.from(job.fileBytes);
    validateQuestionnaireUpload({
      originalName: job.originalName ?? "file",
      mimeType: job.mimeType ?? "",
      byteLength: buf.length,
    });

    // If the user provides manual overrides, we use them.
    const overrides = {
      manualHeaderRow: body.headerRow1Based !== undefined ? body.headerRow1Based - 1 : undefined,
      manualQuestionCol: body.questionColIndex,
      manualAnswerCol: body.answerColIndex,
    };

    const parsed = buildSpreadsheetPreview(buf, job.mimeType ?? "", body.selectedSheet, overrides);
    if ("error" in parsed) {
      await prisma.questionnaireJob.update({
        where: { id: jobId, workspaceId: ctx.workspaceId },

        data: { status: "failed", errorMessage: parsed.error, previewJson: undefined },
      });
      return NextResponse.json(
        { error: { code: "PARSE_FAILED", message: parsed.error }, issues: parsed.issues ?? [] },
        { status: 422 },
      );
    }

    const upData: any = {
      status: "awaiting_confirmation",
      selectedSheetName: body.selectedSheet ?? undefined,
      previewJson: parsed.preview as object,
      headerRowIndex: parsed.preview.headerRow1Based - 1,
      questionColIndex: parsed.preview.questionColIndex,
      answerColIndex: parsed.preview.answerColIndex,
      confidence: parsed.preview.confidence,
      suggestNewAnswer: parsed.preview.suggestNewAnswerColumn,
      errorMessage: null,
    };

    // Preserve detection defaults if not already set (Day 7 logic)
    if (job.detectedHeaderRowIndex === null) {
      upData.detectedHeaderRowIndex = parsed.preview.headerRow1Based - 1;
    }
    if (job.detectedQuestionColIndex === null) {
      upData.detectedQuestionColIndex = parsed.preview.questionColIndex;
    }
    if (job.detectedAnswerColIndex === null) {
      upData.detectedAnswerColIndex = parsed.preview.answerColIndex;
    }

    await prisma.questionnaireJob.update({
      where: { id: jobId, workspaceId: ctx.workspaceId },

      data: upData,
    });

    if (body.selectedSheet) {
      await recordAuditEventSafe({
        workspaceId: ctx.workspaceId,
        actorUserId: ctx.userId,
        eventType: AUDIT_EVENT_TYPES.QUESTIONNAIRE_JOB_RESCAN,
        objectType: AUDIT_OBJECT_TYPES.QUESTIONNAIRE_JOB,
        objectId: jobId,
        metadata: {
          selectedSheet: body.selectedSheet,
          originalRecommendation: (job.previewJson as QuestionnaireImportPreview | null)?.scoredSheets?.[0]?.name,
        },
      });
    }

    return NextResponse.json({ 
      preview: {
        ...parsed.preview,
        detectedHeaderRowIndex: upData.detectedHeaderRowIndex ?? job.detectedHeaderRowIndex,
        detectedQuestionColIndex: upData.detectedQuestionColIndex ?? job.detectedQuestionColIndex,
        detectedAnswerColIndex: upData.detectedAnswerColIndex ?? job.detectedAnswerColIndex,
      } 
    });
  } catch (err) {
    return handleApiError(err);
  }
}
