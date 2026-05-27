"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { Suspense } from "react";
import { SettingsLayout, type SettingsSection } from "@/components/settings/SettingsLayout";
import { GeneralSection } from "@/components/settings/GeneralSection";
import { TeamManagement } from "@/components/settings/TeamManagement";
import { IntegrationsSection } from "@/components/settings/IntegrationsSection";
import { SecuritySection } from "@/components/settings/SecuritySection";
import { AIPolicySection } from "@/components/settings/AIPolicySection";
import { ExportDefaultsSection } from "@/components/settings/ExportDefaultsSection";
import { DangerZoneSection } from "@/components/settings/DangerZoneSection";
import { AuditTrailSection } from "@/components/settings/AuditTrailSection";
import { PermissionsReferenceSection } from "@/components/settings/PermissionsReferenceSection";
import { usePermissions } from "@/lib/auth/use-permissions";
import { isWorkspaceAdmin } from "@/lib/auth/governance-actions";
import type { WorkspaceRole } from "@prisma/client";
import { Permission } from "@/lib/auth/permissions";
import { RouteGuard, UnauthorizedAlert } from "@/components/auth/RouteGuard";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircleIcon } from "@/components/icons";

function SettingsPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { context, loading: authLoading } = usePermissions();
  
  const activeSection = (searchParams.get("tab") as SettingsSection) || "general";
  
  const handleSectionChange = (value: SettingsSection) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", value);
    router.push(`/app/settings?${params.toString()}`);
  };

  if (authLoading) {
    return (
      <div className="animate-pulse space-y-8">
        <div className="h-10 w-64 bg-surface-hover rounded-lg" />
        <div className="flex gap-10">
          <div className="w-64 h-64 bg-surface-hover rounded-lg" />
          <div className="flex-1 h-96 bg-surface-hover rounded-xl" />
        </div>
      </div>
    );
  }

  // Use shared helper for admin check
  const isAdmin = context?.role ? isWorkspaceAdmin(context.role as WorkspaceRole) : false;

  const renderSection = () => {
    switch (activeSection) {
      case "general":
        return <GeneralSection />;
      case "team":
        return <TeamManagement />;
      case "role_matrix":
        return <PermissionsReferenceSection />;
      case "audit_trail":
        return <AuditTrailSection />;
      case "integrations":
        return <IntegrationsSection />;
      case "security":
        return <SecuritySection name={context?.name ?? ""} email={context?.email ?? ""} />;
      case "ai_policy":
        return <AIPolicySection />;
      case "export_defaults":
        return <ExportDefaultsSection />;
      case "danger":
        return <DangerZoneSection />;
      default:
        return <GeneralSection />;
    }
  };

  return (
    <RouteGuard requiredPermissions={[Permission.MANAGE_SETTINGS, Permission.MANAGE_MEMBERS, Permission.VIEW_AUDIT]}>
      <div className="pb-20">
        <UnauthorizedAlert />
        <div className="mb-10">
          <h1 className="text-3xl font-bold tracking-tight text-text-primary">Workspace Configuration</h1>
          <p className="text-text-muted mt-1 text-lg">Manage identity, team access, and AI governance policies.</p>
        </div>

        <SettingsLayout 
        activeSection={activeSection} 
        onSectionChange={handleSectionChange}
      >
        {renderSection()}
      </SettingsLayout>
      </div>
    </RouteGuard>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="animate-pulse h-96 bg-surface-hover rounded-xl" />}>
      <SettingsPageContent />
    </Suspense>
  );
}
