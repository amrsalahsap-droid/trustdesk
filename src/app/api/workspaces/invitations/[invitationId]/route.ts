import { NextResponse } from "next/server";
import { buildAuthContext } from "@/lib/auth/build-context";
import { handleApiError } from "@/lib/api/error-handler";
import { authorizePermission } from "@/lib/auth/authorize-role";
import { Permission } from "@/lib/auth/permissions";
import { revokeInvitation } from "@/modules/workspaces/workspace-user-service";
import { logger } from "@/lib/logging/logger";

export async function DELETE(
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

    logger.info("invitation:delete:requested", {
      invitationId,
      workspaceId,
      actorUserId,
    });

    const invitation = await revokeInvitation({
      invitationId,
      workspaceId,
      actorUserId,
    });

    logger.info("invitation:delete:succeeded", {
      invitationId,
      workspaceId,
      actorUserId,
    });

    return NextResponse.json({ invitation });
  } catch (error) {
    logger.error("invitation:delete:failed", {
      invitationId,
      workspaceId,
      actorUserId,
      error: error instanceof Error ? error.message : String(error),
    });
    return handleApiError(error);
  }
}
