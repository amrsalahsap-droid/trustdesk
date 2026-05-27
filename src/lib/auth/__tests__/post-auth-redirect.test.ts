import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { getPostAuthRedirectForUser } from "../post-auth-redirect";

const mockFindFirst = vi.mocked(prisma.workspaceMembership.findFirst);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getPostAuthRedirectForUser", () => {
  it("returns /onboarding when user has no ACTIVE membership", async () => {
    mockFindFirst.mockResolvedValue(null);
    await expect(getPostAuthRedirectForUser("u1")).resolves.toBe("/onboarding");
  });

  it("returns /app when user has an ACTIVE membership", async () => {
    mockFindFirst.mockResolvedValue({ id: "m1" } as never);
    await expect(getPostAuthRedirectForUser("u1")).resolves.toBe("/app");
    expect(mockFindFirst).toHaveBeenCalledWith({
      where: {
        userId: "u1",
        status: "ACTIVE",
        workspace: { status: "ACTIVE" },
      },
      select: { id: true },
    });
  });
});
