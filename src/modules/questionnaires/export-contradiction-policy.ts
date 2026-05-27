import type { ContradictionResolutionStatus } from "@prisma/client";

/** Workspace setting: whether unresolved medium-severity contradictions block export. */
export type ContradictionMediumExportPolicy = "WARN" | "BLOCK";

/** Map Prisma/workspace string to policy (unknown values default to WARN). */
export function mediumExportPolicyFromDb(
  p: string | null | undefined,
): ContradictionMediumExportPolicy {
  return p === "BLOCK" ? "BLOCK" : "WARN";
}

export type ContradictionExportRowInput = {
  contradictionFound: boolean;
  severity: string | null;
  resolutionStatus: ContradictionResolutionStatus;
};

const UNRESOLVED_STATUSES: ReadonlySet<ContradictionResolutionStatus> = new Set([
  "PENDING",
  "STALE",
]);

/**
 * A row is "open" for export gating when a contradiction was detected and the
 * reviewer has not chosen a terminal resolution (false positive, align, acknowledge, etc.).
 */
export function isContradictionUnresolvedForExport(
  contradictionFound: boolean,
  resolutionStatus: ContradictionResolutionStatus,
): boolean {
  if (!contradictionFound) return false;
  return UNRESOLVED_STATUSES.has(resolutionStatus);
}

function normalizeSeverity(severity: string | null): string {
  return (severity ?? "").trim().toLowerCase();
}

export type RowContradictionExportClassification = "none" | "warn" | "block";

/**
 * Per-row export impact for an unresolved material contradiction.
 * - critical/high: always block
 * - medium: block only when workspace policy is BLOCK
 * - low/info/unknown/null: warn only (null treated as non-blocking for legacy rows)
 */
export function classifyContradictionForExport(
  row: ContradictionExportRowInput | null | undefined,
  mediumPolicy: ContradictionMediumExportPolicy,
): RowContradictionExportClassification {
  if (!row?.contradictionFound) return "none";
  if (!isContradictionUnresolvedForExport(row.contradictionFound, row.resolutionStatus)) {
    return "none";
  }
  const sev = normalizeSeverity(row.severity);
  if (sev === "critical" || sev === "high") return "block";
  if (sev === "medium") return mediumPolicy === "BLOCK" ? "block" : "warn";
  return "warn";
}

export function aggregateContradictionExportGate(
  rows: ReadonlyArray<ContradictionExportRowInput | null | undefined>,
  mediumPolicy: ContradictionMediumExportPolicy,
): {
  blockingRowCount: number;
  warningRowCount: number;
  blocksExport: boolean;
} {
  let blockingRowCount = 0;
  let warningRowCount = 0;
  for (const r of rows) {
    const c = classifyContradictionForExport(r, mediumPolicy);
    if (c === "block") blockingRowCount += 1;
    else if (c === "warn") warningRowCount += 1;
  }
  return {
    blockingRowCount,
    warningRowCount,
    blocksExport: blockingRowCount > 0,
  };
}

export function buildContradictionExportNotices(
  blockingRowCount: number,
  warningRowCount: number,
): { notice: string | null; warnNotice: string | null } {
  const notice =
    blockingRowCount > 0
      ? `${blockingRowCount} row(s) have unresolved high-severity contradictions (or medium-severity with strict policy). Resolve or dismiss them before export.`
      : null;
  const warnNotice =
    warningRowCount > 0
      ? `${warningRowCount} row(s) have open contradictions that should be reviewed before treating the export as fully safe (low/medium warn-only, or medium with warn policy).`
      : null;
  return { notice, warnNotice };
}
