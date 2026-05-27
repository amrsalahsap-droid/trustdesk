import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logging/logger";
import { auth } from "@/lib/auth/auth-utils";
import { AUDIT_EVENT_TYPES, AUDIT_OBJECT_TYPES, recordAuditEventSafe } from "@/lib/audit";

/**
 * POST /api/onboarding/evidence/exception
 * Persists, updates, or deletes evidence exceptions in a workspace's onboarding metadata.
 */
export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { workspaceId, evidenceType, status, reason, note, remove } = body;

    if (!workspaceId || !evidenceType) {
      return NextResponse.json({ error: "workspaceId and evidenceType are required" }, { status: 400 });
    }

    logger.info("onboarding:evidence:exception:action", {
      workspaceId,
      evidenceType,
      remove,
      userId: session.user.id,
    });

    // 1. Verify workspace membership and permissions
    const membership = await prisma.workspaceMembership.findFirst({
      where: {
        workspaceId,
        userId: session.user.id,
        status: "ACTIVE",
      },
    });

    if (!membership) {
      return NextResponse.json({ error: "Unauthorized access to workspace" }, { status: 403 });
    }

    // 2. Fetch the current workspace metadata
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { onboardingIntelMetaJson: true },
    });

    const currentMetadata = (workspace?.onboardingIntelMetaJson as any) || {};
    const currentExceptions = currentMetadata.evidenceExceptions || {};

    let updatedExceptions = { ...currentExceptions };

    if (remove) {
      delete updatedExceptions[evidenceType];
    } else {
      if (!status || !reason) {
        return NextResponse.json({ error: "status and reason are required when creating/updating an exception" }, { status: 400 });
      }
      updatedExceptions[evidenceType] = {
        status,
        reason,
        note: note || "",
        updatedAt: new Date().toISOString(),
        updatedBy: session.user.id,
      };
    }

    const updatedMetadata = {
      ...currentMetadata,
      evidenceExceptions: updatedExceptions,
    };

    // 3. Update the database record
    await prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        onboardingIntelMetaJson: updatedMetadata,
      },
    });

    // 4. Log the audit trail event
    await recordAuditEventSafe({
      workspaceId,
      userId: session.user.id,
      eventType: AUDIT_EVENT_TYPES.WORKSPACE_PROFILE_UPDATED,
      objectType: AUDIT_OBJECT_TYPES.WORKSPACE,
      objectId: workspaceId,
      metadata: {
        action: remove ? "remove_evidence_exception" : "create_evidence_exception",
        evidenceType,
        status,
        reason,
      },
    });

    return NextResponse.json({
      success: true,
      exceptions: updatedExceptions,
      message: remove
        ? `Successfully removed exception for ${evidenceType}`
        : `Successfully saved exception for ${evidenceType}`,
    });

  } catch (error) {
    logger.error("onboarding:evidence:exception:error", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({
      error: "Failed to persist exception workflow",
      detail: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}

/**
 * GET /api/onboarding/evidence/exception
 * Retrieves evidence exceptions in a workspace's onboarding metadata.
 */
export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get("workspaceId");

    if (!workspaceId) {
      return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
    }

    // 1. Verify workspace membership and permissions
    const membership = await prisma.workspaceMembership.findFirst({
      where: {
        workspaceId,
        userId: session.user.id,
        status: "ACTIVE",
      },
    });

    if (!membership) {
      return NextResponse.json({ error: "Unauthorized access to workspace" }, { status: 403 });
    }

    // 2. Fetch the current workspace metadata
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { onboardingIntelMetaJson: true },
    });

    const currentMetadata = (workspace?.onboardingIntelMetaJson as any) || {};
    const currentExceptions = currentMetadata.evidenceExceptions || {};

    return NextResponse.json({
      success: true,
      exceptions: currentExceptions,
    });

  } catch (error) {
    logger.error("onboarding:evidence:exception:get:error", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({
      error: "Failed to retrieve exception workflow",
      detail: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}

