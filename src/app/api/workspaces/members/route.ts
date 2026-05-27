import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { Permission, guardRouteWithPermission, hasPermission } from "@/lib/auth/guard";
import { handleApiError } from "@/lib/api/error-handler";
import { inviteUserToWorkspace, listWorkspaceMembers, listPendingInvitations } from "@/modules/workspaces/workspace-user-service";
import { WorkspaceRole } from "@prisma/client";
import { z } from "zod";

const InviteSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  role: z.nativeEnum(WorkspaceRole),
});

/**
 * GET: List workspace members and pending invitations.
 */
export async function GET(request: Request) {
  try {
    // Guard: Require authentication + VIEW_ANSWERS permission
    const guardResult = await guardRouteWithPermission(request, Permission.VIEW_ANSWERS);
    if (!guardResult.success) {
      return guardResult.response;
    }
    const ctx = guardResult.context;

    const [members, invitations] = await Promise.all([
      listWorkspaceMembers(ctx.workspaceId),
      listPendingInvitations(ctx.workspaceId),
    ]);

    const formattedMembers = members.map((m) => ({
      id: m.id,
      userId: m.userId,
      name: m.user.name ?? m.user.email,
      email: m.user.email,
      role: m.role,
      status: m.status,
      createdAt: m.createdAt,
      invitedBy: m.invitedBy?.name ?? m.invitedBy?.email,
      joinedAt: m.joinedAt,
    }));

    const formattedInvitations = invitations.map((i) => ({
      id: i.id,
      name: i.email.split("@")[0], // Fallback name
      email: i.email,
      role: i.role,
      status: "INVITED",
      mailSent: i.mailSent,
      mailError: i.mailError,
      createdAt: i.createdAt,
      invitedBy: i.invitedBy?.name ?? i.invitedBy?.email,
      inviteToken: hasPermission(ctx.role, Permission.MANAGE_MEMBERS) ? "PENDING_TOKEN_HASHED" : undefined, // Token itself isn't in DB, only hash. Link comes from resend or initial send.
      isInvitation: true,
    }));

    return NextResponse.json({ 
      members: [...formattedMembers, ...formattedInvitations] 
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST: Invite a new user to the workspace.
 */
export async function POST(request: Request) {
  try {
    // Guard: Require authentication + MANAGE_MEMBERS permission
    const guardResult = await guardRouteWithPermission(request, Permission.MANAGE_MEMBERS);
    if (!guardResult.success) {
      return guardResult.response;
    }
    const ctx = guardResult.context;

    const body = await request.json();
    const { email, name, role } = InviteSchema.parse(body);

    const { invitation, rawToken, mailSent, mailError } = await inviteUserToWorkspace({
      workspaceId: ctx.workspaceId,
      invitedByUserId: ctx.userId,
      email,
      role,
    });
    
    const inviteUrl = `${process.env.APP_URL}/auth/invite/${rawToken}`;

    return NextResponse.json({ invitation, rawToken, inviteUrl, mailSent, mailError }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
