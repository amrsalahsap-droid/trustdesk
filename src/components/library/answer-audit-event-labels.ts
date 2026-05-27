import { AUDIT_EVENT_TYPES } from "@/lib/audit/audit-event-types";

/** Short labels for answer-scoped audit rows (auditor-friendly). */
export const ANSWER_AUDIT_EVENT_LABELS: Record<string, string> = {
  [AUDIT_EVENT_TYPES.ANSWER_OWNER_CHANGED]: "Owner changed",
  [AUDIT_EVENT_TYPES.APPROVER_CHANGED]: "Approver changed",
  [AUDIT_EVENT_TYPES.ANSWER_LIBRARY_ITEM_CREATED]: "Answer created",
  [AUDIT_EVENT_TYPES.ANSWER_LIBRARY_ITEM_UPDATED]: "Answer updated",
  [AUDIT_EVENT_TYPES.ANSWER_LIBRARY_ITEM_ARCHIVED]: "Answer archived",
  [AUDIT_EVENT_TYPES.ANSWER_SUBMITTED_FOR_REVIEW]: "Submitted for review",
  [AUDIT_EVENT_TYPES.ANSWER_APPROVED_INTERNAL]: "Approved (internal)",
  [AUDIT_EVENT_TYPES.ANSWER_APPROVED_FOR_EXPORT]: "Approved for export",
  [AUDIT_EVENT_TYPES.ANSWER_EXPORT_SAFE_CONFIRMED]: "Export-safe confirmed",
  [AUDIT_EVENT_TYPES.ANSWER_EXPORT_SAFE_REVOKED]: "Export-safe revoked",
  [AUDIT_EVENT_TYPES.ANSWER_REVISION_REQUESTED]: "Revision requested",
  [AUDIT_EVENT_TYPES.ANSWER_WORKFLOW_REJECTED]: "Rejected in workflow",
  [AUDIT_EVENT_TYPES.ANSWER_REVIEW_CADENCE_LAPSED]: "Review cadence lapsed",
  [AUDIT_EVENT_TYPES.ANSWER_LIBRARY_VERSION_RECORDED]: "Version recorded",
  [AUDIT_EVENT_TYPES.ANSWER_REVIEW_SCHEDULE_CHANGED]: "Review schedule changed",
  [AUDIT_EVENT_TYPES.ANSWER_EVIDENCE_CHANGE_FLAGGED]: "Evidence change — review required",
  [AUDIT_EVENT_TYPES.ANSWER_LIBRARY_OVERRIDE]: "Override recorded",
};

export function answerAuditEventLabel(eventType: string): string {
  return ANSWER_AUDIT_EVENT_LABELS[eventType] ?? humanizeEventType(eventType);
}

function humanizeEventType(eventType: string): string {
  return eventType
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .join(" ");
}

const GOVERNANCE_DELTA_KEYS = [
  "governanceStatus",
  "approvalScope",
  "exportSafe",
  "status",
  "nextReviewDueAt",
  "reviewCadenceDays",
  "ownerId",
  "approverId",
] as const;

/** Readable lines for flat `before_*` / `after_*` governance metadata. */
export function formatGovernanceDeltaLines(metadata: Record<string, unknown>): string | null {
  const lines: string[] = [];
  for (const k of GOVERNANCE_DELTA_KEYS) {
    const b = metadata[`before_${k}`];
    const a = metadata[`after_${k}`];
    if (b !== undefined || a !== undefined) {
      lines.push(`${k}: ${fmtVal(b)} → ${fmtVal(a)}`);
    }
  }
  return lines.length > 0 ? lines.join("\n") : null;
}

function fmtVal(v: unknown): string {
  if (v === undefined) return "—";
  if (v === null) return "—";
  if (typeof v === "boolean") return v ? "yes" : "no";
  return String(v);
}
