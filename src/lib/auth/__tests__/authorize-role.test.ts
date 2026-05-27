import { describe, it, expect } from "vitest";
import { authorizeRole } from "../authorize-role";
import { InsufficientRoleError } from "../errors";
import type { AuthContext } from "../types";

function makeContext(role: AuthContext["role"]): AuthContext {
  return {
    userId: "user-1",
    workspaceId: "ws-1",
    membershipId: "mem-1",
    role,
  };
}

describe("authorizeRole", () => {
  it("does not throw when the role is in the allowed list", () => {
    expect(() => authorizeRole(makeContext("ADMIN"), ["OWNER", "ADMIN"])).not.toThrow();
  });

  it("does not throw for exact match with single allowed role", () => {
    expect(() => authorizeRole(makeContext("VIEWER"), ["VIEWER"])).not.toThrow();
  });

  it("throws InsufficientRoleError when role is not allowed", () => {
    expect(() => authorizeRole(makeContext("VIEWER"), ["OWNER", "ADMIN"])).toThrow(
      InsufficientRoleError,
    );
  });

  it("throws InsufficientRoleError for EDITOR when only OWNER allowed", () => {
    expect(() => authorizeRole(makeContext("EDITOR"), ["OWNER"])).toThrow(InsufficientRoleError);
  });

  it("passes for every role when all roles are allowed", () => {
    const allRoles: AuthContext["role"][] = ["OWNER", "ADMIN", "EDITOR", "VIEWER"];

    for (const role of allRoles) {
      expect(() => authorizeRole(makeContext(role), allRoles)).not.toThrow();
    }
  });
});
