"use client";

import React, { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  LockIcon, 
  ShieldCheckIcon, 
  LogOutIcon, 
  ClockIcon, 
  GlobeIcon,
  CheckIcon,
  AlertCircleIcon,
  UserIcon,
  RefreshIcon
} from "@/components/icons";
import { useLogout } from "@/hooks/use-logout";
import { useToast } from "@/components/ui/toast";
import { ProfileSection } from "./ProfileSection";
import { cn } from "@/lib/utils";
import { PermissionGuard } from "@/components/auth/permission-guard";
import { Permission } from "@/lib/auth/permissions";

interface WorkspaceSecuritySettings {
  inviteExpirationDays: number;
  allowedEmailDomains: string[];
  enforceDomainCheck: boolean;
  sessionTimeoutMinutes: number;
}

interface SecuritySectionProps {
  name: string;
  email: string;
}

export function SecuritySection({ name, email }: SecuritySectionProps) {
  const { logout, isLoggingOut } = useLogout();
  const { toast } = useToast();
  const [wsSettings, setWsSettings] = useState<WorkspaceSecuritySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/workspaces/settings");
        if (res.ok) {
          const json = await res.json();
          setWsSettings({
            inviteExpirationDays: json.workspace.inviteExpirationDays,
            allowedEmailDomains: json.workspace.allowedEmailDomains || [],
            enforceDomainCheck: json.workspace.enforceDomainCheck,
            sessionTimeoutMinutes: json.workspace.sessionTimeoutMinutes,
          });
        }
      } catch (err) {
        console.error("Failed to load security settings", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const handleWsUpdate = async (delta: Partial<WorkspaceSecuritySettings>) => {
    if (!wsSettings) return;
    
    const previous = wsSettings;
    setWsSettings({ ...wsSettings, ...delta });
    setSaving(true);

    try {
      const res = await fetch("/api/workspaces/settings", {
        method: "PATCH",
        body: JSON.stringify(delta),
      });
      
      if (res.ok) {
        toast({ title: "Security policy updated", severity: "success" });
      } else {
        setWsSettings(previous);
        toast({ title: "Failed to update policy", severity: "error" });
      }
    } catch (err) {
      setWsSettings(previous);
      toast({ title: "Network error", severity: "error" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="animate-pulse space-y-10">
    <div className="h-40 bg-surface-hover rounded-xl" />
    <div className="h-64 bg-surface-hover rounded-xl" />
  </div>;

  return (
    <div className="space-y-12 pb-20">
      {/* Workspace Level Security - Admin Only */}
      <PermissionGuard permission={Permission.MANAGE_SETTINGS}>
        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-text-primary">Workspace Security Policy</h2>
              <p className="text-sm text-text-muted">Enforce organization-wide security requirements and session defaults.</p>
            </div>
            {saving && <span className="text-[10px] font-bold text-accent-primary animate-pulse uppercase tracking-widest">Syncing...</span>}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="border-surface-border">
              <CardContent className="p-6 space-y-6">
                <div className="flex items-start gap-3">
                  <div className="h-9 w-9 rounded-lg bg-accent-primary/[0.08] border border-accent-primary/20 flex items-center justify-center text-accent-primary shadow-sm">
                    <ClockIcon className="h-4.5 w-4.5" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-sm font-bold text-text-primary">Session Persistence</h3>
                    <p className="text-xs text-text-muted">Automatically sign out users after a period of inactivity.</p>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <select 
                    className="w-full rounded-lg border border-surface-border bg-surface-base px-3 py-2 text-sm outline-none focus:border-accent-primary transition-all"
                    value={wsSettings?.sessionTimeoutMinutes}
                    onChange={(e) => handleWsUpdate({ sessionTimeoutMinutes: parseInt(e.target.value) })}
                  >
                    <option value={60}>1 Hour</option>
                    <option value={240}>4 Hours</option>
                    <option value={480}>8 Hours</option>
                    <option value={1440}>24 Hours (Default)</option>
                    <option value={10080}>7 Days</option>
                    <option value={43200}>30 Days</option>
                  </select>
                  <p className="text-[10px] text-text-muted flex items-center gap-1">
                    <AlertCircleIcon className="h-3 w-3" /> 
                    Recommended for shared environments: 8 Hours or less.
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-surface-border">
              <CardContent className="p-6 space-y-6">
                <div className="flex items-start gap-3">
                  <div className="h-9 w-9 rounded-lg bg-semantic-warning-bg border border-semantic-warning-border flex items-center justify-center text-semantic-warning shadow-sm">
                    <RefreshIcon className="h-4.5 w-4.5" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-sm font-bold text-text-primary">Invitation Lifecycle</h3>
                    <p className="text-xs text-text-muted">Set how long email invitations remain valid before expiring.</p>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    {[1, 3, 7, 14, 30].map(days => (
                      <button
                        key={days}
                        onClick={() => handleWsUpdate({ inviteExpirationDays: days })}
                        className={cn(
                          "flex-1 py-2 rounded-lg border text-xs font-bold transition-all",
                          wsSettings?.inviteExpirationDays === days 
                            ? "bg-accent-primary border-accent-primary text-white shadow-md shadow-accent-primary/20" 
                            : "bg-surface-base border-surface-border text-text-secondary hover:border-text-muted"
                        )}
                      >
                        {days}d
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] text-text-muted flex items-center gap-1">
                    <AlertCircleIcon className="h-3 w-3" /> 
                    Invitations are revoked immediately if the user is removed.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="border-surface-border overflow-hidden">
            <CardContent className="p-0">
              <div className="p-6 bg-surface-panel/30 border-b border-surface-border">
                <div className="flex items-center justify-between">
                  <div className="flex items-start gap-3">
                    <div className="h-9 w-9 rounded-lg bg-semantic-info-bg border border-semantic-info-border flex items-center justify-center text-semantic-info shadow-sm">
                      <GlobeIcon className="h-4.5 w-4.5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-text-primary">Domain Restriction</h3>
                      <p className="text-xs text-text-muted">Limit workspace access to specific email domains.</p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleWsUpdate({ enforceDomainCheck: !wsSettings?.enforceDomainCheck })}
                    className={cn(
                      "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-ring",
                      wsSettings?.enforceDomainCheck ? "bg-accent-primary" : "bg-surface-border"
                    )}
                  >
                    <span className={cn(
                      "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                      wsSettings?.enforceDomainCheck ? "translate-x-5" : "translate-x-0"
                    )} />
                  </button>
                </div>
              </div>
              
              <div className={cn("p-6 space-y-4 transition-all", !wsSettings?.enforceDomainCheck && "opacity-50 pointer-events-none grayscale")}>
                <label className="text-sm font-medium text-text-secondary">Allowed Email Domains</label>
                <div className="flex flex-wrap gap-2">
                  {wsSettings?.allowedEmailDomains.map(domain => (
                    <span key={domain} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-surface-hover border border-surface-border text-xs font-mono text-text-primary">
                      {domain}
                      <button 
                        onClick={() => handleWsUpdate({ allowedEmailDomains: wsSettings.allowedEmailDomains.filter(d => d !== domain) })}
                        className="text-text-muted hover:text-semantic-error transition-colors"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  <input
                    type="text"
                    placeholder="e.g. acme.com"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        const val = e.currentTarget.value.trim().toLowerCase();
                        if (val && !wsSettings?.allowedEmailDomains.includes(val)) {
                          handleWsUpdate({ allowedEmailDomains: [...(wsSettings?.allowedEmailDomains || []), val] });
                          e.currentTarget.value = "";
                        }
                      }
                    }}
                    className="bg-transparent border-none outline-none text-xs font-mono text-text-primary placeholder:text-text-muted min-w-[120px]"
                  />
                </div>
                <p className="text-[10px] text-text-muted italic">Press Enter to add a domain. When enabled, only users with these email domains can be invited or join.</p>
              </div>
            </CardContent>
          </Card>
        </section>
      </PermissionGuard>

      {/* Personal Security - All Users */}
      <section className="space-y-6">
        <div>
          <h2 className="text-xl font-bold text-text-primary">Personal Security & Profile</h2>
          <p className="text-sm text-text-muted">Manage your identity, password, and active session.</p>
        </div>

        <ProfileSection initialName={name} email={email} />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="border-surface-border">
            <CardContent className="p-6">
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-hover text-text-secondary border border-surface-border shadow-sm">
                  <LockIcon className="h-5 w-5" />
                </div>
                <div className="flex-1 space-y-3">
                  <div>
                    <p className="text-sm font-bold text-text-primary">Authentication</p>
                    <p className="text-xs text-text-muted">Update your password or configure single sign-on (SSO).</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" className="h-8 text-xs" disabled>Change Password</Button>
                    <span className="text-[9px] font-bold text-text-muted bg-surface-hover px-2 py-0.5 rounded border uppercase tracking-tighter">Enterprise Only</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-surface-border">
            <CardContent className="p-6">
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-hover text-text-secondary border border-surface-border shadow-sm">
                  <ShieldCheckIcon className="h-5 w-5" />
                </div>
                <div className="flex-1 space-y-3">
                  <div>
                    <p className="text-sm font-bold text-text-primary">Account Posture</p>
                    <p className="text-xs text-text-muted">Your account is currently protected by standard password auth.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-semantic-success-bg border border-semantic-success-border text-[9px] font-bold text-semantic-success uppercase">
                      <CheckIcon className="h-2.5 w-2.5" /> Healthy
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="border-surface-border overflow-hidden">
          <div className="px-6 py-4 bg-surface-panel/30 border-b border-surface-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <UserIcon className="h-4 w-4 text-text-muted" />
              <h3 className="text-sm font-bold text-text-primary">Active Session</h3>
            </div>
            <Button variant="ghost" size="sm" onClick={logout} isLoading={isLoggingOut} className="h-8 text-xs text-semantic-error hover:bg-semantic-error-bg">
               <LogOutIcon className="h-3.5 w-3.5 mr-1.5" />
               Sign Out Everywhere
            </Button>
          </div>
          <CardContent className="p-0">
            <div className="p-6 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-full bg-semantic-success/10 flex items-center justify-center text-semantic-success">
                  <div className="h-2 w-2 rounded-full bg-semantic-success animate-pulse" />
                </div>
                <div>
                  <p className="text-sm font-bold text-text-primary flex items-center gap-2">
                    Current Device
                    <span className="text-[10px] font-bold px-1.5 py-0.5 bg-semantic-success-bg text-semantic-success rounded border border-semantic-success-border">ACTIVE</span>
                  </p>
                  <p className="text-[11px] text-text-muted mt-0.5">TrustDesk Web App • Chrome on Windows</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-[11px] text-text-muted">Last active</p>
                <p className="text-xs font-medium text-text-primary">Just now</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
