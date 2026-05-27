import { NextResponse } from "next/server";
import { buildAuthContext } from "@/lib/auth/build-context";
import { handleApiError } from "@/lib/api/error-handler";
import { authorizePermission } from "@/lib/auth/authorize-role";
import { Permission } from "@/lib/auth/permissions";
import { updateWorkspaceMembership, removeUserFromWorkspace, getWorkspaceMember } from "@/modules/workspaces/workspace-user-service";
import { WorkspaceRole, WorkspaceMembershipStatus } from "@prisma/client";
import { z } from "zod";

const UpdateSchema = z.object({
  name: z.string().min(1).optional(),
  role: z.nativeEnum(WorkspaceRole).optional(),
  status: z.nativeEnum(WorkspaceMembershipStatus).optional(),
  ownedTopicIds: z.array(z.string()).optional(),
  approvedTopicIds: z.array(z.string()).optional(),
});

/**
 * GET: Fetch a single membership detail.
 */
export async function GET(
  request: Request,
  segment: { params: Promise<{ membershipId: string }> }
) {
  try {
    const ctx = await buildAuthContext(request);
    authorizePermission(ctx, Permission.MANAGE_MEMBERS);

    const { membershipId } = await segment.params;
    const member = await getWorkspaceMember(ctx.workspaceId, membershipId);

    if (!member) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    return NextResponse.json({ member });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * PATCH: Update a membership (role or status).
 */
export async function PATCH(
  request: Request,
  segment: { params: Promise<{ membershipId: string }> }
) {
  try {
    const ctx = await buildAuthContext(request);
    authorizePermission(ctx, Permission.MANAGE_MEMBERS);

    const { membershipId } = await segment.params;
    const body = await request.json();
    const data = UpdateSchema.parse(body);

    const membership = await updateWorkspaceMembership({
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.userId,
      membershipId,
      data,
    });

    return NextResponse.json({ membership });
  } catch (error) {
    if (error instanceof Error && error.message === "CANNOT_REMOVE_LAST_ADMIN") {
      return NextResponse.json(
        { error: { code: "LAST_ADMIN", message: "Cannot remove or demote the only active administrator." } },
        { status: 400 }
      );
    }
    return handleApiError(error);
  }
}

/**
 * DELETE: Remove a member from the workspace (soft delete).
 */
export async function DELETE(
  request: Request,
  segment: { params: Promise<{ membershipId: string }> }
) {
  try {
    const ctx = await buildAuthContext(request);
    authorizePermission(ctx, Permission.MANAGE_MEMBERS);

    const { membershipId } = await segment.params;

    const membership = await removeUserFromWorkspace({
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.userId,
      membershipId,
    });

    return NextResponse.json({ membership });
  } catch (error) {
    if (error instanceof Error && error.message === "CANNOT_REMOVE_LAST_ADMIN") {
      return NextResponse.json(
        { error: { code: "LAST_ADMIN", message: "Cannot remove the only active administrator." } },
        { status: 400 }
      );
    }
    return handleApiError(error);
  }
}
