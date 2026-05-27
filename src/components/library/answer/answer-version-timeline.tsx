"use client";

import { useMemo, useState } from "react";
import type { AnswerDetailVersion, AnswerVersionDiffEntry } from "@/components/library/library-types";

function formatDiffValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "string") return v.length > 200 ? `${v.slice(0, 200)}…` : v;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function simpleLineDiff(left: string, right: string): { kind: "ctx" | "add" | "rem"; text: string }[] {
  const a = left.split("\n");
  const b = right.split("\n");
  const max = Math.max(a.length, b.length);
  const out: { kind: "ctx" | "add" | "rem"; text: string }[] = [];
  for (let i = 0; i < max; i++) {
    const al = a[i] ?? "";
    const bl = b[i] ?? "";
    if (al === bl) out.push({ kind: "ctx", text: al || " " });
    else {
      if (al) out.push({ kind: "rem", text: al });
      if (bl) out.push({ kind: "add", text: bl });
    }
  }
  return out;
}

interface AnswerVersionTimelineProps {
  versions: AnswerDetailVersion[];
  currentVersion: number;
  compact?: boolean;
}

export function AnswerVersionTimeline({ versions, currentVersion, compact }: AnswerVersionTimelineProps) {
  const [expandedVersionId, setExpandedVersionId] = useState<string | null>(null);
  const [compareFrom, setCompareFrom] = useState<number | null>(null);
  const [compareTo, setCompareTo] = useState<number | null>(null);

  const sorted = useMemo(
    () => [...versions].sort((a, b) => b.versionNumber - a.versionNumber),
    [versions],
  );

  const fromVer = sorted.find((v) => v.versionNumber === compareFrom) ?? null;
  const toVer = sorted.find((v) => v.versionNumber === compareTo) ?? null;
  const diffLines =
    fromVer && toVer
      ? simpleLineDiff(fromVer.answerText ?? "", toVer.answerText ?? "")
      : [];

  if (versions.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-white/10 bg-white/5 p-8 text-center">
        <p className="mb-1 text-xs font-medium text-text-primary">No version history</p>
        <p className="text-[10px] text-text-muted">This is the original version of this answer.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {!compact && sorted.length >= 2 ? (
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-text-muted">Compare versions</p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-[10px] text-text-muted">
              From
              <select
                className="rounded-lg border border-white/10 bg-surface-base px-2 py-1.5 text-xs text-text-primary"
                value={compareFrom ?? ""}
                onChange={(e) => setCompareFrom(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">Select…</option>
                {sorted.map((v) => (
                  <option key={`f-${v.id}`} value={v.versionNumber}>
                    v{v.versionNumber}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[10px] text-text-muted">
              To
              <select
                className="rounded-lg border border-white/10 bg-surface-base px-2 py-1.5 text-xs text-text-primary"
                value={compareTo ?? ""}
                onChange={(e) => setCompareTo(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">Select…</option>
                {sorted.map((v) => (
                  <option key={`t-${v.id}`} value={v.versionNumber}>
                    v{v.versionNumber}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {fromVer && toVer && compareFrom !== compareTo ? (
            <div className="mt-3 max-h-48 overflow-y-auto rounded-lg border border-white/10 bg-black/20 p-2 font-mono text-[10px] leading-relaxed">
              {diffLines.map((row, i) => (
                <div
                  key={i}
                  className={
                    row.kind === "add"
                      ? "bg-emerald-500/10 text-emerald-200"
                      : row.kind === "rem"
                        ? "bg-rose-500/10 text-rose-200"
                        : "text-text-muted"
                  }
                >
                  <span className="select-none opacity-50">
                    {row.kind === "add" ? "+ " : row.kind === "rem" ? "- " : "  "}
                  </span>
                  {row.text || " "}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="relative space-y-4 pl-4 before:absolute before:bottom-2 before:left-[7px] before:top-2 before:w-[2px] before:bg-white/5">
        {sorted.map((ver) => {
          const isCurrent = ver.versionNumber === (currentVersion ?? 1);
          const diffEntries: AnswerVersionDiffEntry[] = Array.isArray(ver.changeDiffJson)
            ? (ver.changeDiffJson as AnswerVersionDiffEntry[])
            : [];
          return (
            <div key={ver.id} className="relative">
              <div
                className={`absolute -left-[13px] top-1.5 h-2 w-2 rounded-full border-2 border-surface-base transition-all ${
                  isCurrent ? "bg-accent-primary ring-4 ring-accent-primary/10" : "bg-white/20"
                }`}
              />
              <div className="pl-4">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span
                    className={`text-[10px] font-bold uppercase tracking-tighter ${
                      isCurrent ? "text-accent-primary" : "text-text-muted"
                    }`}
                  >
                    Version {ver.versionNumber}
                    {isCurrent ? " (current)" : ""}
                  </span>
                  {ver.resetApprovalRequired ? (
                    <span className="rounded bg-rose-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-rose-300 ring-1 ring-rose-500/30">
                      Review reset
                    </span>
                  ) : null}
                  {ver.changeKind ? (
                    <span className="rounded bg-white/5 px-1.5 py-0.5 text-[9px] font-mono text-text-muted">
                      {ver.changeKind}
                    </span>
                  ) : null}
                  {ver.changeReason?.toLowerCase().includes("ai seeding") && (
                    <div className="flex items-center gap-1 rounded bg-secondary-indigo/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-secondary-indigo ring-1 ring-secondary-indigo/20">
                      AI Suggestion
                    </div>
                  )}
                  <span className="shrink-0 text-[9px] text-text-muted">
                    {new Date(ver.createdAt).toLocaleString(undefined, {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </span>
                </div>
                {(ver.governanceStatus || ver.approvalScope != null) && (
                  <div className="mb-1 flex flex-wrap gap-1 text-[9px] text-text-muted">
                    {ver.governanceStatus && (
                      <span className="rounded bg-surface-base px-1.5 py-0.5 font-mono">{ver.governanceStatus}</span>
                    )}
                    {ver.approvalScope && (
                      <span className="rounded bg-surface-base px-1.5 py-0.5 font-mono">scope:{ver.approvalScope}</span>
                    )}
                    {ver.exportSafe != null && (
                      <span className="rounded bg-surface-base px-1.5 py-0.5 font-mono">
                        exportSafe:{String(ver.exportSafe)}
                      </span>
                    )}
                  </div>
                )}
                {diffEntries.length > 0 ? (
                  <ul className="mb-2 space-y-1 rounded-lg border border-white/5 bg-white/[0.02] p-2 text-[10px] text-text-secondary">
                    {diffEntries.map((e, idx) => (
                      <li key={idx}>
                        <span className="font-semibold text-text-primary">{e.field}</span>:{" "}
                        <span className="text-semantic-error">{formatDiffValue(e.before)}</span>
                        {" → "}
                        <span className="text-semantic-success-text">{formatDiffValue(e.after)}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <p className="mb-1 line-clamp-2 text-xs font-medium text-text-secondary">
                  {ver.changeReason || "No change log provided."}
                </p>
                <div className="mb-2 flex flex-wrap items-center gap-2 text-[9px]">
                  <span className="font-bold uppercase tracking-widest text-text-muted">
                    {ver.changeReason?.toLowerCase().includes("ai seeding") ? "Generated by" : "Edited by"}
                  </span>
                  <span className="font-bold text-text-primary">
                    {ver.changeReason?.toLowerCase().includes("ai seeding")
                      ? "TrustDesk AI"
                      : ver.changedBy?.name || "System"}
                  </span>
                  {ver.changedBy?.id ? (
                    <span className="font-mono text-text-muted">({ver.changedBy.id.slice(0, 8)}…)</span>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="mb-2 text-[10px] font-semibold text-accent-primary hover:underline"
                  onClick={() => setExpandedVersionId((id) => (id === ver.id ? null : ver.id))}
                >
                  {expandedVersionId === ver.id ? "Hide answer text" : "Show answer text"}
                </button>
                {expandedVersionId === ver.id ? (
                  <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-xs leading-relaxed text-text-secondary whitespace-pre-wrap">
                    {ver.answerText ?? "—"}
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
