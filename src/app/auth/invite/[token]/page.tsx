"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useLogout } from "@/hooks/use-logout";
import { ShieldCheckIcon, UserIcon, LockIcon, AlertCircleIcon, CheckIcon } from "@/components/icons";
import { BrandMark } from "@/components/app-shell/brand-mark";
import Link from "next/link";

interface InviteDetails {
  workspaceName: string;
  email: string;
  name: string;
  needsRegistration: boolean;
}

export default function InviteAcceptancePage() {
  const params = useParams();
  const token = params.token as string;
  const router = useRouter();
  const { toast } = useToast();
  const { logout, isLoggingOut: isSystemLoggingOut } = useLogout();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState<InviteDetails | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    async function fetchInvite() {
      try {
        const res = await fetch(`/api/auth/invites/${token}`);
        const data = await res.json();
        if (res.ok) {
          setDetails(data);
          setName(data.name || "");
          if (data.needsRegistration) setShowPassword(true);
        } else {
          setError(data.error || "Failed to load invitation.");
        }
      } catch (err) {
        setError("Something went wrong while loading the invitation.");
      } finally {
        setLoading(false);
      }
    }
    fetchInvite();
  }, [token]);

  async function handleAccept(e: React.FormEvent) {
    e.preventDefault();
    
    // If user has an account but we haven't shown password field yet, try silent accept (maybe they are logged in)
    if (!details?.needsRegistration && !showPassword && !password) {
      setSubmitting(true);
      try {
        const res = await fetch(`/api/auth/invites/${token}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name || undefined }),
        });
        const data = await res.json();
        
        if (res.ok) {
          toast({ severity: "success", title: "Invitation accepted!" });
          window.location.href = "/app";
          return;
        } else if (data.error === "AUTHENTICATION_REQUIRED") {
          setShowPassword(true);
          setSubmitting(false);
          return;
        } else if (data.error === "EMAIL_MISMATCH") {
          setError("You are currently logged in with a different email address than the one invited. Please log out and try again.");
          setSubmitting(false);
          return;
        } else {
          throw new Error(data.error || "Failed to accept invitation.");
        }
      } catch (err) {
        toast({ severity: "error", title: err instanceof Error ? err.message : "Failed to accept invitation." });
        setSubmitting(false);
        return;
      }
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/auth/invites/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: password || undefined, name: name || undefined }),
      });
      const data = await res.json();
      
      if (res.ok) {
        toast({ severity: "success", title: "Invitation accepted!" });
        window.location.href = "/app";
      } else {
        throw new Error(data.error || "Failed to accept invitation.");
      }
    } catch (err) {
      toast({ severity: "error", title: err instanceof Error ? err.message : "Failed to accept invitation." });
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-base">
        <div className="h-8 w-8 border-4 border-accent-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    const isExpired = error === "INVITE_EXPIRED";
    const isRevoked = error === "INVITE_REVOKED";
    const isAccepted = error === "ALREADY_ACCEPTED" || error === "ALREADY_MEMBER";
    const isMismatch = error.includes("logged in with a different email");

    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-base px-4">
        <div className="w-full max-w-md space-y-8 bg-surface-panel p-10 rounded-2xl border border-surface-border shadow-2xl text-center">
          <div className={`mx-auto flex h-20 w-20 items-center justify-center rounded-full ${isAccepted ? 'bg-semantic-success/10 text-semantic-success' : 'bg-semantic-error/10 text-semantic-error'} mb-4`}>
            {isAccepted ? <CheckIcon className="h-10 w-10" /> : <AlertCircleIcon className="h-10 w-10" />}
          </div>
          
          <div className="space-y-3">
            <h2 className="text-3xl font-bold text-text-primary">
              {isExpired ? "Invite Expired" : 
               isRevoked ? "Invite Revoked" : 
               isAccepted ? "Already Joined" : 
               isMismatch ? "Account Mismatch" :
               "Invalid Invitation"}
            </h2>
            <p className="text-text-muted leading-relaxed">
              {isExpired ? "This invitation link has expired for security reasons. Please ask your administrator to send a new one." :
               isRevoked ? "This invitation has been revoked by a workspace administrator." :
               isAccepted ? "You have already accepted this invitation and joined the workspace. Please log in to continue." :
               isMismatch ? error :
               "The invitation link is invalid or has already been used. Please verify the URL and try again."}
            </p>
          </div>

          <div className="pt-6 space-y-4">
            {isAccepted || isMismatch ? (
              <div className="block w-full">
                <Button 
                  variant="primary" 
                  className="w-full h-11" 
                  loading={isSystemLoggingOut}
                  onClick={async () => {
                    if (isMismatch) {
                      await logout(window.location.href);
                    } else {
                      router.push("/login");
                    }
                  }}
                >
                  {isMismatch ? "Switch Account / Log Out" : "Log In to Workspace"}
                </Button>
              </div>
            ) : (
              <Link href="/login" className="block w-full">
                <Button variant="secondary" className="w-full h-11">
                  Return to Login
                </Button>
              </Link>
            )}
          </div>

          <div className="pt-8 border-t border-surface-border flex items-center justify-center gap-2 text-[10px] font-bold text-text-muted uppercase tracking-widest">
            <ShieldCheckIcon className="h-3.5 w-3.5" />
            <span>Secure Access Control</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-base px-4">
      <div className="w-full max-w-md space-y-8 bg-surface-panel p-8 rounded-2xl border border-surface-border shadow-xl">
        <div className="text-center space-y-4">
          <BrandMark size="lg" href="/" className="justify-center" />
          <h1 className="text-2xl font-bold text-text-primary">Join {details?.workspaceName}</h1>
          <p className="text-text-muted text-sm">
            You've been invited to join the <strong>{details?.workspaceName}</strong> workspace on TrustDesk.
          </p>
        </div>

        <form onSubmit={handleAccept} className="space-y-6 mt-8">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-text-muted uppercase tracking-wider">Email Address</label>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-surface-base border border-surface-border opacity-70">
                <UserIcon className="h-4 w-4 text-text-muted" />
                <span className="text-sm text-text-primary font-medium">{details?.email}</span>
              </div>
            </div>

            {details?.needsRegistration && (
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-text-muted uppercase tracking-wider">Full Name</label>
                <div className="relative">
                  <UserIcon className="absolute left-3 top-3 h-4 w-4 text-text-muted" />
                  <input
                    required
                    type="text"
                    placeholder="John Doe"
                    className="w-full rounded-lg border border-surface-border bg-surface-base py-2.5 pl-10 pr-3 text-sm focus:border-accent-primary focus:ring-1 focus:ring-accent-primary outline-none transition-all"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
              </div>
            )}

            {showPassword && (
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-text-muted uppercase tracking-wider">
                  {details?.needsRegistration ? "Set Password" : "Confirm Password"}
                </label>
                <div className="relative">
                  <LockIcon className="absolute left-3 top-3 h-4 w-4 text-text-muted" />
                  <input
                    required
                    type="password"
                    placeholder="••••••••"
                    className="w-full rounded-lg border border-surface-border bg-surface-base py-2.5 pl-10 pr-3 text-sm focus:border-accent-primary focus:ring-1 focus:ring-accent-primary outline-none transition-all"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                {details?.needsRegistration && (
                  <p className="text-[10px] text-text-muted mt-1 italic">At least 8 characters required.</p>
                )}
              </div>
            )}

            {!details?.needsRegistration && !showPassword && (
              <div className="p-4 rounded-lg bg-accent-primary/5 border border-accent-primary/20 text-center">
                <p className="text-sm text-text-secondary">
                  We found an existing account for this email. Click below to join the workspace.
                </p>
              </div>
            )}
          </div>

          <Button type="submit" variant="primary" className="w-full h-11" loading={submitting}>
            {details?.needsRegistration ? "Create account and join" : "Accept Invitation"}
          </Button>

          {!details?.needsRegistration && (
            <p className="text-center text-[11px] text-text-muted">
              Not you? <Link href="/login" className="text-accent-primary hover:underline font-bold">Sign in with a different account</Link>
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
