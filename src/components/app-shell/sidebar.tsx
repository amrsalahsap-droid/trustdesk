"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutIcon,
  ClipboardIcon,
  FileIcon,
  BookIcon,
  ShieldCheckIcon,
  SettingsIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  UserIcon,
  ActivityIcon,
  BuildingIcon,
  DatabaseIcon,
  ClockIcon
} from "@/components/icons";
import { cn } from "@/lib/utils";
import { BrandMark } from "./brand-mark";
import { WorkspaceSwitcher } from "./workspace-switcher";
import { NAVIGATION_CONFIG } from "@/lib/navigation/config";
import { usePermissions } from "@/lib/auth/use-permissions";
import { Permission } from "@/lib/auth/permissions";
import { isWorkspaceAdmin } from "@/lib/auth/governance-actions";
import type { WorkspaceRole } from "@prisma/client";
import { useEffect, useCallback } from "react";
import type { GovernanceCount } from "@/components/library/governance-queue-bar";


function isActive(pathname: string, href: string): boolean {
  return href === "/app" ? pathname === "/app" : pathname.startsWith(href);
}

function navItemClasses({
  active,
  collapsed,
  className,
}: {
  active: boolean;
  collapsed: boolean;
  className?: string;
}) {
  return cn(
    "relative flex h-8 items-center gap-2.5 rounded-md text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/25 focus-visible:ring-offset-0",
    collapsed ? "justify-center px-0" : "px-2.5",
    active
      ? "bg-accent-primary/[0.08] font-semibold text-accent-primary before:absolute before:bottom-1.5 before:left-0 before:top-1.5 before:w-[3px] before:rounded-r-full before:bg-accent-primary shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1)]"
      : "text-text-secondary hover:bg-surface-hover hover:text-text-primary hover:translate-x-0.5",
    className,
  );
}

function NavItem({
  label,
  href,
  icon: Icon,
  active,
  collapsed,
  badge,
  badgeTone = "default",
}: {
  label: string;
  href: string;
  icon: any;
  active: boolean;
  collapsed: boolean;
  badge?: number;
  badgeTone?: "default" | "error" | "warning";
}) {
  return (
    <li>
      <Link
        href={href}
        title={collapsed ? label : undefined}
        className={navItemClasses({ active, collapsed })}
      >
        <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden />
        {!collapsed && (
          <>
            <span className="min-w-0 flex-1 truncate tracking-[-0.005em]">{label}</span>
            {badge !== undefined && badge > 0 && (
              <span
                className={cn(
                  "ml-auto flex h-4.5 min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold tabular-nums",
                  badgeTone === "error"
                    ? "bg-feedback-error text-white"
                    : badgeTone === "warning"
                    ? "bg-feedback-warning text-feedback-warning-text"
                    : "bg-surface-border text-text-muted"
                )}
              >
                {badge > 99 ? "99+" : badge}
              </span>
            )}
          </>
        )}
        {collapsed && badge !== undefined && badge > 0 && (
          <span
            className={cn(
              "absolute right-1 top-1 flex h-2 w-2 rounded-full border-2 border-surface-panel",
              badgeTone === "error" ? "bg-feedback-error" : badgeTone === "warning" ? "bg-feedback-warning" : "bg-text-muted"
            )}
          />
        )}
      </Link>
    </li>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { hasPermission, hasAnyPermission, loading, context } = usePermissions();

  const isVisible = (item: any) => {
    if (!item.requiredPermissions) return true;
    if (Array.isArray(item.requiredPermissions)) {
      return hasAnyPermission(item.requiredPermissions);
    }
    return hasPermission(item.requiredPermissions);
  };

  const [counts, setCounts] = useState<any>({});

  const fetchCounts = useCallback(async (wid: string) => {
    try {
      const [gRes, qRes] = await Promise.all([
        fetch("/api/knowledge/answers/governance-counts", {
          headers: { "x-workspace-id": wid },
        }),
        fetch("/api/questionnaires/counts", {
          headers: { "x-workspace-id": wid },
        }),
      ]);

      let gCounts = {};
      let qCounts = {};

      if (gRes.ok) gCounts = await gRes.json();
      if (qRes.ok) {
        const qData = await qRes.json();
        qCounts = { activeQuestionnaires: qData.active };
      }

      // Map nested counts for easier config binding
      const mappedCounts = {
        ...gCounts,
        ...qCounts,
        expired_count: (gCounts as any)?.freshness?.expired ?? 0,
      };

      setCounts(mappedCounts);
    } catch (err) {
      console.error("Failed to fetch sidebar counts", err);
    }
  }, []);

  useEffect(() => {
    if (context?.workspaceId) {
      fetchCounts(context.workspaceId);
    }
  }, [context?.workspaceId, fetchCounts]);

  const navWorkspace = NAVIGATION_CONFIG.filter(
    (item) => item.category === "workspace" && isVisible(item)
  );
  const navWork = NAVIGATION_CONFIG.filter(
    (item) => item.category === "work" && isVisible(item)
  );
  const settingsItem = NAVIGATION_CONFIG.find((item) => item.category === "system");
  const showSettings = settingsItem ? isVisible(settingsItem) : false;

  const settingsActive = pathname.startsWith("/app/settings");

  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-30 flex flex-col border-r border-surface-border bg-surface-panel shadow-[var(--shadow-ring)] transition-all duration-300 ease-in-out",
        isCollapsed ? "w-16" : "w-56",
      )}
    >
      <div
        className={cn(
          "flex h-14 shrink-0 items-center border-b border-surface-border transition-all duration-300",
          isCollapsed ? "justify-center px-0" : "px-3 lg:px-4",
        )}
      >
        <BrandMark size={isCollapsed ? "sm" : "md"} showWordmark={!isCollapsed} />
      </div>

      <div className="mt-4">
        {!isCollapsed && <WorkspaceSwitcher activeWorkspaceId={context?.workspaceId} />}
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        <ul className="space-y-0.5">
          {navWorkspace.map(({ label, href, icon }) => (
            <NavItem
              key={href}
              label={label}
              href={href}
              icon={icon}
              active={isActive(pathname, href)}
              collapsed={isCollapsed}
            />
          ))}
        </ul>

        
        {navWork.length > 0 && (
          <>
            {!isCollapsed && (
              <p className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.08em] text-text-muted">
                Work
              </p>
            )}
            {isCollapsed && <div className="mx-2 my-2 border-t border-surface-border" aria-hidden />}
            <ul className="space-y-0.5">
              {navWork.map(({ label, href, icon, badgeKey, badgeTone }) => {
                let dynamicBadge = (counts as any)?.[badgeKey || ""];
                let dynamicTone = badgeTone;

                // Role-based badge overrides for Work section
                if (label === "Governance") {
                  if (context?.role && isWorkspaceAdmin(context.role as WorkspaceRole)) {
                    dynamicBadge = (counts as any)?.unowned;
                    dynamicTone = (counts as any)?.unowned > 0 ? "error" : "default";
                  }
                }

                return (
                  <NavItem
                    key={href}
                    label={label}
                    href={href}
                    icon={icon}
                    active={isActive(pathname, href)}
                    collapsed={isCollapsed}
                    badge={dynamicBadge}
                    badgeTone={dynamicTone}
                  />
                );
              })}
            </ul>
          </>
        )}

              </nav>

      <div
        className={cn(
          "mt-auto border-t border-surface-border px-2 py-2",
          isCollapsed ? "flex flex-col items-center gap-1" : "flex items-center gap-1",
        )}
      >
        {showSettings && (
          <Link
            href="/app/settings"
            title={isCollapsed ? "Settings" : undefined}
            className={cn(
              navItemClasses({
                active: settingsActive,
                collapsed: isCollapsed,
                className: isCollapsed ? "h-8 w-8" : "min-w-0 flex-1",
              }),
            )}
          >
            <SettingsIcon className="h-[18px] w-[18px] shrink-0" aria-hidden />
            {!isCollapsed && (
              <span className="min-w-0 truncate tracking-[-0.005em]">Settings</span>
            )}
          </Link>
        )}

        <button
          type="button"
          onClick={() => setIsCollapsed(!isCollapsed)}
          title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={cn(
            "flex shrink-0 items-center justify-center rounded-md border border-surface-border text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary focus-ring",
            isCollapsed ? "h-8 w-8" : "h-7 w-7",
          )}
        >
          {isCollapsed ? (
            <ChevronRightIcon className="h-4 w-4" aria-hidden />
          ) : (
            <ChevronLeftIcon className="h-4 w-4" aria-hidden />
          )}
        </button>
      </div>
    </aside>
  );
}
