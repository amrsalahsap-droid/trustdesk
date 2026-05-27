"use client";

/**
 * Client-side Route Guard Component
 * 
 * Provides a fallback layer for route protection.
 * Server-side middleware is the primary defense; this catches edge cases.
 */

import { useEffect } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { usePermissions } from "@/lib/auth/use-permissions";
import { Permission } from "@/lib/auth/permissions";
import { getLandingDestination } from "@/lib/navigation/landing-destinations";

interface RouteGuardProps {
  children: React.ReactNode;
  requiredPermissions?: Permission | Permission[];
  fallbackUrl?: string;
}

export function RouteGuard({
  children,
  requiredPermissions,
  fallbackUrl,
}: RouteGuardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { role, hasPermission, loading } = usePermissions();

  useEffect(() => {
    if (loading || !role) return;

    // If no permissions required, allow access
    if (!requiredPermissions) {
      return;
    }

    // DEBUG: Log permission check details
    console.log(`[DEBUG RouteGuard] Role: ${role}`);
    console.log(`[DEBUG RouteGuard] Required permissions:`, requiredPermissions);
    if (Array.isArray(requiredPermissions)) {
      requiredPermissions.forEach(p => {
        console.log(`[DEBUG RouteGuard] Has ${p}:`, hasPermission(p));
      });
    }

    // Check permissions
    const hasAccess = Array.isArray(requiredPermissions)
      ? requiredPermissions.some((p) => hasPermission(p))
      : hasPermission(requiredPermissions);
    
    console.log(`[DEBUG RouteGuard] Has access: ${hasAccess}`);

    if (!hasAccess) {
      // Redirect to fallback or best allowed destination
      const redirectTo = fallbackUrl || getLandingDestination(role);
      console.log(`[DEBUG RouteGuard] Redirecting to: ${redirectTo}`);
      
      // Don't redirect if already at destination
      if (pathname !== redirectTo) {
        const url = new URL(redirectTo, window.location.origin);
        url.searchParams.set("unauthorized", "true");
        url.searchParams.set("attempted", pathname);
        router.replace(url.toString());
      }
    }
  }, [role, hasPermission, loading, pathname, router, requiredPermissions, fallbackUrl]);

  // Show nothing while checking (prevents flash of unauthorized content)
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent-primary" />
      </div>
    );
  }

  return <>{children}</>;
}

/**
 * Unauthorized Access Alert Component
 * Displays when user is redirected from an unauthorized page
 */
export function UnauthorizedAlert() {
  const searchParams = useSearchParams();
  const attempted = searchParams.get("attempted");

  if (!attempted) return null;

  return (
    <div className="bg-error-bg border border-error-border text-error-text px-4 py-3 rounded-lg mb-4">
      <p className="font-semibold">Access Restricted</p>
      <p className="text-sm">
        You don&apos;t have permission to access {attempted}. You have been redirected to an available page.
      </p>
    </div>
  );
}
