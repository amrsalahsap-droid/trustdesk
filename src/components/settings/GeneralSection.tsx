"use client";

import React, { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { 
  BuildingIcon, 
  LinkIcon, 
  GlobeIcon, 
  ShieldCheckIcon, 
  SparklesIcon, 
  ClockIcon,
  AlertCircleIcon,
  CheckIcon
} from "@/components/icons";
import { cn } from "@/lib/utils";

interface WorkspaceSettings {
  id: string;
  name: string;
  slug: string;
  website: string | null;
  timezone: string;
  logoUrl: string | null;
  industry: string[];
  productType: string[];
  customerSegment: string[];
  complianceTargets: string[];
}


export function GeneralSection() {
  const [settings, setSettings] = useState<WorkspaceSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/workspaces/settings");
        if (res.ok) {
          const json = await res.json();
          setSettings(json.workspace);
        }
      } catch (err) {
        console.error("Failed to load workspace settings", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const handleUpdate = async (delta: Partial<WorkspaceSettings>) => {
    if (!settings) return;
    
    // Optimistic update
    const previous = settings;
    setSettings({ ...settings, ...delta });
    
    setSaving(true);
    try {
      const res = await fetch("/api/workspaces/settings", {
        method: "PATCH",
        body: JSON.stringify(delta),
      });
      
      if (res.ok) {
        const json = await res.json();
        setSettings(json.workspace);
        toast({ title: "Changes saved", severity: "success" });
      } else {
        const err = await res.json();
        setSettings(previous);
        toast({ title: "Failed to save", description: err.error?.message || "Unknown error", severity: "error" });
      }
    } catch (err) {
      setSettings(previous);
      toast({ title: "Network error", severity: "error" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="animate-pulse space-y-8">
    <div className="h-8 w-48 bg-surface-hover rounded" />
    <div className="space-y-4">
      <div className="h-64 bg-surface-hover rounded-xl" />
      <div className="h-48 bg-surface-hover rounded-xl" />
    </div>
  </div>;

  if (!settings) return null;

  return (
    <div className="space-y-10 pb-20">
      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-bold text-text-primary">Workspace Identity</h2>
          <p className="text-sm text-text-muted">Manage your organization's core profile and branding.</p>
        </div>

        <Card>
          <CardContent className="p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-medium text-text-secondary">Workspace Name</label>
                <div className="relative group">
                  <BuildingIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted transition-colors group-focus-within:text-accent-primary" />
                  <input
                    type="text"
                    defaultValue={settings.name}
                    onBlur={(e) => e.target.value !== settings.name && handleUpdate({ name: e.target.value })}
                    className="w-full pl-10 pr-4 py-2 bg-surface-base border border-surface-border rounded-lg text-sm focus-ring"
                    placeholder="Acme Corp"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-text-secondary">URL Slug</label>
                <div className="relative group">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-mono text-text-muted">/</span>
                  <input
                    type="text"
                    defaultValue={settings.slug}
                    onBlur={(e) => e.target.value !== settings.slug && handleUpdate({ slug: e.target.value })}
                    className="w-full pl-6 pr-4 py-2 bg-surface-base border border-surface-border rounded-lg text-sm font-mono focus-ring"
                    placeholder="acme-corp"
                  />
                </div>
                <p className="text-[10px] text-text-muted">Unique identifier used in your workspace URL.</p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-text-secondary">Website</label>
                <div className="relative group">
                  <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted transition-colors group-focus-within:text-accent-primary" />
                  <input
                    type="url"
                    defaultValue={settings.website || ""}
                    onBlur={(e) => e.target.value !== (settings.website || "") && handleUpdate({ website: e.target.value })}
                    className="w-full pl-10 pr-4 py-2 bg-surface-base border border-surface-border rounded-lg text-sm focus-ring"
                    placeholder="https://acme.com"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-text-secondary">Logo URL</label>
                <div className="relative group">
                  <GlobeIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted transition-colors group-focus-within:text-accent-primary" />
                  <input
                    type="url"
                    defaultValue={settings.logoUrl || ""}
                    onBlur={(e) => e.target.value !== (settings.logoUrl || "") && handleUpdate({ logoUrl: e.target.value })}
                    className="w-full pl-10 pr-4 py-2 bg-surface-base border border-surface-border rounded-lg text-sm focus-ring"
                    placeholder="https://cdn.acme.com/logo.png"
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-bold text-text-primary">Localization</h2>
          <p className="text-sm text-text-muted">Set regional defaults for reporting and audit logs.</p>
        </div>

        <Card>
          <CardContent className="p-6">
            <div className="max-w-md space-y-2">
              <label className="text-sm font-medium text-text-secondary">Workspace Timezone</label>
              <select
                value={settings.timezone}
                onChange={(e) => handleUpdate({ timezone: e.target.value })}
                className="w-full px-4 py-2 bg-surface-base border border-surface-border rounded-lg text-sm focus-ring appearance-none"
              >
                <option value="UTC">UTC (Coordinated Universal Time)</option>
                <option value="America/New_York">Eastern Time (US & Canada)</option>
                <option value="America/Chicago">Central Time (US & Canada)</option>
                <option value="America/Denver">Mountain Time (US & Canada)</option>
                <option value="America/Los_Angeles">Pacific Time (US & Canada)</option>
                <option value="Europe/London">London / Greenwich Mean Time</option>
                <option value="Europe/Paris">Central European Time</option>
                <option value="Asia/Tokyo">Japan Standard Time</option>
              </select>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-bold text-text-primary">Business Metadata</h2>
          <p className="text-sm text-text-muted">Contextual information used to refine AI recommendations and benchmarks.</p>
        </div>

        <Card>
          <CardContent className="p-6 space-y-6">
             <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-text-secondary">Industries</label>
                  <div className="flex flex-wrap gap-1.5">
                    {settings.industry.map(ind => (
                      <span key={ind} className="px-2 py-0.5 bg-surface-hover text-text-secondary text-[10px] font-bold uppercase rounded border border-surface-border">
                        {ind}
                      </span>
                    ))}
                    <button className="px-2 py-0.5 border border-dashed border-surface-border text-text-muted text-[10px] font-bold uppercase rounded hover:border-accent-primary hover:text-accent-primary transition-colors">
                      + Add
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-text-secondary">Compliance Targets</label>
                  <div className="flex flex-wrap gap-1.5">
                    {settings.complianceTargets.map(target => (
                      <span key={target} className="px-2 py-0.5 bg-semantic-info-bg text-semantic-info text-[10px] font-bold uppercase rounded border border-semantic-info-border">
                        {target}
                      </span>
                    ))}
                    <button className="px-2 py-0.5 border border-dashed border-surface-border text-text-muted text-[10px] font-bold uppercase rounded hover:border-accent-primary hover:text-accent-primary transition-colors">
                      + Add
                    </button>
                  </div>
                </div>
             </div>
          </CardContent>
        </Card>
      </section>

      <div className="flex items-center justify-between pt-6 border-t border-surface-border">
        <div className="flex items-center gap-2 text-text-muted">
           <CheckIcon className="h-4 w-4 text-semantic-success" />
           <span className="text-xs">All changes are automatically saved to your workspace.</span>
        </div>
        <div className="flex items-center gap-4">
           <code className="text-[10px] text-text-muted bg-surface-hover px-2 py-1 rounded">ID: {settings.id}</code>
        </div>
      </div>
    </div>
  );
}
