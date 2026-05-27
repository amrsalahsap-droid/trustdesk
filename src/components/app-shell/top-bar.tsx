"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PlusIcon, SearchIcon } from "@/components/icons";
import { usePermissions } from "@/lib/auth/use-permissions";
import { cn } from "@/lib/utils";
import { UserMenu } from "./user-menu";

const ROUTE_LABELS: Record<string, string> = {
  "/app": "Dashboard",
  "/app/documents": "Documents",
  "/app/library": "Answer Library",
  "/app/questionnaires": "Questionnaires",
  "/app/settings": "Settings",
};

function getBreadcrumb(pathname: string): { label: string; href?: string }[] {
  const crumbs: { label: string; href?: string }[] = [];

  for (const [route, label] of Object.entries(ROUTE_LABELS)) {
    if (pathname === route || pathname.startsWith(route + "/")) {
      crumbs.push({ label, href: route });
      break;
    }
  }

  if (pathname.includes("/review")) {
    crumbs.push({ label: "Review" });
  }

  return crumbs;
}

export function TopBar() {
  const pathname = usePathname();
  const { role, loading } = usePermissions();
  const crumbs = getBreadcrumb(pathname);
  const parents = crumbs.length > 1 ? crumbs.slice(0, -1) : [];
  const current = crumbs.length > 0 ? crumbs[crumbs.length - 1] : { label: "Dashboard", href: "/app" };

  const getRoleBadgeStyles = (role: string) => {
    switch (role) {
      case "OWNER": return "bg-accent-primary/10 text-accent-primary border-accent-primary/20";
      case "ADMIN": return "bg-feedback-info/10 text-feedback-info border-feedback-info/20";
      case "OPERATOR": return "bg-feedback-success/10 text-feedback-success border-feedback-success/20";
      case "APPROVER": return "bg-purple-500/10 text-purple-500 border-purple-500/20";
      default: return "bg-surface-border/50 text-text-muted border-surface-border";
    }
  };

  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between border-b border-surface-border bg-surface-panel/85 px-4 backdrop-blur supports-[backdrop-filter]:bg-surface-panel/70 sm:px-6">
      <div className="min-w-0 flex-1 flex items-center gap-4">
        <div className="min-w-0">
          {parents.length > 0 && (
            <nav className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs font-medium text-text-muted" aria-label="Breadcrumb">
              {parents.map((crumb, i) => (
                <span key={`${crumb.label}-${i}`} className="flex items-center gap-1.5">
                  {i > 0 && <span className="text-surface-border">/</span>}
                  {crumb.href ? (
                    <Link
                      href={crumb.href}
                      className="truncate text-text-muted transition-colors hover:text-text-primary"
                    >
                      {crumb.label}
                    </Link>
                  ) : (
                    <span className="truncate">{crumb.label}</span>
                  )}
                </span>
              ))}
              <span className="text-surface-border">/</span>
            </nav>
          )}
          <h1 className="truncate text-[15px] font-semibold leading-none text-text-primary">
            {current.label}
          </h1>
        </div>

        {!loading && role && (
          <div className={cn(
            "hidden sm:flex items-center h-5 px-1.5 rounded border text-[10px] font-bold tracking-wider uppercase",
            getRoleBadgeStyles(role)
          )}>
            {role.replace("_", " ")}
          </div>
        )}
      </div>

      <div className="ml-4 flex shrink-0 items-center gap-3">
        <button
          type="button"
          className="hidden h-9 w-56 cursor-default items-center gap-2 rounded-md border border-surface-border bg-surface-base px-3 text-left text-sm text-text-muted md:flex"
          aria-label="Search — coming soon"
        >
          <SearchIcon className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
          <span className="flex-1 truncate">Search…</span>
          <kbd className="hidden rounded border border-surface-border bg-surface-panel px-1.5 py-0.5 font-mono text-[10px] font-medium text-text-muted sm:inline">
            K
          </kbd>
        </button>

        <Button variant="ghost" size="sm" className="hidden sm:inline-flex" leftIcon={<PlusIcon className="h-4 w-4" />}>
          New
        </Button>

        <div className="hidden h-6 w-px bg-surface-border sm:block" aria-hidden />

        <UserMenu />
      </div>
    </header>
  );
}
