import { recordAuditEventSafe, type AuditEventInput } from "@/lib/audit/record-audit-event";

/** Flat primitives only — nested objects are stripped by audit sanitization. */
export type GovernanceAuditFlat = Record<string, string | number | boolean | null>;

export function governanceAuditSnapshot(item: {
  governanceStatus: string;
  approvalScope: string;
  exportSafe: boolean;
  status: string;
  nextReviewDueAt: Date | null | undefined;
  reviewCadenceDays: number | null | undefined;
  ownerId: string | null | undefined;
  approverId: string | null | undefined;
}): GovernanceAuditFlat {
  return {
    governanceStatus: item.governanceStatus,
    approvalScope: item.approvalScope,
    exportSafe: item.exportSafe,
    status: item.status,
    nextReviewDueAt: item.nextReviewDueAt ? new Date(item.nextReviewDueAt).toISOString() : null,
    reviewCadenceDays: item.reviewCadenceDays ?? null,
    ownerId: item.ownerId ?? null,
    approverId: item.approverId ?? null,
  };
}

function flattenWithPrefix(prefix: string, snap: GovernanceAuditFlat): GovernanceAuditFlat {
  const out: GovernanceAuditFlat = {};
  for (const [k, v] of Object.entries(snap)) {
    out[`${prefix}_${k}`] = v;
  }
  return out;
}

/**
 * Appends flattened before_/after_ governance fields plus optional action, comment, version.
 */
export function buildGovernanceAuditMetadata(opts: {
  before?: GovernanceAuditFlat | null;
  after?: GovernanceAuditFlat | null;
  action?: string | null;
  comment?: string | null;
  version?: number | null;
  source?: string | null;
  changeReason?: string | null;
}): Record<string, unknown> {
  const meta: Record<string, unknown> = {};
  if (opts.action != null) meta.action = opts.action;
  if (opts.comment != null) meta.comment = String(opts.comment).slice(0, 500);
  if (opts.changeReason != null) meta.changeReason = String(opts.changeReason).slice(0, 500);
  if (opts.version != null) meta.version = opts.version;
  if (opts.source != null) meta.source = opts.source;
  if (opts.before) Object.assign(meta, flattenWithPrefix("before", opts.before));
  if (opts.after) Object.assign(meta, flattenWithPrefix("after", opts.after));
  return meta;
}

export async function recordAnswerGovernanceAuditSafe(
  input: Omit<AuditEventInput, "metadata"> & {
    metadata?: Record<string, unknown> | null;
  },
): Promise<void> {
  await recordAuditEventSafe({
    ...input,
    metadata: input.metadata ?? undefined,
  });
}
