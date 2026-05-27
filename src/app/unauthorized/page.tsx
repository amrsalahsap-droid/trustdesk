"use client";

import { Button } from "@/components/ui/button";
import { UserIcon, ShieldCheckIcon } from "@/components/icons";
import Link from "next/link";

export default function UnauthorizedPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-base px-4">
      <div className="w-full max-w-md space-y-8 bg-surface-panel p-8 rounded-2xl border border-surface-border shadow-xl text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-accent-primary/10 text-accent-primary">
          <UserIcon className="h-8 w-8" />
        </div>
        
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight text-text-primary">Authentication Required</h1>
          <p className="text-text-muted">
            Your session has expired or you are not logged in. Please sign in to continue accessing TrustDesk.
          </p>
        </div>

        <div className="pt-4 space-y-4">
          <Link href="/login" className="block w-full">
            <Button variant="primary" className="w-full h-11">
              Sign In
            </Button>
          </Link>
          
          <Link href="/signup" className="block text-sm font-medium text-text-muted hover:text-accent-primary transition-colors">
            Don't have an account? Sign up
          </Link>
        </div>

        <div className="pt-6 border-t border-surface-border flex items-center justify-center gap-2 text-[10px] font-bold text-text-muted uppercase tracking-widest">
          <ShieldCheckIcon className="h-3 w-3" />
          <span>TrustDesk Secure Session</span>
        </div>
      </div>
    </div>
  );
}
