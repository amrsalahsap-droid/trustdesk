import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/resolve-identity", () => ({
  resolveUserIdentity: vi.fn(),
}));

vi.mock("@/modules/workspaces/create-workspace", () => ({
  createWorkspaceForUser: vi.fn(),
}));

vi.mock("@/lib/auth/resolve-membership", () => ({
  resolveWorkspaceMembership: vi.fn(),
}));

import { resolveUserIdentity } from "@/lib/auth/resolve-identity";
import { createWorkspaceForUser } from "@/modules/workspaces/create-workspace";
import { resolveWorkspaceMembership } from "@/lib/auth/resolve-membership";
import {
  AuthenticationError,
  NoWorkspaceAccessError,
  WorkspaceAccessDeniedError,
} from "@/lib/auth/errors";
import { POST as createWorkspace } from "@/app/api/workspaces/route";
import { POST as selectWorkspace } from "@/app/api/workspaces/select/route";

const mockResolveIdentity = vi.mocked(resolveUserIdentity);
const mockCreateWorkspace = vi.mocked(createWorkspaceForUser);
const mockResolveMembership = vi.mocked(resolveWorkspaceMembership);

beforeEach(() => {
  vi.clearAllMocks();
  mockResolveMembership.mockReset();
});

function makeJsonRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/workspaces", () => {
  it("creates a workspace and returns 201", async () => {
    mockResolveIdentity.mockResolvedValue({ userId: "user-1" });
    mockCreateWorkspace.mockResolvedValue({
      workspace: {
        id: "ws-new",
        name: "Acme Inc",
        slug: "acme-inc",
      },
      membership: {
        id: "mem-new",
        userId: "user-1",
        workspaceId: "ws-new",
        role: "OWNER",
        status: "ACTIVE",
      },
    } as never);

    const req = makeJsonRequest("http://localhost/api/workspaces", {
      name: "Acme Inc",
    });
    const res = await createWorkspace(req);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.workspace.name).toBe("Acme Inc");
    expect(body.membership.role).toBe("OWNER");
  });

  it("returns 400 for invalid body (missing name)", async () => {
    mockResolveIdentity.mockResolvedValue({ userId: "user-1" });

    const req = makeJsonRequest("http://localhost/api/workspaces", {});
    const res = await createWorkspace(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 for empty name", async () => {
    mockResolveIdentity.mockResolvedValue({ userId: "user-1" });

    const req = makeJsonRequest("http://localhost/api/workspaces", { name: "" });
    const res = await createWorkspace(req);

    expect(res.status).toBe(400);
  });

  it("returns 401 when not authenticated", async () => {
    mockResolveIdentity.mockRejectedValue(new AuthenticationError());

    const req = makeJsonRequest("http://localhost/api/workspaces", {
      name: "Test",
    });
    const res = await createWorkspace(req);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error.code).toBe("UNAUTHENTICATED");
  });
});

describe("POST /api/workspaces/select", () => {
  it("validates membership and returns context", async () => {
    mockResolveIdentity.mockResolvedValue({ userId: "user-1" });
    mockResolveMembership.mockResolvedValue({
      workspaceId: "ws-1",
      membershipId: "mem-1",
      role: "EDITOR",
    });

    const req = makeJsonRequest("http://localhost/api/workspaces/select", {
      workspaceId: "ws-1",
    });
    const res = await selectWorkspace(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({
      userId: "user-1",
      workspaceId: "ws-1",
      membershipId: "mem-1",
      role: "EDITOR",
    });
  });

  it("blocks cross-tenant access", async () => {
    mockResolveIdentity.mockResolvedValue({ userId: "user-1" });
    mockResolveMembership.mockRejectedValue(new WorkspaceAccessDeniedError());

    const req = makeJsonRequest("http://localhost/api/workspaces/select", {
      workspaceId: "ws-other-tenant",
    });
    const res = await selectWorkspace(req);
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error.code).toBe("WORKSPACE_ACCESS_DENIED");
  });

  it("returns 403 when user has no active workspace memberships", async () => {
    mockResolveIdentity.mockResolvedValue({ userId: "user-1" });
    mockResolveMembership.mockRejectedValue(new NoWorkspaceAccessError());

    const req = makeJsonRequest("http://localhost/api/workspaces/select", {
      workspaceId: "ws-1",
    });
    const res = await selectWorkspace(req);
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error.code).toBe("NO_WORKSPACE_ACCESS");
  });

  it("returns 400 when body has unknown keys (strict)", async () => {
    mockResolveIdentity.mockResolvedValue({ userId: "user-1" });

    const req = makeJsonRequest("http://localhost/api/workspaces/select", {
      workspaceId: "ws-1",
      userId: "evil",
    });
    const res = await selectWorkspace(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(mockResolveMembership).not.toHaveBeenCalled();
  });

  it("returns 400 for missing workspaceId", async () => {
    mockResolveIdentity.mockResolvedValue({ userId: "user-1" });

    const req = makeJsonRequest("http://localhost/api/workspaces/select", {});
    const res = await selectWorkspace(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 401 when not authenticated", async () => {
    mockResolveIdentity.mockRejectedValue(new AuthenticationError());

    const req = makeJsonRequest("http://localhost/api/workspaces/select", {
      workspaceId: "ws-1",
    });
    const res = await selectWorkspace(req);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error.code).toBe("UNAUTHENTICATED");
  });
});
