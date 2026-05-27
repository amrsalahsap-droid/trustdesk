"use client";

import { Button } from "@/components/ui/button";
import { AlertCircleIcon, ShieldCheckIcon } from "@/components/icons";
import Link from "next/link";

export default function SuspendedPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-base px-4">
      <div className="w-full max-w-md space-y-8 bg-surface-panel p-8 rounded-2xl border border-surface-border shadow-xl text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-semantic-warning/10 text-semantic-warning">
          <AlertCircleIcon className="h-8 w-8" />
        </div>
        
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight text-text-primary">Membership Suspended</h1>
          <p className="text-text-muted">
            Your access to this workspace has been suspended by an administrator. You will not be able to view or edit data until your membership is reactivated.
          </p>
        </div>

        <div className="pt-4 space-y-4">
          <Link href="/app" className="block w-full">
            <Button variant="secondary" className="w-full h-11">
              Switch Workspace
            </Button>
          </Link>
          
          <Link href="/login" className="block text-sm font-medium text-text-muted hover:text-accent-primary transition-colors">
            Sign in with a different account
          </Link>
        </div>

        <div className="pt-6 border-t border-surface-border flex items-center justify-center gap-2 text-[10px] font-bold text-text-muted uppercase tracking-widest">
          <ShieldCheckIcon className="h-3 w-3" />
          <span>Membership Compliance Management</span>
        </div>
      </div>
    </div>
  );
}
