"use client";

import { useEffect, useState } from "react";
import { Permission } from "@/lib/auth/permissions";

interface AuthContext {
  userId: string;
  workspaceId: string;
  role: string;
  permissions: Permission[];
  name?: string;
  email?: string;
}

export function usePermissions() {
  const [context, setContext] = useState<AuthContext | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchContext() {
      try {
        const res = await fetch("/api/auth/context");
        if (res.ok) {
          const data = await res.json();
          setContext(data);
        }
      } catch (err) {
        console.error("Failed to fetch auth context", err);
      } finally {
        setLoading(false);
      }
    }
    fetchContext();
  }, []);

  const hasPermission = (permission: Permission) => {
    return context?.permissions?.includes(permission) ?? false;
  };

  const hasAnyPermission = (permissions: Permission[]) => {
    return permissions.some(p => hasPermission(p));
  };

  const hasAllPermissions = (permissions: Permission[]) => {
    return permissions.every(p => hasPermission(p));
  };

  return {
    context,
    loading,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    role: context?.role,
    name: context?.name,
    email: context?.email,
  };
}
