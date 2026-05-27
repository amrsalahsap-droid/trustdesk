import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/build-context", () => ({
  buildAuthContext: vi.fn(),
}));

vi.mock("@/lib/audit/list-audit-events", () => ({
  listAnswerAuditEventsEnriched: vi.fn(),
}));

import { buildAuthContext } from "@/lib/auth/build-context";
import { Permission } from "@/lib/auth/permissions";
import { listAnswerAuditEventsEnriched } from "@/lib/audit/list-audit-events";
import { GET } from "@/app/api/knowledge/answers/[id]/audit/route";

const mockBuildContext = vi.mocked(buildAuthContext);
const mockListEnriched = vi.mocked(listAnswerAuditEventsEnriched);

beforeEach(() => {
  vi.clearAllMocks();
  mockListEnriched.mockResolvedValue([]);
});

describe("GET /api/knowledge/answers/[id]/audit", () => {
  it("allows VIEW_AUDIT without VIEW_ANSWERS", async () => {
    mockBuildContext.mockResolvedValue({
      userId: "u1",
      workspaceId: "ws-1",
      membershipId: "m1",
      role: "VIEWER",
      permissions: [Permission.VIEW_AUDIT],
    } as never);

    const req = new Request("http://localhost/api/knowledge/answers/a1/audit", {
      headers: { "x-workspace-id": "ws-1" },
    });
    const res = await GET(req, { params: Promise.resolve({ id: "a1" }) });

    expect(res.status).toBe(200);
    expect(mockListEnriched).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      answerId: "a1",
      limit: 100,
    });
  });

  it("allows VIEW_ANSWERS without VIEW_AUDIT", async () => {
    mockBuildContext.mockResolvedValue({
      userId: "u1",
      workspaceId: "ws-1",
      membershipId: "m1",
      role: "EDITOR",
      permissions: [Permission.VIEW_ANSWERS, Permission.EDIT_ANSWERS],
    } as never);

    const req = new Request("http://localhost/api/knowledge/answers/a1/audit", {
      headers: { "x-workspace-id": "ws-1" },
    });
    const res = await GET(req, { params: Promise.resolve({ id: "a1" }) });

    expect(res.status).toBe(200);
  });

  it("returns 403 when caller lacks both audit permissions", async () => {
    mockBuildContext.mockResolvedValue({
      userId: "u1",
      workspaceId: "ws-1",
      membershipId: "m1",
      role: "CONTRIBUTOR",
      permissions: [Permission.EDIT_ANSWERS],
    } as never);

    const req = new Request("http://localhost/api/knowledge/answers/a1/audit", {
      headers: { "x-workspace-id": "ws-1" },
    });
    const res = await GET(req, { params: Promise.resolve({ id: "a1" }) });

    expect(res.status).toBe(403);
    expect(mockListEnriched).not.toHaveBeenCalled();
  });
});
