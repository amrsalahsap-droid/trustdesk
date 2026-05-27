import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { resolveUserIdentity } from "@/lib/auth/resolve-identity";
import { DocumentTemplateService } from "@/modules/workspaces/onboarding/document-template-service";
import { TailoringEngine } from "@/modules/workspaces/onboarding/tailoring-engine";
import { parseDocumentBriefsJson } from "@/modules/workspaces/onboarding/document-briefs-persist";

/**
 * GET /api/onboarding/documents/download?workspaceId=...&documentId=...
 * Generates and downloads a tailored DOCX starter template.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get("workspaceId");
    const documentId = searchParams.get("documentId");

    if (!workspaceId || !documentId) {
      return NextResponse.json({ error: "Missing required parameters" }, { status: 400 });
    }

    const { userId } = await resolveUserIdentity();

    // 1. Verify access
    const membership = await prisma.workspaceMembership.findFirst({
      where: {
        workspaceId,
        userId,
        status: "ACTIVE",
      },
    });

    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // 2. Load Intel
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: {
        name: true,
        industry: true,
        productType: true,
        customerSegment: true,
        dataTypes: true,
        complianceTargets: true,
        deepProfileJson: true,
        documentBriefsJson: true,
      }
    });

    if (!workspace) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    // 3. Reconstruct tailored profile (CompanyProfileService via TailoringEngine) + brief
    const tailoredProfile = TailoringEngine.merge(workspace as any, workspace.deepProfileJson as any);
    const briefs = parseDocumentBriefsJson(workspace.documentBriefsJson);
    const brief = briefs[documentId];

    // 4. Generate DOCX
    const buffer = await DocumentTemplateService.generateDocx(tailoredProfile, brief, documentId, {
      workspaceId,
    });

    // 5. Stream response
    return new Response(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${documentId}-template.docx"`,
      },
    });
  } catch (error) {
    console.error("onboarding:docx-download:failed", error);
    return NextResponse.json({ error: "Failed to generate template" }, { status: 500 });
  }
}
