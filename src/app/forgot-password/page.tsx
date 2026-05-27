"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { EnvelopeIcon, ArrowLeftIcon } from "@/components/icons";
import Link from "next/link";

export default function ForgotPasswordPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (res.ok) {
        setDone(true);
        toast({ severity: "success", title: "Reset link sent if account exists" });
      } else {
        const body = await res.json();
        throw new Error(body.error?.message || "Failed to request reset");
      }
    } catch (error) {
      toast({ severity: "error", title: error instanceof Error ? error.message : "Something went wrong" });
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-base px-4">
        <div className="w-full max-w-md space-y-8 bg-surface-panel p-8 rounded-2xl border border-surface-border shadow-xl text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-accent-primary/10 text-accent-primary">
            <EnvelopeIcon className="h-6 w-6" />
          </div>
          <h2 className="text-2xl font-bold text-text-primary">Check your email</h2>
          <p className="text-text-muted">
            If an account exists for <strong>{email}</strong>, you will receive a password reset link shortly.
          </p>
          <div className="pt-4">
            <Link href="/login" className="text-sm font-medium text-accent-primary hover:underline">
              Back to login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-base px-4">
      <div className="w-full max-w-md space-y-8 bg-surface-panel p-8 rounded-2xl border border-surface-border shadow-xl">
        <div className="space-y-2 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-text-primary">Forgot password?</h1>
          <p className="text-text-muted text-sm">No worries, we'll send you reset instructions.</p>
        </div>

        <form onSubmit={handleSubmit} className="mt-8 space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-text-primary">Email Address</label>
            <div className="relative">
              <EnvelopeIcon className="absolute left-3 top-3 h-4 w-4 text-text-muted" />
              <input
                required
                type="email"
                placeholder="you@company.com"
                className="w-full rounded-lg border border-surface-border bg-surface-base py-2.5 pl-10 pr-3 text-sm focus:border-accent-primary focus:ring-1 focus:ring-accent-primary outline-none transition-all"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>

          <Button type="submit" variant="primary" className="w-full h-11" loading={loading}>
            Reset password
          </Button>

          <div className="text-center">
            <Link href="/login" className="inline-flex items-center gap-2 text-sm font-medium text-text-muted hover:text-accent-primary transition-colors">
              <ArrowLeftIcon className="h-4 w-4" />
              Back to login
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
