"use client";

import { useEffect, useState } from "react";
import { answerAuditEventLabel, formatGovernanceDeltaLines } from "./answer-audit-event-labels";

type AuditRow = {
  id: string;
  eventType: string;
  createdAt: string;
  metadataJson: unknown;
  actorUserId?: string | null;
  actorLabel?: string | null;
  actorEmail?: string | null;
};

export function AnswerWorkflowAuditPanel({ answerId, workspaceId }: { answerId: string; workspaceId: string }) {
  const [events, setEvents] = useState<AuditRow[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !answerId || !workspaceId) return;
    let cancelled = false;
    setLoading(true);
    void fetch(`/api/knowledge/answers/${answerId}/audit`, {
      headers: { "x-workspace-id": workspaceId },
      cache: "no-store",
    })
      .then((r) => r.json())
      .then((data: { events?: AuditRow[] }) => {
        if (!cancelled && Array.isArray(data.events)) setEvents(data.events);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, answerId, workspaceId]);

  return (
    <div className="rounded-xl border border-surface-border bg-surface-panel/30">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-text-muted hover:bg-surface-hover/50"
      >
        Workflow & audit history
        <span className="text-text-primary">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div className="max-h-56 space-y-2 overflow-y-auto border-t border-surface-border px-4 py-3 custom-scrollbar">
          {loading ? (
            <p className="text-xs text-text-muted">Loading…</p>
          ) : events.length === 0 ? (
            <p className="text-xs text-text-muted">No audit events yet.</p>
          ) : (
            events.map((ev) => {
              const meta =
                ev.metadataJson && typeof ev.metadataJson === "object" && ev.metadataJson !== null
                  ? (ev.metadataJson as Record<string, unknown>)
                  : null;
              const delta = meta ? formatGovernanceDeltaLines(meta) : null;
              const actor =
                ev.actorLabel?.trim() ||
                (ev.actorEmail ? String(ev.actorEmail) : ev.actorUserId ? `User ${ev.actorUserId}` : null);
              return (
                <div key={ev.id} className="rounded-md border border-surface-border/60 bg-surface-base/50 px-2 py-1.5 text-[11px]">
                  <div className="font-semibold text-text-primary">{answerAuditEventLabel(ev.eventType)}</div>
                  <div className="text-[10px] font-mono text-text-muted/80">{ev.eventType}</div>
                  <div className="text-[10px] text-text-muted">
                    {new Date(ev.createdAt).toLocaleString()}
                    {actor ? ` · ${actor}` : ""}
                  </div>
                  {delta && (
                    <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap break-words text-[10px] text-text-secondary">
                      {delta}
                    </pre>
                  )}
                  {meta && !delta && (
                    <pre className="mt-1 max-h-20 overflow-auto whitespace-pre-wrap break-all text-[10px] text-text-secondary">
                      {JSON.stringify(meta, null, 0).slice(0, 400)}
                    </pre>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
