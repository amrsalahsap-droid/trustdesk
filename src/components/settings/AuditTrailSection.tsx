"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { 
  ActivityIcon, 
  UserIcon, 
  ShieldCheckIcon, 
  BookIcon, 
  ClipboardIcon,
  SearchIcon 
} from "@/components/icons";
import { cn } from "@/lib/utils";

interface AuditEvent {
  id: string;
  eventType: string;
  objectType: string;
  objectId: string | null;
  actorUserId: string | null;
  metadataJson: any;
  createdAt: string;
}

export function AuditTrailSection() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/workspaces/audit");
        if (res.ok) {
          const data = await res.json();
          setEvents(data.events);
        }
      } catch (err) {
        console.error("Failed to load audit events", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const getEventIcon = (type: string) => {
    if (type.includes("USER") || type.includes("INVITE")) return <UserIcon className="h-4 w-4" />;
    if (type.includes("ANSWER") || type.includes("LIBRARY")) return <BookIcon className="h-4 w-4" />;
    if (type.includes("QUESTIONNAIRE")) return <ClipboardIcon className="h-4 w-4" />;
    return <ActivityIcon className="h-4 w-4" />;
  };

  if (loading) return <div className="animate-pulse space-y-3"><div className="h-10 bg-surface-hover rounded-lg" /><div className="h-10 bg-surface-hover rounded-lg" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-text-primary">Audit Trail</h2>
          <p className="text-sm text-text-muted">A record of significant administrative and governance events in the workspace.</p>
        </div>
      </div>

      <div className="rounded-xl border border-surface-border bg-surface-panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-hover text-text-muted font-medium border-b border-surface-border">
              <tr>
                <th className="px-4 py-3">Event</th>
                <th className="px-4 py-3">Object</th>
                <th className="px-4 py-3">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {events.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-text-muted">
                    No recent activity found.
                  </td>
                </tr>
              ) : (
                events.map((event) => (
                  <tr key={event.id} className="hover:bg-surface-hover transition-colors">
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-7 w-7 items-center justify-center rounded bg-surface-border text-text-secondary">
                          {getEventIcon(event.eventType)}
                        </div>
                        <div>
                          <p className="font-bold text-text-primary">{event.eventType.replace(/_/g, " ")}</p>
                          <p className="text-[11px] text-text-muted font-mono">{event.id.substring(0, 8)}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-text-secondary capitalize">
                      {event.objectType.toLowerCase()}
                    </td>
                    <td className="px-4 py-4 text-text-muted tabular-nums">
                      {format(new Date(event.createdAt), "MMM d, h:mm a")}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
