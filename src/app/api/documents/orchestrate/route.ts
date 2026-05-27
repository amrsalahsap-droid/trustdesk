import { NextResponse } from "next/server";
import { z } from "zod";
import { EvidenceOrchestrationService } from "@/modules/workspaces/onboarding/evidence-orchestration-service";
import { resolveUserIdentity } from "@/lib/auth/resolve-identity";
import { handleApiError } from "@/lib/api/error-handler";
import { prisma } from "@/lib/db/prisma";

const PostSchema = z.object({
  documentId: z.string(),
  orchestrationSessionId: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const { userId } = await resolveUserIdentity();
    const body = await request.json();
    const parsed = PostSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }

    const { documentId, orchestrationSessionId } = parsed.data;

    // Verify document exists and user has access
    const document = await prisma.sourceDocument.findFirst({
      where: {
        id: documentId,
        workspace: {
          members: {
            some: {
              userId,
              status: "ACTIVE",
            },
          },
        },
      },
      include: {
        content: {
          select: {
            fullText: true,
            metadataJson: true,
          },
        },
        workspace: {
          select: {
            id: true,
          },
        },
      },
    });

    if (!document) {
      return NextResponse.json({ error: "Document not found or access denied" }, { status: 404 });
    }

    // Check if orchestration already exists
    const existingOrchestration = await EvidenceOrchestrationService.getOrchestrationResult(
      documentId,
      document.workspace.id,
    );
    if (existingOrchestration && !orchestrationSessionId) {
      return NextResponse.json({
        success: true,
        message: "Orchestration already exists",
        orchestration: existingOrchestration,
      });
    }

    // Run orchestration
    const result = await EvidenceOrchestrationService.orchestrateEvidence(
      documentId,
      document.workspace.id,
      userId,
      {
        filename: document.originalName,
        extractedText: document.content?.fullText || undefined,
        uploadContext: "manual_orchestration",
        orchestrationSessionId: orchestrationSessionId || `manual-${Date.now()}`,
      }
    );

    return NextResponse.json({
      success: true,
      orchestration: result,
    });

  } catch (error) {
    return handleApiError(error);
  }
}

export async function GET(request: Request) {
  try {
    const { userId } = await resolveUserIdentity();
    const { searchParams } = new URL(request.url);
    const documentId = searchParams.get("documentId");

    if (!documentId) {
      return NextResponse.json({ error: "Missing documentId parameter" }, { status: 400 });
    }

    // Verify document exists and user has access
    const document = await prisma.sourceDocument.findFirst({
      where: {
        id: documentId,
        workspace: {
          members: {
            some: {
              userId,
              status: "ACTIVE",
            },
          },
        },
      },
    });

    if (!document) {
      return NextResponse.json({ error: "Document not found or access denied" }, { status: 404 });
    }

    // Get orchestration result
    const result = await EvidenceOrchestrationService.getOrchestrationResult(
      documentId,
      document.workspaceId,
    );

    if (!result) {
      return NextResponse.json({ 
        success: false,
        message: "No orchestration found for this document",
      });
    }

    return NextResponse.json({
      success: true,
      orchestration: result,
    });

  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const { userId } = await resolveUserIdentity();
    const { searchParams } = new URL(request.url);
    const documentId = searchParams.get("documentId");

    if (!documentId) {
      return NextResponse.json({ error: "Missing documentId parameter" }, { status: 400 });
    }

    // Verify document exists and user has access
    const document = await prisma.sourceDocument.findFirst({
      where: {
        id: documentId,
        workspace: {
          members: {
            some: {
              userId,
              status: "ACTIVE",
            },
          },
        },
      },
      include: {
        workspace: {
          select: {
            id: true,
          },
        },
      },
    });

    if (!document) {
      return NextResponse.json({ error: "Document not found or access denied" }, { status: 404 });
    }

    // Remove orchestration
    const result = await EvidenceOrchestrationService.removeOrchestration(
      documentId,
      document.workspace.id,
      userId
    );

    return NextResponse.json({
      success: true,
      deleted: result.deleted,
      errors: result.errors,
    });

  } catch (error) {
    return handleApiError(error);
  }
}
