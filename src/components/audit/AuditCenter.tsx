"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  ActivityIcon, 
  UserIcon, 
  ShieldCheckIcon, 
  BookIcon, 
  ClipboardIcon,
  SearchIcon,
  FilterIcon,
  DownloadIcon,
  ChevronDownIcon,
  SettingsIcon,
  ClockIcon,
  AlertCircleIcon,
  BuildingIcon,
  RefreshIcon
} from "@/components/icons";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface AuditEvent {
  id: string;
  eventType: string;
  objectType: string;
  objectId: string | null;
  actorUserId: string | null;
  actorLabel: string | null;
  actorEmail: string | null;
  metadataJson: any;
  createdAt: string;
}

export function AuditCenter() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    eventType: "",
    actorSearch: "",
    dateRange: "all",
  });
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filters.eventType) params.set("eventType", filters.eventType);
      
      const res = await fetch(`/api/workspaces/audit?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setEvents(data.events);
      } else {
        throw new Error("Failed to load audit events");
      }
    } catch (err) {
      console.error("Failed to load audit events", err);
      setError("We couldn't retrieve the audit log. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, [filters.eventType]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const filteredEvents = events.filter(e => {
    if (filters.actorSearch && !e.actorLabel?.toLowerCase().includes(filters.actorSearch.toLowerCase())) return false;
    return true;
  });

  const getEventIcon = (type: string) => {
    if (type.includes("USER") || type.includes("INVITE") || type.includes("ROLE") || type.includes("MEMBERSHIP")) 
      return <div className="p-2 bg-blue-500/10 text-blue-500 rounded-lg"><UserIcon className="h-4 w-4" /></div>;
    if (type.includes("ANSWER") || type.includes("LIBRARY")) 
      return <div className="p-2 bg-emerald-500/10 text-emerald-500 rounded-lg"><BookIcon className="h-4 w-4" /></div>;
    if (type.includes("GOVERNANCE") || type.includes("APPROVE") || type.includes("REVIEW")) 
      return <div className="p-2 bg-purple-500/10 text-purple-500 rounded-lg"><ShieldCheckIcon className="h-4 w-4" /></div>;
    if (type.includes("CONTRADICTION"))
      return <div className="p-2 bg-violet-500/10 text-violet-700 rounded-lg"><AlertCircleIcon className="h-4 w-4" /></div>;
    if (type.includes("QUESTIONNAIRE")) 
      return <div className="p-2 bg-amber-500/10 text-amber-500 rounded-lg"><ClipboardIcon className="h-4 w-4" /></div>;
    if (type.includes("EXPORT")) 
      return <div className="p-2 bg-indigo-500/10 text-indigo-500 rounded-lg"><DownloadIcon className="h-4 w-4" /></div>;
    if (type.includes("WORKSPACE")) 
      return <div className="p-2 bg-rose-500/10 text-rose-500 rounded-lg"><BuildingIcon className="h-4 w-4" /></div>;
    return <div className="p-2 bg-slate-500/10 text-slate-500 rounded-lg"><ActivityIcon className="h-4 w-4" /></div>;
  };

  const renderMetadata = (meta: any) => {
    if (!meta || typeof meta !== 'object') return null;
    
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2 p-4 bg-surface-base rounded-lg border border-surface-border">
        {Object.entries(meta).map(([key, value]) => {
          if (key === 'before' || key === 'after' || key === 'previousState' || key === 'changes') return null;
          return (
            <div key={key} className="flex flex-col gap-1">
              <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider">{key}</span>
              <span className="text-xs text-text-primary font-mono truncate">
                {typeof value === 'object' ? JSON.stringify(value) : String(value)}
              </span>
            </div>
          );
        })}
        
        {/* Before/After View */}
        {(meta.before !== undefined || meta.after !== undefined) && (
          <div className="col-span-full grid grid-cols-2 gap-4 mt-2 pt-2 border-t border-surface-border">
            <div className="space-y-1">
              <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Before</span>
              <pre className="text-[11px] p-2 bg-surface-hover rounded border border-surface-border overflow-x-auto text-text-secondary">
                {JSON.stringify(meta.before || meta.previousState || "N/A", null, 2)}
              </pre>
            </div>
            <div className="space-y-1">
              <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider text-accent-primary">After / Changes</span>
              <pre className="text-[11px] p-2 bg-accent-primary/5 rounded border border-accent-primary/10 overflow-x-auto text-text-primary">
                {JSON.stringify(meta.after || meta.changes || "N/A", null, 2)}
              </pre>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Filters Bar */}
      <Card className="border-surface-border bg-surface-panel shadow-sm">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex-1 min-w-[240px] relative">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
              <input 
                type="text"
                placeholder="Search actor name or email..."
                className="w-full pl-10 pr-4 py-2 bg-surface-base border border-surface-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent-primary/20 focus:border-accent-primary transition-all"
                value={filters.actorSearch}
                onChange={(e) => setFilters(f => ({ ...f, actorSearch: e.target.value }))}
              />
            </div>

            <div className="flex items-center gap-2">
              <select 
                className="bg-surface-base border border-surface-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-primary/20"
                value={filters.eventType}
                onChange={(e) => setFilters(f => ({ ...f, eventType: e.target.value }))}
              >
                <option value="">All Event Types</option>
                <optgroup label="User & Access">
                  <option value="USER_INVITED">User Invited</option>
                  <option value="INVITE_ACCEPTED">Invite Accepted</option>
                  <option value="ROLE_CHANGED">Role Changed</option>
                  <option value="MEMBERSHIP_REMOVED">Membership Removed</option>
                </optgroup>
                <optgroup label="Governance & Approval">
                  <option value="ANSWER_SUBMITTED_FOR_REVIEW">Submitted for Review</option>
                  <option value="ANSWER_APPROVED_INTERNAL">Internal Approval</option>
                  <option value="ANSWER_APPROVED_FOR_EXPORT">Approved for Export</option>
                  <option value="ANSWER_WORKFLOW_REJECTED">Workflow Rejected</option>
                  <option value="APPROVER_CHANGED">Approver Changed</option>
                </optgroup>
                <optgroup label="Library & Versions">
                  <option value="ANSWER_LIBRARY_ITEM_CREATED">Item Created</option>
                  <option value="ANSWER_LIBRARY_ITEM_UPDATED">Item Updated</option>
                  <option value="ANSWER_LIBRARY_VERSION_RECORDED">Version Recorded</option>
                  <option value="ANSWER_OWNER_CHANGED">Owner Changed</option>
                  <option value="ANSWER_LIBRARY_OVERRIDE">Library Override</option>
                </optgroup>
                <optgroup label="Questionnaires & AI">
                  <option value="SOURCE_DOCUMENT_UPLOAD_SUCCEEDED">Document Uploaded</option>
                  <option value="EXPORT_DOWNLOADED">Export Downloaded</option>
                  <option value="QUESTIONNAIRE_ITEM_OVERRIDE">Item Override</option>
                  <option value="QUESTIONNAIRE_JOB_RESCAN">Job Rescan</option>
                </optgroup>
                <optgroup label="Questionnaire — contradictions">
                  <option value="QUESTIONNAIRE_ITEM_CONTRADICTION_DETECTED">Contradiction detected</option>
                  <option value="QUESTIONNAIRE_ITEM_CONTRADICTION_RESOLVED">Contradiction resolved (keep / edit)</option>
                  <option value="QUESTIONNAIRE_ITEM_CONTRADICTION_DISMISSED">Contradiction dismissed</option>
                  <option value="QUESTIONNAIRE_ITEM_CANONICAL_UPDATE_REQUESTED">Canonical update requested</option>
                </optgroup>
                <optgroup label="Workspace Danger">
                  <option value="WORKSPACE_ARCHIVED">Workspace Archived</option>
                  <option value="WORKSPACE_INVITES_REVOKED_BULK">Invites Revoked Bulk</option>
                  <option value="WORKSPACE_EXPORT_DEFAULTS_RESET">Export Defaults Reset</option>
                </optgroup>
              </select>

              <Button variant="outline" size="sm" onClick={loadEvents} disabled={loading}>
                <RefreshIcon className={cn("h-4 w-4 mr-2", loading && "animate-spin")} />
                Refresh
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Error State */}
      {error && (
        <Card className="border-rose-200 bg-rose-50/30 p-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 text-rose-600 mb-4">
            <AlertCircleIcon className="h-6 w-6" />
          </div>
          <h3 className="text-lg font-bold text-text-primary">Failed to load audit events</h3>
          <p className="mt-2 text-sm text-text-muted max-w-md mx-auto">{error}</p>
          <Button variant="outline" className="mt-6" onClick={loadEvents}>
            <RefreshIcon className="h-4 w-4 mr-2" />
            Try Again
          </Button>
        </Card>
      )}

      {/* Events List */}
      {!error && (
        <div className="space-y-2">
          {loading && events.length === 0 ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="flex items-center gap-4 p-4 rounded-2xl border border-surface-border bg-white shadow-sm">
                  <Skeleton className="h-10 w-10 rounded-lg shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="flex justify-between">
                      <Skeleton className="h-4 w-48 rounded" />
                      <Skeleton className="h-3 w-32 rounded" />
                    </div>
                    <Skeleton className="h-3 w-24 rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : events.length === 0 ? (
          <Card className="border-dashed border-surface-border bg-transparent">
            <CardContent className="p-16 flex flex-col items-center justify-center text-center">
              <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-surface-border bg-white shadow-sm">
                <ActivityIcon className="h-8 w-8 text-text-muted/20" />
              </div>
              <h3 className="text-xl font-bold text-text-primary">No audit events yet</h3>
              <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-text-muted">
                Workspace actions, approvals, answer changes, and exports will appear here once activity begins.
              </p>
              <p className="mt-2 text-xs text-text-muted italic">
                Activity logs help maintain a verifiable chain of custody for your security compliance data.
              </p>
              <div className="mt-8 flex items-center gap-4">
                <Link href="/app/questionnaires/new">
                  <Button>Start Questionnaire</Button>
                </Link>
                <Button variant="outline" onClick={loadEvents}>Refresh Log</Button>
              </div>
            </CardContent>
          </Card>
        ) : filteredEvents.length === 0 ? (
          <Card className="border-dashed border-surface-border bg-transparent">
            <CardContent className="p-12 flex flex-col items-center justify-center text-center">
              <SearchIcon className="h-12 w-12 text-text-muted/20 mb-4" />
              <h3 className="text-sm font-bold text-text-primary">No matching events found</h3>
              <p className="text-xs text-text-muted max-w-xs mt-1">Try adjusting your filters or search terms to find what you're looking for.</p>
              <Button variant="ghost" size="sm" className="mt-4" onClick={() => setFilters({ eventType: "", actorSearch: "", dateRange: "all" })}>
                Clear Filters
              </Button>
            </CardContent>
          </Card>
        ) : (
          filteredEvents.map((event) => (
            <Card 
              key={event.id} 
              className={cn(
                "border-surface-border transition-all overflow-hidden",
                expandedEvent === event.id ? "ring-1 ring-accent-primary/20 bg-accent-primary/[0.01]" : "hover:bg-surface-hover/50 cursor-pointer"
              )}
              onClick={() => setExpandedEvent(expandedEvent === event.id ? null : event.id)}
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  {getEventIcon(event.eventType)}
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-text-primary capitalize">{event.eventType.toLowerCase().replace(/_/g, " ")}</span>
                        <span className="text-xs text-text-muted px-1.5 py-0.5 bg-surface-hover rounded border border-surface-border">{event.objectType}</span>
                      </div>
                      <span className="text-[11px] font-medium text-text-muted flex items-center gap-1.5">
                        <ClockIcon className="h-3 w-3" />
                        {format(new Date(event.createdAt), "MMM d, yyyy · HH:mm:ss")}
                      </span>
                    </div>
                    
                    <div className="flex items-center justify-between mt-1">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-text-muted">Actor:</span>
                        <span className="font-bold text-text-secondary">{event.actorLabel}</span>
                        {event.actorEmail && <span className="text-text-muted font-normal text-[10px]">({event.actorEmail})</span>}
                      </div>
                      <div className="flex items-center gap-1 text-[10px] text-text-muted font-mono">
                        <span>ID: {event.id.substring(0, 12)}...</span>
                        <ChevronDownIcon className={cn("h-3 w-3 transition-transform", expandedEvent === event.id && "rotate-180")} />
                      </div>
                    </div>
                  </div>
                </div>

                {expandedEvent === event.id && (
                  <div className="mt-4 animate-in slide-in-from-top-1 fade-in duration-200">
                    <div className="flex items-center gap-2 text-[10px] font-bold text-text-muted uppercase tracking-widest mb-3">
                      <SettingsIcon className="h-3 w-3" />
                      Event Metadata & State Changes
                    </div>
                    {renderMetadata(event.metadataJson)}
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    )}
    </div>
  );
}
