import { InsufficientRoleError } from "./errors";
import type { AuthContext } from "./types";
import type { Permission } from "./permissions";

export function authorizeRole(ctx: AuthContext, allowed: AuthContext["role"][]): void {
  if (!allowed.includes(ctx.role)) {
    throw new InsufficientRoleError();
  }
}

/**
 * Authorizes a specific granular permission against the user's current context.
 */
export function authorizePermission(ctx: AuthContext, permission: Permission): void {
  if (!ctx.permissions.includes(permission)) {
    throw new InsufficientRoleError();
  }
}

/** True if the caller has at least one of the listed permissions. */
export function authorizeAnyPermission(ctx: AuthContext, permissions: Permission[]): void {
  if (!permissions.some((p) => ctx.permissions.includes(p))) {
    throw new InsufficientRoleError();
  }
}
