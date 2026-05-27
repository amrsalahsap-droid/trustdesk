"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CheckIcon, AlertCircleIcon } from "@/components/icons";
import Link from "next/link";

export default function VerifyEmailPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setError("Verification token is missing.");
      return;
    }

    async function doVerify() {
      try {
        const res = await fetch("/api/auth/verify-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });

        if (res.ok) {
          setStatus("success");
        } else {
          const body = await res.json();
          setStatus("error");
          setError(body.error || "Failed to verify email.");
        }
      } catch (err) {
        setStatus("error");
        setError("Something went wrong during verification.");
      }
    }

    doVerify();
  }, [token]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-base px-4">
      <div className="w-full max-w-md space-y-8 bg-surface-panel p-8 rounded-2xl border border-surface-border shadow-xl text-center">
        {status === "loading" && (
          <div className="space-y-4">
            <div className="h-8 w-8 border-4 border-accent-primary border-t-transparent rounded-full animate-spin mx-auto" />
            <h2 className="text-xl font-bold text-text-primary">Verifying your email...</h2>
            <p className="text-text-muted">Please wait while we confirm your email address.</p>
          </div>
        )}

        {status === "success" && (
          <div className="space-y-4">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-semantic-success/10 text-semantic-success">
              <CheckIcon className="h-6 w-6" />
            </div>
            <h2 className="text-2xl font-bold text-text-primary">Email Verified!</h2>
            <p className="text-text-muted">
              Thank you for verifying your email. Your account is now fully active.
            </p>
            <div className="pt-4">
              <Link href="/login" className="inline-block w-full">
                <Button variant="primary" className="w-full h-11">
                  Log in
                </Button>
              </Link>
            </div>
          </div>
        )}

        {status === "error" && (
          <div className="space-y-4">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-semantic-error/10 text-semantic-error">
              <AlertCircleIcon className="h-6 w-6" />
            </div>
            <h2 className="text-2xl font-bold text-text-primary">Verification Failed</h2>
            <p className="text-text-muted">{error}</p>
            <div className="pt-4">
              <Link href="/login" className="text-sm font-medium text-accent-primary hover:underline">
                Back to login
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
