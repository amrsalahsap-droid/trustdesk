import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { DocumentTemplateService } from "@/modules/workspaces/onboarding/document-template-service";
import { resolveUserIdentity } from "@/lib/auth/resolve-identity";
import { handleApiError } from "@/lib/api/error-handler";

import { TailoringEngine } from "@/modules/workspaces/onboarding/tailoring-engine";
import { parseDocumentBriefsJson } from "@/modules/workspaces/onboarding/document-briefs-persist";

/**
 * GET /api/onboarding/template?workspaceId=...&docId=...
 * Generates an AI-tailored starter template for a document using deep intelligence.
 */
export async function GET(request: Request) {
  try {
    const { userId } = await resolveUserIdentity();
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get("workspaceId");
    const docId = searchParams.get("docId");

    if (!workspaceId || !docId) {
      return NextResponse.json({ error: "Missing workspaceId or docId" }, { status: 400 });
    }

    // 1. Verify membership
    const membership = await prisma.workspaceMembership.findFirst({
      where: {
        workspaceId,
        userId,
        status: "ACTIVE",
      },
    });

    if (!membership) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // 2. Fetch Workspace for profile context and intelligence
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

    // 3. Merge intelligence (confirmed scalars + persisted deepProfileJson from analyze confirm).
    // TailoringEngine delegates to CompanyProfileService; deepProfileJson is populated on POST /api/onboarding/profile.
    const tailoredProfile = TailoringEngine.merge(workspace, workspace.deepProfileJson as any);
    
    // 4. Extract Brief for this specific document (supports wrapped persistence shape)
    const briefs = parseDocumentBriefsJson(workspace.documentBriefsJson);
    const brief = briefs[docId];

    // 5. Generate Template (with honest quality tier for UI)
    const { template, templateQuality, signalsUsed } = await DocumentTemplateService.generateTemplateWithQuality(
      tailoredProfile,
      brief,
      docId,
      { workspaceId },
    );

    return NextResponse.json({
      template,
      tailoringMode: tailoredProfile.mode,
      tailoringConfidence: tailoredProfile.confidence,
      templateQuality,
      signalsUsed,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
