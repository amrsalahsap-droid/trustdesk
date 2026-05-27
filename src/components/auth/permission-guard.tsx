"use client";

import { usePermissions } from "@/lib/auth/use-permissions";
import { Permission } from "@/lib/auth/permissions";
import { ReactNode } from "react";

interface PermissionGuardProps {
  children: ReactNode;
  fallback?: ReactNode;
  permission?: Permission;
  permissions?: Permission[];
  requireAll?: boolean;
  check?: (context: any) => boolean;
  showFallback?: boolean;
  fallbackMessage?: string;
}

/**
 * A client-side guard that only renders children if the user has the required permissions.
 */
export function PermissionGuard({
  children,
  fallback = null,
  permission,
  permissions,
  requireAll = false,
  check,
  showFallback = false,
  fallbackMessage = "You don't have permission to perform this action.",
}: PermissionGuardProps) {
  const { hasPermission, hasAnyPermission, hasAllPermissions, loading, context } = usePermissions();

  if (loading) return null;

  let allowed = false;

  if (permission) {
    allowed = hasPermission(permission);
  } else if (permissions) {
    allowed = requireAll ? hasAllPermissions(permissions) : hasAnyPermission(permissions);
  } else if (check && context) {
    allowed = check(context);
  }

  if (!allowed) {
    if (showFallback) {
      return (
        <div className="rounded-md bg-semantic-error/5 border border-semantic-error/10 p-3 text-xs text-semantic-error">
          {fallbackMessage}
        </div>
      );
    }
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
