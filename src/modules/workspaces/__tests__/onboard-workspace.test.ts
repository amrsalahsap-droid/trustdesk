import { describe, it, expect, vi, beforeEach } from "vitest";
import { ZodError } from "zod";
import { prisma } from "@/lib/db/prisma";
import { createWorkspaceDuringOnboarding } from "../onboard-workspace";
import { AlreadyOnboardedError, UserNotFoundError } from "@/lib/auth/errors";

vi.mock("../create-workspace", () => ({
  createWorkspaceForUser: vi.fn(),
}));

import { createWorkspaceForUser } from "../create-workspace";

const mockFindFirst = vi.mocked(prisma.workspaceMembership.findFirst);
const mockFindUser = vi.mocked(prisma.user.findUnique);
const mockCreateWorkspace = vi.mocked(createWorkspaceForUser);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createWorkspaceDuringOnboarding", () => {
  const userId = "user-1";
  const workspaceName = "Acme Inc";

  it("returns CreateWorkspaceResult when user has no active membership on active workspace", async () => {
    mockFindUser.mockResolvedValue({ id: userId } as never);
    mockFindFirst.mockResolvedValue(null);

    mockCreateWorkspace.mockResolvedValue({
      workspace: {
        id: "ws-new",
        name: "Acme Inc",
        slug: "acme-inc",
        status: "ACTIVE",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      membership: {
        id: "mem-new",
        userId: "user-1",
        workspaceId: "ws-new",
        role: "OWNER",
        status: "ACTIVE",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    } as never);

    const result = await createWorkspaceDuringOnboarding({ userId, workspaceName });

    expect(result).toEqual({
      workspaceId: "ws-new",
      workspaceName: "Acme Inc",
      workspaceSlug: "acme-inc",
      membershipId: "mem-new",
      role: "OWNER",
    });
    expect(mockCreateWorkspace).toHaveBeenCalledWith(userId, workspaceName);
  });

  it("throws AlreadyOnboardedError when user already has ACTIVE membership on ACTIVE workspace", async () => {
    mockFindUser.mockResolvedValue({ id: userId } as never);
    mockFindFirst.mockResolvedValue({ id: "existing-mem" } as never);

    await expect(createWorkspaceDuringOnboarding({ userId, workspaceName })).rejects.toThrow(
      AlreadyOnboardedError,
    );

    expect(mockCreateWorkspace).not.toHaveBeenCalled();
  });

  it("queries only ACTIVE membership on ACTIVE workspace", async () => {
    mockFindUser.mockResolvedValue({ id: userId } as never);
    mockFindFirst.mockResolvedValue(null);
    mockCreateWorkspace.mockResolvedValue({
      workspace: {
        id: "ws",
        name: "Test",
        slug: "test",
        status: "ACTIVE",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      membership: {
        id: "mem",
        userId,
        workspaceId: "ws",
        role: "OWNER",
        status: "ACTIVE",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    } as never);

    await createWorkspaceDuringOnboarding({ userId, workspaceName });

    expect(mockFindFirst).toHaveBeenCalledWith({
      where: {
        userId,
        status: "ACTIVE",
        workspace: { status: "ACTIVE" },
      },
      select: { id: true },
    });
  });

  it("throws ZodError for name shorter than 2 characters", async () => {
    mockFindUser.mockResolvedValue({ id: userId } as never);

    await expect(createWorkspaceDuringOnboarding({ userId, workspaceName: "a" })).rejects.toThrow(
      ZodError,
    );
    expect(mockCreateWorkspace).not.toHaveBeenCalled();
  });

  it("throws ZodError for whitespace-only name", async () => {
    mockFindUser.mockResolvedValue({ id: userId } as never);

    await expect(
      createWorkspaceDuringOnboarding({ userId, workspaceName: "   " }),
    ).rejects.toThrow(ZodError);
    expect(mockCreateWorkspace).not.toHaveBeenCalled();
  });

  it("throws UserNotFoundError when user does not exist", async () => {
    mockFindUser.mockResolvedValue(null);

    await expect(createWorkspaceDuringOnboarding({ userId, workspaceName })).rejects.toThrow(
      UserNotFoundError,
    );
    expect(mockFindFirst).not.toHaveBeenCalled();
    expect(mockCreateWorkspace).not.toHaveBeenCalled();
  });
});
