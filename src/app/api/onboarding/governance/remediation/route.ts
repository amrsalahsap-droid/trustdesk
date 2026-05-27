import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logging/logger";
import { auth } from "@/lib/auth/auth-utils";
import { AUDIT_EVENT_TYPES, AUDIT_OBJECT_TYPES, recordAuditEventSafe } from "@/lib/audit";
import {
  applyGovernanceRemediationUpdate,
  getGovernanceRemediationStore,
} from "@/modules/workspaces/onboarding/governance-remediation-utils";
import type { GovernanceRemediationAction } from "@/modules/workspaces/onboarding/governance-remediation-types";

const VALID_ACTIONS: GovernanceRemediationAction[] = [
  "not_applicable",
  "confirm",
  "assign_owner",
  "set_due_date",
  "add_note",
  "evidence_uploaded",
];

async function assertWorkspaceAccess(workspaceId: string, userId: string) {
  const membership = await prisma.workspaceMembership.findFirst({
    where: { workspaceId, userId, status: "ACTIVE" },
  });
  return membership != null;
}

/**
 * POST /api/onboarding/governance/remediation
 * Persists governance task remediation progress in workspace onboarding metadata.
 */
export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      workspaceId,
      taskId,
      action,
      owner,
      dueDate,
      note,
      evidenceDocumentId,
      evidenceType,
      relatedTopicKeys,
      sourceRationale,
      taskSnapshot,
    } = body;

    if (!workspaceId || !taskId || !action) {
      return NextResponse.json(
        { error: "workspaceId, taskId, and action are required" },
        { status: 400 },
      );
    }

    if (!VALID_ACTIONS.includes(action)) {
      return NextResponse.json({ error: "Invalid remediation action" }, { status: 400 });
    }

    if (action === "assign_owner" && !owner?.trim()) {
      return NextResponse.json({ error: "owner is required for assign_owner" }, { status: 400 });
    }

    if (action === "set_due_date" && !dueDate?.trim()) {
      return NextResponse.json({ error: "dueDate is required for set_due_date" }, { status: 400 });
    }

    if (action === "add_note" && !note?.trim()) {
      return NextResponse.json({ error: "note is required for add_note" }, { status: 400 });
    }

    const hasAccess = await assertWorkspaceAccess(workspaceId, session.user.id);
    if (!hasAccess) {
      return NextResponse.json({ error: "Unauthorized access to workspace" }, { status: 403 });
    }

    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { onboardingIntelMetaJson: true },
    });

    const currentMetadata = (workspace?.onboardingIntelMetaJson as Record<string, unknown>) || {};
    const remediationStore = getGovernanceRemediationStore(currentMetadata);
    const existing = remediationStore.tasks[taskId];

    const updatedRecord = applyGovernanceRemediationUpdate(existing, {
      taskId,
      action,
      userId: session.user.id,
      owner: owner?.trim(),
      dueDate: dueDate?.trim(),
      note: note?.trim(),
      evidenceDocumentId,
      evidenceType,
      relatedTopicKeys: Array.isArray(relatedTopicKeys) ? relatedTopicKeys : undefined,
      sourceRationale: sourceRationale || taskSnapshot?.title,
    });

    const updatedMetadata = {
      ...currentMetadata,
      governanceRemediations: {
        tasks: {
          ...remediationStore.tasks,
          [taskId]: updatedRecord,
        },
      },
    };

    await prisma.workspace.update({
      where: { id: workspaceId },
      data: { onboardingIntelMetaJson: updatedMetadata },
    });

    await recordAuditEventSafe({
      workspaceId,
      actorUserId: session.user.id,
      eventType: AUDIT_EVENT_TYPES.WORKSPACE_PROFILE_UPDATED,
      objectType: AUDIT_OBJECT_TYPES.WORKSPACE,
      objectId: workspaceId,
      metadata: {
        action: "governance_remediation_update",
        remediationAction: action,
        taskId,
        status: updatedRecord.status,
        taskSnapshot,
      },
    });

    logger.info("onboarding:governance:remediation:updated", {
      workspaceId,
      taskId,
      action,
      status: updatedRecord.status,
    });

    return NextResponse.json({
      success: true,
      remediation: updatedRecord,
      remediations: (updatedMetadata.governanceRemediations as { tasks: Record<string, unknown> })
        .tasks,
    });
  } catch (error) {
    logger.error("onboarding:governance:remediation:error", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      {
        error: "Failed to persist governance remediation",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

/**
 * GET /api/onboarding/governance/remediation?workspaceId=...
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

    const hasAccess = await assertWorkspaceAccess(workspaceId, session.user.id);
    if (!hasAccess) {
      return NextResponse.json({ error: "Unauthorized access to workspace" }, { status: 403 });
    }

    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { onboardingIntelMetaJson: true },
    });

    const remediationStore = getGovernanceRemediationStore(
      workspace?.onboardingIntelMetaJson as Record<string, unknown>,
    );

    return NextResponse.json({
      success: true,
      remediations: remediationStore.tasks,
    });
  } catch (error) {
    logger.error("onboarding:governance:remediation:get:error", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      {
        error: "Failed to retrieve governance remediations",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
