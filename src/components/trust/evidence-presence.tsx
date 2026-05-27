"use client";

import { FileIcon } from "@/components/icons";

/** `sm`: library list rows. `md`: questionnaire / comfortable layouts. */
export type TrustDensity = "sm" | "md";

interface EvidencePresenceProps {
  /** Whether any source evidence is linked. */
  linked: boolean;
  /** When set with linked, shows numeric count (e.g. list from API later). */
  count?: number;
  /** `sm`: dense list rows. `md`: questionnaire / comfortable tap targets (min-h on wrapper). */
  density?: TrustDensity;
  /** Show text label after icon (default true). */
  showLabel?: boolean;
}

/**
 * Lightweight evidence linkage indicator — neutral when linked (no loud “success” in lists).
 * Questionnaire review: pass density="md" and wrap in min-h-[44px] flex items-center if needed.
 */
export function EvidencePresence({
  linked,
  count,
  density = "sm",
  showLabel = true,
}: EvidencePresenceProps) {
  const md = density === "md";
  const label =
    !linked
      ? "No sources"
      : count != null && count > 0
        ? `${count} source${count === 1 ? "" : "s"}`
        : "Sources";

  const base =
    "inline-flex max-w-full items-center gap-1.5 rounded-md border font-medium tabular-nums transition-colors";
  const size = md ? "min-h-11 px-3 py-2 text-sm" : "px-2 py-0.5 text-xs";
  const tone = linked
    ? "border-surface-border bg-surface-base text-text-secondary"
    : "border-surface-border bg-surface-panel text-text-muted";

  return (
    <span className={`${base} ${size} ${tone}`} title={linked ? "Linked to indexed document snippets" : "No snippets linked yet"}>
      <FileIcon className={`shrink-0 text-text-muted ${md ? "h-4 w-4" : "h-3 w-3"}`} />
      {showLabel ? <span className="truncate">{label}</span> : null}
    </span>
  );
}
