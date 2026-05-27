import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { resolveWorkspaceMembership } from "../resolve-membership";
import {
  NoWorkspaceAccessError,
  WorkspaceAccessDeniedError,
  WorkspaceSelectionRequiredError,
} from "../errors";

const mockFindMany = vi.mocked(prisma.workspaceMembership.findMany);
const mockAuditCreate = vi.mocked(prisma.auditEvent.create);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("resolveWorkspaceMembership", () => {
  const userId = "user-1";

  it("throws NoWorkspaceAccessError when user has zero active memberships", async () => {
    mockFindMany.mockResolvedValue([]);

    await expect(resolveWorkspaceMembership({ userId })).rejects.toThrow(NoWorkspaceAccessError);

    expect(mockAuditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventType: "WORKSPACE_ACCESS_DENIED",
        actorUserId: userId,
        workspaceId: null,
      }),
    });
  });

  it("auto-selects the single active membership when no workspaceId requested", async () => {
    mockFindMany.mockResolvedValue([{ id: "mem-1", workspaceId: "ws-1", role: "EDITOR" }] as never);

    const result = await resolveWorkspaceMembership({ userId });

    expect(result).toEqual({
      workspaceId: "ws-1",
      membershipId: "mem-1",
      role: "EDITOR",
    });
  });

  it("throws WorkspaceSelectionRequiredError when user has multiple memberships and no selection", async () => {
    mockFindMany.mockResolvedValue([
      { id: "mem-1", workspaceId: "ws-1", role: "OWNER" },
      { id: "mem-2", workspaceId: "ws-2", role: "VIEWER" },
    ] as never);

    await expect(resolveWorkspaceMembership({ userId })).rejects.toThrow(
      WorkspaceSelectionRequiredError,
    );
  });

  it("includes workspace IDs in WorkspaceSelectionRequiredError", async () => {
    mockFindMany.mockResolvedValue([
      { id: "mem-1", workspaceId: "ws-1", role: "OWNER" },
      { id: "mem-2", workspaceId: "ws-2", role: "VIEWER" },
    ] as never);

    try {
      await resolveWorkspaceMembership({ userId });
      expect.fail("Expected WorkspaceSelectionRequiredError");
    } catch (error) {
      expect(error).toBeInstanceOf(WorkspaceSelectionRequiredError);
      expect((error as WorkspaceSelectionRequiredError).workspaceIds).toEqual(["ws-1", "ws-2"]);
    }
  });

  it("returns the matching membership when requestedWorkspaceId is valid", async () => {
    mockFindMany.mockResolvedValue([
      { id: "mem-1", workspaceId: "ws-1", role: "ADMIN" },
      { id: "mem-2", workspaceId: "ws-2", role: "VIEWER" },
    ] as never);

    const result = await resolveWorkspaceMembership({
      userId,
      requestedWorkspaceId: "ws-2",
    });

    expect(result).toEqual({
      workspaceId: "ws-2",
      membershipId: "mem-2",
      role: "VIEWER",
    });
  });

  it("throws WorkspaceAccessDeniedError when requestedWorkspaceId is not in memberships", async () => {
    mockFindMany.mockResolvedValue([{ id: "mem-1", workspaceId: "ws-1", role: "OWNER" }] as never);

    await expect(
      resolveWorkspaceMembership({
        userId,
        requestedWorkspaceId: "ws-other-tenant",
      }),
    ).rejects.toThrow(WorkspaceAccessDeniedError);

    expect(mockAuditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventType: "WORKSPACE_ACCESS_DENIED",
        workspaceId: "ws-other-tenant",
        objectId: "ws-other-tenant",
        actorUserId: userId,
      }),
    });
  });

  it("filters out disabled memberships (Prisma where clause)", async () => {
    // ACTIVE membership only; ARCHIVED workspaces excluded via workspace.status.
    mockFindMany.mockResolvedValue([]);

    await expect(resolveWorkspaceMembership({ userId })).rejects.toThrow(NoWorkspaceAccessError);

    expect(mockFindMany).toHaveBeenCalledWith({
      where: {
        userId,
        status: "ACTIVE",
        workspace: { status: "ACTIVE" },
      },
      select: {
        id: true,
        workspaceId: true,
        role: true,
      },
    });
  });
});
