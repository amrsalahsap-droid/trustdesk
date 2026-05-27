import { NextResponse } from "next/server";
import { withWorkspaceContext } from "@/lib/api/with-workspace-context";
import { handleApiError } from "@/lib/api/error-handler";
import { testUploadSourceDocument } from "@/modules/documents/test-upload-source-document";

export const POST = withWorkspaceContext(async (request, ctx) => {
  try {
    if (process.env.STORAGE_TEST_UPLOAD_ENABLED !== "true") {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Not found" } },
        { status: 404 },
      );
    }

    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Expected multipart/form-data with a file field",
          },
        },
        { status: 400 },
      );
    }

    const form = await request.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Missing file field" } },
        { status: 400 },
      );
    }

    const buffer = new Uint8Array(await file.arrayBuffer());
    const mimeType = file.type && file.type.length > 0 ? file.type : "application/octet-stream";

    const result = await testUploadSourceDocument(ctx, {
      buffer,
      originalName: file.name,
      mimeType,
      byteLength: file.size,
    });

    return NextResponse.json(
      {
        id: result.id,
        storageKey: result.storageKey,
        uploadStatus: "UPLOADED",
      },
      { status: 201 },
    );
  } catch (error) {
    return handleApiError(error);
  }
});
