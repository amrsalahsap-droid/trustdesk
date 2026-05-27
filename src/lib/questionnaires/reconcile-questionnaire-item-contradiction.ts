/**
 * Targeted contradiction persistence for a single questionnaire row.
 * Same pipeline as review GET: canonical retrieval, detect, upsert, optional audit.
 */

import { prisma, uncheckedPrisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logging/logger";
import {
  getContradictionForItem,
  saveNoContradiction,
  upsertContradictionDetection,
} from "@/lib/contradiction/persistence-service";
import type { ContradictionResolutionStatus } from "@/lib/contradiction/persistence-types";
import {
  runRowCanonicalContradictionCheck,
  subControlKeyFromProvenance,
  type TopicForRetrieve,
} from "@/lib/questionnaires/review-contradiction";
import {
  buildSaveContradictionInputFromReviewRow,
  withContradictionPersistence,
} from "@/lib/questionnaires/review-contradiction-persist";
import type { ReviewCanonicalContradictionDTO } from "@/lib/questionnaires/types";
import {
  recordAuditEventSafe,
  AUDIT_EVENT_TYPES,
  AUDIT_OBJECT_TYPES,
} from "@/lib/audit";
import {
  buildContradictionDetectedAuditMetadata,
  shouldEmitMaterialContradictionDetected,
} from "@/lib/audit/contradiction-audit";

/**
 * Resolution statuses that "block" export (per `isContradictionUnresolvedForExport`).
 * Only prior rows in one of these states need to be cleared when reconcile decides there is
 * no current contradiction to persist; terminal states (ACKNOWLEDGED, RESOLVED_ROW,
 * RESOLVED_CANONICAL, FALSE_POSITIVE) already record the user's final decision and must be
 * preserved.
 */
const UNRESOLVED_STATUSES: ReadonlySet<ContradictionResolutionStatus> = new Set<ContradictionResolutionStatus>([
  "PENDING",
  "STALE",
]);

/**
 * When reconcile cannot detect a canonical contradiction (empty row, missing canonical,
 * missing rule pack, checked-without-canonical), any prior ContradictionResult that was
 * still flagging the row must be cleared so export readiness does not block on stale data.
 */
async function clearStaleContradictionIfNeeded(args: {
  workspaceId: string;
  questionnaireId: string;
  questionnaireItemId: string;
  topicId: string | null;
  topicKey: string | null;
}): Promise<void> {
  const prior = await getContradictionForItem(args.workspaceId, args.questionnaireItemId);
  if (!prior) return;
  if (!prior.contradictionFound) return;
  if (!UNRESOLVED_STATUSES.has(prior.resolutionStatus)) return;

  try {
    await saveNoContradiction({
      workspaceId: args.workspaceId,
      questionnaireId: args.questionnaireId,
      questionnaireItemId: args.questionnaireItemId,
      // Preserve FK integrity by reusing the prior canonical snapshot.
      canonicalAnswerId: prior.canonicalAnswerId,
      canonicalVersionNumber: prior.canonicalVersionNumber,
      topicId: args.topicId ?? prior.topicId ?? undefined,
      topicKey: args.topicKey ?? prior.topicKey ?? undefined,
    });
  } catch (e) {
    logger.warn("questionnaire.reconcile:stale_clear_failed", {
      workspaceId: args.workspaceId,
      questionnaireId: args.questionnaireId,
      questionnaireItemId: args.questionnaireItemId,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

export async function reconcileQuestionnaireItemContradiction(args: {
  workspaceId: string;
  questionnaireId: string;
  questionnaireItemId: string;
  actorUserId?: string | null;
  /** Passed to audit metadata when emitting QUESTIONNAIRE_ITEM_CONTRADICTION_DETECTED */
  auditDetectedReason?: string;
}): Promise<ReviewCanonicalContradictionDTO> {
  const { workspaceId, questionnaireId, questionnaireItemId, actorUserId } = args;
  const auditReason = args.auditDetectedReason ?? "material_detection_on_reconcile";

  const item = await prisma.questionnaireItem.findFirst({
    where: { id: questionnaireItemId, workspaceId, questionnaireId },
    select: {
      id: true,
      type: true,
      question: true,
      finalAnswer: true,
      suggestedAnswer: true,
      importedAnswer: true,
      topicId: true,
      topicKey: true,
      provenanceJson: true,
      suggestedAnswerId: true,
      verificationStatus: true,
    },
  });

  if (!item || item.type !== "question_row") {
    return { status: "skipped", reason: "not_question_row" };
  }

  const topicForRetrieve: TopicForRetrieve | null = item.topicId
    ? { topicId: item.topicId }
    : item.topicKey
      ? { topicKey: item.topicKey }
      : null;

  let topicKeyForRules = (item.topicKey?.trim() && item.topicKey) || null;
  if (!topicKeyForRules && item.topicId) {
    let topic = await prisma.knowledgeTopic.findFirst({
      where: {
        id: item.topicId,
        workspaceId: { in: [workspaceId, "SYSTEM_WORKSPACE"] },
      },
      select: { key: true },
    });
    if (!topic) {
      topic = await uncheckedPrisma.knowledgeTopic.findFirst({
        where: { id: item.topicId, workspaceId: null },
        select: { key: true },
      });
    }
    topicKeyForRules = topic?.key ?? null;
  }

  let linkedSub: string | null = null;
  if (item.suggestedAnswerId) {
    const ans = await prisma.answerLibraryItem.findFirst({
      where: { id: item.suggestedAnswerId, workspaceId },
      select: { subControlKey: true },
    });
    linkedSub = ans?.subControlKey ?? null;
  }
  const subControlKey = linkedSub ?? subControlKeyFromProvenance(item.provenanceJson) ?? null;

  let canonicalContradiction: ReviewCanonicalContradictionDTO;
  try {
    console.log("DEBUG: Running row contradiction check");
    canonicalContradiction = await runRowCanonicalContradictionCheck({
      workspaceId,
      questionnaireId,
      questionnaireItemId: item.id,
      question: item.question,
      finalAnswer: item.finalAnswer,
      suggestedAnswer: item.suggestedAnswer,
      importedAnswer: item.importedAnswer,
      suggestedAnswerId: item.suggestedAnswerId,
      verificationStatus: item.verificationStatus,
      topicForRetrieve,
      topicKeyForRules,
      subControlKey,
    });
  } catch (e) {
    logger.warn("questionnaire.reconcile:contradiction_row_unexpected_error", {
      workspaceId,
      questionnaireId,
      questionnaireItemId: item.id,
      error: e instanceof Error ? e.message : String(e),
    });
    return {
      status: "error",
      message: e instanceof Error ? e.message : "Unexpected error",
    };
  }

  if (canonicalContradiction.status === "checked") {
    const persistInput = buildSaveContradictionInputFromReviewRow(
      {
        workspaceId,
        questionnaireId,
        questionnaireItemId: item.id,
        topicId: item.topicId,
        topicKey: item.topicKey,
        subControlKey,
        finalAnswer: item.finalAnswer,
        suggestedAnswer: item.suggestedAnswer,
      },
      canonicalContradiction,
    );
    if (persistInput) {
      try {
        let priorForAudit: Awaited<ReturnType<typeof getContradictionForItem>> = null;
        if (persistInput.contradictionFound) {
          priorForAudit = await getContradictionForItem(workspaceId, item.id);
        }
        console.log("DEBUG: Upserting contradiction detection", { workspaceId });
        const persisted = await upsertContradictionDetection(persistInput);
        canonicalContradiction = withContradictionPersistence(canonicalContradiction, persisted);
        if (
          actorUserId &&
          persisted.contradictionFound &&
          shouldEmitMaterialContradictionDetected(priorForAudit, persisted)
        ) {
          await recordAuditEventSafe({
            workspaceId,
            actorUserId,
            eventType: AUDIT_EVENT_TYPES.QUESTIONNAIRE_ITEM_CONTRADICTION_DETECTED,
            objectType: AUDIT_OBJECT_TYPES.QUESTIONNAIRE_ITEM,
            objectId: item.id,
            metadata: buildContradictionDetectedAuditMetadata(
              questionnaireId,
              item.id,
              persisted,
              auditReason,
            ),
          });
        }
      } catch (e) {
        logger.warn("questionnaire.reconcile:contradiction_persist_failed", {
          workspaceId,
          questionnaireId,
          questionnaireItemId: item.id,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    } else {
      // checked but no canonicalAnswerId: there is nothing to compare against, so any
      // prior unresolved contradiction for this row is now stale.
      await clearStaleContradictionIfNeeded({
        workspaceId,
        questionnaireId,
        questionnaireItemId: item.id,
        topicId: item.topicId,
        topicKey: item.topicKey,
      });
    }
  } else if (
    canonicalContradiction.status === "skipped" ||
    canonicalContradiction.status === "no_canonical" ||
    canonicalContradiction.status === "no_rule_pack"
  ) {
    // Row has no current detection context (empty answer, missing canonical, missing rule
    // pack). Clear any lingering unresolved contradiction so export readiness matches the
    // row's current state. Audit trail is preserved via upsert to contradictionFound=false.
    await clearStaleContradictionIfNeeded({
      workspaceId,
      questionnaireId,
      questionnaireItemId: item.id,
      topicId: item.topicId,
      topicKey: item.topicKey,
    });
  }

  return canonicalContradiction;
}

/**
 * Re-runs contradiction detection for every questionnaire row tied to this answer:
 * rows whose persisted contradiction points at this canonical, and rows that link it as suggestedAnswerId.
 */
export async function reconcileContradictionsForCanonicalAnswer(args: {
  workspaceId: string;
  answerId: string;
  actorUserId?: string | null;
}): Promise<void> {
  const { workspaceId, answerId, actorUserId } = args;

  const [fromResults, fromSuggested] = await Promise.all([
    prisma.contradictionResult.findMany({
      where: { workspaceId, canonicalAnswerId: answerId },
      select: { questionnaireItemId: true, questionnaireId: true },
    }),
    prisma.questionnaireItem.findMany({
      where: { workspaceId, suggestedAnswerId: answerId, type: "question_row" },
      select: { id: true, questionnaireId: true },
    }),
  ]);

  const seen = new Set<string>();
  const tasks: Array<{ questionnaireId: string; questionnaireItemId: string }> = [];

  for (const r of fromResults) {
    if (!seen.has(r.questionnaireItemId)) {
      seen.add(r.questionnaireItemId);
      tasks.push({
        questionnaireId: r.questionnaireId,
        questionnaireItemId: r.questionnaireItemId,
      });
    }
  }
  for (const r of fromSuggested) {
    if (!seen.has(r.id)) {
      seen.add(r.id);
      tasks.push({ questionnaireId: r.questionnaireId, questionnaireItemId: r.id });
    }
  }

  for (const t of tasks) {
    try {
      await reconcileQuestionnaireItemContradiction({
        workspaceId,
        questionnaireId: t.questionnaireId,
        questionnaireItemId: t.questionnaireItemId,
        actorUserId,
        auditDetectedReason: "material_detection_after_canonical_change",
      });
    } catch (e) {
      logger.warn("questionnaire.reconcile:canonical_fanout_failed", {
        workspaceId,
        answerId,
        questionnaireItemId: t.questionnaireItemId,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
}
