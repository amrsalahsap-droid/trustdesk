import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildAuthContext } from "../build-context";
import { AuthenticationError } from "../errors";

// We need to mock the sub-modules that buildAuthContext calls
vi.mock("../resolve-identity", () => ({
  resolveUserIdentity: vi.fn(),
}));

vi.mock("../resolve-membership", () => ({
  resolveWorkspaceMembership: vi.fn(),
}));

import { resolveUserIdentity } from "../resolve-identity";
import { resolveWorkspaceMembership } from "../resolve-membership";

const mockResolveIdentity = vi.mocked(resolveUserIdentity);
const mockResolveMembership = vi.mocked(resolveWorkspaceMembership);

beforeEach(() => {
  vi.clearAllMocks();
});

function makeRequest(url: string, headers?: Record<string, string>): Request {
  return new Request(url, { headers });
}

describe("buildAuthContext", () => {
  it("reads x-workspace-id from header", async () => {
    mockResolveIdentity.mockResolvedValue({ userId: "user-1" });
    mockResolveMembership.mockResolvedValue({
      workspaceId: "ws-1",
      membershipId: "mem-1",
      role: "OWNER",
    });

    const req = makeRequest("http://localhost/api/test", {
      "x-workspace-id": "ws-1",
    });

    const ctx = await buildAuthContext(req);

    expect(ctx.workspaceId).toBe("ws-1");
    expect(mockResolveMembership).toHaveBeenCalledWith({
      userId: "user-1",
      requestedWorkspaceId: "ws-1",
    });
  });

  it("falls back to query parameter when header is missing", async () => {
    mockResolveIdentity.mockResolvedValue({ userId: "user-1" });
    mockResolveMembership.mockResolvedValue({
      workspaceId: "ws-2",
      membershipId: "mem-2",
      role: "EDITOR",
    });

    const req = makeRequest("http://localhost/api/test?workspaceId=ws-2");

    const ctx = await buildAuthContext(req);

    expect(ctx.workspaceId).toBe("ws-2");
    expect(mockResolveMembership).toHaveBeenCalledWith({
      userId: "user-1",
      requestedWorkspaceId: "ws-2",
    });
  });

  it("passes null when neither header nor query param is present", async () => {
    mockResolveIdentity.mockResolvedValue({ userId: "user-1" });
    mockResolveMembership.mockResolvedValue({
      workspaceId: "ws-auto",
      membershipId: "mem-auto",
      role: "VIEWER",
    });

    const req = makeRequest("http://localhost/api/test");

    await buildAuthContext(req);

    expect(mockResolveMembership).toHaveBeenCalledWith({
      userId: "user-1",
      requestedWorkspaceId: null,
    });
  });

  it("throws AuthenticationError when session is missing", async () => {
    mockResolveIdentity.mockRejectedValue(new AuthenticationError());

    const req = makeRequest("http://localhost/api/test");

    await expect(buildAuthContext(req)).rejects.toThrow(AuthenticationError);
  });

  it("returns a complete AuthContext on success", async () => {
    mockResolveIdentity.mockResolvedValue({ userId: "user-1" });
    mockResolveMembership.mockResolvedValue({
      workspaceId: "ws-1",
      membershipId: "mem-1",
      role: "ADMIN",
    });

    const req = makeRequest("http://localhost/api/test", {
      "x-workspace-id": "ws-1",
    });

    const ctx = await buildAuthContext(req);

    expect(ctx).toEqual({
      userId: "user-1",
      workspaceId: "ws-1",
      membershipId: "mem-1",
      role: "ADMIN",
    });
  });
});
