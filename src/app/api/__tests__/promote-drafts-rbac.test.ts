import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/build-context", () => ({
  buildAuthContext: vi.fn(),
}));

vi.mock("@/modules/knowledge/topics/promote-drafts-service", () => ({
  promoteDrafts: vi.fn().mockResolvedValue({ promoted: 0 }),
}));

import { buildAuthContext } from "@/lib/auth/build-context";
import { Permission } from "@/lib/auth/permissions";
import { POST } from "@/app/api/knowledge/topics/promote-drafts/route";

const mockBuildContext = vi.mocked(buildAuthContext);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/knowledge/topics/promote-drafts RBAC", () => {
  it("returns 403 for viewer", async () => {
    mockBuildContext.mockResolvedValue({
      userId: "u-1",
      workspaceId: "ws-1",
      membershipId: "m-1",
      role: "VIEWER",
      permissions: [Permission.VIEW_ANSWERS, Permission.VIEW_EVIDENCE, Permission.VIEW_HISTORY],
    });

    const res = await POST(
      new Request("http://localhost/api/knowledge/topics/promote-drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-workspace-id": "ws-1" },
        body: JSON.stringify({ topicKey: "t1" }),
      }),
    );

    expect(res.status).toBe(403);
  });

  it("allows operator with MANAGE_TOPICS", async () => {
    mockBuildContext.mockResolvedValue({
      userId: "u-1",
      workspaceId: "ws-1",
      membershipId: "m-1",
      role: "OPERATOR",
      permissions: [
        Permission.MANAGE_TOPICS,
        Permission.VIEW_ANSWERS,
        Permission.EDIT_ANSWERS,
        Permission.ASSIGN_OWNERS,
      ],
    });

    const res = await POST(
      new Request("http://localhost/api/knowledge/topics/promote-drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-workspace-id": "ws-1" },
        body: JSON.stringify({ topicKey: "t1" }),
      }),
    );

    expect(res.status).toBe(200);
  });
});
