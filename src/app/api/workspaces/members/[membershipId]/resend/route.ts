import { NextResponse } from "next/server";
import { buildAuthContext } from "@/lib/auth/build-context";
import { handleApiError } from "@/lib/api/error-handler";
import { authorizePermission } from "@/lib/auth/authorize-role";
import { Permission } from "@/lib/auth/permissions";
import { resendInvitation } from "@/modules/workspaces/workspace-user-service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ membershipId: string }> }
) {
  try {
    const ctx = await buildAuthContext(request);
    authorizePermission(ctx, Permission.MANAGE_MEMBERS);

    const { membershipId } = await params;

    const membership = await resendInvitation({
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.userId,
      membershipId,
    });

    return NextResponse.json({ membership });
  } catch (error) {
    return handleApiError(error);
  }
}
