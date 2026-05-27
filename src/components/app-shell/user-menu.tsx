"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { LogOutIcon, SettingsIcon } from "@/components/icons";
import { useLogout } from "@/hooks/use-logout";
import { usePermissions } from "@/lib/auth/use-permissions";
import { Permission } from "@/lib/auth/permissions";

export function UserMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const [user, setUser] = useState<{ name: string | null; email: string } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const { hasAnyPermission } = usePermissions();

  const showSettings = hasAnyPermission([
    Permission.MANAGE_SETTINGS,
    Permission.MANAGE_MEMBERS,
    Permission.VIEW_AUDIT,
  ]);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data) => {
        if (data.user) {
          setUser(data.user);
        }
      })
      .catch(err => console.error("Failed to fetch user", err));
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const { logout, isLoggingOut } = useLogout();

  const handleLogout = async () => {
    await logout();
  };


  const name = user?.name || user?.email || "User";
  const initials = name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex h-9 w-9 items-center justify-center rounded-full border border-surface-border bg-surface-hover text-text-primary transition-colors hover:border-accent-primary/40 hover:bg-surface-panel focus:outline-none focus:ring-2 focus:ring-accent-primary/30 focus:ring-offset-2 focus:ring-offset-surface-panel"
        aria-label="User menu"
      >
        <span className="text-[11px] font-semibold tracking-tight">{initials}</span>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-64 origin-top-right rounded-xl border border-surface-border bg-surface-panel p-1.5 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
          <div className="mb-1 flex flex-col gap-0.5 border-b border-surface-border px-3 py-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">Signed in as</p>
            <p className="truncate text-sm font-bold text-text-primary">{name}</p>
            {user?.email && user.email !== name && (
              <p className="mt-0.5 truncate text-xs text-text-muted">{user.email}</p>
            )}
          </div>

          <div className="space-y-0.5">
            {showSettings && (
              <Link
                href="/app/settings"
                onClick={() => setIsOpen(false)}
                className="flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
              >
                <SettingsIcon className="h-4 w-4 shrink-0" aria-hidden />
                Settings
              </Link>
            )}
          </div>

          <div className="mt-1 border-t border-surface-border pt-1">
            <button
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-sm font-semibold text-feedback-error transition-colors hover:bg-feedback-error/10 disabled:opacity-50"
            >
              <LogOutIcon className="h-4 w-4" />
              {isLoggingOut ? "Logging out..." : "Log out"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
