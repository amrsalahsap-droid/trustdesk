import { NextResponse } from "next/server";
import { z } from "zod";
import { WorkspaceRole } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { resolveUserIdentity } from "@/lib/auth/resolve-identity";
import { Permission, hasPermission } from "@/lib/auth/permissions";
import { inviteUserToWorkspace } from "@/modules/workspaces/workspace-user-service";
import { handleApiError } from "@/lib/api/error-handler";
import { logger } from "@/lib/logging/logger";
import { AUDIT_EVENT_TYPES, AUDIT_OBJECT_TYPES, recordAuditEventSafe } from "@/lib/audit";
import { serverEnv } from "@/lib/env/server";

const BodySchema = z.object({
  workspaceId: z.string(),
  email: z.string().email(),
  role: z.nativeEnum(WorkspaceRole),
  personalMessage: z.string().max(2000).optional(),
  recommendationId: z.string().optional(),
});

/**
 * Onboarding-safe reviewer invite: validates workspace membership without requiring
 * workspace-scoped route guards that depend on x-workspace-id headers.
 */
export async function POST(request: Request) {
  try {
    const { userId } = await resolveUserIdentity();
    const parsed = BodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Invalid request", issues: parsed.error.flatten() } },
        { status: 400 },
      );
    }

    const { workspaceId, email, role, personalMessage, recommendationId } = parsed.data;

    const membership = await prisma.workspaceMembership.findFirst({
      where: { workspaceId, userId, status: "ACTIVE" },
    });

    if (!membership) {
      return NextResponse.json({ error: { code: "FORBIDDEN", message: "Not a member of this workspace" } }, { status: 403 });
    }

    if (!hasPermission(membership.role, Permission.MANAGE_MEMBERS)) {
      return NextResponse.json(
        { error: { code: "FORBIDDEN", message: "Insufficient permissions to invite members" } },
        { status: 403 },
      );
    }

    let invitationResult: Awaited<ReturnType<typeof inviteUserToWorkspace>>;
    try {
      invitationResult = await inviteUserToWorkspace({
        workspaceId,
        invitedByUserId: userId,
        email,
        role,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === "ALREADY_MEMBER") {
        return NextResponse.json(
          { error: { code: "ALREADY_MEMBER", message: "This email is already an active member of the workspace." } },
          { status: 409 },
        );
      }
      throw err;
    }

    const { invitation, rawToken, mailSent, mailError } = invitationResult;

    if (personalMessage?.trim()) {
      await recordAuditEventSafe({
        workspaceId,
        actorUserId: userId,
        eventType: AUDIT_EVENT_TYPES.USER_INVITED,
        objectType: AUDIT_OBJECT_TYPES.WORKSPACE_MEMBERSHIP,
        objectId: invitation.id,
        metadata: {
          note: "onboarding_personal_message",
          messagePreview: personalMessage.trim().slice(0, 500),
        },
      });
    }

    const ws = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { onboardingIntelMetaJson: true },
    });
    const meta = (ws?.onboardingIntelMetaJson as Record<string, unknown>) || {};
    const prevSatisfied = Array.isArray(meta.satisfiedRecommendationIds)
      ? ([...(meta.satisfiedRecommendationIds as string[])] as string[])
      : [];
    const satisfied = new Set(prevSatisfied);
    if (recommendationId) satisfied.add(recommendationId);

    await prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        onboardingIntelMetaJson: {
          ...meta,
          satisfiedRecommendationIds: Array.from(satisfied),
          reviewerInvite: {
            lastInvitationId: invitation.id,
            email: invitation.email,
            role,
            at: new Date().toISOString(),
            mailSent,
            mailError: mailError ?? null,
          },
          governanceReadiness: {
            ...(typeof meta.governanceReadiness === "object" && meta.governanceReadiness !== null
              ? (meta.governanceReadiness as object)
              : {}),
            reviewerInvited: true,
            approvalWorkflowPrepared: true,
            preparedAt: new Date().toISOString(),
          },
        },
      },
    });

    const inviteUrl = `${serverEnv.APP_URL}/auth/invite/${rawToken}`;

    logger.info("onboarding:reviewer-invite:complete", {
      workspaceId,
      invitationId: invitation.id,
      recommendationId,
    });

    return NextResponse.json(
      {
        success: true,
        invitation,
        mailSent,
        mailError,
        inviteUrl,
      },
      { status: 201 },
    );
  } catch (error) {
    return handleApiError(error);
  }
}
