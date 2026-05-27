"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { 
  BuildingIcon, 
  UsersIcon, 
  DatabaseIcon, 
  LockIcon, 
  SparklesIcon, 
  DownloadIcon, 
  AlertCircleIcon,
  ChevronRightIcon
} from "@/components/icons";

import { usePermissions } from "@/lib/auth/use-permissions";
import { Permission } from "@/lib/auth/permissions";

export type SettingsSection = 
  | "general" 
  | "team" 
  | "integrations" 
  | "security" 
  | "ai_policy" 
  | "export_defaults" 
  | "audit_trail"
  | "role_matrix"
  | "danger";

interface SettingsLayoutProps {
  activeSection: SettingsSection;
  onSectionChange: (section: SettingsSection) => void;
  children: React.ReactNode;
}

interface NavItem {
  id: SettingsSection;
  label: string;
  icon: any;
  requiredPermission?: Permission;
}

const NAV_ITEMS: NavItem[] = [
  { id: "general", label: "General", icon: BuildingIcon },
  { id: "team", label: "Team & Access", icon: UsersIcon, requiredPermission: Permission.MANAGE_MEMBERS },
  { id: "role_matrix", label: "Role Matrix", icon: LockIcon },
  { id: "audit_trail", label: "Audit Trail", icon: DatabaseIcon, requiredPermission: Permission.VIEW_AUDIT },
  { id: "integrations", label: "Integrations", icon: DatabaseIcon },
  { id: "security", label: "Security & Sessions", icon: LockIcon },
  { id: "ai_policy", label: "AI & Answer Policy", icon: SparklesIcon, requiredPermission: Permission.MANAGE_SETTINGS },
  { id: "export_defaults", label: "Export Defaults", icon: DownloadIcon, requiredPermission: Permission.MANAGE_SETTINGS },
  { id: "danger", label: "Danger Zone", icon: AlertCircleIcon, requiredPermission: Permission.MANAGE_SETTINGS },
];

export function SettingsLayout({ activeSection, onSectionChange, children }: SettingsLayoutProps) {
  const { hasPermission } = usePermissions();
  const visibleItems = NAV_ITEMS.filter(item => !item.requiredPermission || hasPermission(item.requiredPermission));

  return (
    <div className="flex flex-col lg:flex-row gap-10 min-h-[600px]">
      {/* Sidebar Navigation */}
      <aside className="w-full lg:w-64 shrink-0">
        <nav className="flex flex-col gap-1 sticky top-6">
          {visibleItems.map((item) => {
            const isActive = activeSection === item.id;
            const Icon = item.icon;
            
            return (
              <button
                key={item.id}
                onClick={() => onSectionChange(item.id)}
                className={cn(
                  "flex items-center gap-3 px-4 py-2.5 text-sm font-medium rounded-lg transition-all group",
                  isActive 
                    ? "bg-accent-primary/[0.06] text-accent-primary" 
                    : "text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                )}
              >
                <Icon className={cn(
                  "h-4.5 w-4.5 transition-colors",
                  isActive ? "text-accent-primary" : "text-text-muted group-hover:text-text-secondary"
                )} />
                <span className="flex-1 text-left">{item.label}</span>
                {isActive && <ChevronRightIcon className="h-3.5 w-3.5 opacity-50" />}
              </button>
            );
          })}
        </nav>
      </aside>

      {/* Content Area */}
      <main className="flex-1 min-w-0 max-w-4xl">
        <div className="animate-page-fade">
          {children}
        </div>
      </main>
    </div>
  );
}
