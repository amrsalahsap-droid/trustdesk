import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { buildAuthContext } from "@/lib/auth/build-context";
import { handleApiError } from "@/lib/api/error-handler";
import { reconcileContradictionsForCanonicalAnswer } from "@/lib/questionnaires/reconcile-questionnaire-item-contradiction";
import { recordAuditEventSafe, AUDIT_OBJECT_TYPES } from "@/lib/audit";
import { AUDIT_EVENT_TYPES } from "@/lib/audit/audit-event-types";
import { buildGovernanceAuditMetadata, governanceAuditSnapshot } from "@/lib/audit/answer-governance-audit";
import { computeAnswerEmbedding } from "@/modules/workspaces/intelligence/answer-embedding";
import {
  getSubControl,
  subControlEmbeddingExtras,
} from "@/modules/knowledge/topics/subcontrol-taxonomy";
import { uncheckedPrisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logging/logger";
import {
  applyWorkflowAction,
  parseWorkflowAction,
  parseWorkflowComment,
  WorkflowValidationError,
} from "@/lib/knowledge/answer-workflow";
import { assertWorkflowActionPermission } from "@/lib/auth/governance-actions";
import { resolveCadenceDays } from "@/lib/knowledge/answer-freshness";
import {
  buildGovernedFieldDiff,
  evidenceSnapshotJsonValue,
  governanceCompareFromItem,
  inferChangeKind,
  itemToVersionSnapshot,
  recordAnswerLibraryVersion,
  sortedEvidenceChunkIds,
  VERSION_CHANGE_KIND,
} from "@/lib/knowledge/answer-version-record";

function isPrismaUniqueViolation(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}

export async function POST(request: Request, segment: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await buildAuthContext(request);
    const params = await segment.params;
    const workspaceId = ctx.workspaceId;
    const userId = ctx.userId;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    let action;
    let comment: string | undefined;
    try {
      action = parseWorkflowAction(body);
      comment = parseWorkflowComment(body);
    } catch (e) {
      if (e instanceof WorkflowValidationError) {
        return NextResponse.json({ error: e.message, code: e.code }, { status: 400 });
      }
      throw e;
    }

    assertWorkflowActionPermission(ctx, action);

    const [answer, workspace] = await Promise.all([
      prisma.answerLibraryItem.findFirst({
        where: { id: params.id, workspaceId },
        include: { topic: { select: { reviewCadenceDays: true } } },
      }),
      prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: {
          allowOwnerSelfApprove: true,
          defaultAnswerReviewCadenceDays: true,
          requireApproverExportSafeConfirmation: true,
        },
      }),
    ]);

    if (!answer) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    const policy = {
      allowOwnerSelfApprove: workspace?.allowOwnerSelfApprove ?? false,
      requireApproverExportSafeConfirmation: workspace?.requireApproverExportSafeConfirmation ?? true,
    };

    const resolvedCadenceDays = resolveCadenceDays({
      answerOverride: answer.reviewCadenceDays,
      topicOverride: answer.topic?.reviewCadenceDays ?? null,
      workspaceDefault: workspace?.defaultAnswerReviewCadenceDays ?? 90,
    });

    let transition;
    try {
      transition = applyWorkflowAction(action, answer, ctx, policy, comment, {
        resolvedCadenceDays,
      });
    } catch (e) {
      if (e instanceof WorkflowValidationError) {
        const status =
          e.code === "FORBIDDEN" ||
            e.code === "NOT_ASSIGNED_APPROVER" ||
            e.code === "NOT_OWNER" ||
            e.code === "SELF_APPROVE_NOT_ALLOWED"
            ? 403
            : 400;
        return NextResponse.json({ error: e.message, code: e.code }, { status });
      }
      throw e;
    }

    let resolvedTopicKey: string | null = null;
    let resolvedTopicName: string | null = null;
    if (answer.topicId && answer.subControlKey) {
      const topicRow = await uncheckedPrisma.knowledgeTopic.findUnique({
        where: { id: answer.topicId },
        select: { key: true, name: true },
      });
      resolvedTopicKey = topicRow?.key ?? null;
      resolvedTopicName = topicRow?.name ?? null;
    }
    const subControlMeta =
      answer.subControlKey && resolvedTopicKey
        ? getSubControl(resolvedTopicKey, answer.subControlKey)
        : null;
    const embeddingExtras = subControlMeta
      ? subControlEmbeddingExtras(resolvedTopicName, subControlMeta)
      : undefined;

    const shouldReembed = transition.status === "APPROVED" && answer.status !== "APPROVED";
    let nextEmbedding: number[] | undefined;
    if (shouldReembed) {
      try {
        nextEmbedding = await computeAnswerEmbedding(answer.title, answer.answer, embeddingExtras);
      } catch (err) {
        logger.warn("api:knowledge:answers:workflow:embedding:failed", {
          workspaceId,
          answerId: params.id,
          error: err instanceof Error ? err.message : String(err),
        });
        nextEmbedding = undefined;
      }
    }

    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const result = await prisma.$transaction(async (tx) => {
          const fresh = await tx.answerLibraryItem.findFirst({
            where: { id: params.id, workspaceId },
          });
          if (!fresh) throw new Error("Answer disappeared during workflow");

          const nextVersion = fresh.currentVersion + 1;

          const evBefore = await tx.answerEvidence.findMany({
            where: { answerId: fresh.id, workspaceId },
            select: { chunkId: true, quote: true },
          });
          const beforeIds = sortedEvidenceChunkIds(evBefore);
          const beforeSnap = governanceCompareFromItem(fresh, beforeIds);

          const updatedItem = await tx.answerLibraryItem.update({
            where: { id: params.id, workspaceId },
            data: {
              governanceStatus: transition.governanceStatus,
              approvalScope: transition.approvalScope,
              exportSafe: transition.exportSafe,
              status: transition.status,
              lastReviewedAt: transition.lastReviewedAt,
              approvedAt: transition.approvedAt,
              approvedByUserId: transition.approvedByUserId,
              nextReviewDueAt: transition.nextReviewDueAt,
              expiresAt: transition.expiresAt,
              ...(transition.lastVerified !== undefined ? { lastVerified: transition.lastVerified } : {}),
              currentVersion: nextVersion,
              ...(nextEmbedding !== undefined ? { embedding: nextEmbedding } : {}),
            },
          });

          const evAfter = await tx.answerEvidence.findMany({
            where: { answerId: fresh.id, workspaceId },
            select: { chunkId: true, quote: true },
          });
          const afterIds = sortedEvidenceChunkIds(evAfter);
          const finalDiff = buildGovernedFieldDiff(
            beforeSnap,
            governanceCompareFromItem(updatedItem, afterIds),
          );

          await recordAnswerLibraryVersion(tx, {
            workspaceId,
            answerId: updatedItem.id,
            versionNumber: nextVersion,
            changedById: userId,
            changeReason: transition.changeReasonSummary,
            resetApprovalRequired: false,
            changeDiffJson: finalDiff.length ? finalDiff : null,
            evidenceSnapshotJson: evidenceSnapshotJsonValue(evAfter),
            snapshot: itemToVersionSnapshot(updatedItem),
            changeKind: inferChangeKind({
              explicit: VERSION_CHANGE_KIND.GOVERNANCE,
              diff: finalDiff,
              resetApprovalRequired: false,
            }),
          });

          return updatedItem;
        });

        const beforeSnap = governanceAuditSnapshot({
          governanceStatus: answer.governanceStatus,
          approvalScope: answer.approvalScope,
          exportSafe: answer.exportSafe,
          status: answer.status,
          nextReviewDueAt: answer.nextReviewDueAt,
          reviewCadenceDays: answer.reviewCadenceDays,
          ownerId: answer.ownerId,
          approverId: answer.approverId,
        });
        const afterSnap = governanceAuditSnapshot({
          governanceStatus: result.governanceStatus,
          approvalScope: result.approvalScope,
          exportSafe: result.exportSafe,
          status: result.status,
          nextReviewDueAt: result.nextReviewDueAt,
          reviewCadenceDays: result.reviewCadenceDays,
          ownerId: result.ownerId,
          approverId: result.approverId,
        });

        await recordAuditEventSafe({
          workspaceId,
          actorUserId: userId,
          eventType: transition.auditEventType,
          objectType: AUDIT_OBJECT_TYPES.ANSWER_LIBRARY_ITEM,
          objectId: result.id,
          metadata: {
            ...buildGovernanceAuditMetadata({
              action,
              before: beforeSnap,
              after: afterSnap,
              comment: comment?.slice(0, 500) ?? null,
              version: result.currentVersion,
              source: "workflow",
            }),
            fromGovernance: answer.governanceStatus,
            toGovernance: transition.governanceStatus,
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
              action,
              version: result.currentVersion,
              source: "workflow",
              changeReason: transition.changeReasonSummary,
            }),
          },
        });

        const item = await prisma.answerLibraryItem.findFirst({
          where: { id: result.id, workspaceId },
          include: {
            topic: true,
            ownerUser: { select: { id: true, name: true, email: true } },
            approverUser: { select: { id: true, name: true, email: true } },
            approvedByUser: { select: { id: true, name: true, email: true } },
            versions: {
              orderBy: { versionNumber: "desc" },
              include: { changedBy: { select: { name: true, email: true } } },
            },
            evidence: {
              include: {
                chunk: { include: { sourceDocument: true } },
              },
            },
          },
        });

        await reconcileContradictionsForCanonicalAnswer({
          workspaceId,
          answerId: params.id,
          actorUserId: userId,
        });

        return NextResponse.json({ item });
      } catch (error) {
        lastError = error;
        if (attempt === 0 && isPrismaUniqueViolation(error)) continue;
        throw error;
      }
    }

    throw lastError instanceof Error ? lastError : new Error("Workflow update failed");
  } catch (error) {
    console.error("api:knowledge:answers:workflow:post:failed", error);
    return handleApiError(error);
  }
}
