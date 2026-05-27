import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { buildAuthContext } from "@/lib/auth/build-context";
import { handleApiError } from "@/lib/api/error-handler";
import { recordAuditEventSafe, AUDIT_EVENT_TYPES, AUDIT_OBJECT_TYPES } from "@/lib/audit";
import { TopicsService } from "@/modules/knowledge/topics/topics-service";
import { slugify } from "@/lib/utils/slug";
import { z } from "zod";
import { authorizePermission } from "@/lib/auth/authorize-role";
import { Permission } from "@/lib/auth/permissions";
import { assertTopicDefaultAssignees } from "@/lib/auth/governance-actions";
import {
  buildContributorAnswerWhere,
  extractUniqueTopicIds,
} from "@/lib/knowledge/contributor-scope";

const PostSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  ownerId: z.string().optional(),
  approverId: z.string().optional(),
  reviewCadenceDays: z.number().int().nullable().optional(),
  status: z.enum(["ACTIVE", "DRAFT", "ARCHIVED", "SUGGESTED"]).optional(),
  force: z.boolean().optional(),
});

export async function GET(request: Request) {
  try {
    const ctx = await buildAuthContext(request);
    authorizePermission(ctx, Permission.VIEW_ANSWERS);
    const workspaceId = ctx.workspaceId;

    if (!workspaceId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const checkName = searchParams.get("checkName");
    const checkDescription = searchParams.get("checkDescription");

    // 1. Shadowing / Overlap detection mode
    if (checkName) {
      const validation = await TopicsService.validateTopicCreation(workspaceId, {
        key: slugify(checkName), // Best effort key check
        name: checkName,
        description: checkDescription || ""
      });
      
      const overlaps = await TopicsService.findOverlappingTopics(
        workspaceId,
        checkName,
        checkDescription || ""
      );
      
      return NextResponse.json({ 
        overlaps,
        governanceInsight: validation.governanceInsight,
        warning: validation.warning,
        isBlocked: validation.isBlocked,
        collision: validation.collision
      });
    }

    const status = searchParams.get("status") as any;
    const scope = searchParams.get("scope") as "all" | "my_approvals" | "my_contributions" | null;

    // 2. Resolve authorized topics (Workspace overrides > Global)
    let topics;
    if (status === "SUGGESTED") {
      topics = await TopicsService.resolveSuggestedTopics(workspaceId);
    } else {
      topics = await TopicsService.resolveWorkspaceTopics(workspaceId);
    }

    // 2a. Scope topics to responsibility if requested (Approver/Owner work or Contributor contributions)
    if ((scope === "my_approvals" || scope === "my_contributions") && ctx.userId) {
      let relevantAnswerTopics;
      
      if (scope === "my_contributions") {
        // For Contributors: find topics where they have made contributions
        // Uses canonical contributor scope definition (versions + evidence uploads)
        relevantAnswerTopics = await prisma.answerLibraryItem.findMany({
          where: {
            workspaceId,
            ...buildContributorAnswerWhere(ctx.userId),
          },
          select: { topicId: true },
          distinct: ["topicId"],
        });
      } else {
        // For Approvers/Owners: find topics where this user is the owner or approver,
        // OR answers that are unowned (so Owners/Admins can claim them)
        console.log(`[DEBUG Topics API] Looking for answers with approverId=${ctx.userId} or ownerId=${ctx.userId} in workspace=${workspaceId}`);
        relevantAnswerTopics = await prisma.answerLibraryItem.findMany({
          where: {
            workspaceId,
            OR: [
              { approverId: ctx.userId },
              { ownerId: ctx.userId },
              { ownerId: null } // Include topics with unowned work
            ]
          },
          select: { topicId: true, id: true, approverId: true, ownerId: true },
          distinct: ["topicId"],
        });
        console.log(`[DEBUG Topics API] Found ${relevantAnswerTopics.length} answers:`, relevantAnswerTopics.map(a => ({ id: a.id, topicId: a.topicId, approverId: a.approverId, ownerId: a.ownerId })));
      }
      
      const relevantTopicIds = new Set(extractUniqueTopicIds(relevantAnswerTopics));
      console.log(`[DEBUG Topics API] Extracted topic IDs:`, Array.from(relevantTopicIds));
      
      // Also include topics where user is the default owner or approver (not for Contributors)
      if (scope !== "my_contributions") {
        const defaultAssigneeTopics = await prisma.knowledgeTopic.findMany({
          where: {
            workspaceId,
            OR: [
              { approverId: ctx.userId },
              { ownerId: ctx.userId }
            ]
          },
          select: { id: true },
        });
        defaultAssigneeTopics.forEach(t => relevantTopicIds.add(t.id));
      }
      
      // Filter topics to only those relevant to this user
      const beforeCount = topics.length;
      topics = topics.filter(t => relevantTopicIds.has(t.id));
      console.log(`[DEBUG Topics API] Filtered topics: ${beforeCount} -> ${topics.length} topics`);
      console.log(`[DEBUG Topics API] Available topic IDs before filter:`, topics.map(t => t.id));
    }


    // 2. Fetch answer counts for the resolved topics
    const topicIds = topics.map(t => t.id);
    const countWhere: any = {
      workspaceId,
      topicId: { in: topicIds }
    };
    
    // For responsibility scoping, counts should reflect only assigned/owned answers
    if (scope === "my_approvals" && ctx.userId) {
      countWhere.OR = [
        { approverId: ctx.userId },
        { ownerId: ctx.userId }
      ];
    } else if (scope === "my_contributions" && ctx.userId) {
      // For Contributors: counts should reflect only their contribution-relevant answers
      // Use canonical contributor scope definition
      const contributorWhere = buildContributorAnswerWhere(ctx.userId);
      countWhere.AND = contributorWhere;
    }


    const counts = await prisma.answerLibraryItem.groupBy({
      by: ["topicId"],
      where: countWhere,
      _count: true
    });

    const approvedCounts = await prisma.answerLibraryItem.groupBy({
      by: ["topicId"],
      where: {
        ...countWhere,
        status: "APPROVED"
      },
      _count: true
    });

    const countsMap = new Map(counts.map(c => [c.topicId, c._count]));
    const approvedMap = new Map(approvedCounts.map(c => [c.topicId, c._count]));

    // 2b. Fetch Advanced Health Metrics
    const healthMetrics = await TopicsService.getTopicHealthMetrics(workspaceId, topicIds);

    // 3. Map to friendly format
    const formattedTopics = topics.map(t => {
        const baseMetrics = {
            totalAnswers: countsMap.get(t.id) || 0,
            approvedAnswers: approvedMap.get(t.id) || 0
        };
        const advancedMetrics = healthMetrics[t.id] || { evidencedAnswers: 0, usageCount: 0, gapCount: 0, sourceChunks: 0 };
        const strength = TopicsService.calculateStrengthScore(baseMetrics, advancedMetrics);

        return {
            id: t.id,
            key: t.key,
            name: t.name,
            description: t.description,
            status: t.status,
            isWorkspaceSpecific: t.workspaceId === workspaceId,
            suggestionReason: (t as any).suggestionReason || null,
            owner: (t as any).owner,
            approver: (t as any).approver,
            reviewCadenceDays: (t as { reviewCadenceDays?: number | null }).reviewCadenceDays ?? null,
            ...baseMetrics,
            health: {
              ...advancedMetrics,
              strength
            }
        };
    });

    return NextResponse.json({ topics: formattedTopics });
  } catch (error) {
    console.error("api:knowledge:topics:failed", error);
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await buildAuthContext(request);
    authorizePermission(ctx, Permission.MANAGE_TOPICS);
    const workspaceId = ctx.workspaceId;

    if (!workspaceId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = PostSchema.parse(body);

    assertTopicDefaultAssignees(
      ctx,
      parsed.ownerId !== undefined || parsed.approverId !== undefined,
    );

    if (
      parsed.reviewCadenceDays != null &&
      ![90, 180, 365].includes(parsed.reviewCadenceDays)
    ) {
      return NextResponse.json(
        { error: "reviewCadenceDays must be 90, 180, 365, or null" },
        { status: 400 },
      );
    }

    // 1. Governance Guardrail: Prevent semantic duplicates if not forced
    if (!parsed.force) {
      const validation = await TopicsService.validateTopicCreation(workspaceId, {
        key: parsed.key,
        name: parsed.name,
        description: parsed.description
      });

      if (validation.isBlocked) {
        return NextResponse.json({ 
          error: {
            code: "DUPLICATE_TOPIC",
            message: `Possible duplicate detected: "${validation.collision?.item.name}"`,
            collision: validation.collision
          }
        }, { status: 409 });
      }
    }

    const existing = await prisma.knowledgeTopic.findUnique({
      where: { workspaceId_key: { workspaceId, key: parsed.key } }
    });

    const topic = await TopicsService.upsertWorkspaceTopic(workspaceId, parsed);

    if (existing) {
      if (parsed.ownerId !== undefined && parsed.ownerId !== existing.ownerId) {
        await recordAuditEventSafe({
          workspaceId,
          actorUserId: ctx.userId,
          eventType: AUDIT_EVENT_TYPES.TOPIC_OWNER_CHANGED,
          objectType: AUDIT_OBJECT_TYPES.KNOWLEDGE_TOPIC,
          objectId: topic.id,
          metadata: { before: existing.ownerId, after: topic.ownerId },
        });
      }
      if (parsed.approverId !== undefined && parsed.approverId !== existing.approverId) {
        await recordAuditEventSafe({
          workspaceId,
          actorUserId: ctx.userId,
          eventType: AUDIT_EVENT_TYPES.APPROVER_CHANGED,
          objectType: AUDIT_OBJECT_TYPES.KNOWLEDGE_TOPIC,
          objectId: topic.id,
          metadata: { before: existing.approverId, after: topic.approverId },
        });
      }
    }

    await recordAuditEventSafe({
      workspaceId,
      actorUserId: ctx.userId,
      eventType: existing ? AUDIT_EVENT_TYPES.KNOWLEDGE_TOPIC_UPDATED : AUDIT_EVENT_TYPES.KNOWLEDGE_TOPIC_CREATED,
      objectType: AUDIT_OBJECT_TYPES.KNOWLEDGE_TOPIC,
      objectId: topic.id,
      metadata: {
        before: existing ? { ownerId: existing.ownerId, approverId: existing.approverId, status: existing.status } : null,
        after: { ownerId: topic.ownerId, approverId: topic.approverId, status: topic.status },
        changes: parsed
      }
    });

    return NextResponse.json({ topic }, { status: 201 });
  } catch (error) {
    console.error("api:knowledge:topics:post:failed", error);
    return handleApiError(error);
  }
}
export async function PATCH(request: Request) {
  try {
    const ctx = await buildAuthContext(request);
    authorizePermission(ctx, Permission.MANAGE_TOPICS);
    const workspaceId = ctx.workspaceId;

    if (!workspaceId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = z
      .object({
        id: z.string(),
        status: z.enum(["ACTIVE", "ARCHIVED"]).optional(),
        reviewCadenceDays: z.number().int().nullable().optional(),
        contradictionSemanticAssistEnabled: z.boolean().optional(),
      })
      .parse(body);

    if (
      parsed.status === undefined &&
      parsed.reviewCadenceDays === undefined &&
      parsed.contradictionSemanticAssistEnabled === undefined
    ) {
      return NextResponse.json({ error: "No updates provided" }, { status: 400 });
    }

    const existing = await prisma.knowledgeTopic.findFirst({
      where: { id: parsed.id, workspaceId },
    });

    if (!existing) {
      return NextResponse.json({ error: "Topic not found" }, { status: 404 });
    }

    if (
      parsed.reviewCadenceDays !== undefined &&
      parsed.reviewCadenceDays != null &&
      ![90, 180, 365].includes(parsed.reviewCadenceDays)
    ) {
      return NextResponse.json(
        { error: "reviewCadenceDays must be 90, 180, 365, or null" },
        { status: 400 },
      );
    }

    const data: {
      status?: "ACTIVE" | "ARCHIVED";
      reviewCadenceDays?: number | null;
      contradictionSemanticAssistEnabled?: boolean;
    } = {};
    if (parsed.status !== undefined) data.status = parsed.status;
    if (parsed.reviewCadenceDays !== undefined) data.reviewCadenceDays = parsed.reviewCadenceDays;
    if (parsed.contradictionSemanticAssistEnabled !== undefined) {
      data.contradictionSemanticAssistEnabled = parsed.contradictionSemanticAssistEnabled;
    }

    const topic = await prisma.knowledgeTopic.update({
      where: { id: parsed.id, workspaceId },
      data,
    });

    await recordAuditEventSafe({
      workspaceId,
      actorUserId: ctx.userId,
      eventType: AUDIT_EVENT_TYPES.KNOWLEDGE_TOPIC_UPDATED,
      objectType: AUDIT_OBJECT_TYPES.KNOWLEDGE_TOPIC,
      objectId: parsed.id,
      metadata: {
        before: {
          status: existing.status,
          reviewCadenceDays: existing.reviewCadenceDays,
          contradictionSemanticAssistEnabled: existing.contradictionSemanticAssistEnabled,
        },
        after: {
          status: topic.status,
          reviewCadenceDays: topic.reviewCadenceDays,
          contradictionSemanticAssistEnabled: topic.contradictionSemanticAssistEnabled,
        },
        action: "TOPIC_PATCH",
      },
    });

    return NextResponse.json({ topic });
  } catch (error) {
    console.error("api:knowledge:topics:patch:failed", error);
    return handleApiError(error);
  }
}
