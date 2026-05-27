"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

type FieldErrors = Record<string, string[] | undefined>;

export function SignUpForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "x-trustdesk-csrf": "1"
        },
        body: JSON.stringify({ name: name || undefined, email, password }),
      });
      const data = (await res.json()) as {
        user?: { id: string; email: string; name: string | null };
        next?: string;
        error?: { code?: string; message?: string; issues?: { fieldErrors?: FieldErrors } };
      };

      if (!res.ok) {
        if (data.error?.code === "DUPLICATE_EMAIL") {
          setError("An account with this email already exists.");
          return;
        }
        if (data.error?.code === "RATE_LIMIT_EXCEEDED") {
          setError("Too many signup attempts. Please wait an hour before trying again.");
          return;
        }
        if (data.error?.code === "VALIDATION_ERROR" && data.error.issues?.fieldErrors) {
          setFieldErrors(data.error.issues.fieldErrors);
          setError("Please fix the highlighted fields.");
          return;
        }
        setError(data.error?.message ?? "Something went wrong.");
        return;
      }

      if (data.next) {
        // Prevent tenant bleed in shared browsers by purging any stale state
        localStorage.clear();
        sessionStorage.clear();
        window.location.href = data.next;
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={onSubmit} className="flex flex-col gap-5">
        <div>
          <label htmlFor="email" className="block text-sm font-semibold text-text-primary mb-1.5">
            Work email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="name@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-surface-border bg-surface-base px-3.5 py-2.5 text-sm transition-all focus:border-accent-primary focus:ring-2 focus:ring-accent-primary/20 outline-none placeholder:text-text-muted"
          />
          {fieldErrors.email?.length ? (
            <p className="mt-1.5 text-sm font-medium text-feedback-error">{fieldErrors.email.join(", ")}</p>
          ) : null}
        </div>
        <div>
          <label htmlFor="password" className="block text-sm font-semibold text-text-primary mb-1.5">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            placeholder="Min. 8 characters"
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-surface-border bg-surface-base px-3.5 py-2.5 text-sm transition-all focus:border-accent-primary focus:ring-2 focus:ring-accent-primary/20 outline-none placeholder:text-text-muted"
          />
          <p className="mt-1.5 text-[11px] text-text-muted font-medium">Must be at least 8 characters with uppercase, lowercase, numbers, and symbols.</p>
          {fieldErrors.password?.length ? (
            <p className="mt-1.5 text-sm font-medium text-feedback-error">{fieldErrors.password.join(", ")}</p>
          ) : null}
        </div>

        {error ? (
          <div className="rounded-lg bg-feedback-error/10 p-3 flex items-center gap-2.5">
            <div className="h-1.5 w-1.5 rounded-full bg-feedback-error animate-pulse" />
            <p className="text-sm font-semibold text-feedback-error">{error}</p>
          </div>
        ) : null}

        <Button
          type="submit"
          isLoading={submitting}
          className="w-full h-12 text-base shadow-lg shadow-accent-primary/25"
        >
          Get Started with TrustDesk
        </Button>
      </form>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-surface-border" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-surface-panel px-2 text-text-muted font-bold tracking-widest">or continue with</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Button
          variant="outline"
          disabled
          leftIcon={
            <svg className="h-4 w-4" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
          }
          className="w-full opacity-60 cursor-not-allowed"
        >
          Google
        </Button>
        <Button
          variant="outline"
          disabled
          leftIcon={
            <svg className="h-4 w-4" viewBox="0 0 24 24">
              <path d="M1 1h10v10H1z" fill="#f25022" />
              <path d="M13 1h10v10H13z" fill="#7fba00" />
              <path d="M1 13h10v10H1z" fill="#00a4ef" />
              <path d="M13 13h10v10H1z" fill="#ffb900" />
            </svg>
          }
          className="w-full opacity-60 cursor-not-allowed"
        >
          Microsoft
        </Button>
      </div>

      <div className="mt-2 flex flex-col items-center gap-3 border-t border-surface-border pt-6">
        <div className="flex items-center gap-4 text-[10px] font-bold text-text-muted uppercase tracking-widest text-center">
          <span>No credit card required</span>
          <span className="h-1 w-1 rounded-full bg-surface-border" />
          <span>Workspace-isolated</span>
          <span className="h-1 w-1 rounded-full bg-surface-border" />
          <span>SOC2 Compliant</span>
        </div>
      </div>
    </div>
  );
}
