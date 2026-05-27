import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { resolveWorkspaceMembership } from "../resolve-membership";

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    workspaceMembership: {
      findMany: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
  },
}));

describe("lastActiveWorkspaceId Resolution Priority", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should prioritize requestedWorkspaceId (hint/cookie) over lastActiveWorkspaceId", async () => {
    const userId = "user-1";
    const requestedId = "ws-hint";
    const lastActiveId = "ws-last-active";

    (prisma.workspaceMembership.findMany as any).mockResolvedValue([
      { workspaceId: "ws-hint", id: "m1", role: "OWNER", workspace: { industry: ["Tech"] } },
      { workspaceId: "ws-last-active", id: "m2", role: "OWNER", workspace: { industry: ["Tech"] } },
    ]);

    (prisma.user.findUnique as any).mockResolvedValue({ lastActiveWorkspaceId: lastActiveId });

    const result = await resolveWorkspaceMembership({ userId, requestedWorkspaceId: requestedId });

    expect(result.workspaceId).toBe("ws-hint");
  });

  it("should fall back to lastActiveWorkspaceId if no requestedWorkspaceId is provided", async () => {
    const userId = "user-1";
    const lastActiveId = "ws-last-active";

    (prisma.workspaceMembership.findMany as any).mockResolvedValue([
      { workspaceId: "ws-other", id: "m1", role: "OWNER", workspace: { industry: ["Tech"] } },
      { workspaceId: "ws-last-active", id: "m2", role: "OWNER", workspace: { industry: ["Tech"] } },
    ]);

    (prisma.user.findUnique as any).mockResolvedValue({ lastActiveWorkspaceId: lastActiveId });

    const result = await resolveWorkspaceMembership({ userId });

    expect(result.workspaceId).toBe("ws-last-active");
  });

  it("should ignore lastActiveWorkspaceId if the user is not a member of that workspace", async () => {
    const userId = "user-1";
    const lastActiveId = "ws-stale";

    (prisma.workspaceMembership.findMany as any).mockResolvedValue([
      { workspaceId: "ws-real", id: "m1", role: "OWNER", workspace: { industry: ["Tech"] } },
    ]);

    (prisma.user.findUnique as any).mockResolvedValue({ lastActiveWorkspaceId: lastActiveId });

    // Should auto-select the only available membership
    const result = await resolveWorkspaceMembership({ userId });

    expect(result.workspaceId).toBe("ws-real");
  });

  it("should force selection if no requestedId/lastActive is valid and multiple memberships exist", async () => {
    const userId = "user-1";

    (prisma.workspaceMembership.findMany as any).mockResolvedValue([
      { workspaceId: "ws-1", id: "m1", role: "OWNER", workspace: { industry: ["Tech"] } },
      { workspaceId: "ws-2", id: "m2", role: "OWNER", workspace: { industry: ["Tech"] } },
    ]);

    (prisma.user.findUnique as any).mockResolvedValue({ lastActiveWorkspaceId: null });

    await expect(resolveWorkspaceMembership({ userId })).rejects.toThrow();
  });

  it("should throw WorkspaceSelectionRequiredError when no memberships exist", async () => {
    const userId = "user-no-memberships";

    (prisma.workspaceMembership.findMany as any).mockResolvedValue([]);
    (prisma.user.findUnique as any).mockResolvedValue({ lastActiveWorkspaceId: null });

    await expect(resolveWorkspaceMembership({ userId })).rejects.toThrow();
  });
});
