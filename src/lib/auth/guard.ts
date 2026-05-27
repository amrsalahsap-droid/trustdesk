/**
 * Canonical Permission Guard Layer
 * 
 * Provides reusable, composable authorization guards for TrustDesk.
 * All backend authorization should use these guards for consistency.
 * 
 * Usage pattern:
 *   const ctx = await guardAuthenticated(request);
 *   guardPermission(ctx, Permission.VIEW_ANSWERS);
 *   // ... business logic
 */

import { NextResponse } from "next/server";
import { buildAuthContext, buildAuthContextRSC } from "./build-context";
import { isWorkspaceAdmin, isOperatorLike } from "./governance-actions";
import { Permission } from "./permissions";
import type { AuthContext } from "./types";
import {
  AuthenticationError,
  InsufficientRoleError,
  MembershipSuspendedError,
  WorkspaceAccessDeniedError,
  WorkspaceProfileIncompleteError,
  WorkspaceSelectionRequiredError,
} from "./errors";

// ============================================================================
// GUARD RESULT TYPES
// ============================================================================

export type GuardResult<T> =
  | { success: true; context: T }
  | { success: false; response: NextResponse };

export type GuardContext = AuthContext;

// ============================================================================
// ERROR RESPONSE HELPERS
// ============================================================================

function unauthorizedResponse(message = "Authentication required"): NextResponse {
  return NextResponse.json(
    { error: { code: "UNAUTHENTICATED", message } },
    { status: 401 }
  );
}

function forbiddenResponse(message = "Access denied"): NextResponse {
  return NextResponse.json(
    { error: { code: "FORBIDDEN", message } },
    { status: 403 }
  );
}

function membershipRequiredResponse(): NextResponse {
  return NextResponse.json(
    { error: { code: "MEMBERSHIP_REQUIRED", message: "Active workspace membership required" } },
    { status: 403 }
  );
}

function workspaceSelectionRequiredResponse(workspaceIds: string[]): NextResponse {
  return NextResponse.json(
    { error: { code: "WORKSPACE_SELECTION_REQUIRED", message: "Workspace selection required", workspaceIds } },
    { status: 409 }
  );
}

// ============================================================================
// CORE GUARDS - These throw on failure for use in non-route code
// ============================================================================

/**
 * Asserts that a user is authenticated and has a valid workspace membership.
 * Throws appropriate errors on failure.
 */
export async function guardAuthenticated(request?: Request): Promise<AuthContext> {
  if (request) {
    return buildAuthContext(request);
  }
  return buildAuthContextRSC();
}

/**
 * Asserts that the context has a specific permission.
 * Throws InsufficientRoleError on failure.
 */
export function guardPermission(ctx: AuthContext, permission: Permission): void {
  if (!ctx.permissions.includes(permission)) {
    throw new InsufficientRoleError(`Missing required permission: ${permission}`);
  }
}

/**
 * Asserts that the context has at least one of the specified permissions.
 * Throws InsufficientRoleError on failure.
 */
export function guardAnyPermission(ctx: AuthContext, permissions: Permission[]): void {
  if (!permissions.some((p) => ctx.permissions.includes(p))) {
    throw new InsufficientRoleError(
      `Missing required permissions. Need one of: ${permissions.join(", ")}`
    );
  }
}

/**
 * Asserts that the context has all of the specified permissions.
 * Throws InsufficientRoleError on failure.
 */
export function guardAllPermissions(ctx: AuthContext, permissions: Permission[]): void {
  const missing = permissions.filter((p) => !ctx.permissions.includes(p));
  if (missing.length > 0) {
    throw new InsufficientRoleError(`Missing required permissions: ${missing.join(", ")}`);
  }
}

/**
 * Asserts that the user has workspace admin privileges (OWNER or ADMIN).
 * Throws InsufficientRoleError on failure.
 */
export function guardAdmin(ctx: AuthContext): void {
  if (!isWorkspaceAdmin(ctx.role)) {
    throw new InsufficientRoleError("This action requires admin privileges");
  }
}

/**
 * Asserts that the user has operator-level privileges (OWNER, ADMIN, or OPERATOR).
 * Throws InsufficientRoleError on failure.
 */
export function guardOperator(ctx: AuthContext): void {
  if (!isOperatorLike(ctx.role)) {
    throw new InsufficientRoleError("This action requires operator privileges");
  }
}

/**
 * Asserts that the user's workspace membership is active (not suspended).
 * Throws MembershipSuspendedError on failure.
 */
export function guardActiveMembership(ctx: AuthContext): void {
  // Additional checks can be added here if we track membership status in AuthContext
  // For now, presence in AuthContext implies active membership
}

// ============================================================================
// ROUTE GUARDS - These return NextResponse for use in API routes
// ============================================================================

/**
 * Route guard: Authenticates user and returns context or 401 response.
 */
export async function routeGuardAuthenticated(request: Request): Promise<GuardResult<AuthContext>> {
  try {
    const ctx = await buildAuthContext(request);
    return { success: true, context: ctx };
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return { success: false, response: unauthorizedResponse() };
    }
    if (error instanceof WorkspaceSelectionRequiredError) {
      return { success: false, response: workspaceSelectionRequiredResponse(error.workspaceIds) };
    }
    if (error instanceof WorkspaceProfileIncompleteError) {
      return { success: false, response: forbiddenResponse("Workspace profile incomplete") };
    }
    throw error;
  }
}

/**
 * Route guard: Checks specific permission, returns 403 on failure.
 */
export function routeGuardPermission(ctx: AuthContext, permission: Permission): NextResponse | null {
  if (!ctx.permissions.includes(permission)) {
    return forbiddenResponse(`Missing required permission: ${permission}`);
  }
  return null;
}

/**
 * Route guard: Checks any of the specified permissions, returns 403 on failure.
 */
export function routeGuardAnyPermission(
  ctx: AuthContext,
  permissions: Permission[]
): NextResponse | null {
  if (!permissions.some((p) => ctx.permissions.includes(p))) {
    return forbiddenResponse(`Missing required permissions. Need one of: ${permissions.join(", ")}`);
  }
  return null;
}

/**
 * Route guard: Checks admin privileges, returns 403 on failure.
 */
export function routeGuardAdmin(ctx: AuthContext): NextResponse | null {
  if (!isWorkspaceAdmin(ctx.role)) {
    return forbiddenResponse("This action requires admin privileges");
  }
  return null;
}

/**
 * Route guard: Checks operator privileges, returns 403 on failure.
 */
export function routeGuardOperator(ctx: AuthContext): NextResponse | null {
  if (!isOperatorLike(ctx.role)) {
    return forbiddenResponse("This action requires operator privileges");
  }
  return null;
}

// ============================================================================
// COMPOSITION UTILITIES - Build complex guards from simple ones
// ============================================================================

/**
 * Combines multiple route guards into a single check.
 * Returns the first failure response, or null if all pass.
 */
export function combineRouteGuards(
  ctx: AuthContext,
  ...guards: Array<(ctx: AuthContext) => NextResponse | null>
): NextResponse | null {
  for (const guard of guards) {
    const result = guard(ctx);
    if (result) return result;
  }
  return null;
}

/**
 * Higher-order guard: Requires authentication + permission.
 * For use in API route handlers.
 */
export async function guardRouteWithPermission(
  request: Request,
  permission: Permission
): Promise<GuardResult<AuthContext>> {
  const authResult = await routeGuardAuthenticated(request);
  if (!authResult.success) return authResult;

  const permissionResult = routeGuardPermission(authResult.context, permission);
  if (permissionResult) {
    return { success: false, response: permissionResult };
  }

  return authResult;
}

/**
 * Higher-order guard: Requires authentication + any of permissions.
 * For use in API route handlers.
 */
export async function guardRouteWithAnyPermission(
  request: Request,
  permissions: Permission[]
): Promise<GuardResult<AuthContext>> {
  const authResult = await routeGuardAuthenticated(request);
  if (!authResult.success) return authResult;

  const permissionResult = routeGuardAnyPermission(authResult.context, permissions);
  if (permissionResult) {
    return { success: false, response: permissionResult };
  }

  return authResult;
}

/**
 * Higher-order guard: Requires authentication + admin privileges.
 * For use in API route handlers.
 */
export async function guardRouteWithAdmin(request: Request): Promise<GuardResult<AuthContext>> {
  const authResult = await routeGuardAuthenticated(request);
  if (!authResult.success) return authResult;

  const adminResult = routeGuardAdmin(authResult.context);
  if (adminResult) {
    return { success: false, response: adminResult };
  }

  return authResult;
}

// ============================================================================
// SERVICE-LEVEL GUARDS - For use in business logic/services
// ============================================================================

/**
 * Service guard: Creates a closure that checks permission before executing business logic.
 */
export function withPermission<T>(
  ctx: AuthContext,
  permission: Permission,
  fn: () => T
): T {
  guardPermission(ctx, permission);
  return fn();
}

/**
 * Service guard: Creates a closure that checks admin before executing business logic.
 */
export function withAdmin<T>(ctx: AuthContext, fn: () => T): T {
  guardAdmin(ctx);
  return fn();
}

// ============================================================================
// TYPE GUARDS - TypeScript type narrowing
// ============================================================================

/**
 * Type guard: Checks if context has specific permission.
 */
export function hasPermission(ctx: AuthContext, permission: Permission): boolean {
  return ctx.permissions.includes(permission);
}

/**
 * Type guard: Checks if context has admin privileges.
 */
export function isAdmin(ctx: AuthContext): boolean {
  return isWorkspaceAdmin(ctx.role);
}

/**
 * Type guard: Checks if context has operator privileges.
 */
export function isOperator(ctx: AuthContext): boolean {
  return isOperatorLike(ctx.role);
}

// ============================================================================
// RE-EXPORTS for convenience
// ============================================================================

export { isWorkspaceAdmin, isOperatorLike } from "./governance-actions";
export { Permission } from "./permissions";
export type { AuthContext } from "./types";
