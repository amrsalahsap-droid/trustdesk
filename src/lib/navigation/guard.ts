import { WorkspaceRole } from "@prisma/client";
import { NAVIGATION_CONFIG } from "./config";
import { hasPermission } from "../auth/permissions";

/**
 * Validates if a user role has access to a specific application route.
 * Uses NAVIGATION_CONFIG as the single source of truth for required permissions.
 */
export function validateRouteAccess(pathname: string, role: WorkspaceRole): boolean {
  // 1. Exact match priority
  let match = NAVIGATION_CONFIG.find(item => item.href === pathname);
  
  // 2. Prefix match fallback (for sub-routes)
  if (!match) {
    // Sort by length descending to match most specific sub-route first
    const sortedConfig = [...NAVIGATION_CONFIG].sort((a, b) => b.href.length - a.href.length);
    match = sortedConfig.find(item => {
      // Don't match the root '/app' against everything
      if (item.href === "/app") return pathname === "/app";
      return pathname.startsWith(item.href);
    });
  }

  // If no config entry exists for this path, we assume it's a shared/public-app area (like Dashboard)
  if (!match || !match.requiredPermissions) return true;

  const required = Array.isArray(match.requiredPermissions)
    ? match.requiredPermissions
    : [match.requiredPermissions];

  // User must have at least one of the required permissions
  return required.some(p => hasPermission(role, p));
}
