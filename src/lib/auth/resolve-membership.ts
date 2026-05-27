import { AUDIT_EVENT_TYPES, AUDIT_OBJECT_TYPES, recordAuditEventSafe } from "@/lib/audit";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logging/logger";
import {
  NoWorkspaceAccessError,
  WorkspaceAccessDeniedError,
  WorkspaceSelectionRequiredError,
  MembershipSuspendedError,
} from "./errors";
import type { MembershipResolution } from "./types";
import { getPermissionsForRole } from "./permissions";

interface ResolveMembershipParams {
  userId: string;
  requestedWorkspaceId?: string | null;
}

export async function resolveWorkspaceMembership(
  params: ResolveMembershipParams,
): Promise<MembershipResolution> {
  const { userId, requestedWorkspaceId } = params;

  // 1. Authoritative Membership Fetch + User Preference
  let memberships: Awaited<ReturnType<typeof prisma.workspaceMembership.findMany>>;
  let user: Awaited<ReturnType<typeof prisma.user.findUnique>>;
  
  try {
    [memberships, user] = await Promise.all([
      prisma.workspaceMembership.findMany({
        where: {
          userId,
          status: "ACTIVE",
          workspace: { status: "ACTIVE" },
        },
        select: {
          id: true,
          workspaceId: true,
          role: true,
          workspace: {
            select: {
              industry: true,
            },
          },
        },
      }),
      prisma.user.findUnique({
        where: { id: userId },
        select: { lastActiveWorkspaceId: true }
      })
    ]);
  } catch (dbError) {
    // Log detailed error for debugging in dev
    logger.error("auth:resolve-membership:db-error", {
      userId,
      error: dbError instanceof Error ? dbError.message : String(dbError),
      code: (dbError as { code?: string }).code,
    });
    
    // Re-throw with helpful message for error boundary
    if (dbError instanceof Error && dbError.message.includes("P1000")) {
      throw new Error(`Database authentication failed. Check your DATABASE_URL environment variable.`);
    }
    throw dbError;
  }

  // 2. Fail-Closed: No memberships found at all
  if (memberships.length === 0) {
    // If they specifically requested one, let's see if it exists but is inactive
    if (requestedWorkspaceId) {
      const inactiveMembership = await prisma.workspaceMembership.findUnique({
        where: {
          userId_workspaceId: { userId, workspaceId: requestedWorkspaceId }
        },
        select: { status: true }
      });
      if (inactiveMembership) {
        if (inactiveMembership.status === "SUSPENDED") {
          throw new MembershipSuspendedError();
        }
        throw new WorkspaceAccessDeniedError("Membership is " + inactiveMembership.status.toLowerCase());
      }
    }

    logger.warn("auth:resolve-membership:no-access", { userId });
    throw new NoWorkspaceAccessError();
  }

  // 3. Resolve with Hint (treated as non-authoritative hint only)
  const hintId = requestedWorkspaceId || user?.lastActiveWorkspaceId;

  if (hintId) {
    const match = memberships.find((m) => m.workspaceId === hintId);

    if (match) {
      const source = requestedWorkspaceId ? "hint-match" : "last-active-match";
      logger.info(`auth:resolve-membership:${source}`, {
        userId,
        workspaceId: match.workspaceId,
      });
      return {
        workspaceId: match.workspaceId,
        membershipId: match.id,
        role: match.role,
        permissions: getPermissionsForRole(match.role),
        isProfileComplete: match.workspace.industry.length > 0,
      };
    } else if (requestedWorkspaceId) {
      // Ignore and Replace: Specifically requested ID was invalid (belonged to another user or was stale)
      logger.warn("auth:resolve-membership:stale-hint-ignored", {
        userId,
        requestedWorkspaceId,
      });
    } else {
      // Stale lastActiveWorkspaceId - ignore silently as it's just a preference
      logger.info("auth:resolve-membership:stale-last-active-ignored", {
        userId,
        lastActiveWorkspaceId: user?.lastActiveWorkspaceId
      });
    }
  }

  // 4. Fallback to Authoritative Selection
  if (memberships.length === 1) {
    const only = memberships[0];
    logger.info("auth:resolve-membership:auto-selected", {
      userId,
      workspaceId: only.workspaceId,
    });
    return {
      workspaceId: only.workspaceId,
      membershipId: only.id,
      role: only.role,
      permissions: getPermissionsForRole(only.role),
      isProfileComplete: only.workspace.industry.length > 0,
    };
  }

  // Multiple options and no valid hint -> Force Selection
  logger.info("auth:resolve-membership:selection-required", {
    userId,
    workspaceCount: memberships.length,
  });

  throw new WorkspaceSelectionRequiredError(memberships.map((m) => m.workspaceId));
}
