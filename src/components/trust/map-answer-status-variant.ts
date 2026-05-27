import type { StatusVariant } from "@/components/ui/status-badge";

/**
 * Maps answer library governance status to StatusBadge variant.
 * ARCHIVED uses neutral (retired, not an error). UNRESOLVED reserved for future schema.
 */
export function answerStatusToBadgeVariant(status: string | null | undefined): StatusVariant {
  const s = (status || "DRAFT").toUpperCase();
  if (s === "APPROVED") return "ok";
  if (s === "ARCHIVED") return "neutral";
  if (s === "UNRESOLVED") return "processing";
  return "warning";
}

/** Human-readable badge label (keeps enum values readable). */
export function answerStatusDisplayLabel(status: string | null | undefined): string {
  const s = (status || "DRAFT").toUpperCase();
  if (s === "UNRESOLVED") return "Unresolved";
  if (s === "DRAFT") return "Draft";
  if (s === "APPROVED") return "Approved";
  if (s === "ARCHIVED") return "Archived";
  return s.charAt(0) + s.slice(1).toLowerCase();
}
