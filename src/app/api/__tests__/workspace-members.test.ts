import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

vi.mock("@/lib/auth/build-context", () => ({
  buildAuthContext: vi.fn(),
}));

import { prisma } from "@/lib/db/prisma";
import { buildAuthContext } from "@/lib/auth/build-context";
import { GET } from "@/app/api/workspaces/members/route";

const mockBuildContext = vi.mocked(buildAuthContext);
const findManyMemberships = prisma.workspaceMembership.findMany as unknown as Mock;

const ctx = {
  userId: "user-1",
  workspaceId: "ws-1",
  membershipId: "mem-1",
  role: "OWNER" as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockBuildContext.mockReset();
  mockBuildContext.mockResolvedValue(ctx);
  findManyMemberships.mockReset();
  findManyMemberships.mockResolvedValue([]);
});

describe("GET /api/workspaces/members", () => {
  it("returns members with userId, name, email, role for ACTIVE memberships only", async () => {
    findManyMemberships.mockResolvedValueOnce([
      {
        userId: "u1",
        role: "OWNER",
        user: { id: "u1", name: "Alice", email: "alice@example.com" },
      },
      {
        userId: "u2",
        role: "EDITOR",
        user: { id: "u2", name: null, email: "bob@example.com" },
      },
    ]);

    const res = await GET(new Request("http://localhost/api/workspaces/members"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.members).toHaveLength(2);
    expect(body.members[0]).toEqual({
      userId: "u1",
      name: "Alice",
      email: "alice@example.com",
      role: "OWNER",
    });
    expect(body.members[1]).toEqual({
      userId: "u2",
      name: "bob@example.com",
      email: "bob@example.com",
      role: "EDITOR",
    });

    expect(findManyMemberships).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId: "ws-1", status: "ACTIVE" },
      }),
    );
  });

  it("returns 401 when not authenticated", async () => {
    const { AuthenticationError } = await import("@/lib/auth/errors");
    mockBuildContext.mockRejectedValueOnce(new AuthenticationError());

    const res = await GET(new Request("http://localhost/api/workspaces/members"));
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error.code).toBe("UNAUTHENTICATED");
  });
});
