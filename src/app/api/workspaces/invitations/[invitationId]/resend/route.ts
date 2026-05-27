import { NextResponse } from "next/server";
import { buildAuthContext } from "@/lib/auth/build-context";
import { handleApiError } from "@/lib/api/error-handler";
import { authorizePermission } from "@/lib/auth/authorize-role";
import { Permission } from "@/lib/auth/permissions";
import { resendInvitation } from "@/modules/workspaces/workspace-user-service";
import { logger } from "@/lib/logging/logger";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ invitationId: string }> }
) {
  const { invitationId } = await params;
  let workspaceId = "unknown";
  let actorUserId = "unknown";

  try {
    const ctx = await buildAuthContext(request);
    workspaceId = ctx.workspaceId;
    actorUserId = ctx.userId;

    authorizePermission(ctx, Permission.MANAGE_MEMBERS);

    logger.info("invitation:resend:requested", {
      invitationId,
      workspaceId,
      actorUserId,
    });

    const { invitation, rawToken } = await resendInvitation({
      workspaceId,
      actorUserId,
      invitationId,
    });

    logger.info("invitation:resend:succeeded", {
      invitationId,
      workspaceId,
      actorUserId,
    });

    return NextResponse.json({ invitation, rawToken });
  } catch (error) {
    logger.error("invitation:resend:failed", {
      invitationId,
      workspaceId,
      actorUserId,
      error: error instanceof Error ? error.message : String(error),
    });
    return handleApiError(error);
  }
}
