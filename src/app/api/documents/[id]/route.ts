import { NextResponse } from "next/server";
import { getSourceDocumentDetails } from "@/modules/workspaces/source-documents/get-document-details";
import { buildAuthContext } from "@/lib/auth/build-context";
import { authorizePermission } from "@/lib/auth/authorize-role";
import { Permission } from "@/lib/auth/permissions";
import { handleApiError } from "@/lib/api/error-handler";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await buildAuthContext(request);
    authorizePermission(ctx, Permission.VIEW_EVIDENCE);
    const { id } = await params;
    const document = await getSourceDocumentDetails({
      request,
      documentId: id,
    });

    return NextResponse.json({ document });
  } catch (err) {
    return handleApiError(err);
  }
}
