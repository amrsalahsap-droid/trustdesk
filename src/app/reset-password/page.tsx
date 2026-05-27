"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { LockIcon, CheckIcon } from "@/components/icons";
import Link from "next/link";

export default function ResetPasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  
  const token = searchParams.get("token");
  
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    password: "",
    confirmPassword: "",
  });
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) {
      toast({ severity: "error", title: "Invalid reset link", description: "The reset token is missing." });
    }
  }, [token, toast]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (formData.password !== formData.confirmPassword) {
      toast({ severity: "error", title: "Passwords do not match" });
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password: formData.password }),
      });

      if (res.ok) {
        setDone(true);
        toast({ severity: "success", title: "Password reset successful" });
      } else {
        const body = await res.json();
        throw new Error(body.error || "Failed to reset password");
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
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-semantic-success/10 text-semantic-success">
            <CheckIcon className="h-6 w-6" />
          </div>
          <h2 className="text-2xl font-bold text-text-primary">Password reset</h2>
          <p className="text-text-muted">
            Your password has been successfully reset. You can now log in with your new password.
          </p>
          <div className="pt-4">
            <Link href="/login" className="inline-block w-full">
              <Button variant="primary" className="w-full h-11">
                Log in
              </Button>
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
          <h1 className="text-3xl font-bold tracking-tight text-text-primary">Set new password</h1>
          <p className="text-text-muted text-sm">Your new password must be different from previous passwords.</p>
        </div>

        <form onSubmit={handleSubmit} className="mt-8 space-y-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-text-primary">New Password</label>
              <div className="relative">
                <LockIcon className="absolute left-3 top-3 h-4 w-4 text-text-muted" />
                <input
                  required
                  type="password"
                  placeholder="••••••••"
                  className="w-full rounded-lg border border-surface-border bg-surface-base py-2.5 pl-10 pr-3 text-sm focus:border-accent-primary focus:ring-1 focus:ring-accent-primary outline-none transition-all"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                />
              </div>
              <p className="mt-1 text-[11px] text-text-muted font-medium">Must be at least 8 characters with uppercase, lowercase, numbers, and symbols.</p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-text-primary">Confirm Password</label>
              <div className="relative">
                <LockIcon className="absolute left-3 top-3 h-4 w-4 text-text-muted" />
                <input
                  required
                  type="password"
                  placeholder="••••••••"
                  className="w-full rounded-lg border border-surface-border bg-surface-base py-2.5 pl-10 pr-3 text-sm focus:border-accent-primary focus:ring-1 focus:ring-accent-primary outline-none transition-all"
                  value={formData.confirmPassword}
                  onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                />
              </div>
            </div>
          </div>

          <Button type="submit" variant="primary" className="w-full h-11" loading={loading} disabled={!token}>
            Reset password
          </Button>
        </form>
      </div>
    </div>
  );
}
