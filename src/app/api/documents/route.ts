import { NextResponse } from "next/server";
import { uploadSourceDocument } from "@/modules/workspaces/source-documents/upload-document";
import { listSourceDocuments } from "@/modules/workspaces/source-documents/list-documents";
import { Permission, guardRouteWithPermission } from "@/lib/auth/guard";
import { handleApiError } from "@/lib/api/error-handler";

export async function POST(request: Request) {
  try {
    // Guard: Require authentication + UPLOAD_EVIDENCE permission
    const guardResult = await guardRouteWithPermission(request, Permission.UPLOAD_EVIDENCE);
    if (!guardResult.success) {
      return guardResult.response;
    }
    const ctx = guardResult.context;

    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: { code: "INVALID_FILE", message: "A file part is required" } },
        { status: 400 },
      );
    }

    let linkedTopicKeys: string[] | undefined;
    const rawTopics = formData.get("linkedTopicKeys");
    if (typeof rawTopics === "string" && rawTopics.length > 0) {
      try {
        const parsed = JSON.parse(rawTopics);
        if (Array.isArray(parsed)) linkedTopicKeys = parsed.filter((x) => typeof x === "string");
      } catch {
        linkedTopicKeys = undefined;
      }
    }

    const doc = await uploadSourceDocument({
      request,
      file,
      onboardingAudit: {
        onboardingSessionId: formData.get("onboardingSessionId")?.toString(),
        recommendationId: formData.get("recommendationId")?.toString(),
        expectedDocumentType: formData.get("expectedDocumentType")?.toString(),
        linkedTopicKeys,
        evidenceCategory: formData.get("evidenceCategory")?.toString(),
      },
    });

    return NextResponse.json(
      {
        document: {
          id: doc.id,
          originalName: doc.originalName,
          status: doc.uploadStatus,
          createdAt: doc.createdAt,
          isReused: (doc as any).isReused,
        },
      },
      { status: 201 },
    );
  } catch (err) {
    return handleApiError(err);
  }
}
export async function GET(request: Request) {
  try {
    // Guard: Require authentication + VIEW_EVIDENCE permission
    const guardResult = await guardRouteWithPermission(request, Permission.VIEW_EVIDENCE);
    if (!guardResult.success) {
      return guardResult.response;
    }
    const ctx = guardResult.context;

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1", 10);
    const pageSize = parseInt(searchParams.get("pageSize") || "25", 10);
    const searchQuery = searchParams.get("search") || undefined;
    const statusFilter = searchParams.get("status") || "all";

    const result = await listSourceDocuments({
      request,
      page,
      pageSize,
      searchQuery,
      statusFilter,
    });

    return NextResponse.json(result);
  } catch (err) {
    return handleApiError(err);
  }
}
