import { prisma } from "@/lib/db/prisma";
import {
  getContradictionGovernanceBreakdowns,
  getContradictionGovernanceCounts,
  type ContradictionGovernanceBreakdowns,
  type ContradictionGovernanceCounts,
} from "@/lib/contradiction/governance-contradiction-metrics";

/** Secondary contradiction workload (engine still maturing). */
export type GovernanceContradictionGovernance = Omit<
  ContradictionGovernanceCounts,
  "exportBlockingHighOrCritical" | "exportBlockingMedium"
>;

export type GovernanceMetricsSnapshot = {
  totalGovernedAnswers: number;
  approvedInternal: number;
  approvedForExport: number;
  expired: number;
  unowned: number;
  missingApprover: number;
  missingEvidence: number;
  pendingApprovals: number;
  overriddenThisMonth: number;
  reviewedThisMonth: number;
  newlyExpiredThisMonth: number;
  /** PENDING/STALE + critical|high — export / readiness blockers (legacy field name). */
  openContradictionResultsHighOrCritical: number;
  /** PENDING/STALE + medium. */
  openContradictionResultsMedium: number;
  /** Extended contradiction signals and dimensional breakdowns for governance. */
  contradictionGovernance: GovernanceContradictionGovernance;
  contradictionBreakdowns: ContradictionGovernanceBreakdowns;
};

export async function getGovernanceMetricsSnapshot(
  workspaceId: string,
  now: Date = new Date(),
): Promise<GovernanceMetricsSnapshot> {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const base = { workspaceId, status: { not: "ARCHIVED" as const } };

  const [answerBlock, contradictionCounts, contradictionBreakdowns] = await Promise.all([
    Promise.all([
      prisma.answerLibraryItem.count({ where: base }),
      prisma.answerLibraryItem.count({
        where: {
          ...base,
          OR: [
            { governanceStatus: "APPROVED_INTERNAL" },
            { status: "APPROVED", governanceStatus: "DRAFT" },
          ],
        },
      }),
      prisma.answerLibraryItem.count({
        where: {
          ...base,
          governanceStatus: "APPROVED_FOR_EXPORT",
          approvalScope: "EXPORT_ALLOWED",
          exportSafe: true,
          OR: [{ nextReviewDueAt: null }, { nextReviewDueAt: { gte: now } }],
        },
      }),
      prisma.answerLibraryItem.count({
        where: {
          ...base,
          OR: [
            { governanceStatus: "EXPIRED" },
            {
              governanceStatus: { in: ["APPROVED_INTERNAL", "APPROVED_FOR_EXPORT"] },
              nextReviewDueAt: { not: null, lt: now },
            },
            {
              status: "APPROVED",
              governanceStatus: "DRAFT",
              nextReviewDueAt: { not: null, lt: now },
            },
          ],
        },
      }),
      prisma.answerLibraryItem.count({ where: { ...base, ownerId: null } }),
      prisma.answerLibraryItem.count({ where: { ...base, approverId: null } }),
      prisma.answerLibraryItem.count({
        where: { ...base, evidence: { none: {} } },
      }),
      prisma.answerLibraryItem.count({
        where: { ...base, governanceStatus: "IN_REVIEW" },
      }),
      prisma.answerLibraryItem.count({
        where: {
          ...base,
          overrideAt: { gte: monthStart },
          overrideReasonCategory: { not: null },
        },
      }),
      prisma.answerLibraryItem.count({
        where: {
          ...base,
          lastVerified: { gte: monthStart },
          status: "APPROVED",
        },
      }),
      prisma.answerLibraryItem.count({
        where: {
          ...base,
          governanceStatus: "EXPIRED",
          updatedAt: { gte: monthStart },
        },
      }),
    ]),
    getContradictionGovernanceCounts(workspaceId, now),
    getContradictionGovernanceBreakdowns(workspaceId),
  ]);

  const [
    totalGovernedAnswers,
    approvedInternal,
    approvedForExport,
    expired,
    unowned,
    missingApprover,
    missingEvidence,
    pendingApprovals,
    overriddenThisMonth,
    reviewedThisMonth,
    newlyExpiredThisMonth,
  ] = answerBlock;

  const {
    exportBlockingHighOrCritical,
    exportBlockingMedium,
    unresolvedTotal,
    highSeverityUnresolved,
    dismissedTotal,
    dismissedLast30Days,
    canonicalUpdateRequestsOpen,
    detectedLast7Days,
    resolvedLast7Days,
  } = contradictionCounts;

  return {
    totalGovernedAnswers,
    approvedInternal,
    approvedForExport,
    expired,
    unowned,
    missingApprover,
    missingEvidence,
    pendingApprovals,
    overriddenThisMonth,
    reviewedThisMonth,
    newlyExpiredThisMonth,
    openContradictionResultsHighOrCritical: exportBlockingHighOrCritical,
    openContradictionResultsMedium: exportBlockingMedium,
    contradictionGovernance: {
      unresolvedTotal,
      highSeverityUnresolved,
      dismissedTotal,
      dismissedLast30Days,
      canonicalUpdateRequestsOpen,
      detectedLast7Days,
      resolvedLast7Days,
    },
    contradictionBreakdowns,
  };
}
