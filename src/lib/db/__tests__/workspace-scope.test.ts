import { describe, it, expect } from "vitest";
import type { AuthContext } from "@/lib/auth/types";
import { workspaceWhere, workspaceCreateData, workspaceUpdateWhere } from "../workspace-scope";

const ctx: AuthContext = {
  userId: "user-1",
  workspaceId: "ws-tenant-a",
  membershipId: "mem-1",
  role: "EDITOR",
};

describe("workspaceWhere", () => {
  it("always sets workspaceId from ctx", () => {
    expect(workspaceWhere(ctx)).toEqual({ workspaceId: "ws-tenant-a" });
  });

  it("merges additional predicates and overwrites any workspaceId on input", () => {
    expect(
      workspaceWhere(ctx, {
        id: "doc-1",
        workspaceId: "ws-evil",
        deleted: false,
      }),
    ).toEqual({
      id: "doc-1",
      deleted: false,
      workspaceId: "ws-tenant-a",
    });
  });
});

describe("workspaceCreateData", () => {
  it("injects workspaceId and drops client workspaceId", () => {
    const data = workspaceCreateData(ctx, {
      fileName: "a.pdf",
      storageKey: "key",
      workspaceId: "ws-evil",
    } as Record<string, unknown>);
    expect(data).toEqual({
      fileName: "a.pdf",
      storageKey: "key",
      workspaceId: "ws-tenant-a",
    });
  });
});

describe("workspaceUpdateWhere", () => {
  it("builds id + workspace scoped where", () => {
    expect(workspaceUpdateWhere(ctx, "id", "doc-1")).toEqual({
      id: "doc-1",
      workspaceId: "ws-tenant-a",
    });
  });
});
