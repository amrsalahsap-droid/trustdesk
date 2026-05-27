import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { buildAuthContext } from "@/lib/auth/build-context";
import { handleApiError } from "@/lib/api/error-handler";
import { validateQuestionnaireUpload } from "@/lib/questionnaires/validate-questionnaire-upload";
import { buildSpreadsheetPreview } from "@/modules/questionnaires/spreadsheet-preview";

export async function POST(request: Request) {
  try {
    const ctx = await buildAuthContext(request);
    const workspaceId = ctx.workspaceId;

    const formData = await request.formData();
    const file = formData.get("file");
    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: { code: "INVALID_FILE", message: "A spreadsheet file is required" } },
        { status: 400 },
      );
    }

    const buf = Buffer.from(await file.arrayBuffer());
    validateQuestionnaireUpload({
      originalName: file.name,
      mimeType: file.type || "",
      byteLength: buf.length,
    });

    const parsed = buildSpreadsheetPreview(buf, file.type || "");
    if ("error" in parsed) {
      return NextResponse.json(
        {
          error: { code: "PARSE_FAILED", message: parsed.error },
          issues: parsed.issues ?? [],
        },
        { status: 422 },
      );
    }

    const job = await prisma.questionnaireJob.create({
      data: {
        workspaceId,
        status: "sheet_detected",
        originalName: file.name,
        mimeType: file.type || "application/octet-stream",
        detectedSheetName: parsed.preview.selectedSheet,
        selectedSheetName: parsed.preview.selectedSheet,
        fileBytes: buf,
        previewJson: parsed.preview as object,
        suggestNewAnswer: parsed.preview.suggestNewAnswerColumn,
        errorMessage: null,
      },
    });

    return NextResponse.json(
      {
        jobId: job.id,
        preview: parsed.preview,
      },
      { status: 201 },
    );
  } catch (err) {
    return handleApiError(err);
  }
}
