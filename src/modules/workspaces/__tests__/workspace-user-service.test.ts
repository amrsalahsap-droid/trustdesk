import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { 
  inviteUserToWorkspace, 
  updateWorkspaceMembership, 
  listWorkspaceMembers, 
  removeUserFromWorkspace 
} from "../workspace-user-service";

const mockTransaction = vi.mocked(prisma.$transaction);
const mockUserFindUnique = vi.mocked(prisma.user.findUnique);
const mockMembershipUpdate = vi.mocked(prisma.workspaceMembership.update);
const mockMembershipFindMany = vi.mocked(prisma.workspaceMembership.findMany);
const mockAuditCreate = vi.mocked(prisma.auditEvent.create);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("WorkspaceUserService", () => {
  describe("inviteUserToWorkspace", () => {
    it("creates a new user and membership if user doesn't exist", async () => {
      mockUserFindUnique.mockResolvedValue(null);
      
      const mockUser = { id: "user-new", email: "new@example.com" };
      const mockMembership = { id: "mem-new", userId: "user-new", workspaceId: "ws-1", role: "OPERATOR", status: "INVITED" };

      mockTransaction.mockImplementation(async (fn) => {
        const tx = {
          user: {
            findUnique: vi.fn().mockResolvedValue(null),
            create: vi.fn().mockResolvedValue(mockUser),
          },
          workspaceMembership: {
            upsert: vi.fn().mockResolvedValue(mockMembership),
          },
        };
        return fn(tx as never);
      });

      const result = await inviteUserToWorkspace({
        workspaceId: "ws-1",
        invitedByUserId: "admin-1",
        email: "new@example.com",
        role: "OPERATOR",
      });

      expect(result.id).toBe("mem-new");
      expect(mockAuditCreate).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          eventType: "WORKSPACE_MEMBERSHIP_CREATED",
          workspaceId: "ws-1",
        }),
      }));
    });

    it("uses existing user if email is already registered", async () => {
      const existingUser = { id: "user-existing", email: "existing@example.com" };
      mockUserFindUnique.mockResolvedValue(existingUser as any);

      const mockMembership = { id: "mem-new", userId: "user-existing", workspaceId: "ws-1", role: "APPROVER", status: "INVITED" };

      mockTransaction.mockImplementation(async (fn) => {
        const tx = {
          user: {
            findUnique: vi.fn().mockResolvedValue(existingUser),
          },
          workspaceMembership: {
            upsert: vi.fn().mockResolvedValue(mockMembership),
          },
        };
        return fn(tx as never);
      });

      const result = await inviteUserToWorkspace({
        workspaceId: "ws-1",
        invitedByUserId: "admin-1",
        email: "existing@example.com",
        role: "APPROVER",
      });

      expect(result.userId).toBe("user-existing");
    });
  });

  describe("updateWorkspaceMembership", () => {
    it("updates role and status", async () => {
      const mockMembership = { id: "mem-1", role: "ADMIN", status: "ACTIVE" };
      mockMembershipUpdate.mockResolvedValue(mockMembership as any);

      const result = await updateWorkspaceMembership({
        workspaceId: "ws-1",
        actorUserId: "admin-1",
        membershipId: "mem-1",
        data: { role: "ADMIN", status: "ACTIVE" },
      });

      expect(result.role).toBe("ADMIN");
      expect(mockMembershipUpdate).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: "mem-1", workspaceId: "ws-1" },
        data: { role: "ADMIN", status: "ACTIVE" },
      }));
      expect(mockAuditCreate).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          eventType: "WORKSPACE_MEMBERSHIP_UPDATED",
        }),
      }));
    });
  });

  describe("removeUserFromWorkspace", () => {
    it("sets status to REMOVED", async () => {
      const mockMembership = { id: "mem-1", status: "REMOVED" };
      mockMembershipUpdate.mockResolvedValue(mockMembership as any);

      await removeUserFromWorkspace({
        workspaceId: "ws-1",
        actorUserId: "admin-1",
        membershipId: "mem-1",
      });

      expect(mockMembershipUpdate).toHaveBeenCalledWith(expect.objectContaining({
        data: { status: "REMOVED" },
      }));
      expect(mockAuditCreate).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          eventType: "WORKSPACE_MEMBERSHIP_REMOVED",
        }),
      }));
    });
  });
});
