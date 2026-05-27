import { logger } from "@/lib/logging/logger";
import { resolveUserIdentity } from "./resolve-identity";
import { resolveWorkspaceMembership } from "./resolve-membership";
import { getRequestedWorkspaceIdFromRequest, getRequestedWorkspaceIdFromRSC } from "./request-workspace";
import type { AuthContext } from "./types";
import { WorkspaceProfileIncompleteError } from "./errors";
import { cache } from "react";

/**
 * Builds auth context for API handlers (Route Handlers).
 * Wrapped in React cache to prevent redundant DB hits within a single request.
 */
export const buildAuthContext = cache(async (request: Request): Promise<AuthContext> => {
  const { userId } = await resolveUserIdentity();

  const requestedWorkspaceId = getRequestedWorkspaceIdFromRequest(request);

  const membership = await resolveWorkspaceMembership({
    userId,
    requestedWorkspaceId,
  });

  if (!membership.isProfileComplete) {
    throw new WorkspaceProfileIncompleteError(membership.workspaceId);
  }

  logger.info("auth:build-context:ok", {
    userId,
    workspaceId: membership.workspaceId,
    role: membership.role,
  });

  return {
    userId,
    workspaceId: membership.workspaceId,
    membershipId: membership.membershipId,
    role: membership.role,
    permissions: membership.permissions,
  };
});

/**
 * Builds auth context for React Server Components (Layouts/Pages).
 * Wrapped in React cache to prevent redundant DB hits within a single request.
 */
export const buildAuthContextRSC = cache(async (): Promise<AuthContext> => {
  let userId: string;
  
  try {
    const identity = await resolveUserIdentity();
    userId = identity.userId;
  } catch (error) {
    logger.error("auth:build-context-rsc:identity-failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }

  const requestedWorkspaceId = await getRequestedWorkspaceIdFromRSC();

  let membership: Awaited<ReturnType<typeof resolveWorkspaceMembership>>;
  
  try {
    membership = await resolveWorkspaceMembership({
      userId,
      requestedWorkspaceId,
    });
  } catch (error) {
    // Log context for debugging but don't swallow the error
    logger.error("auth:build-context-rsc:membership-failed", {
      userId,
      requestedWorkspaceId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }

  if (!membership.isProfileComplete) {
    throw new WorkspaceProfileIncompleteError(membership.workspaceId);
  }

  logger.info("auth:build-context-rsc:ok", {
    userId,
    workspaceId: membership.workspaceId,
    role: membership.role,
  });

  return {
    userId,
    workspaceId: membership.workspaceId,
    membershipId: membership.membershipId,
    role: membership.role,
    permissions: membership.permissions,
  };
});

