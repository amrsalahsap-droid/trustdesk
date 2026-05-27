/**
 * Workspace-level contradiction signals for governance dashboards.
 * Kept secondary to deterministic detection until the engine is fully stable.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

const UNRESOLVED_STATUSES = ["PENDING", "STALE", "ACKNOWLEDGED"] as const;
const EXPORT_BLOCKING_STATUSES = ["PENDING", "STALE"] as const;

const UNRESOLVED_LIST = [...UNRESOLVED_STATUSES];
const EXPORT_BLOCKING_LIST = [...EXPORT_BLOCKING_STATUSES];

export type ContradictionGovernanceCounts = {
  /** PENDING/STALE + critical|high (export / readiness blockers). */
  exportBlockingHighOrCritical: number;
  /** PENDING/STALE + medium. */
  exportBlockingMedium: number;
  /** contradictionFound + not terminal (includes ACK awaiting canonical / keep-row). */
  unresolvedTotal: number;
  /** Unresolved with severity critical or high (full backlog). */
  highSeverityUnresolved: number;
  /** Lifetime FALSE_POSITIVE resolutions. */
  dismissedTotal: number;
  /** FALSE_POSITIVE with resolvedAt in last 30 days (throughput). */
  dismissedLast30Days: number;
  /** Rows where reviewer requested a canonical library update and ACK is still open. */
  canonicalUpdateRequestsOpen: number;
  /** New material contradictions (found) in last 7 days. */
  detectedLast7Days: number;
  /** Moved to terminal resolution in last 7 days. */
  resolvedLast7Days: number;
};

export type ContradictionBreakdownTopic = {
  topicId: string | null;
  topicKey: string | null;
  topicName: string | null;
  count: number;
};

export type ContradictionBreakdownUser = {
  userId: string | null;
  displayName: string | null;
  email: string | null;
  count: number;
};

export type ContradictionBreakdownQuestionnaire = {
  questionnaireId: string;
  title: string | null;
  count: number;
};

export type ContradictionBreakdownSeverity = {
  severity: string;
  count: number;
};

export type ContradictionGovernanceBreakdowns = {
  byTopic: ContradictionBreakdownTopic[];
  byOwner: ContradictionBreakdownUser[];
  byApprover: ContradictionBreakdownUser[];
  byQuestionnaire: ContradictionBreakdownQuestionnaire[];
  bySeverity: ContradictionBreakdownSeverity[];
};

const BREAKDOWN_LIMIT = 15;

function daysAgo(now: Date, days: number): Date {
  return new Date(now.getTime() - days * 86400000);
}

export async function getContradictionGovernanceCounts(
  workspaceId: string,
  now: Date = new Date(),
): Promise<ContradictionGovernanceCounts> {
  const d7 = daysAgo(now, 7);
  const d30 = daysAgo(now, 30);

  const unresolvedBase = {
    workspaceId,
    contradictionFound: true,
    resolutionStatus: { in: UNRESOLVED_LIST },
  };

  const exportBlocking = {
    workspaceId,
    contradictionFound: true,
    resolutionStatus: { in: EXPORT_BLOCKING_LIST },
  };

  const [
    exportBlockingHighOrCritical,
    exportBlockingMedium,
    unresolvedTotal,
    highSeverityUnresolved,
    dismissedTotal,
    dismissedLast30Days,
    canonicalUpdateRequestsOpen,
    detectedLast7Days,
    resolvedLast7Days,
  ] = await Promise.all([
    prisma.contradictionResult.count({
      where: {
        ...exportBlocking,
        severity: { in: ["critical", "high"] },
      },
    }),
    prisma.contradictionResult.count({
      where: {
        ...exportBlocking,
        severity: "medium",
      },
    }),
    prisma.contradictionResult.count({ where: unresolvedBase }),
    prisma.contradictionResult.count({
      where: {
        ...unresolvedBase,
        severity: { in: ["critical", "high"] },
      },
    }),
    prisma.contradictionResult.count({
      where: { workspaceId, resolutionStatus: "FALSE_POSITIVE" },
    }),
    prisma.contradictionResult.count({
      where: {
        workspaceId,
        resolutionStatus: "FALSE_POSITIVE",
        resolvedAt: { gte: d30 },
      },
    }),
    prisma.contradictionResult.count({
      where: {
        workspaceId,
        contradictionFound: true,
        resolutionStatus: "ACKNOWLEDGED",
        resolutionAction: "REQUEST_CANONICAL_UPDATE",
      },
    }),
    prisma.contradictionResult.count({
      where: {
        workspaceId,
        contradictionFound: true,
        detectedAt: { gte: d7 },
      },
    }),
    prisma.contradictionResult.count({
      where: {
        workspaceId,
        resolvedAt: { gte: d7 },
        resolutionStatus: { in: ["RESOLVED_ROW", "RESOLVED_CANONICAL", "FALSE_POSITIVE"] },
      },
    }),
  ]);

  return {
    exportBlockingHighOrCritical,
    exportBlockingMedium,
    unresolvedTotal,
    highSeverityUnresolved,
    dismissedTotal,
    dismissedLast30Days,
    canonicalUpdateRequestsOpen,
    detectedLast7Days,
    resolvedLast7Days,
  };
}

async function hydrateUsers(
  rows: Array<{ userId: string | null; count: bigint | number }>,
): Promise<ContradictionBreakdownUser[]> {
  const ids = [...new Set(rows.map((r) => r.userId).filter((id): id is string => !!id))];
  const users =
    ids.length === 0
      ? []
      : await prisma.user.findMany({
          where: { id: { in: ids } },
          select: { id: true, name: true, email: true },
        });
  const map = new Map(users.map((u) => [u.id, u]));
  return rows.map((r) => {
    const u = r.userId ? map.get(r.userId) : undefined;
    return {
      userId: r.userId,
      displayName: u?.name ?? null,
      email: u?.email ?? null,
      count: Number(r.count),
    };
  });
}

export async function getContradictionGovernanceBreakdowns(
  workspaceId: string,
): Promise<ContradictionGovernanceBreakdowns> {
  const unresolvedWhere = {
    workspaceId,
    contradictionFound: true,
    resolutionStatus: { in: UNRESOLVED_LIST },
  };

  const [byTopicAgg, byQuestionnaireAgg, bySeverityAgg, ownerRows, approverRows] = await Promise.all([
    prisma.contradictionResult.groupBy({
      by: ["topicId"],
      where: unresolvedWhere,
      _count: { _all: true },
    }),
    prisma.contradictionResult.groupBy({
      by: ["questionnaireId"],
      where: unresolvedWhere,
      _count: { _all: true },
    }),
    prisma.contradictionResult.groupBy({
      by: ["severity"],
      where: unresolvedWhere,
      _count: { _all: true },
    }),
    prisma.$queryRaw<Array<{ userId: string | null; c: bigint }>>(
      Prisma.sql`
        SELECT ali."ownerId" AS "userId", COUNT(*)::bigint AS c
        FROM "ContradictionResult" cr
        INNER JOIN "AnswerLibraryItem" ali ON ali."id" = cr."canonicalAnswerId"
          AND ali."workspaceId" = cr."workspaceId"
        WHERE cr."workspaceId" = ${workspaceId}
          AND cr."contradictionFound" = true
          AND cr."resolutionStatus" IN ('PENDING', 'STALE', 'ACKNOWLEDGED')
        GROUP BY ali."ownerId"
        ORDER BY COUNT(*) DESC
        LIMIT ${BREAKDOWN_LIMIT}
      `,
    ),
    prisma.$queryRaw<Array<{ userId: string | null; c: bigint }>>(
      Prisma.sql`
        SELECT ali."approverId" AS "userId", COUNT(*)::bigint AS c
        FROM "ContradictionResult" cr
        INNER JOIN "AnswerLibraryItem" ali ON ali."id" = cr."canonicalAnswerId"
          AND ali."workspaceId" = cr."workspaceId"
        WHERE cr."workspaceId" = ${workspaceId}
          AND cr."contradictionFound" = true
          AND cr."resolutionStatus" IN ('PENDING', 'STALE', 'ACKNOWLEDGED')
        GROUP BY ali."approverId"
        ORDER BY COUNT(*) DESC
        LIMIT ${BREAKDOWN_LIMIT}
      `,
    ),
  ]);

  const byTopicSorted = [...byTopicAgg].sort((a, b) => b._count._all - a._count._all).slice(0, BREAKDOWN_LIMIT);

  const topicIds = byTopicSorted.map((t) => t.topicId).filter((id): id is string => !!id);
  const topics =
    topicIds.length === 0
      ? []
      : await prisma.knowledgeTopic.findMany({
          where: { id: { in: topicIds }, workspaceId },
          select: { id: true, key: true, name: true },
        });
  const topicMap = new Map(topics.map((t) => [t.id, t]));

  const byTopic: ContradictionBreakdownTopic[] = byTopicSorted.map((row) => {
    const meta = row.topicId ? topicMap.get(row.topicId) : undefined;
    return {
      topicId: row.topicId,
      topicKey: meta?.key ?? null,
      topicName: meta?.name ?? null,
      count: row._count._all,
    };
  });

  const byQuestionnaireSorted = [...byQuestionnaireAgg]
    .sort((a, b) => b._count._all - a._count._all)
    .slice(0, BREAKDOWN_LIMIT);

  const qIds = byQuestionnaireSorted.map((q) => q.questionnaireId);
  const questionnaires =
    qIds.length === 0
      ? []
      : await prisma.questionnaire.findMany({
          where: { id: { in: qIds }, workspaceId },
          select: { id: true, title: true },
        });
  const qMap = new Map(questionnaires.map((q) => [q.id, q]));

  const byQuestionnaire: ContradictionBreakdownQuestionnaire[] = byQuestionnaireSorted.map((row) => ({
    questionnaireId: row.questionnaireId,
    title: qMap.get(row.questionnaireId)?.title ?? null,
    count: row._count._all,
  }));

  const bySeverity: ContradictionBreakdownSeverity[] = [...bySeverityAgg]
    .sort((a, b) => b._count._all - a._count._all)
    .map((row) => ({
      severity: row.severity ?? "unknown",
      count: row._count._all,
    }));

  const byOwner = await hydrateUsers(ownerRows.map((r) => ({ userId: r.userId, count: r.c })));
  const byApprover = await hydrateUsers(approverRows.map((r) => ({ userId: r.userId, count: r.c })));

  return {
    byTopic,
    byOwner,
    byApprover,
    byQuestionnaire,
    bySeverity,
  };
}

export { UNRESOLVED_STATUSES, EXPORT_BLOCKING_STATUSES };
