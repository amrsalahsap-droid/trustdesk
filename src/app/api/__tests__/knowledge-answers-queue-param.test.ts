import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

vi.mock("@/lib/auth/build-context", () => ({
  buildAuthContext: vi.fn(),
}));

import { prisma } from "@/lib/db/prisma";
import { buildAuthContext } from "@/lib/auth/build-context";
import { Permission } from "@/lib/auth/permissions";
import { GET } from "@/app/api/knowledge/answers/route";

const mockBuildContext = vi.mocked(buildAuthContext);
const findMany = prisma.answerLibraryItem.findMany as unknown as Mock;

beforeEach(() => {
  vi.clearAllMocks();
  mockBuildContext.mockReset();
  findMany.mockReset();
  findMany.mockResolvedValue([]);
});

describe("GET /api/knowledge/answers?queue=", () => {
  it("returns 400 for unknown queue id", async () => {
    mockBuildContext.mockResolvedValue({
      userId: "u-1",
      workspaceId: "ws-1",
      membershipId: "m-1",
      role: "OPERATOR",
      permissions: [Permission.VIEW_ANSWERS],
    });

    const res = await GET(
      new Request("http://localhost/api/knowledge/answers?queue=not_a_real_queue", {
        headers: { "x-workspace-id": "ws-1" },
      }),
    );
    expect(res.status).toBe(400);
    expect(findMany).not.toHaveBeenCalled();
  });

  it("returns 403 when caller cannot access workspace-scoped queue", async () => {
    mockBuildContext.mockResolvedValue({
      userId: "u-1",
      workspaceId: "ws-1",
      membershipId: "m-1",
      role: "VIEWER",
      permissions: [Permission.VIEW_ANSWERS],
    });

    const res = await GET(
      new Request("http://localhost/api/knowledge/answers?queue=unowned", {
        headers: { "x-workspace-id": "ws-1" },
      }),
    );
    expect(res.status).toBe(403);
    expect(findMany).not.toHaveBeenCalled();
  });

  it("lists with prisma where for allowed queue", async () => {
    mockBuildContext.mockResolvedValue({
      userId: "u-1",
      workspaceId: "ws-1",
      membershipId: "m-1",
      role: "OPERATOR",
      permissions: [Permission.VIEW_ANSWERS],
    });

    const res = await GET(
      new Request("http://localhost/api/knowledge/answers?queue=unowned", {
        headers: { "x-workspace-id": "ws-1" },
      }),
    );
    expect(res.status).toBe(200);
    expect(findMany).toHaveBeenCalledTimes(1);
    const arg = findMany.mock.calls[0][0] as { where: { ownerId?: null } };
    expect(arg.where).toMatchObject({
      workspaceId: "ws-1",
      ownerId: null,
      status: { not: "ARCHIVED" },
    });
  });

  it("scopes my_approvals list to IN_REVIEW for approver", async () => {
    mockBuildContext.mockResolvedValue({
      userId: "u-appr",
      workspaceId: "ws-1",
      membershipId: "m-1",
      role: "EDITOR",
      permissions: [Permission.VIEW_ANSWERS, Permission.APPROVE_ANSWERS],
    });

    const res = await GET(
      new Request("http://localhost/api/knowledge/answers?queue=my_approvals", {
        headers: { "x-workspace-id": "ws-1" },
      }),
    );
    expect(res.status).toBe(200);
    const arg = findMany.mock.calls[0][0] as {
      where: { approverId?: string; governanceStatus?: string };
    };
    expect(arg.where).toMatchObject({
      approverId: "u-appr",
      governanceStatus: "IN_REVIEW",
    });
  });
});
