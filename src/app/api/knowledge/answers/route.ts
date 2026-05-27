import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma, uncheckedPrisma } from "@/lib/db/prisma";
import { recordAuditEventSafe, AUDIT_EVENT_TYPES, AUDIT_OBJECT_TYPES } from "@/lib/audit";
import { buildGovernanceAuditMetadata, governanceAuditSnapshot } from "@/lib/audit/answer-governance-audit";
import { Permission, guardRouteWithPermission, guardRouteWithAnyPermission } from "@/lib/auth/guard";
import { assertAnswerCreate } from "@/lib/auth/governance-actions";
import { handleApiError } from "@/lib/api/error-handler";
import { logger } from "@/lib/logging/logger";
import { computeAnswerEmbedding } from "@/modules/workspaces/intelligence/answer-embedding";
import {
  getSubControl,
  subControlEmbeddingExtras,
} from "@/modules/knowledge/topics/subcontrol-taxonomy";
import {
  evidenceSnapshotJsonValue,
  itemToVersionSnapshot,
  recordAnswerLibraryVersion,
  VERSION_CHANGE_KIND,
} from "@/lib/knowledge/answer-version-record";
import {
  EXPORT_SAFETY_TIERS,
  type ExportSafetyTier,
  prismaWhereForExportSafetyTier,
} from "@/lib/knowledge/answer-export-safety";
import {
  canAccessQueueList,
  prismaWhereForQueue,
} from "@/lib/knowledge/governance-queues";
import { GOVERNANCE_QUEUE_IDS, isGovernanceQueueId } from "@/lib/knowledge/governance-shared";
import { buildContributorAnswerWhere } from "@/lib/knowledge/contributor-scope";

/**
 * GET: List items for a workspace, optionally filtered by topic.
 * Now includes formal owner details.
 */
export async function GET(request: Request) {
  try {
    // Guard: Require authentication + VIEW_ANSWERS permission
    const guardResult = await guardRouteWithPermission(request, Permission.VIEW_ANSWERS);
    if (!guardResult.success) {
      return guardResult.response;
    }
    const ctx = guardResult.context;
    const { searchParams } = new URL(request.url);
    const topicKey = searchParams.get("topicKey");
    const queue = searchParams.get("queue");

    const andClauses: Prisma.AnswerLibraryItemWhereInput[] = [];

    if (topicKey) {
      andClauses.push({ topic: { key: topicKey } });
    }

    if (queue) {
      if (!isGovernanceQueueId(queue)) {
        return NextResponse.json(
          {
            error: {
              code: "VALIDATION_ERROR",
              message: `Invalid queue (allowed: ${GOVERNANCE_QUEUE_IDS.join(", ")})`,
            },
          },
          { status: 400 },
        );
      }
      if (!canAccessQueueList(queue, ctx)) {
        return NextResponse.json({ error: { code: "FORBIDDEN", message: "Not allowed for this queue" } }, { status: 403 });
      }
      andClauses.push(prismaWhereForQueue(queue, ctx));
    }

    const filterClauses: Prisma.AnswerLibraryItemWhereInput[] = [];

    // 1. Workflow Filters
    const workflow = searchParams.get("workflow")?.split(",").filter(Boolean) || [];
    if (workflow.length > 0) {
      if (workflow.includes("DRAFT")) filterClauses.push({ status: "DRAFT", governanceStatus: "DRAFT" });
      if (workflow.includes("IN_REVIEW")) filterClauses.push({ governanceStatus: "IN_REVIEW" });
      if (workflow.includes("NEEDS_REVISION")) filterClauses.push({ governanceStatus: "REVISION_REQUIRED" });
      if (workflow.includes("APPROVED")) filterClauses.push({ status: "APPROVED" });
    }

    // 2. Assignment Filters
    const assignment = searchParams.get("assignment")?.split(",").filter(Boolean) || [];
    if (assignment.length > 0) {
      if (assignment.includes("MINE")) {
        filterClauses.push({
          OR: [{ ownerId: ctx.userId }, { approverId: ctx.userId }],
        });
      }
      if (assignment.includes("UNASSIGNED")) {
        filterClauses.push({
          AND: [{ ownerId: null }, { approverId: null }],
        });
      }
      if (assignment.includes("NO_APPROVER")) {
        filterClauses.push({
          AND: [
            { approverId: null },
            { status: { in: ["DRAFT"] } },
            { governanceStatus: { in: ["DRAFT", "IN_REVIEW", "REVISION_REQUIRED"] } },
          ],
        });
      }
    }

    // 3. Urgency Filters
    const urgency = searchParams.get("urgency")?.split(",").filter(Boolean) || [];
    const now = new Date();
    if (urgency.length > 0) {
      if (urgency.includes("OVERDUE")) {
        filterClauses.push({
          OR: [
            { governanceStatus: "EXPIRED" },
            { nextReviewDueAt: { lt: now } },
          ],
        });
      }
      if (urgency.includes("DUE_SOON")) {
        const threeDaysOut = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
        filterClauses.push({
          nextReviewDueAt: { gte: now, lte: threeDaysOut },
        });
      }
    }

    // 4. Usage / Export Filters
    const usage = searchParams.get("usage")?.split(",").filter(Boolean) || [];
    if (usage.length > 0) {
      if (usage.includes("EXPORT_SAFE")) {
        filterClauses.push({
          status: "APPROVED",
          governanceStatus: "APPROVED_FOR_EXPORT",
          approvalScope: "EXPORT_ALLOWED",
          exportSafe: true,
          OR: [{ nextReviewDueAt: null }, { nextReviewDueAt: { gte: now } }],
        });
      }
      if (usage.includes("INTERNAL_ONLY")) {
        filterClauses.push({
          status: "APPROVED",
          NOT: {
            governanceStatus: "APPROVED_FOR_EXPORT",
            approvalScope: "EXPORT_ALLOWED",
            exportSafe: true,
          },
        });
      }
      if (usage.includes("NOT_APPROVED")) {
        filterClauses.push({ status: { not: "APPROVED" } });
      }
    }

    if (filterClauses.length > 0) {
      andClauses.push({ OR: filterClauses });
    }

    // 5. Search (AND with everything else)
    const search = searchParams.get("search");
    if (search) {
      andClauses.push({
        OR: [
          { title: { contains: search, mode: "insensitive" } },
          { answer: { contains: search, mode: "insensitive" } },
          {
            evidence: {
              some: {
                chunk: {
                  sourceDocument: { fileName: { contains: search, mode: "insensitive" } },
                },
              },
            },
          },
        ],
      });
    }

    // Role-scoped answer filters
    // These filters define the "focused" view for each role type
    const filter = searchParams.get("filter");
    if (filter === "my_owned") {
      // OWNER focused scope: all answers where user is the owner (any status)
      andClauses.push({ ownerId: ctx.userId });
    } else if (filter === "my_approvals") {
      // APPROVER waiting-for-approval scope: only IN_REVIEW answers assigned to this approver
      andClauses.push({ approverId: ctx.userId, governanceStatus: "IN_REVIEW" });
    } else if (filter === "my_assigned") {
      // APPROVER full assignment scope: all answers where user is the approver (any status)
      // This gives Approvers visibility into their complete approval portfolio
      andClauses.push({ approverId: ctx.userId });
    } else if (filter === "my_contributions") {
      // CONTRIBUTOR focused scope: answers where user has made contributions
      // Uses canonical contributor scope definition (versions + evidence uploads)
      // Direct Prisma query - no multi-step ID lookup chain
      const contributorWhere = buildContributorAnswerWhere(ctx.userId);
      andClauses.push(contributorWhere);
    } else if (filter === "unowned") {
      andClauses.push({ ownerId: null });
    } else if (filter === "no_approver") {
      andClauses.push({ approverId: null });
    }

    const statusParam = searchParams.get("status");
    if (statusParam && ["DRAFT", "APPROVED", "ARCHIVED"].includes(statusParam)) {
      andClauses.push({ status: statusParam as Prisma.EnumAnswerStatusFilter<"AnswerLibraryItem"> });
    }

    const freshness = searchParams.get("freshness");
    if (freshness === "expired") {
      andClauses.push({
        OR: [
          { governanceStatus: "EXPIRED" },
          {
            governanceStatus: { in: ["APPROVED_INTERNAL", "APPROVED_FOR_EXPORT"] },
            nextReviewDueAt: { not: null, lt: now },
          },
        ],
      });
    } else if (freshness === "due_soon") {
      const horizon = new Date(now.getTime());
      horizon.setUTCDate(horizon.getUTCDate() + 14);
      andClauses.push({
        governanceStatus: { in: ["APPROVED_INTERNAL", "APPROVED_FOR_EXPORT"] },
        nextReviewDueAt: { not: null, gte: now, lte: horizon },
      });
    }

    const whereClause: Prisma.AnswerLibraryItemWhereInput = {
      workspaceId: ctx.workspaceId,
      status: { not: "ARCHIVED" },
      ...(andClauses.length > 0 ? { AND: andClauses } : {}),
    };

    const rawItems = await prisma.answerLibraryItem.findMany({
      where: whereClause,
      include: {
        topic: true,
        ownerUser: {
          select: { id: true, name: true, email: true },
        },
        approverUser: {
          select: { id: true, name: true, email: true },
        },
        evidence: {
          include: {
            chunk: {
              include: {
                sourceDocument: {
                  select: { fileName: true, uploadedById: true }
                }
              }
            }
          }
        },
        // Include versions authored by current user for contribution signal detection
        versions: {
          where: { changedById: ctx.userId },
          select: { id: true, versionNumber: true },
          take: 1,
        },
        _count: {
          select: { evidence: true },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    // Defensive id-dedupe. Prisma's `findMany` with nested includes does not
    // multiply parent rows today, but a future include/join change (e.g.
    // switching evidence to a flat join) could silently re-introduce
    // duplicates in the response. Filtering by id here guarantees the UI
    // never sees the same answer twice for this reason alone.
    const seen = new Set<string>();
    const items = rawItems.filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });

    console.log(`[API /knowledge/answers] URL: ${request.url}`);
    console.log(`[API /knowledge/answers] topicKey: ${topicKey}, queue: ${queue}, filter: ${filter}`);
    console.log(`[API /knowledge/answers] whereClause:`, JSON.stringify(whereClause));
    console.log(`[API /knowledge/answers] items returned: ${items.length}`);


    // Structured duplicate detection: if two *distinct* rows share the same
    // (topicId, evidenceFingerprint, contentHash), they are real DB
    // duplicates slipped past the dedupe guard (or legacy rows pre-cleanup).
    // Emit a single log event per group so the issue shows up in
    // observability without hiding rows from the UI before the cleanup
    // script has run.
    const fingerprintGroups = new Map<string, string[]>();
    for (const item of items) {
      if (
        item.generationScope !== "SEEDED" ||
        !item.evidenceFingerprint ||
        !item.contentHash ||
        !item.topicId
      ) {
        continue;
      }
      const key = `${item.topicId}|${item.evidenceFingerprint}|${item.contentHash}`;
      const bucket = fingerprintGroups.get(key) ?? [];
      bucket.push(item.id);
      fingerprintGroups.set(key, bucket);
    }
    for (const [key, answerIds] of fingerprintGroups) {
      if (answerIds.length > 1) {
        const [topicId, evidenceFingerprint, contentHash] = key.split("|");
        logger.warn("answer_library.duplicate_detected", {
          workspaceId: ctx.workspaceId,
          topicId,
          evidenceFingerprint,
          contentHash,
          answerIds,
          source: "list_query",
        });
      }
    }

    // Compute contribution signals for each item (for Contributor context-only marking)
    const itemsWithContributionSignals = items.map((item) => {
      const hasVersionContribution = item.versions && item.versions.length > 0;
      const hasEvidenceContribution = item.evidence?.some(
        (e: any) => e.chunk?.sourceDocument?.uploadedById === ctx.userId
      );

      return {
        ...item,
        contributionSignals: {
          hasVersionContribution,
          hasEvidenceContribution,
          hasContributed: hasVersionContribution || hasEvidenceContribution,
        },
      };
    });

    return NextResponse.json({ items: itemsWithContributionSignals });
  } catch (error) {
    console.error("api:knowledge:answers:list:failed", error);
    return handleApiError(error);
  }
}

/**
 * POST: Create a new Answer Library Item with formal owner assignment.
 */
export async function POST(request: Request) {
  try {
    // Guard: Require authentication + EDIT_ANSWERS or MANAGE_TOPICS permission
    const guardResult = await guardRouteWithAnyPermission(request, [Permission.EDIT_ANSWERS, Permission.MANAGE_TOPICS]);
    if (!guardResult.success) {
      return guardResult.response;
    }
    const ctx = guardResult.context;
    const workspaceId = ctx.workspaceId;
    const userId = ctx.userId;

    const body = await request.json();
    const {
      title,
      answer,
      topicId,
      owner,
      ownerId,
      approverId,
      status,
      confidenceScore,
      subControlKey,
      subControlLabels,
    } = body;
    const resolvedStatus = status || "DRAFT";

    assertAnswerCreate(ctx, resolvedStatus);

    if (!title || !topicId) {
      return NextResponse.json({ error: "Missing required fields: title, topicId" }, { status: 400 });
    }

    // Resolve the parent topic's canonical key so we can validate the caller's
    // subControlKey against the taxonomy and include sub-control labels in
    // the embedding input. Validation prevents typos like "access-review"
    // vs "access_review" silently disabling sub-control routing.
    let resolvedTopicKey: string | null = null;
    let resolvedTopicName: string | null = null;
    let topicOwnerId: string | null = null;
    let topicApproverId: string | null = null;

    if (topicId) {
      const topicRow = await uncheckedPrisma.knowledgeTopic.findUnique({
        where: { id: topicId },
        select: { key: true, name: true, ownerId: true, approverId: true },
      });
      resolvedTopicKey = topicRow?.key ?? null;
      resolvedTopicName = topicRow?.name ?? null;
      topicOwnerId = topicRow?.ownerId ?? null;
      topicApproverId = topicRow?.approverId ?? null;
    }

    let subControlOwnerId: string | null = null;
    let subControlApproverId: string | null = null;

    if (topicId && subControlKey) {
      const subGov = await uncheckedPrisma.subControlGovernance.findUnique({
        where: {
          workspaceId_topicId_subControlKey: {
            workspaceId,
            topicId,
            subControlKey,
          },
        },
      });
      subControlOwnerId = subGov?.ownerId ?? null;
      subControlApproverId = subGov?.approverId ?? null;
    }

    const finalOwnerId = ownerId || subControlOwnerId || topicOwnerId;
    const finalApproverId = approverId || subControlApproverId || topicApproverId;
    if (subControlKey) {
      if (!resolvedTopicKey || !getSubControl(resolvedTopicKey, subControlKey)) {
        return NextResponse.json(
          {
            error:
              "subControlKey does not belong to the resolved topic's taxonomy. Check the sub-control catalogue.",
          },
          { status: 400 },
        );
      }
    }
    const subControlMeta = subControlKey
      ? getSubControl(resolvedTopicKey, subControlKey)
      : null;
    const embeddingExtras = subControlMeta
      ? subControlEmbeddingExtras(resolvedTopicName, subControlMeta)
      : undefined;
    const resolvedSubControlLabels: string[] = Array.isArray(subControlLabels)
      ? (subControlLabels as string[]).filter((l) => typeof l === "string")
      : subControlMeta
        ? [subControlMeta.label, ...subControlMeta.keywords]
        : [];

    if (finalOwnerId) {
      const membership = await prisma.workspaceMembership.findFirst({
        where: { workspaceId, userId: finalOwnerId, status: "ACTIVE" },
      });
      if (!membership) {
        return NextResponse.json(
          { error: "Assigned owner must be an active member of this workspace" },
          { status: 403 },
        );
      }
    }

    if (finalApproverId) {
      const membership = await prisma.workspaceMembership.findFirst({
        where: { workspaceId, userId: finalApproverId, status: "ACTIVE" },
      });
      if (!membership) {
        return NextResponse.json(
          { error: "Assigned approver must be an active member of this workspace" },
          { status: 403 },
        );
      }
    }

    // Compute embedding outside the transaction so a provider outage does
    // not extend the DB lock. Fall back to an empty vector on failure; the
    // matcher's key-based fallback still reaches the row and the backfill
    // script will re-embed it on the next pass.
    let createEmbedding: number[] = [];
    try {
      createEmbedding = await computeAnswerEmbedding(title, answer, embeddingExtras);
    } catch (err) {
      logger.warn("api:knowledge:answers:embedding:failed", {
        workspaceId,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      const item = await tx.answerLibraryItem.create({
        data: {
          workspaceId,
          topicId,
          title,
          answer,
          owner: owner || null,
          ownerId: finalOwnerId || null,
          approverId: finalApproverId || null,
          status: resolvedStatus,
          lastVerified: resolvedStatus === "APPROVED" ? new Date() : undefined,
          governanceStatus: resolvedStatus === "APPROVED" ? "APPROVED_INTERNAL" : "DRAFT",
          approvalScope: resolvedStatus === "APPROVED" ? "INTERNAL_ONLY" : "INTERNAL_ONLY",
          exportSafe: false,
          confidenceScore: confidenceScore ?? null,
          embedding: createEmbedding,
          subControlKey: subControlKey ?? null,
          subControlLabels: resolvedSubControlLabels,
          currentVersion: 1,
        },
        include: {
          topic: true,
          ownerUser: { select: { id: true, name: true } },
          approverUser: { select: { id: true, name: true } },
        },
      });

      await recordAnswerLibraryVersion(tx, {
        workspaceId,
        answerId: item.id,
        versionNumber: 1,
        changedById: userId,
        changeReason: "Initial creation",
        resetApprovalRequired: false,
        changeDiffJson: null,
        evidenceSnapshotJson: evidenceSnapshotJsonValue([]),
        snapshot: itemToVersionSnapshot(item),
        changeKind: VERSION_CHANGE_KIND.SYSTEM,
      });

      return item;
    });

    await recordAuditEventSafe({
      workspaceId,
      actorUserId: userId,
      eventType: AUDIT_EVENT_TYPES.ANSWER_LIBRARY_ITEM_CREATED,
      objectType: AUDIT_OBJECT_TYPES.ANSWER_LIBRARY_ITEM,
      objectId: result.id,
      metadata: {
        title: result.title,
        topic: result.topic?.key,
        owner: result.ownerUser?.name || result.owner,
        approver: result.approverUser?.name,
        ownerId: result.ownerId,
        approverId: result.approverId,
        ...buildGovernanceAuditMetadata({
          action: "create",
          after: governanceAuditSnapshot({
            governanceStatus: result.governanceStatus,
            approvalScope: result.approvalScope,
            exportSafe: result.exportSafe,
            status: result.status,
            nextReviewDueAt: result.nextReviewDueAt,
            reviewCadenceDays: result.reviewCadenceDays,
            ownerId: result.ownerId,
            approverId: result.approverId,
          }),
          source: "post_answers",
        }),
      },
    });

    await recordAuditEventSafe({
      workspaceId,
      actorUserId: userId,
      eventType: AUDIT_EVENT_TYPES.ANSWER_LIBRARY_VERSION_RECORDED,
      objectType: AUDIT_OBJECT_TYPES.ANSWER_LIBRARY_ITEM,
      objectId: result.id,
      metadata: {
        ...buildGovernanceAuditMetadata({
          action: "create",
          version: 1,
          source: "post_answers",
          changeReason: "Initial creation",
        }),
      },
    });

    return NextResponse.json({ item: result });
  } catch (error) {
    console.error("api:knowledge:answers:create:failed", error);
    return handleApiError(error);
  }
}
