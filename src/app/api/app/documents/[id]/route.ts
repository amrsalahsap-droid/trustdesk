import { NextResponse } from "next/server";
import { withWorkspaceContextParams } from "@/lib/api/with-workspace-context";
import { handleApiError } from "@/lib/api/error-handler";
import { getSourceDocumentById } from "@/modules/documents";

export const GET = withWorkspaceContextParams(async (_request, ctx, params) => {
  try {
    const doc = await getSourceDocumentById(ctx, params.id);
    return NextResponse.json({
      id: doc.id,
      fileName: doc.fileName,
      originalName: doc.originalName,
      mimeType: doc.mimeType,
      fileSizeBytes: doc.fileSizeBytes,
      storageKey: doc.storageKey,
      uploadStatus: doc.uploadStatus,
      createdAt: doc.createdAt.toISOString(),
      updatedAt: doc.updatedAt.toISOString(),
    });
  } catch (error) {
    return handleApiError(error);
  }
});
