import { buildAuthContext } from "./build-context";
import { InsufficientRoleError, AuthenticationError } from "./errors";
import { recordAuditEventSafe, AUDIT_EVENT_TYPES, AUDIT_OBJECT_TYPES } from "@/lib/audit";
import { AuthContext } from "./types";

/**
 * Guard for administrative routes.
 * Ensures the user is authenticated and has either ADMIN or OWNER role.
 * Logs both successful and denied access attempts.
 */
export async function buildAdminAuthContext(request: Request): Promise<AuthContext> {
  const url = new URL(request.url);
  const path = url.pathname;

  try {
    const context = await buildAuthContext(request);

    // Only ADMIN and OWNER roles are allowed for admin operations
    if (context.role !== "ADMIN" && context.role !== "OWNER") {
      await recordAuditEventSafe({
        workspaceId: context.workspaceId,
        userId: context.userId,
        eventType: AUDIT_EVENT_TYPES.ADMIN_ACCESS_DENIED,
        objectType: AUDIT_OBJECT_TYPES.AUTH_CONTEXT,
        objectId: context.userId,
        metadata: {
          path,
          reason: "insufficient_role",
          role: context.role,
        },
      });
      throw new InsufficientRoleError("Admin access required");
    }

    // Success audit log
    await recordAuditEventSafe({
      workspaceId: context.workspaceId,
      userId: context.userId,
      eventType: AUDIT_EVENT_TYPES.ADMIN_ACCESS_GRANTED,
      objectType: AUDIT_OBJECT_TYPES.AUTH_CONTEXT,
      objectId: context.userId,
      metadata: {
        path,
        role: context.role,
      },
    });

    return context;
  } catch (error) {
    // If it's already an InsufficientRoleError, it was handled above
    if (error instanceof InsufficientRoleError) {
      throw error;
    }

    // Handle authentication errors specifically for logging if needed
    if (error instanceof AuthenticationError) {
       // We don't have a userId here, so we log with minimal info
       console.warn(`[AdminGuard] Unauthenticated access attempt to ${path}`);
       throw error;
    }

    // Re-throw other errors (NoWorkspaceAccessError, etc.)
    throw error;
  }
}
