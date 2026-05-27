"use client";

import { useState, useEffect, useRef } from "react";
import { BuildingIcon, ChevronRightIcon, PlusIcon, SparklesIcon, CheckIcon } from "@/components/icons";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface Workspace {
  id: string;
  name: string;
  isDemo: boolean;
}

export function WorkspaceSwitcher({ activeWorkspaceId }: { activeWorkspaceId?: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    fetch("/api/auth/me")
      .then(res => res.json())
      .then(data => {
        if (data.workspaces) {
          setWorkspaces(data.workspaces);
        }
      });
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = async (workspaceId: string) => {
    if (workspaceId === activeWorkspaceId) {
      setIsOpen(false);
      return;
    }

    try {
      const res = await fetch("/api/workspaces/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId }),
      });

      if (res.ok) {
        // Redirect to dashboard of the new workspace
        // This will trigger the IdentityIntegrityGuard to sync the cookie
        window.location.href = `/app?workspaceId=${workspaceId}`;
      }
    } catch (err) {
      console.error("Failed to switch workspace", err);
    }
  };

  const activeWorkspace = workspaces.find(w => w.id === activeWorkspaceId);

  return (
    <div className="relative px-2 mb-4" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-lg border border-surface-border bg-surface-base p-2 text-left transition-all hover:border-accent-primary/40 hover:bg-surface-hover focus:outline-none focus:ring-2 focus:ring-accent-primary/20",
          isOpen && "border-accent-primary/50 ring-2 ring-accent-primary/10"
        )}
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent-primary/10 text-accent-primary">
          <BuildingIcon className="h-4.5 w-4.5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-sm font-bold text-text-primary">
              {activeWorkspace?.name || "Select Workspace"}
            </p>
            {activeWorkspace?.isDemo && (
              <span className="flex h-4 items-center rounded-full bg-accent-primary/15 px-1.5 text-[9px] font-bold uppercase tracking-wider text-accent-primary">
                Demo
              </span>
            )}
          </div>
          <p className="text-[10px] font-medium text-text-muted">Switch Workspace</p>
        </div>
        <ChevronRightIcon className={cn("h-4 w-4 shrink-0 text-text-muted transition-transform", isOpen && "rotate-90")} />
      </button>

      {isOpen && (
        <div className="absolute left-2 right-2 top-full z-50 mt-1 origin-top rounded-xl border border-surface-border bg-surface-panel p-1.5 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
          <div className="mb-1 px-2 py-1.5">
            <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted">My Workspaces</p>
          </div>
          
          <div className="max-h-[280px] overflow-y-auto space-y-0.5">
            {workspaces.map((w) => (
              <button
                key={w.id}
                onClick={() => handleSelect(w.id)}
                className={cn(
                  "flex w-full items-center justify-between gap-3 rounded-lg px-2 py-2 text-left transition-colors",
                  w.id === activeWorkspaceId 
                    ? "bg-accent-primary/5 text-accent-primary" 
                    : "text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                )}
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <div className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded text-[10px] font-bold",
                    w.id === activeWorkspaceId ? "bg-accent-primary text-white" : "bg-surface-border text-text-muted"
                  )}>
                    {w.name.substring(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{w.name}</p>
                    {w.isDemo && (
                      <div className="flex items-center gap-1 text-[9px] font-bold text-accent-primary uppercase tracking-tighter">
                        <SparklesIcon className="h-2.5 w-2.5" />
                        Demo Environment
                      </div>
                    )}
                  </div>
                </div>
                {w.id === activeWorkspaceId && <CheckIcon className="h-4 w-4 shrink-0" />}
              </button>
            ))}
          </div>

          <div className="mt-1 border-t border-surface-border pt-1">
            <Link
              href="/onboarding?new=true"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-semibold text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
            >
              <PlusIcon className="h-4 w-4 text-text-muted" />
              Create workspace
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
