import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { Permission, guardRouteWithPermission } from "@/lib/auth/guard";
import { handleApiError } from "@/lib/api/error-handler";
import { validateQuestionnaireUpload } from "@/lib/questionnaires/validate-questionnaire-upload";
import { buildSpreadsheetPreview } from "@/modules/questionnaires/spreadsheet-preview";

export async function POST(request: Request) {
  try {
    // Guard: Require authentication + IMPORT_QUESTIONNAIRES permission
    const guardResult = await guardRouteWithPermission(request, Permission.IMPORT_QUESTIONNAIRES);
    if (!guardResult.success) {
      return guardResult.response;
    }
    const ctx = guardResult.context;
    const { userId, workspaceId } = ctx;

    // 2. Extract and validate file
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

    // 3. Built-in scan/preview to verify spreadsheet structure
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

    // 4. Create QuestionnaireJob record linked to workspace and user
    // Story D6-EN-01: Store fileBytes and link to the correct workspace and user.
    const job = await prisma.questionnaireJob.create({
      data: {
        workspaceId,
        uploadedById: userId,
        status: "sheet_detected",
        originalName: file.name,
        mimeType: file.type || "application/octet-stream",
        detectedSheetName: parsed.preview.selectedSheet,
        selectedSheetName: parsed.preview.selectedSheet,
        fileBytes: buf,
        previewJson: parsed.preview as object,
        errorMessage: null,
      },
    });

    // 5. Normalized success response
    return NextResponse.json(
      {
        jobId: job.id,
        preview: parsed.preview,
      },
      { status: 201 },
    );
  } catch (err) {
    // 6. Normalized failure response (handleApiError handles domain errors)
    return handleApiError(err);
  }
}
