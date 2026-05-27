import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
vi.unmock("@/lib/db/prisma");

import { prisma } from "@/lib/db/prisma";
import { 
  inviteUserToWorkspace, 
  acceptInvite, 
  resolveInviteByToken,
  revokeInvitation,
  resendInvitation,
  updateWorkspaceMembership,
  removeUserFromWorkspace
} from "@/modules/workspaces/workspace-user-service";
import { WorkspaceRole, WorkspaceMembershipStatus } from "@prisma/client";
import { getPermissionsForRole, Permission } from "@/lib/auth/permissions";

/**
 * Integration Tests for the Auth & Authz Workflow.
 * These tests interact with the real database to verify state and logic.
 */
describe("Auth & Authz Workflow Integration", () => {
  let adminUserId: string;
  let workspaceId: string;

  beforeAll(async () => {
    console.log("DATABASE_URL:", process.env.DATABASE_URL);
    console.log("Setting up test data...");
    // 1. Setup a test workspace and admin user
    const admin = await prisma.user.create({
      data: {
        email: "admin-" + Math.random().toString(36).substring(7) + "@test.com",
        name: "Test Admin",
        passwordHash: "fake-hash",
      },
    });
    adminUserId = admin.id;
    console.log("Admin created:", adminUserId);

    const workspace = await prisma.workspace.create({
      data: {
        name: "Test Workspace",
        slug: "test-ws-" + Math.random().toString(36).substring(7),
      },
    });
    workspaceId = workspace.id;
    console.log("Workspace created:", workspaceId);

    await prisma.workspaceMembership.create({
      data: {
        userId: adminUserId,
        workspaceId,
        role: "ADMIN",
        status: "ACTIVE",
      },
    });
    console.log("Admin membership created");
  });

  afterAll(async () => {
    console.log("Cleaning up test data for workspace:", workspaceId);
    if (!workspaceId) return;

    // Cleanup
    try {
      await prisma.workspaceMembership.deleteMany({ where: { workspaceId } });
      await prisma.workspaceInvitation.deleteMany({ where: { workspaceId } });
      await prisma.workspace.delete({ where: { id: workspaceId } });
      console.log("Cleanup complete");
    } catch (err) {
      console.error("Cleanup failed:", err);
    }
  });

  describe("Invitation Lifecycle", () => {
    it("should complete a full invitation-to-membership lifecycle", async () => {
      const email = "newuser@test.com";
      
      // 1. Admin invites user
      const { invitation, rawToken } = await inviteUserToWorkspace({
        workspaceId,
        invitedByUserId: adminUserId,
        email,
        role: "OPERATOR",
      });

      expect(invitation.status).toBe("PENDING");
      expect(invitation.role).toBe("OPERATOR");

      // 2. Resolve token
      const resolution = await resolveInviteByToken(rawToken);
      expect("error" in resolution).toBe(false);
      if (!("error" in resolution)) {
        expect(resolution.email).toBe(email);
        expect(resolution.needsRegistration).toBe(true);
      }

      // 3. Accept invite
      await acceptInvite({
        token: rawToken,
        password: "password123",
        name: "New User",
      });

      // 4. Verify membership
      const membership = await prisma.workspaceMembership.findFirst({
        where: { workspaceId, user: { email } },
      });

      expect(membership?.status).toBe("ACTIVE");
      expect(membership?.role).toBe("OPERATOR");
      
      // 5. Verify user creation
      const user = await prisma.user.findUnique({ where: { email } });
      expect(user).not.toBeNull();
      expect(user?.name).toBe("New User");
    });

    it("should handle duplicate invitations by revoking the old one", async () => {
      const email = "duplicate@test.com";
      
      const { invitation: firstInvite } = await inviteUserToWorkspace({
        workspaceId,
        invitedByUserId: adminUserId,
        email,
        role: "VIEWER",
      });

      const { invitation: secondInvite } = await inviteUserToWorkspace({
        workspaceId,
        invitedByUserId: adminUserId,
        email,
        role: "EDITOR",
      });

      const refreshedFirst = await prisma.workspaceInvitation.findUnique({
        where: { id: firstInvite.id },
      });

      expect(refreshedFirst?.status).toBe("REVOKED");
      expect(secondInvite.status).toBe("PENDING");
      expect(secondInvite.role).toBe("EDITOR");
    });

    it("should allow an existing user to join a second workspace via invite", async () => {
      // Create a second workspace
      const ws2 = await prisma.workspace.create({
        data: { name: "Second Workspace", slug: "ws2-" + Math.random().toString(7) }
      });

      const email = "existing-user@test.com";
      const user = await prisma.user.create({
        data: { email, passwordHash: "hash", name: "Existing User" }
      });

      const { invitation, rawToken } = await inviteUserToWorkspace({
        workspaceId: ws2.id,
        invitedByUserId: adminUserId, // Admin might not be in ws2 but the service allows it for now (or admin needs to be in ws2)
        email,
        role: "VIEWER",
      });

      await acceptInvite({
        token: rawToken,
        authUserId: user.id // Logged in as existing user
      });

      const membership = await prisma.workspaceMembership.findUnique({
        where: { userId_workspaceId: { userId: user.id, workspaceId: ws2.id } }
      });

      expect(membership?.status).toBe("ACTIVE");
      expect(membership?.role).toBe("VIEWER");

      // Cleanup ws2
      await prisma.workspaceMembership.deleteMany({ where: { workspaceId: ws2.id } });
      await prisma.workspace.delete({ where: { id: ws2.id } });
    });
  });

  describe("RBAC & Boundaries", () => {
    it("should verify that permissions match the defined roles", () => {
      const contributorPermissions = getPermissionsForRole("CONTRIBUTOR");
      const approverPermissions = getPermissionsForRole("APPROVER");
      const auditorPermissions = getPermissionsForRole("AUDITOR");

      expect(contributorPermissions).not.toContain(Permission.APPROVE_ANSWERS);
      expect(approverPermissions).toContain(Permission.APPROVE_ANSWERS);
      expect(approverPermissions).not.toContain(Permission.MANAGE_MEMBERS);
      expect(auditorPermissions).toContain(Permission.VIEW_AUDIT);
      expect(auditorPermissions).not.toContain(Permission.EDIT_ANSWERS);
    });

    it("should prevent removing the last admin from a workspace", async () => {
      const adminMembership = await prisma.workspaceMembership.findFirst({
        where: { workspaceId, role: "ADMIN", status: "ACTIVE" }
      });

      await expect(removeUserFromWorkspace({
        workspaceId,
        actorUserId: adminUserId,
        membershipId: adminMembership!.id,
      })).rejects.toThrow("CANNOT_REMOVE_LAST_ADMIN");
    });
  });

  describe("Invite Management", () => {
    it("should allow revoking a pending invitation", async () => {
      const { invitation } = await inviteUserToWorkspace({
        workspaceId,
        invitedByUserId: adminUserId,
        email: "revoke@test.com",
        role: "VIEWER",
      });

      await revokeInvitation(invitation.id, adminUserId);

      const refreshed = await prisma.workspaceInvitation.findUnique({
        where: { id: invitation.id }
      });
      expect(refreshed?.status).toBe("REVOKED");
    });

    it("should allow resending an invitation (generating a new token)", async () => {
      const { invitation: oldInvite, rawToken: oldToken } = await inviteUserToWorkspace({
        workspaceId,
        invitedByUserId: adminUserId,
        email: "resend@test.com",
        role: "VIEWER",
      });

      const { invitation: newInvite, rawToken: newToken } = await resendInvitation({
        workspaceId,
        actorUserId: adminUserId,
        invitationId: oldInvite.id,
      });

      expect(newToken).not.toBe(oldToken);
      expect(newInvite.id).toBe(oldInvite.id);
      
      const resolution = await resolveInviteByToken(newToken);
      expect("error" in resolution).toBe(false);
    });
  });
});
