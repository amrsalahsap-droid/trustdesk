import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { createWorkspaceForUser } from "../create-workspace";

const mockTransaction = vi.mocked(prisma.$transaction);
const mockFindMany = vi.mocked(prisma.workspace.findMany);
const mockAuditCreate = vi.mocked(prisma.auditEvent.create);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createWorkspaceForUser", () => {
  it("creates a workspace and OWNER membership in a single transaction", async () => {
    mockFindMany.mockResolvedValue([]);

    const mockWorkspace = {
      id: "ws-new",
      name: "Acme Inc",
      slug: "acme-inc",
    };

    const mockMembership = {
      id: "mem-new",
      userId: "user-1",
      workspaceId: "ws-new",
      role: "OWNER" as const,
      status: "ACTIVE" as const,
    };

    mockTransaction.mockImplementation(async (fn) => {
      const tx = {
        workspace: {
          create: vi.fn().mockResolvedValue(mockWorkspace),
        },
        workspaceMembership: {
          create: vi.fn().mockResolvedValue(mockMembership),
        },
      };
      return fn(tx as never);
    });

    const result = await createWorkspaceForUser("user-1", "Acme Inc");

    expect(result.workspace.id).toBe("ws-new");
    expect(result.workspace.slug).toBe("acme-inc");
    expect(result.membership.role).toBe("OWNER");
    expect(result.membership.userId).toBe("user-1");

    expect(mockAuditCreate).toHaveBeenCalledTimes(2);
    expect(mockAuditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventType: "WORKSPACE_CREATED",
        objectId: "ws-new",
        workspaceId: "ws-new",
      }),
    });
    expect(mockAuditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventType: "WORKSPACE_MEMBERSHIP_CREATED",
        objectId: "mem-new",
        workspaceId: "ws-new",
      }),
    });
  });

  it("generates a slug from the workspace name", async () => {
    mockFindMany.mockResolvedValue([]);

    mockTransaction.mockImplementation(async (fn) => {
      const tx = {
        workspace: {
          create: vi.fn().mockImplementation(({ data }) => ({
            id: "ws-new",
            name: data.name,
            slug: data.slug,
          })),
        },
        workspaceMembership: {
          create: vi.fn().mockResolvedValue({
            id: "mem-new",
            userId: "user-1",
            workspaceId: "ws-new",
            role: "OWNER",
            status: "ACTIVE",
          }),
        },
      };
      return fn(tx as never);
    });

    const result = await createWorkspaceForUser("user-1", "My Cool Workspace!");

    expect(result.workspace.slug).toBe("my-cool-workspace");
  });

  it("appends a sequential number when the slug already exists", async () => {
    mockFindMany.mockResolvedValue([{ slug: "acme-inc" }] as never);

    mockTransaction.mockImplementation(async (fn) => {
      const tx = {
        workspace: {
          create: vi.fn().mockImplementation(({ data }) => ({
            id: "ws-new",
            name: data.name,
            slug: data.slug,
          })),
        },
        workspaceMembership: {
          create: vi.fn().mockResolvedValue({
            id: "mem-new",
            userId: "user-1",
            workspaceId: "ws-new",
            role: "OWNER",
            status: "ACTIVE",
          }),
        },
      };
      return fn(tx as never);
    });

    const result = await createWorkspaceForUser("user-1", "Acme Inc");

    expect(result.workspace.slug).toBe("acme-inc-2");
  });

  it("increments the counter past existing sequential slugs", async () => {
    mockFindMany.mockResolvedValue([
      { slug: "acme-inc" },
      { slug: "acme-inc-2" },
      { slug: "acme-inc-3" },
    ] as never);

    mockTransaction.mockImplementation(async (fn) => {
      const tx = {
        workspace: {
          create: vi.fn().mockImplementation(({ data }) => ({
            id: "ws-new",
            name: data.name,
            slug: data.slug,
          })),
        },
        workspaceMembership: {
          create: vi.fn().mockResolvedValue({
            id: "mem-new",
            userId: "user-1",
            workspaceId: "ws-new",
            role: "OWNER",
            status: "ACTIVE",
          }),
        },
      };
      return fn(tx as never);
    });

    const result = await createWorkspaceForUser("user-1", "Acme Inc");

    expect(result.workspace.slug).toBe("acme-inc-4");
  });

  it("assigns OWNER role and ACTIVE status to the membership", async () => {
    mockFindMany.mockResolvedValue([]);

    let capturedMembershipData: Record<string, unknown> | null = null;

    mockTransaction.mockImplementation(async (fn) => {
      const tx = {
        workspace: {
          create: vi.fn().mockResolvedValue({
            id: "ws-new",
            name: "Test",
            slug: "test",
          }),
        },
        workspaceMembership: {
          create: vi.fn().mockImplementation(({ data }) => {
            capturedMembershipData = data;
            return {
              id: "mem-new",
              ...data,
            };
          }),
        },
      };
      return fn(tx as never);
    });

    await createWorkspaceForUser("user-1", "Test");

    expect(capturedMembershipData).toMatchObject({
      userId: "user-1",
      role: "OWNER",
      status: "ACTIVE",
    });
  });

  it("includes ACTIVE status on workspace create and propagates membership failure", async () => {
    mockFindMany.mockResolvedValue([]);

    const workspaceCreate = vi.fn().mockResolvedValue({
      id: "ws-new",
      name: "Test",
      slug: "test",
      status: "ACTIVE",
    });
    const membershipCreate = vi.fn().mockRejectedValue(new Error("membership failed"));

    mockTransaction.mockImplementation(async (fn) => {
      const tx = {
        workspace: { create: workspaceCreate },
        workspaceMembership: { create: membershipCreate },
      };
      return fn(tx as never);
    });

    await expect(createWorkspaceForUser("user-1", "Test")).rejects.toThrow("membership failed");

    expect(workspaceCreate).toHaveBeenCalledTimes(1);
    expect(workspaceCreate.mock.calls[0][0].data).toMatchObject({
      name: "Test",
      slug: "test",
      status: "ACTIVE",
      isDemo: false,
    });
    expect(membershipCreate).toHaveBeenCalledTimes(1);
  });
});
