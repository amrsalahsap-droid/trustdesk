"use client";

import React, { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  DatabaseIcon, 
  EnvelopeIcon, 
  ShieldCheckIcon, 
  AlertCircleIcon, 
  CheckIcon,
  RefreshIcon,
  LinkIcon,
  SparklesIcon
} from "@/components/icons";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";

interface HealthData {
  email: {
    provider: string;
    configured: boolean;
    senderAddress: string;
  };
  storage: {
    driver: string;
    configured: boolean;
    bucket: string | null;
    region: string | null;
  };
  slack: { configured: boolean; status: string };
  jira: { configured: boolean; status: string };
}

export function IntegrationsSection() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { toast } = useToast();

  async function fetchHealth() {
    setRefreshing(true);
    try {
      const res = await fetch("/api/admin/integrations/health");
      if (res.ok) {
        const data = await res.json();
        setHealth(data);
      }
    } catch (err) {
      console.error("Failed to fetch health", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    fetchHealth();
  }, []);

  if (loading) return (
    <div className="animate-pulse space-y-6">
      <div className="h-8 w-48 bg-surface-hover rounded" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="h-40 bg-surface-hover rounded-xl" />
        <div className="h-40 bg-surface-hover rounded-xl" />
      </div>
    </div>
  );

  return (
    <div className="space-y-10">
      <section className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-text-primary">Core Services</h2>
            <p className="text-sm text-text-muted">Status and health of essential platform infrastructure.</p>
          </div>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={fetchHealth} 
            disabled={refreshing}
            className="h-8 text-xs text-text-muted hover:text-text-primary"
          >
            <RefreshIcon className={cn("h-3.5 w-3.5 mr-1.5", refreshing && "animate-spin")} />
            Refresh Health
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Email Provider Card */}
          <Card className={cn(
            "relative overflow-hidden border-surface-border transition-all",
            health?.email.configured ? "bg-semantic-success-bg/5" : "bg-semantic-error-bg/5"
          )}>
            <CardContent className="p-6">
              <div className="flex items-start justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-surface-panel border border-surface-border flex items-center justify-center text-text-primary shadow-sm">
                    <EnvelopeIcon className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-text-primary">Email Provider</h3>
                    <p className="text-[10px] font-medium text-text-muted uppercase tracking-wider">{health?.email.provider}</p>
                  </div>
                </div>
                <div className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border uppercase tracking-widest",
                  health?.email.configured 
                    ? "bg-semantic-success-bg border-semantic-success-border text-semantic-success" 
                    : "bg-semantic-error-bg border-semantic-error-border text-semantic-error"
                )}>
                  {health?.email.configured ? (
                    <><CheckIcon className="h-3 w-3" /> Configured</>
                  ) : (
                    <><AlertCircleIcon className="h-3 w-3" /> Unconfigured</>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs py-2 border-b border-surface-border/50">
                  <span className="text-text-muted">Sender Address</span>
                  <span className="font-mono text-text-primary">{health?.email.senderAddress || "Not Set"}</span>
                </div>
                <div className="flex items-center justify-between text-xs py-2 border-b border-surface-border/50">
                  <span className="text-text-muted">Connection Status</span>
                  <span className="flex items-center gap-1.5 font-medium text-text-primary">
                    <div className={cn("h-1.5 w-1.5 rounded-full", health?.email.configured ? "bg-semantic-success" : "bg-semantic-error")} />
                    {health?.email.configured ? "Operational" : "Disconnected"}
                  </span>
                </div>
              </div>

              <div className="mt-6 flex items-center gap-2">
                <Button variant="outline" size="sm" className="h-8 text-[11px] flex-1" disabled={!health?.email.configured}>
                  Test Connection
                </Button>
                <Button variant="ghost" size="sm" className="h-8 text-[11px] flex-1 text-text-muted">
                  View Logs
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Storage Connector Card */}
          <Card className={cn(
            "relative overflow-hidden border-surface-border transition-all",
            health?.storage.configured ? "bg-semantic-success-bg/5" : "bg-semantic-error-bg/5"
          )}>
            <CardContent className="p-6">
              <div className="flex items-start justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-surface-panel border border-surface-border flex items-center justify-center text-text-primary shadow-sm">
                    <DatabaseIcon className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-text-primary">Object Storage</h3>
                    <p className="text-[10px] font-medium text-text-muted uppercase tracking-wider">Driver: {health?.storage.driver}</p>
                  </div>
                </div>
                <div className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border uppercase tracking-widest",
                  health?.storage.configured 
                    ? "bg-semantic-success-bg border-semantic-success-border text-semantic-success" 
                    : "bg-semantic-error-bg border-semantic-error-border text-semantic-error"
                )}>
                  {health?.storage.configured ? (
                    <><CheckIcon className="h-3 w-3" /> Configured</>
                  ) : (
                    <><AlertCircleIcon className="h-3 w-3" /> Unconfigured</>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs py-2 border-b border-surface-border/50">
                  <span className="text-text-muted">Bucket / Path</span>
                  <span className="font-mono text-text-primary">{health?.storage.bucket || "None"}</span>
                </div>
                <div className="flex items-center justify-between text-xs py-2 border-b border-surface-border/50">
                  <span className="text-text-muted">Region</span>
                  <span className="font-mono text-text-primary">{health?.storage.region || "N/A"}</span>
                </div>
              </div>

              <div className="mt-6 flex items-center gap-2">
                <Button variant="outline" size="sm" className="h-8 text-[11px] flex-1" disabled={!health?.storage.configured}>
                  Validate Permissions
                </Button>
                <Button variant="ghost" size="sm" className="h-8 text-[11px] flex-1 text-text-muted">
                  S3 Settings
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="space-y-6">
        <div>
          <h2 className="text-xl font-bold text-text-primary">Third-Party Connectors</h2>
          <p className="text-sm text-text-muted">Extend TrustDesk by connecting your existing security and communication tools.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 opacity-75">
          {["Slack", "Jira", "Vanta"].map((item) => (
            <Card key={item} className="border-surface-border bg-surface-panel/30 border-dashed">
              <CardContent className="p-5 flex flex-col items-center text-center">
                <div className="h-10 w-10 rounded-lg bg-surface-hover flex items-center justify-center text-text-muted mb-4 border border-surface-border">
                   {item === "Slack" ? <LinkIcon className="h-5 w-5" /> : <DatabaseIcon className="h-5 w-5" />}
                </div>
                <h4 className="text-sm font-bold text-text-primary mb-1">{item}</h4>
                <p className="text-[10px] text-text-muted mb-4">Native integration support for automated workflows.</p>
                <span className="text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-surface-hover text-text-muted border border-surface-border">
                  Coming Soon
                </span>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <Card className="bg-accent-primary/[0.02] border-dashed border-accent-primary/20">
        <CardContent className="p-8 flex flex-col items-center justify-center text-center">
          <SparklesIcon className="h-10 w-10 text-accent-primary/30 mb-4" />
          <h3 className="text-sm font-bold text-text-primary mb-1">Looking for AI Config?</h3>
          <p className="text-xs text-text-muted max-w-sm mb-4">
            Model endpoint settings and answer policies have moved to the <strong>AI & Answer Policy</strong> section.
          </p>
          <Button variant="outline" size="sm">Go to AI Settings</Button>
        </CardContent>
      </Card>
    </div>
  );
}
