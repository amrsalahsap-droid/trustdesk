import type { Prisma } from "@prisma/client";
import type { AnswerApprovalScope, AnswerGovernanceStatus, AnswerStatus } from "@prisma/client";

export const VERSION_CHANGE_KIND = {
  CONTENT: "CONTENT",
  GOVERNANCE: "GOVERNANCE",
  OWNERSHIP: "OWNERSHIP",
  EVIDENCE: "EVIDENCE",
  SYSTEM: "SYSTEM",
} as const;

export type VersionDiffEntry = { field: string; before: unknown; after: unknown };

export type GovernanceCompareSnapshot = {
  title: string;
  answer: string | null;
  governanceStatus: string | null;
  approvalScope: string | null;
  exportSafe: boolean;
  ownerId: string | null;
  approverId: string | null;
  evidenceChunkIds: string[];
  topicId: string | null;
  subControlKey: string | null;
  subControlLabels: string[];
  confidenceScore: number | null;
  reviewCadenceDays: number | null;
};

function chunkIdsSorted(ids: string[]): string[] {
  return [...ids].sort();
}

export function sortedEvidenceChunkIds(rows: { chunkId: string }[]): string[] {
  return chunkIdsSorted([...new Set(rows.map((r) => r.chunkId))]);
}

export function governanceCompareFromParts(args: {
  title: string;
  answer: string | null;
  governanceStatus: string | null;
  approvalScope: string | null;
  exportSafe: boolean;
  ownerId: string | null;
  approverId: string | null;
  evidenceChunkIds: string[];
  topicId: string | null;
  subControlKey: string | null;
  subControlLabels: string[];
  confidenceScore: number | null;
  reviewCadenceDays: number | null;
}): GovernanceCompareSnapshot {
  return {
    title: args.title,
    answer: args.answer,
    governanceStatus: args.governanceStatus,
    approvalScope: args.approvalScope,
    exportSafe: args.exportSafe,
    ownerId: args.ownerId,
    approverId: args.approverId,
    evidenceChunkIds: chunkIdsSorted(args.evidenceChunkIds),
    topicId: args.topicId,
    subControlKey: args.subControlKey,
    subControlLabels: [...args.subControlLabels].sort(),
    confidenceScore: args.confidenceScore,
    reviewCadenceDays: args.reviewCadenceDays,
  };
}

export function governanceCompareFromItem(
  item: {
    title: string;
    answer: string | null;
    governanceStatus: AnswerGovernanceStatus;
    approvalScope: AnswerApprovalScope;
    exportSafe: boolean;
    ownerId: string | null;
    approverId: string | null;
    topicId: string | null;
    subControlKey: string | null;
    subControlLabels: string[];
    confidenceScore: number | null;
    reviewCadenceDays: number | null;
  },
  evidenceChunkIds: string[],
): GovernanceCompareSnapshot {
  return governanceCompareFromParts({
    title: item.title,
    answer: item.answer,
    governanceStatus: item.governanceStatus,
    approvalScope: item.approvalScope,
    exportSafe: item.exportSafe,
    ownerId: item.ownerId,
    approverId: item.approverId,
    evidenceChunkIds,
    topicId: item.topicId,
    subControlKey: item.subControlKey,
    subControlLabels: item.subControlLabels ?? [],
    confidenceScore: item.confidenceScore,
    reviewCadenceDays: item.reviewCadenceDays,
  });
}

function serializeScalar(v: unknown): unknown {
  if (v instanceof Date) return v.toISOString();
  return v;
}

export function buildGovernedFieldDiff(
  before: GovernanceCompareSnapshot,
  after: GovernanceCompareSnapshot,
): VersionDiffEntry[] {
  const out: VersionDiffEntry[] = [];
  const push = (field: string, b: unknown, a: unknown) => {
    const sb = serializeScalar(b);
    const sa = serializeScalar(a);
    if (JSON.stringify(sb) !== JSON.stringify(sa)) {
      out.push({ field, before: sb, after: sa });
    }
  };
  push("title", before.title, after.title);
  push("answer", before.answer, after.answer);
  push("governanceStatus", before.governanceStatus, after.governanceStatus);
  push("approvalScope", before.approvalScope, after.approvalScope);
  push("exportSafe", before.exportSafe, after.exportSafe);
  push("ownerId", before.ownerId, after.ownerId);
  push("approverId", before.approverId, after.approverId);
  push("evidenceChunkIds", before.evidenceChunkIds, after.evidenceChunkIds);
  push("topicId", before.topicId, after.topicId);
  push("subControlKey", before.subControlKey, after.subControlKey);
  push("subControlLabels", before.subControlLabels, after.subControlLabels);
  push("confidenceScore", before.confidenceScore, after.confidenceScore);
  push("reviewCadenceDays", before.reviewCadenceDays, after.reviewCadenceDays);
  return out;
}

export function buildOverrideFieldsDiff(
  before: {
    overrideReasonCategory: string | null;
    overrideComment: string | null;
    overrideScope: string | null;
  },
  after: {
    overrideReasonCategory: string | null;
    overrideComment: string | null;
    overrideScope: string | null;
  },
): VersionDiffEntry[] {
  const out: VersionDiffEntry[] = [];
  const push = (field: string, b: unknown, a: unknown) => {
    const sb = serializeScalar(b);
    const sa = serializeScalar(a);
    if (JSON.stringify(sb) !== JSON.stringify(sa)) {
      out.push({ field, before: sb, after: sa });
    }
  };
  push("overrideReasonCategory", before.overrideReasonCategory, after.overrideReasonCategory);
  push("overrideComment", before.overrideComment, after.overrideComment);
  push("overrideScope", before.overrideScope, after.overrideScope);
  return out;
}

export function isApprovedGovernance(governanceStatus: string | null | undefined): boolean {
  return governanceStatus === "APPROVED_INTERNAL" || governanceStatus === "APPROVED_FOR_EXPORT";
}

/**
 * Whether a PATCH-style edit should force REVISION_REQUIRED for an APPROVED_* answer.
 * Owner/approver-only changes never return true here.
 */
export function classifyApprovalResetFromDiff(
  diff: VersionDiffEntry[],
  opts: { allowBodyEditWithoutReapproval: boolean },
): boolean {
  const fields = new Set(diff.map((d) => d.field));
  const hasBody = fields.has("title") || fields.has("answer");
  const hasScopeExportEvidence =
    fields.has("approvalScope") || fields.has("exportSafe") || fields.has("evidenceChunkIds");
  if (hasScopeExportEvidence) return true;
  if (hasBody && !opts.allowBodyEditWithoutReapproval) return true;
  return false;
}

export function evidenceSnapshotJsonValue(
  rows: { chunkId: string; quote: string | null }[],
): Prisma.InputJsonValue {
  const byChunk = new Map(rows.map((r) => [r.chunkId, r.quote]));
  return sortedEvidenceChunkIds(rows).map((chunkId) => ({
    chunkId,
    quote: byChunk.get(chunkId) ?? null,
  }));
}

export type VersionSnapshotInput = {
  title: string;
  answerText: string | null;
  status: AnswerStatus;
  governanceStatus: AnswerGovernanceStatus | null;
  approvalScope: AnswerApprovalScope | null;
  approvedAt: Date | null;
  approvedByUserId: string | null;
  lastReviewedAt: Date | null;
  nextReviewDueAt: Date | null;
  expiresAt: Date | null;
  exportSafe: boolean;
  evidenceRequired: boolean;
  ownerId: string | null;
  approverId: string | null;
};

export function inferChangeKind(args: {
  explicit?: string | null;
  diff: VersionDiffEntry[];
  resetApprovalRequired: boolean;
}): string | null {
  if (args.explicit != null && args.explicit !== "") return args.explicit;
  const fields = new Set(args.diff.map((d) => d.field));
  if (fields.has("evidenceChunkIds") && !fields.has("title") && !fields.has("answer")) {
    return VERSION_CHANGE_KIND.EVIDENCE;
  }
  if (fields.has("ownerId") || fields.has("approverId")) {
    if (
      args.diff.length === 1 ||
      (fields.size <= 2 && [...fields].every((f) => f === "ownerId" || f === "approverId"))
    ) {
      return VERSION_CHANGE_KIND.OWNERSHIP;
    }
  }
  if (fields.has("governanceStatus") || fields.has("approvalScope") || fields.has("exportSafe")) {
    return VERSION_CHANGE_KIND.GOVERNANCE;
  }
  if (fields.has("title") || fields.has("answer")) {
    return VERSION_CHANGE_KIND.CONTENT;
  }
  return args.resetApprovalRequired ? VERSION_CHANGE_KIND.GOVERNANCE : VERSION_CHANGE_KIND.SYSTEM;
}

export async function recordAnswerLibraryVersion(
  tx: Prisma.TransactionClient,
  args: {
    workspaceId: string;
    answerId: string;
    versionNumber: number;
    changedById: string | null;
    changeReason: string;
    resetApprovalRequired: boolean;
    changeKind?: string | null;
    changeDiffJson: VersionDiffEntry[] | null;
    evidenceSnapshotJson: Prisma.InputJsonValue;
    snapshot: VersionSnapshotInput;
  },
): Promise<void> {
  const kind =
    args.changeKind ??
    inferChangeKind({
      explicit: null,
      diff: args.changeDiffJson ?? [],
      resetApprovalRequired: args.resetApprovalRequired,
    });

  await tx.answerLibraryItemVersion.create({
    data: {
      workspaceId: args.workspaceId,
      answerId: args.answerId,
      versionNumber: args.versionNumber,
      title: args.snapshot.title,
      answerText: args.snapshot.answerText,
      status: args.snapshot.status,
      changedById: args.changedById,
      changeReason: args.changeReason,
      ownerId: args.snapshot.ownerId,
      approverId: args.snapshot.approverId,
      evidenceSnapshotJson: args.evidenceSnapshotJson,
      changeDiffJson: args.changeDiffJson === null ? undefined : (args.changeDiffJson as Prisma.InputJsonValue),
      resetApprovalRequired: args.resetApprovalRequired,
      changeKind: kind,
      governanceStatus: args.snapshot.governanceStatus ?? undefined,
      approvalScope: args.snapshot.approvalScope ?? undefined,
      approvedAt: args.snapshot.approvedAt ?? undefined,
      approvedByUserId: args.snapshot.approvedByUserId ?? undefined,
      lastReviewedAt: args.snapshot.lastReviewedAt ?? undefined,
      nextReviewDueAt: args.snapshot.nextReviewDueAt ?? undefined,
      expiresAt: args.snapshot.expiresAt ?? undefined,
      exportSafe: args.snapshot.exportSafe,
      evidenceRequired: args.snapshot.evidenceRequired,
    },
  });
}

export function itemToVersionSnapshot(
  item: {
    title: string;
    answer: string | null;
    status: AnswerStatus;
    governanceStatus: AnswerGovernanceStatus;
    approvalScope: AnswerApprovalScope;
    approvedAt: Date | null;
    approvedByUserId: string | null;
    lastReviewedAt: Date | null;
    nextReviewDueAt: Date | null;
    expiresAt: Date | null;
    exportSafe: boolean;
    evidenceRequired: boolean;
    ownerId: string | null;
    approverId: string | null;
  },
): VersionSnapshotInput {
  return {
    title: item.title,
    answerText: item.answer,
    status: item.status,
    governanceStatus: item.governanceStatus,
    approvalScope: item.approvalScope,
    approvedAt: item.approvedAt,
    approvedByUserId: item.approvedByUserId,
    lastReviewedAt: item.lastReviewedAt,
    nextReviewDueAt: item.nextReviewDueAt,
    expiresAt: item.expiresAt,
    exportSafe: item.exportSafe,
    evidenceRequired: item.evidenceRequired,
    ownerId: item.ownerId,
    approverId: item.approverId,
  };
}
