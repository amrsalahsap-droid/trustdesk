import { prisma } from "@/lib/db/prisma";
import { WorkspaceRole, WorkspaceMembershipStatus, WorkspaceInvitationStatus } from "@prisma/client";
import { logger } from "@/lib/logging/logger";
import { AUDIT_EVENT_TYPES, AUDIT_OBJECT_TYPES, recordAuditEventSafe } from "@/lib/audit";
import { mailService } from "@/lib/mail/mail-service";
import { serverEnv } from "@/lib/env/server";
import { hashToken } from "@/lib/auth/token-hash";
import crypto from "crypto";
import bcrypt from "bcrypt";

/**
 * Invites a user to a workspace.
 * Creates a WorkspaceInvitation record.
 */
export async function inviteUserToWorkspace(params: {
  workspaceId: string;
  invitedByUserId: string;
  email: string;
  role: WorkspaceRole;
}) {
  const { workspaceId, invitedByUserId, email, role } = params;
  const normalizedEmail = email.trim().toLowerCase();

  // 1. Check for existing active membership
  const existingMember = await prisma.workspaceMembership.findFirst({
    where: {
      workspaceId,
      user: { email: normalizedEmail },
      status: "ACTIVE",
    },
  });
  if (existingMember) {
    throw new Error("ALREADY_MEMBER");
  }

  // 2. Revoke any existing pending invitations for this email in this workspace
  await prisma.workspaceInvitation.updateMany({
    where: {
      workspaceId,
      email: normalizedEmail,
      status: "PENDING",
    },
    data: {
      status: "REVOKED",
      revokedAt: new Date(),
    },
  });

  // 3. Create new invitation
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 24);

  const invitation = await prisma.workspaceInvitation.create({
    data: {
      workspaceId,
      email: normalizedEmail,
      role,
      tokenHash,
      invitedById: invitedByUserId,
      expiresAt,
      status: "PENDING",
    },
    include: {
      workspace: { select: { name: true } },
    },
  });

  logger.info("invite:persistence:success", {
    workspaceId,
    invitedByUserId,
    email: normalizedEmail,
    invitationId: invitation.id,
  });

  await recordAuditEventSafe({
    workspaceId,
    actorUserId: invitedByUserId,
    eventType: AUDIT_EVENT_TYPES.USER_INVITED,
    objectType: AUDIT_OBJECT_TYPES.WORKSPACE_MEMBERSHIP,
    objectId: invitation.id,
    metadata: { 
      email: normalizedEmail, 
      role, 
      action: "INVITATION_CREATED",
      status: "PENDING"
    },
  });

  // 4. Send Email
  const inviteUrl = `${serverEnv.APP_URL}/auth/invite/${rawToken}`;
  logger.info("invite:email:sending", { email: normalizedEmail, url: inviteUrl });
  
  let mailSent = false;
  let mailError: string | null = null;
  
  try {
    await mailService.sendInvitationEmail({
      to: normalizedEmail,
      workspaceName: invitation.workspace.name,
      inviteUrl,
    });
    mailSent = true;
    logger.info("invite:email:success", { email: normalizedEmail });
  } catch (err) {
    mailError = err instanceof Error ? err.message : String(err);
    logger.error("invite:email:failed", {
      workspaceId,
      email: normalizedEmail,
      error: mailError,
    });
  }

  // Update invitation with mail status
  await prisma.workspaceInvitation.update({
    where: { id: invitation.id },
    data: { mailSent, mailError },
  });

  return { invitation: { ...invitation, mailSent, mailError }, rawToken, mailSent, mailError };
}

/**
 * Resolves an invitation by raw token.
 */
export async function resolveInviteByToken(rawToken: string) {
  const tokenHash = hashToken(rawToken);
  
  const invitation = await prisma.workspaceInvitation.findUnique({
    where: { tokenHash },
    include: {
      workspace: { select: { id: true, name: true, slug: true } },
      invitedBy: { select: { name: true, email: true } },
    },
  });

  if (!invitation) return { error: "INVITE_NOT_FOUND" };
  if (invitation.status === "REVOKED") return { error: "INVITE_REVOKED" };
  if (invitation.status === "ACCEPTED") return { error: "ALREADY_ACCEPTED" };
  if (invitation.expiresAt < new Date()) {
    return { error: "INVITE_EXPIRED" };
  }

  // Check if user already exists
  const existingUser = await prisma.user.findUnique({
    where: { email: invitation.email },
    select: { id: true, name: true, passwordHash: true },
  });

  const needsRegistration = !existingUser || existingUser.passwordHash === "PLACEHOLDER";
  
  // Check for existing membership
  if (existingUser) {
    const existingMembership = await prisma.workspaceMembership.findUnique({
      where: {
        userId_workspaceId: {
          userId: existingUser.id,
          workspaceId: invitation.workspaceId,
        },
      },
    });
    
    if (existingMembership && existingMembership.status === "ACTIVE") {
      return { error: "ALREADY_MEMBER" };
    }
  }

  return {
    invitation,
    workspace: invitation.workspace,
    email: invitation.email,
    needsRegistration,
    existingUser,
  };
}

/**
 * Accepts an invitation.
 */
export async function acceptInvite(params: {
  token: string;
  password?: string;
  name?: string;
  authUserId?: string;
}) {
  const { token, password, name, authUserId } = params;

  const resolution = await resolveInviteByToken(token);
  if ("error" in resolution) throw new Error(resolution.error);

  const { invitation } = resolution;

  return prisma.$transaction(async (tx) => {
    // Re-verify invitation status inside transaction to prevent race conditions
    const invitation = await tx.workspaceInvitation.findUnique({
      where: { id: resolution.invitation.id },
    });

    if (!invitation || invitation.status !== "PENDING") {
      throw new Error("ALREADY_ACCEPTED");
    }

    if (invitation.expiresAt < new Date()) {
      throw new Error("INVITE_EXPIRED");
    }

    // 1. Find or create user
    let user = await tx.user.findUnique({
      where: { email: invitation.email },
    });

    // Security check: If logged in, must be the right user
    if (authUserId && user && user.id !== authUserId) {
      throw new Error("EMAIL_MISMATCH");
    }

    if (!user) {
      if (!password) throw new Error("REGISTRATION_REQUIRED");
      const passwordHash = await bcrypt.hash(password, 12);
      user = await tx.user.create({
        data: {
          email: invitation.email,
          name: name || invitation.email.split("@")[0],
          passwordHash,
        },
      });
    } else {
      // User exists. Must be authenticated as this user or have a valid password.
      if (authUserId) {
        if (user.id !== authUserId) throw new Error("EMAIL_MISMATCH");
      } else if (password) {
        // If password provided, verify it (unless it's a placeholder)
        if (user.passwordHash !== "PLACEHOLDER") {
          const isValid = await bcrypt.compare(password, user.passwordHash);
          if (!isValid) throw new Error("INVALID_PASSWORD");
        } else {
          // Complete registration for placeholder users
          const passwordHash = await bcrypt.hash(password, 12);
          await tx.user.update({
            where: { id: user.id },
            data: { passwordHash },
          });
        }
      } else {
        // No auth and no password
        throw new Error("AUTHENTICATION_REQUIRED");
      }

      // Update name if provided and user currently has no name
      if (name && !user.name) {
        await tx.user.update({
          where: { id: user.id },
          data: { name },
        });
      }
    }

    // 2. Create membership
    const membership = await tx.workspaceMembership.upsert({
      where: {
        userId_workspaceId: {
          userId: user.id,
          workspaceId: invitation.workspaceId,
        },
      },
      update: {
        role: invitation.role,
        status: "ACTIVE",
        joinedAt: new Date(),
        invitedById: invitation.invitedById,
      },
      create: {
        userId: user.id,
        workspaceId: invitation.workspaceId,
        role: invitation.role,
        status: "ACTIVE",
        joinedAt: new Date(),
        invitedById: invitation.invitedById,
      },
    });

    // 3. Mark invitation as accepted
    await tx.workspaceInvitation.update({
      where: { id: invitation.id },
      data: {
        status: "ACCEPTED",
        acceptedAt: new Date(),
      },
    });

    if (resolution.needsRegistration) {
      await recordAuditEventSafe({
        workspaceId: invitation.workspaceId,
        actorUserId: user.id,
        eventType: AUDIT_EVENT_TYPES.ACCOUNT_CREATED_FROM_INVITE,
        objectType: AUDIT_OBJECT_TYPES.USER,
        objectId: user.id,
        metadata: { email: invitation.email },
      });
    }

    await recordAuditEventSafe({
      workspaceId: invitation.workspaceId,
      actorUserId: user.id,
      eventType: AUDIT_EVENT_TYPES.INVITE_ACCEPTED,
      objectType: AUDIT_OBJECT_TYPES.WORKSPACE_MEMBERSHIP,
      objectId: membership.id,
      metadata: { 
        action: "INVITE_ACCEPTED", 
        email: invitation.email, 
        role: invitation.role,
        isNewAccount: resolution.needsRegistration
      },
    });

    return { membership, userId: user.id };
  });
}

/**
 * Revokes an invitation.
 */
export async function revokeInvitation(params: {
  workspaceId: string;
  invitationId: string;
  actorUserId: string;
}) {
  const { workspaceId, invitationId, actorUserId } = params;

  // Ensure it exists and is pending in this workspace
  const invitation = await prisma.workspaceInvitation.findUnique({
    where: { id: invitationId, workspaceId },
  });

  if (!invitation) {
    throw new Error("Invitation not found");
  }

  if (invitation.status !== "PENDING") {
    throw new Error("Only pending invitations can be revoked");
  }

  const updated = await prisma.workspaceInvitation.update({
    where: { id: invitationId },
    data: {
      status: "REVOKED",
      revokedAt: new Date(),
    },
  });

  await recordAuditEventSafe({
    workspaceId,
    actorUserId,
    eventType: AUDIT_EVENT_TYPES.INVITE_REVOKED,
    objectType: AUDIT_OBJECT_TYPES.WORKSPACE_MEMBERSHIP,
    objectId: updated.id,
    metadata: {
      action: "INVITATION_REVOKED",
      email: updated.email,
      previousStatus: invitation.status,
      newStatus: "REVOKED",
    },
  });

  return updated;
}

/**
 * Lists all members of a workspace.
 */
export async function listWorkspaceMembers(workspaceId: string) {
  return prisma.workspaceMembership.findMany({
    where: {
      workspaceId,
      status: { not: "REMOVED" },
    },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
        },
      },
      invitedBy: {
        select: {
          id: true,
          email: true,
          name: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}

/**
 * Lists pending invitations for a workspace.
 */
export async function listPendingInvitations(workspaceId: string) {
  return prisma.workspaceInvitation.findMany({
    where: {
      workspaceId,
      status: "PENDING",
      expiresAt: { gt: new Date() },
    },
    include: {
      invitedBy: {
        select: { name: true, email: true },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}

/**
 * Gets a specific member of a workspace.
 */
export async function getWorkspaceMember(workspaceId: string, membershipId: string) {
  return prisma.workspaceMembership.findUnique({
    where: {
      id: membershipId,
      workspaceId,
    },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          ownedKnowledgeTopics: { where: { workspaceId }, select: { id: true, name: true } },
          approvedKnowledgeTopics: { where: { workspaceId }, select: { id: true, name: true } },
        },
      },
      invitedBy: {
        select: {
          id: true,
          email: true,
          name: true,
        },
      },
    },
  });
}

/**
 * Updates a user's role or status within a workspace.
 */
export async function updateWorkspaceMembership(params: {
  workspaceId: string;
  actorUserId: string;
  membershipId: string;
  data: {
    name?: string;
    role?: WorkspaceRole;
    status?: WorkspaceMembershipStatus;
    ownedTopicIds?: string[];
    approvedTopicIds?: string[];
  };
}) {
  const { workspaceId, actorUserId, membershipId, data } = params;

  return prisma.$transaction(async (tx) => {
    const oldMembership = await tx.workspaceMembership.findUnique({
      where: { id: membershipId },
      include: { user: true },
    });

    if (!oldMembership) throw new Error("Membership not found");

    // 1. Safety Check: Cannot remove or demote the last remaining admin
    if ((data.status === "REMOVED" || data.status === "SUSPENDED" || (data.role && data.role !== "ADMIN")) && oldMembership.role === "ADMIN") {
      const adminCount = await tx.workspaceMembership.count({
        where: {
          workspaceId,
          role: "ADMIN",
          status: "ACTIVE",
          id: { not: membershipId },
        },
      });
      if (adminCount === 0) {
        throw new Error("CANNOT_REMOVE_LAST_ADMIN");
      }
    }

    if (data.name !== undefined) {
      await tx.user.update({
        where: { id: oldMembership.userId },
        data: { name: data.name },
      });
    }

    const membership = await tx.workspaceMembership.update({
      where: { id: membershipId },
      data: {
        role: data.role ?? undefined,
        status: data.status ?? undefined,
      },
    });

    // Handle topic updates...
    if (data.ownedTopicIds !== undefined) {
      await tx.knowledgeTopic.updateMany({
        where: { workspaceId, ownerId: oldMembership.userId },
        data: { ownerId: null },
      });
      if (data.ownedTopicIds.length > 0) {
        await tx.knowledgeTopic.updateMany({
          where: { workspaceId, id: { in: data.ownedTopicIds } },
          data: { ownerId: oldMembership.userId },
        });
      }
    }

    if (data.approvedTopicIds !== undefined) {
      await tx.knowledgeTopic.updateMany({
        where: { workspaceId, approverId: oldMembership.userId },
        data: { approverId: null },
      });
      if (data.approvedTopicIds.length > 0) {
        await tx.knowledgeTopic.updateMany({
          where: { workspaceId, id: { in: data.approvedTopicIds } },
          data: { approverId: oldMembership.userId },
        });
      }
    }

    if (data.role && data.role !== oldMembership.role) {
      await recordAuditEventSafe({
        workspaceId,
        actorUserId,
        eventType: AUDIT_EVENT_TYPES.ROLE_CHANGED,
        objectType: AUDIT_OBJECT_TYPES.WORKSPACE_MEMBERSHIP,
        objectId: membershipId,
        metadata: {
          targetUserId: oldMembership.userId,
          before: oldMembership.role,
          after: data.role,
        },
      });
    }

    if (data.status && data.status !== oldMembership.status) {
      const eventType =
        data.status === "SUSPENDED"
          ? AUDIT_EVENT_TYPES.MEMBERSHIP_SUSPENDED
          : oldMembership.status === "SUSPENDED" && data.status === "ACTIVE"
          ? AUDIT_EVENT_TYPES.MEMBERSHIP_REACTIVATED
          : AUDIT_EVENT_TYPES.WORKSPACE_MEMBERSHIP_UPDATED;

      await recordAuditEventSafe({
        workspaceId,
        actorUserId,
        eventType,
        objectType: AUDIT_OBJECT_TYPES.WORKSPACE_MEMBERSHIP,
        objectId: membershipId,
        metadata: {
          targetUserId: oldMembership.userId,
          before: oldMembership.status,
          after: data.status,
        },
      });
    }

    // Capture specific governance changes
    if (data.ownedTopicIds !== undefined) {
      await recordAuditEventSafe({
        workspaceId,
        actorUserId,
        eventType: AUDIT_EVENT_TYPES.TOPIC_OWNER_CHANGED,
        objectType: AUDIT_OBJECT_TYPES.USER,
        objectId: oldMembership.userId,
        metadata: {
          action: "TOPIC_OWNERSHIP_SYNC",
          topicIds: data.ownedTopicIds,
        },
      });
    }

    await recordAuditEventSafe({
      workspaceId,
      actorUserId,
      eventType: AUDIT_EVENT_TYPES.WORKSPACE_MEMBERSHIP_UPDATED,
      objectType: AUDIT_OBJECT_TYPES.WORKSPACE_MEMBERSHIP,
      objectId: membershipId,
      metadata: { 
        targetUserId: oldMembership.userId,
        targetEmail: oldMembership.user.email,
        changes: data,
        previousState: {
          role: oldMembership.role,
          status: oldMembership.status
        }
      },
    });

    return membership;
  });
}

/**
 * Removes a user from a workspace.
 */
export async function removeUserFromWorkspace(params: {
  workspaceId: string;
  actorUserId: string;
  membershipId: string;
}) {
  const { workspaceId, actorUserId, membershipId } = params;

  return prisma.$transaction(async (tx) => {
    const oldMembership = await tx.workspaceMembership.findUnique({
      where: { id: membershipId },
    });
    if (!oldMembership) throw new Error("Membership not found");

    // Safety Check: Last Admin
    if (oldMembership.role === "ADMIN") {
      const adminCount = await tx.workspaceMembership.count({
        where: {
          workspaceId,
          role: "ADMIN",
          status: "ACTIVE",
          id: { not: membershipId },
        },
      });
      if (adminCount === 0) {
        throw new Error("CANNOT_REMOVE_LAST_ADMIN");
      }
    }

    const membership = await tx.workspaceMembership.update({
      where: { id: membershipId, workspaceId },
      data: { status: "REMOVED" },
    });

    await recordAuditEventSafe({
      workspaceId,
      actorUserId,
      eventType: AUDIT_EVENT_TYPES.MEMBERSHIP_REMOVED,
      objectType: AUDIT_OBJECT_TYPES.WORKSPACE_MEMBERSHIP,
      objectId: membershipId,
      metadata: { 
        targetUserId: oldMembership.userId,
        status: "REMOVED",
        previousStatus: oldMembership.status
      },
    });

    return membership;
  });
}

/**
 * Resends an invitation.
 */
export async function resendInvitation(params: {
  workspaceId: string;
  actorUserId: string;
  invitationId: string;
}) {
  const { workspaceId, actorUserId, invitationId } = params;

  const oldInvitation = await prisma.workspaceInvitation.findUnique({
    where: { id: invitationId, workspaceId },
    include: { workspace: { select: { name: true } } },
  });

  if (!oldInvitation) throw new Error("Invitation not found");
  if (oldInvitation.status !== "PENDING") throw new Error("Invitation already processed");

  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 24);

  const invitation = await prisma.workspaceInvitation.update({
    where: { id: invitationId },
    data: {
      tokenHash,
      expiresAt,
      invitedById: actorUserId,
    },
  });

  await recordAuditEventSafe({
    workspaceId,
    actorUserId,
    eventType: AUDIT_EVENT_TYPES.INVITE_RESENT,
    objectType: AUDIT_OBJECT_TYPES.WORKSPACE_MEMBERSHIP,
    objectId: invitation.id,
    metadata: { 
      email: invitation.email,
      role: oldInvitation.role
    },
  });

  return { invitation, rawToken };
}
