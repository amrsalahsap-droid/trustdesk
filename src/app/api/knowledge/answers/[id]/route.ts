import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

function isPrismaUniqueViolation(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}
import { prisma, uncheckedPrisma } from "@/lib/db/prisma";
import { recordAuditEventSafe, AUDIT_EVENT_TYPES, AUDIT_OBJECT_TYPES } from "@/lib/audit";
import { buildGovernanceAuditMetadata, governanceAuditSnapshot } from "@/lib/audit/answer-governance-audit";
import { buildAuthContext } from "@/lib/auth/build-context";
import { authorizePermission } from "@/lib/auth/authorize-role";
import { Permission } from "@/lib/auth/permissions";
import { assertAnswerDelete, assertAnswerPatchAllowed } from "@/lib/auth/governance-actions";
import { handleApiError } from "@/lib/api/error-handler";
import { logger } from "@/lib/logging/logger";
import { reconcileContradictionsForCanonicalAnswer } from "@/lib/questionnaires/reconcile-questionnaire-item-contradiction";
import { computeAnswerEmbedding } from "@/modules/workspaces/intelligence/answer-embedding";
import {
  getSubControl,
  subControlEmbeddingExtras,
} from "@/modules/knowledge/topics/subcontrol-taxonomy";
import {
  hasAnswerLibraryPatchChanges,
  mergeAnswerLibraryPatch,
  type AnswerLibraryPatchBody,
} from "@/lib/knowledge/answer-library-patch";
import {
  ALLOWED_CADENCE_DAYS,
  computeNextReviewDueAt,
  resolveCadenceDays,
} from "@/lib/knowledge/answer-freshness";
import { safeParseOverridePayload } from "@/lib/knowledge/override-reason";
import {
  buildGovernedFieldDiff,
  buildOverrideFieldsDiff,
  classifyApprovalResetFromDiff,
  evidenceSnapshotJsonValue,
  governanceCompareFromItem,
  inferChangeKind,
  isApprovedGovernance,
  itemToVersionSnapshot,
  recordAnswerLibraryVersion,
  sortedEvidenceChunkIds,
  VERSION_CHANGE_KIND,
} from "@/lib/knowledge/answer-version-record";

const answerDetailInclude = {
  topic: true,
  ownerUser: { select: { id: true, name: true, email: true } },
  approverUser: { select: { id: true, name: true, email: true } },
  approvedByUser: { select: { id: true, name: true, email: true } },
  versions: {
    orderBy: { versionNumber: "desc" as const },
    include: { changedBy: { select: { id: true, name: true, email: true } } },
  },
  evidence: {
    include: {
      chunk: {
        include: {
          sourceDocument: true,
        },
      },
    },
  },
} satisfies Prisma.AnswerLibraryItemInclude;

/**
 * GET: Retrieve a specific Answer Library Item with full history and owner details.
 */
export async function GET(
  request: Request,
  segment: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await buildAuthContext(request);
    authorizePermission(ctx, Permission.VIEW_ANSWERS);
    const params = await segment.params;

    const item = await prisma.answerLibraryItem.findFirst({
      where: {
        id: params.id,
        workspaceId: ctx.workspaceId,
      },
      include: answerDetailInclude,
    });

    if (!item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    return NextResponse.json({ item });
  } catch (error) {
    console.error("api:knowledge:answers:detail:get:failed", error);
    return handleApiError(error);
  }
}

/**
 * PATCH: Update an Answer Library Item with owner validation and versioning.
 */
export async function PATCH(
  request: Request,
  segment: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await buildAuthContext(request);
    const params = await segment.params;
    const workspaceId = ctx.workspaceId;
    const userId = ctx.userId;

    const body = (await request.json()) as AnswerLibraryPatchBody;
    const { changeReason, ...patchFields } = body;

    const existing = await prisma.answerLibraryItem.findFirst({
      where: { id: params.id, workspaceId },
    });

    if (!existing) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    assertAnswerPatchAllowed(ctx, existing, body);

    // Governed path: while in formal review, approvals must use POST .../workflow
    if (
      patchFields.status === "APPROVED" &&
      existing.status !== "APPROVED" &&
      existing.governanceStatus === "IN_REVIEW"
    ) {
      return NextResponse.json(
        {
          error:
            "This answer is in review. Use the workflow endpoint to approve, reject, or request revision.",
          code: "USE_WORKFLOW",
        },
        { status: 409 },
      );
    }

    if (patchFields.reviewCadenceDays !== undefined) {
      if (
        patchFields.reviewCadenceDays != null &&
        !ALLOWED_CADENCE_DAYS.includes(patchFields.reviewCadenceDays as (typeof ALLOWED_CADENCE_DAYS)[number])
      ) {
        return NextResponse.json(
          { error: "reviewCadenceDays must be 90, 180, 365, or null to inherit" },
          { status: 400 },
        );
      }
    }

    if (patchFields.ownerId && patchFields.ownerId !== existing.ownerId) {
      const membership = await prisma.workspaceMembership.findFirst({
        where: { workspaceId, userId: patchFields.ownerId, status: "ACTIVE" },
      });
      if (!membership) {
        return NextResponse.json(
          { error: "Assigned owner must be an active member of this workspace" },
          { status: 403 },
        );
      }
    }

    if (patchFields.approverId && patchFields.approverId !== existing.approverId) {
      const membership = await prisma.workspaceMembership.findFirst({
        where: { workspaceId, userId: patchFields.approverId, status: "ACTIVE" },
      });
      if (!membership) {
        return NextResponse.json(
          { error: "Assigned approver must be an active member of this workspace" },
          { status: 403 },
        );
      }
    }

    const merged = mergeAnswerLibraryPatch(existing, patchFields);

    if (!hasAnswerLibraryPatchChanges(existing, merged)) {
      const item = await prisma.answerLibraryItem.findFirst({
        where: { id: params.id, workspaceId },
        include: answerDetailInclude,
      });
      return NextResponse.json({ item });
    }

    const [wsRowPreview, evBeforePreview] = await Promise.all([
      uncheckedPrisma.workspace.findUnique({
        where: { id: workspaceId },
        select: {
          defaultAnswerReviewCadenceDays: true,
          allowApprovedAnswerBodyEditWithoutReapproval: true,
        },
      }),
      uncheckedPrisma.answerEvidence.findMany({
        where: { answerId: existing.id, workspaceId },
        select: { chunkId: true },
      }),
    ]);
    const beforeEvidencePreview = sortedEvidenceChunkIds(evBeforePreview);
    const beforeSnapPreview = governanceCompareFromItem(existing, beforeEvidencePreview);

    const isApprovalTransitionPreview =
      merged.status === "APPROVED" && existing.status !== "APPROVED";
    const isArchiveTransitionPreview =
      merged.status === "ARCHIVED" && existing.status !== "ARCHIVED";

    const intentItemPreview = {
      title: merged.title,
      answer: merged.answer,
      governanceStatus: existing.governanceStatus,
      approvalScope: existing.approvalScope,
      exportSafe: existing.exportSafe,
      ownerId: merged.ownerId,
      approverId: merged.approverId,
      topicId: merged.topicId,
      subControlKey: merged.subControlKey,
      subControlLabels: merged.subControlLabels,
      confidenceScore: merged.confidenceScore,
      reviewCadenceDays: merged.reviewCadenceDays,
    };
    const intentDiffPreview = buildGovernedFieldDiff(
      beforeSnapPreview,
      governanceCompareFromItem(intentItemPreview, beforeEvidencePreview),
    );
    const resetApprovalPreview =
      !isApprovalTransitionPreview &&
      !isArchiveTransitionPreview &&
      isApprovedGovernance(existing.governanceStatus) &&
      classifyApprovalResetFromDiff(intentDiffPreview, {
        allowBodyEditWithoutReapproval:
          wsRowPreview?.allowApprovedAnswerBodyEditWithoutReapproval ?? false,
      });

    const titleOrAnswerChanged =
      existing.title !== merged.title || (existing.answer ?? "") !== (merged.answer ?? "");

    const requiresOverridePayload =
      (isApprovedGovernance(existing.governanceStatus) && titleOrAnswerChanged) ||
      resetApprovalPreview;

    const hasAnyOverrideInPatch =
      patchFields.overrideReasonCategory !== undefined ||
      patchFields.overrideComment !== undefined ||
      patchFields.overrideScope !== undefined;

    let mergedForDb = merged;

    if (requiresOverridePayload) {
      const parsed = safeParseOverridePayload({
        overrideReasonCategory: patchFields.overrideReasonCategory,
        overrideComment: patchFields.overrideComment ?? null,
        overrideScope: patchFields.overrideScope,
      });
      if (!parsed.success) {
        return NextResponse.json(
          {
            error: "Override rationale required",
            code: "OVERRIDE_REQUIRED",
            issues: parsed.error.issues,
          },
          { status: 400 },
        );
      }
      mergedForDb = {
        ...merged,
        overrideReasonCategory: parsed.data.overrideReasonCategory,
        overrideComment: parsed.data.overrideComment?.trim() ?? null,
        overrideScope: parsed.data.overrideScope,
      };
    } else if (hasAnyOverrideInPatch) {
      const parsed = safeParseOverridePayload({
        overrideReasonCategory: merged.overrideReasonCategory,
        overrideComment: merged.overrideComment ?? null,
        overrideScope: merged.overrideScope,
      });
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Invalid override fields", issues: parsed.error.issues },
          { status: 400 },
        );
      }
      mergedForDb = {
        ...merged,
        overrideReasonCategory: parsed.data.overrideReasonCategory,
        overrideComment: parsed.data.overrideComment?.trim() ?? null,
        overrideScope: parsed.data.overrideScope,
      };
    }

    // Resolve the merged topic's canonical key so sub-control keys can be
    // validated against the taxonomy and sub-control labels fed into the
    // embedding. Runs only when sub-control fields actually change to avoid
    // an extra DB hit on ownership-only edits.
    const subControlFieldsChanged =
      patchFields.subControlKey !== undefined || patchFields.subControlLabels !== undefined;
    let resolvedTopicKey: string | null = null;
    let resolvedTopicName: string | null = null;
    if (mergedForDb.topicId && (subControlFieldsChanged || mergedForDb.subControlKey)) {
      // Read-only metadata lookup. Uses uncheckedPrisma to support global
      // SYSTEM_WORKSPACE topics (which the tenant-guarded client cannot
      // find by id alone) and because the response is only used for
      // embedding augmentation and taxonomy validation against the
      // already-accessible answer row.
      const topicRow = await uncheckedPrisma.knowledgeTopic.findUnique({
        where: { id: mergedForDb.topicId },
        select: { key: true, name: true },
      });
      resolvedTopicKey = topicRow?.key ?? null;
      resolvedTopicName = topicRow?.name ?? null;
    }
    if (mergedForDb.subControlKey) {
      if (!resolvedTopicKey || !getSubControl(resolvedTopicKey, mergedForDb.subControlKey)) {
        return NextResponse.json(
          {
            error:
              "subControlKey does not belong to the resolved topic's taxonomy. Check the sub-control catalogue.",
          },
          { status: 400 },
        );
      }
    }
    const subControlMeta = mergedForDb.subControlKey
      ? getSubControl(resolvedTopicKey, mergedForDb.subControlKey)
      : null;
    const embeddingExtras = subControlMeta
      ? subControlEmbeddingExtras(resolvedTopicName, subControlMeta)
      : undefined;

    // Re-embed on semantic changes: title/answer edits, APPROVED transition,
    // or sub-control taxonomy changes (label / keywords flow into the vector
    // so retrieval discrimination tracks the new metadata).
    const shouldReembed =
      mergedForDb.title !== existing.title ||
      mergedForDb.answer !== existing.answer ||
      (mergedForDb.status === "APPROVED" && existing.status !== "APPROVED") ||
      subControlFieldsChanged;
    let nextEmbedding: number[] | undefined;
    if (shouldReembed) {
      try {
        nextEmbedding = await computeAnswerEmbedding(
          mergedForDb.title,
          mergedForDb.answer,
          embeddingExtras,
        );
      } catch (err) {
        logger.warn("api:knowledge:answers:embedding:failed", {
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
          if (!fresh) {
            throw new Error("Answer disappeared during update");
          }

          const nextVersion = fresh.currentVersion + 1;

          const isApprovalTransition = mergedForDb.status === "APPROVED" && fresh.status !== "APPROVED";
          const isArchiveTransition = mergedForDb.status === "ARCHIVED" && fresh.status !== "ARCHIVED";
          const approvalNow = new Date();

          const [wsRow, topicMeta] = await Promise.all([
            tx.workspace.findUnique({
              where: { id: workspaceId },
              select: {
                defaultAnswerReviewCadenceDays: true,
                allowApprovedAnswerBodyEditWithoutReapproval: true,
              },
            }),
            fresh.topicId
              ? tx.knowledgeTopic.findFirst({
                  where: {
                    id: fresh.topicId,
                    workspaceId: { in: [workspaceId, "SYSTEM_WORKSPACE"] },
                  },
                  select: { reviewCadenceDays: true },
                })
              : Promise.resolve(null),
          ]);

          const resolvedCadence = resolveCadenceDays({
            answerOverride: mergedForDb.reviewCadenceDays,
            topicOverride: topicMeta?.reviewCadenceDays ?? null,
            workspaceDefault: wsRow?.defaultAnswerReviewCadenceDays ?? 90,
          });

          const cadenceRecalcApproved =
            mergedForDb.reviewCadenceDays !== existing.reviewCadenceDays &&
            (fresh.governanceStatus === "APPROVED_INTERNAL" ||
              fresh.governanceStatus === "APPROVED_FOR_EXPORT" ||
              (fresh.status === "APPROVED" && fresh.governanceStatus === "DRAFT"));

          let nextReviewDueAt: Date | undefined;
          let lastReviewedAt: Date | undefined;
          let expiresAtClear: null | undefined;
          if (isApprovalTransition) {
            lastReviewedAt = approvalNow;
            nextReviewDueAt = computeNextReviewDueAt(approvalNow, resolvedCadence);
            expiresAtClear = null;
          } else if (cadenceRecalcApproved) {
            const anchor = fresh.lastReviewedAt ?? fresh.approvedAt ?? approvalNow;
            nextReviewDueAt = computeNextReviewDueAt(anchor, resolvedCadence);
          }

          const evRowsBefore = await tx.answerEvidence.findMany({
            where: { answerId: fresh.id, workspaceId },
            select: { chunkId: true, quote: true },
          });
          const beforeEvidenceIds = sortedEvidenceChunkIds(evRowsBefore);
          const beforeSnap = governanceCompareFromItem(fresh, beforeEvidenceIds);

          const overrideMetaBefore = {
            overrideReasonCategory: fresh.overrideReasonCategory,
            overrideComment: fresh.overrideComment,
            overrideScope: fresh.overrideScope,
          };

          const intentItem = {
            title: mergedForDb.title,
            answer: mergedForDb.answer,
            governanceStatus: fresh.governanceStatus,
            approvalScope: fresh.approvalScope,
            exportSafe: fresh.exportSafe,
            ownerId: mergedForDb.ownerId,
            approverId: mergedForDb.approverId,
            topicId: mergedForDb.topicId,
            subControlKey: mergedForDb.subControlKey,
            subControlLabels: mergedForDb.subControlLabels,
            confidenceScore: mergedForDb.confidenceScore,
            reviewCadenceDays: mergedForDb.reviewCadenceDays,
          };
          const intentDiff = buildGovernedFieldDiff(
            beforeSnap,
            governanceCompareFromItem(intentItem, beforeEvidenceIds),
          );
          const resetApproval =
            !isApprovalTransition &&
            !isArchiveTransition &&
            isApprovedGovernance(fresh.governanceStatus) &&
            classifyApprovalResetFromDiff(intentDiff, {
              allowBodyEditWithoutReapproval:
                wsRow?.allowApprovedAnswerBodyEditWithoutReapproval ?? false,
            });

          const updatedItem = await tx.answerLibraryItem.update({
            where: { id: params.id, workspaceId },

            data: {
              title: mergedForDb.title,
              answer: mergedForDb.answer,
              topicId: mergedForDb.topicId,
              owner: mergedForDb.owner,
              ownerId: mergedForDb.ownerId,
              approverId: mergedForDb.approverId,
              status: resetApproval ? "DRAFT" : mergedForDb.status,
              confidenceScore: mergedForDb.confidenceScore,
              reviewCadenceDays: mergedForDb.reviewCadenceDays,
              currentVersion: nextVersion,
              lastVerified: isApprovalTransition ? approvalNow : undefined,
              approvedAt: resetApproval ? null : isApprovalTransition ? approvalNow : undefined,
              approvedByUserId: resetApproval ? null : isApprovalTransition ? userId : undefined,
              overrideReasonCategory: mergedForDb.overrideReasonCategory,
              overrideComment: mergedForDb.overrideComment,
              overrideScope: mergedForDb.overrideScope,
              overrideAt: mergedForDb.overrideReasonCategory ? approvalNow : null,
              overrideByUserId: mergedForDb.overrideReasonCategory ? userId : null,
              ...(resetApproval
                ? {
                    governanceStatus: "REVISION_REQUIRED" as const,
                    approvalScope: "INTERNAL_ONLY" as const,
                    exportSafe: false,
                    lastReviewedAt: approvalNow,
                    nextReviewDueAt: null,
                    expiresAt: null,
                  }
                : isApprovalTransition
                  ? {
                      governanceStatus: "APPROVED_INTERNAL" as const,
                      approvalScope: "INTERNAL_ONLY" as const,
                      exportSafe: false,
                      lastReviewedAt,
                      nextReviewDueAt,
                      expiresAt: expiresAtClear,
                    }
                  : {}),
              ...(!resetApproval &&
              !isApprovalTransition &&
              cadenceRecalcApproved &&
              nextReviewDueAt
                ? { nextReviewDueAt }
                : {}),
              ...(isArchiveTransition ? { governanceStatus: "REJECTED" as const } : {}),
              subControlKey: mergedForDb.subControlKey,
              subControlLabels: mergedForDb.subControlLabels,
              ...(nextEmbedding !== undefined ? { embedding: nextEmbedding } : {}),
            },
            include: {
              topic: true,
              ownerUser: { select: { id: true, name: true } },
              approverUser: { select: { id: true, name: true } },
            },
          });

          const evRowsAfter = await tx.answerEvidence.findMany({
            where: { answerId: fresh.id, workspaceId },
            select: { chunkId: true, quote: true },
          });
          const afterEvidenceIds = sortedEvidenceChunkIds(evRowsAfter);
          const governanceDiff = buildGovernedFieldDiff(
            beforeSnap,
            governanceCompareFromItem(updatedItem, afterEvidenceIds),
          );
          const overrideMetaAfter = {
            overrideReasonCategory: updatedItem.overrideReasonCategory,
            overrideComment: updatedItem.overrideComment,
            overrideScope: updatedItem.overrideScope,
          };
          const overrideDiff = buildOverrideFieldsDiff(overrideMetaBefore, overrideMetaAfter);
          const combinedDiff = [...governanceDiff, ...overrideDiff];

          const baseReason =
            changeReason ||
            (resetApproval ? "Material edit — review required" : "User update");
          const versionReason =
            overrideDiff.length && mergedForDb.overrideReasonCategory
              ? `${baseReason} [Override: ${mergedForDb.overrideReasonCategory}]`
              : baseReason;

          await recordAnswerLibraryVersion(tx, {
            workspaceId,
            answerId: updatedItem.id,
            versionNumber: nextVersion,
            changedById: userId,
            changeReason: versionReason,
            resetApprovalRequired: resetApproval,
            changeDiffJson: combinedDiff.length ? combinedDiff : null,
            evidenceSnapshotJson: evidenceSnapshotJsonValue(evRowsAfter),
            snapshot: itemToVersionSnapshot(updatedItem),
            changeKind: resetApproval
              ? VERSION_CHANGE_KIND.CONTENT
              : inferChangeKind({
                  diff: combinedDiff,
                  resetApprovalRequired: false,
                }),
          });

          return updatedItem;
        });

        if (patchFields.ownerId && patchFields.ownerId !== existing.ownerId) {
          await recordAuditEventSafe({
            workspaceId,
            actorUserId: userId,
            eventType: AUDIT_EVENT_TYPES.ANSWER_OWNER_CHANGED,
            objectType: AUDIT_OBJECT_TYPES.ANSWER_LIBRARY_ITEM,
            objectId: result.id,
            metadata: {
              before: existing.ownerId,
              after: result.ownerId,
            },
          });
        }

        if (patchFields.approverId && patchFields.approverId !== existing.approverId) {
          await recordAuditEventSafe({
            workspaceId,
            actorUserId: userId,
            eventType: AUDIT_EVENT_TYPES.APPROVER_CHANGED,
            objectType: AUDIT_OBJECT_TYPES.ANSWER_LIBRARY_ITEM,
            objectId: result.id,
            metadata: {
              before: existing.approverId,
              after: result.approverId,
            },
          });
        }

        if (
          existing.overrideReasonCategory !== result.overrideReasonCategory ||
          (existing.overrideComment ?? "") !== (result.overrideComment ?? "") ||
          existing.overrideScope !== result.overrideScope
        ) {
          await recordAuditEventSafe({
            workspaceId,
            actorUserId: userId,
            eventType: AUDIT_EVENT_TYPES.ANSWER_LIBRARY_OVERRIDE,
            objectType: AUDIT_OBJECT_TYPES.ANSWER_LIBRARY_ITEM,
            objectId: result.id,
            metadata: {
              category: result.overrideReasonCategory,
              scope: result.overrideScope,
              commentPreview: (result.overrideComment ?? "").slice(0, 200),
              before_overrideReasonCategory: existing.overrideReasonCategory ?? null,
              before_overrideScope: existing.overrideScope ?? null,
              before_overrideCommentPreview: (existing.overrideComment ?? "").slice(0, 200),
            },
          });
        }

        const existingNext = existing.nextReviewDueAt
          ? new Date(existing.nextReviewDueAt).getTime()
          : null;
        const resultNext = result.nextReviewDueAt ? new Date(result.nextReviewDueAt).getTime() : null;
        const scheduleChanged =
          existingNext !== resultNext ||
          (existing.reviewCadenceDays ?? null) !== (result.reviewCadenceDays ?? null);
        if (scheduleChanged) {
          await recordAuditEventSafe({
            workspaceId,
            actorUserId: userId,
            eventType: AUDIT_EVENT_TYPES.ANSWER_REVIEW_SCHEDULE_CHANGED,
            objectType: AUDIT_OBJECT_TYPES.ANSWER_LIBRARY_ITEM,
            objectId: result.id,
            metadata: {
              ...buildGovernanceAuditMetadata({
                action: "patch",
                before: governanceAuditSnapshot({
                  governanceStatus: existing.governanceStatus,
                  approvalScope: existing.approvalScope,
                  exportSafe: existing.exportSafe,
                  status: existing.status,
                  nextReviewDueAt: existing.nextReviewDueAt,
                  reviewCadenceDays: existing.reviewCadenceDays,
                  ownerId: existing.ownerId,
                  approverId: existing.approverId,
                }),
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
                changeReason: changeReason || "User update",
                version: result.currentVersion,
                source: "patch",
              }),
            },
          });
        }

        await recordAuditEventSafe({
          workspaceId,
          actorUserId: userId,
          eventType: AUDIT_EVENT_TYPES.ANSWER_LIBRARY_ITEM_UPDATED,
          objectType: AUDIT_OBJECT_TYPES.ANSWER_LIBRARY_ITEM,
          objectId: result.id,
          metadata: {
            ...buildGovernanceAuditMetadata({
              action: "patch",
              before: governanceAuditSnapshot({
                governanceStatus: existing.governanceStatus,
                approvalScope: existing.approvalScope,
                exportSafe: existing.exportSafe,
                status: existing.status,
                nextReviewDueAt: existing.nextReviewDueAt,
                reviewCadenceDays: existing.reviewCadenceDays,
                ownerId: existing.ownerId,
                approverId: existing.approverId,
              }),
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
              version: result.currentVersion,
              changeReason: changeReason || "User update",
              source: "patch",
            }),
            updates: Object.entries(patchFields)
              .filter(([, v]) => v !== undefined)
              .map(([k]) => k)
              .join(","),
          },
        });

        if (result.currentVersion > existing.currentVersion) {
          await recordAuditEventSafe({
            workspaceId,
            actorUserId: userId,
            eventType: AUDIT_EVENT_TYPES.ANSWER_LIBRARY_VERSION_RECORDED,
            objectType: AUDIT_OBJECT_TYPES.ANSWER_LIBRARY_ITEM,
            objectId: result.id,
            metadata: {
              ...buildGovernanceAuditMetadata({
                action: "patch",
                version: result.currentVersion,
                changeReason: changeReason || "User update",
                source: "patch",
              }),
            },
          });
        }

        const item = await prisma.answerLibraryItem.findFirst({
          where: { id: result.id, workspaceId },
          include: answerDetailInclude,
        });

        await reconcileContradictionsForCanonicalAnswer({
          workspaceId,
          answerId: params.id,
          actorUserId: userId,
        });

        return NextResponse.json({ item });
      } catch (error) {
        lastError = error;
        if (attempt === 0 && isPrismaUniqueViolation(error)) {
          continue;
        }
        throw error;
      }
    }

    throw lastError instanceof Error ? lastError : new Error("Answer update failed");
  } catch (error) {
    console.error("api:knowledge:answers:detail:patch:failed", error);
    return handleApiError(error);
  }
}

/**
 * DELETE: Remove an Answer Library Item.
 */
export async function DELETE(
  request: Request,
  segment: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await buildAuthContext(request);
    const params = await segment.params;
    const workspaceId = ctx.workspaceId;
    const userId = ctx.userId;

    const existing = await prisma.answerLibraryItem.findFirst({
      where: { id: params.id, workspaceId },
    });

    if (!existing) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    assertAnswerDelete(ctx, existing.ownerId);

    await prisma.answerLibraryItem.delete({
      where: { id: params.id, workspaceId },
    });

    await recordAuditEventSafe({
      workspaceId,
      actorUserId: userId,
      eventType: AUDIT_EVENT_TYPES.ANSWER_LIBRARY_ITEM_ARCHIVED,
      objectType: AUDIT_OBJECT_TYPES.ANSWER_LIBRARY_ITEM,
      objectId: params.id,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("api:knowledge:answers:detail:delete:failed", error);
    return handleApiError(error);
  }
}
