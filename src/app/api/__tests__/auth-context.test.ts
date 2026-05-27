import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/build-context", () => ({
  buildAuthContext: vi.fn(),
}));

import { buildAuthContext } from "@/lib/auth/build-context";
import {
  AuthenticationError,
  NoWorkspaceAccessError,
  WorkspaceSelectionRequiredError,
} from "@/lib/auth/errors";
import { GET } from "@/app/api/auth/context/route";

const mockBuildContext = vi.mocked(buildAuthContext);

beforeEach(() => {
  vi.clearAllMocks();
  mockBuildContext.mockReset();
});

function makeRequest(
  url = "http://localhost/api/auth/context",
  headers?: Record<string, string>,
): Request {
  return new Request(url, { headers });
}

describe("GET /api/auth/context", () => {
  it("returns context for a single-workspace user", async () => {
    mockBuildContext.mockResolvedValue({
      userId: "user-1",
      workspaceId: "ws-1",
      membershipId: "mem-1",
      role: "OWNER",
    });

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({
      userId: "user-1",
      workspaceId: "ws-1",
      role: "OWNER",
    });
  });

  it("returns requiresWorkspaceSelection for multi-workspace user", async () => {
    mockBuildContext.mockRejectedValue(new WorkspaceSelectionRequiredError(["ws-1", "ws-2"]));

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.requiresWorkspaceSelection).toBe(true);
    expect(body.workspaceIds).toEqual(["ws-1", "ws-2"]);
  });

  it("returns 401 for unauthenticated user", async () => {
    mockBuildContext.mockRejectedValue(new AuthenticationError());

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error.code).toBe("UNAUTHENTICATED");
  });

  it("returns 403 when user has no workspace access", async () => {
    mockBuildContext.mockRejectedValue(new NoWorkspaceAccessError());

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error.code).toBe("NO_WORKSPACE_ACCESS");
  });

  it("passes request through to buildAuthContext for header-based workspace hint", async () => {
    mockBuildContext.mockResolvedValue({
      userId: "user-1",
      workspaceId: "ws-specific",
      membershipId: "mem-specific",
      role: "ADMIN",
    });

    const req = makeRequest("http://localhost/api/auth/context", {
      "x-workspace-id": "ws-specific",
    });

    await GET(req);

    expect(mockBuildContext).toHaveBeenCalledWith(req);
  });
});
