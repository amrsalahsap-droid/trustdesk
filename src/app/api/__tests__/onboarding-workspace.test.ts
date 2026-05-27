import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

vi.mock("@/lib/auth/resolve-identity", () => ({
  resolveUserIdentity: vi.fn(),
}));

vi.mock("@/modules/onboarding", () => ({
  createWorkspaceDuringOnboarding: vi.fn(),
}));

import { resolveUserIdentity } from "@/lib/auth/resolve-identity";
import { createWorkspaceDuringOnboarding } from "@/modules/onboarding";
import {
  AuthenticationError,
  AlreadyOnboardedError,
  UserNotFoundError,
} from "@/lib/auth/errors";
import { POST } from "@/app/api/onboarding/workspace/route";

const mockResolveIdentity = vi.mocked(resolveUserIdentity);
const mockOnboard = vi.mocked(createWorkspaceDuringOnboarding);

beforeEach(() => {
  vi.clearAllMocks();
  mockOnboard.mockReset();
  mockResolveIdentity.mockReset();
});

function makeJsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/onboarding/workspace", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/onboarding/workspace", () => {
  it("returns 201 with workspaceId, workspaceName, workspaceSlug, and role on success", async () => {
    mockResolveIdentity.mockResolvedValue({ userId: "user-1" });
    mockOnboard.mockResolvedValue({
      workspaceId: "ws-new",
      workspaceName: "Acme Inc",
      workspaceSlug: "acme-inc",
      membershipId: "mem-new",
      role: "OWNER",
    });

    const res = await POST(makeJsonRequest({ workspaceName: "Acme Inc" }));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body).toEqual({
      workspaceId: "ws-new",
      workspaceName: "Acme Inc",
      workspaceSlug: "acme-inc",
      role: "OWNER",
    });
  });

  it("returns 409 when user is already onboarded", async () => {
    mockResolveIdentity.mockResolvedValue({ userId: "user-1" });
    mockOnboard.mockRejectedValue(new AlreadyOnboardedError());

    const res = await POST(makeJsonRequest({ workspaceName: "Acme" }));
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error.code).toBe("ALREADY_ONBOARDED");
  });

  it("returns 401 when user is not authenticated", async () => {
    mockResolveIdentity.mockRejectedValue(new AuthenticationError());

    const res = await POST(makeJsonRequest({ workspaceName: "Acme" }));
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error.code).toBe("UNAUTHENTICATED");
  });

  it("returns 404 when user is not found", async () => {
    mockResolveIdentity.mockResolvedValue({ userId: "user-1" });
    mockOnboard.mockRejectedValue(new UserNotFoundError());

    const res = await POST(makeJsonRequest({ workspaceName: "Acme" }));
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error.code).toBe("USER_NOT_FOUND");
  });

  it("returns 400 when workspaceName is missing", async () => {
    mockResolveIdentity.mockResolvedValue({ userId: "user-1" });

    const res = await POST(makeJsonRequest({}));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 when body has unknown keys (strict)", async () => {
    mockResolveIdentity.mockResolvedValue({ userId: "user-1" });

    const res = await POST(
      makeJsonRequest({ workspaceName: "Acme", userId: "evil", role: "OWNER" }),
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(mockOnboard).not.toHaveBeenCalled();
  });

  it("returns 400 when workspaceName is invalid per service Zod", async () => {
    mockResolveIdentity.mockResolvedValue({ userId: "user-1" });
    const invalid = z.string().min(2).safeParse("");
    expect(invalid.success).toBe(false);
    mockOnboard.mockRejectedValue(invalid.error);

    const res = await POST(makeJsonRequest({ workspaceName: "" }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.message).toBe("Invalid workspace name");
  });

  it("passes correct arguments to the onboarding service", async () => {
    mockResolveIdentity.mockResolvedValue({ userId: "user-1" });
    mockOnboard.mockResolvedValue({
      workspaceId: "ws",
      workspaceName: "Test",
      workspaceSlug: "test",
      membershipId: "mem",
      role: "OWNER",
    });

    await POST(makeJsonRequest({ workspaceName: "Test" }));

    expect(mockOnboard).toHaveBeenCalledWith({
      userId: "user-1",
      workspaceName: "Test",
    });
  });
});
