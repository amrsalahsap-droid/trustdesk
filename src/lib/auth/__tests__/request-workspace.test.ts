import { describe, it, expect } from "vitest";
import { getRequestedWorkspaceIdFromRequest } from "../request-workspace";

describe("getRequestedWorkspaceIdFromRequest", () => {
  it("returns null when header and query are absent", () => {
    const req = new Request("http://localhost/api/foo");
    expect(getRequestedWorkspaceIdFromRequest(req)).toBeNull();
  });

  it("prefers x-workspace-id header over query param", () => {
    const req = new Request("http://localhost/api/foo?workspaceId=from-query", {
      headers: { "x-workspace-id": "from-header" },
    });
    expect(getRequestedWorkspaceIdFromRequest(req)).toBe("from-header");
  });

  it("uses query param when header is missing", () => {
    const req = new Request("http://localhost/api/foo?workspaceId=ws-2");
    expect(getRequestedWorkspaceIdFromRequest(req)).toBe("ws-2");
  });

  it("returns null for whitespace-only header", () => {
    const req = new Request("http://localhost/api/foo", {
      headers: { "x-workspace-id": "   " },
    });
    expect(getRequestedWorkspaceIdFromRequest(req)).toBeNull();
  });
});
