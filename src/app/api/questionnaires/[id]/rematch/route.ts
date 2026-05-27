import { NextResponse } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { buildAuthContext } from "@/lib/auth/build-context";
import { handleApiError } from "@/lib/api/error-handler";
import { logger } from "@/lib/logging/logger";
import { QuestionnaireMatchingService } from "@/modules/workspaces/intelligence/questionnaire-matching-service";
import { UNRESOLVED_REASON_KEYS } from "@/lib/questionnaires/unresolved-reasons";

import { assertAnswerGenerate } from "@/lib/auth/governance-actions";

/**
 * POST /api/questionnaires/[id]/rematch
 *
 * Replays `matchRows` + `applyResultsToDatabase` for an already-imported
 * questionnaire using the current library state.  Lets operators fix upstream
 * issues (reclassification, seeding, promotion) and immediately see the
 * effect on existing rows without re-uploading the source file.
 *
 * Safety:
 *  - Tenant-scoped via `buildAuthContext`; only operates on rows belonging to
 *    the caller's workspace.
 *  - Does NOT create new QuestionnaireItem rows, only updates existing ones.
 *  - Human decisions (ACCEPTED / REJECTED / EDITED / MANUAL_OVERRIDE) are
 *    preserved by `applyResultsToDatabase` — the same guard that runs during
 *    initial import.
 */
export async function POST(
  request: Request,
  segment: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await buildAuthContext(request);
    assertAnswerGenerate(ctx);
    const { id: questionnaireId } = await segment.params;

    const questionnaire = await prisma.questionnaire.findFirst({
      where: { id: questionnaireId, workspaceId: ctx.workspaceId },
      select: { id: true, title: true },
    });
    if (!questionnaire) {
      return NextResponse.json({ error: "Questionnaire not found." }, { status: 404 });
    }

    const items = await prisma.questionnaireItem.findMany({
      where: { questionnaireId, workspaceId: ctx.workspaceId, type: "question_row" },
      select: {
        id: true,
        rowNumber: true,
        type: true,
        question: true,
        topicId: true,
        suggestedAnswerId: true,
        unresolvedReason: true,
        confidence: true,
      },
    });

    if (items.length === 0) {
      return NextResponse.json({
        questionnaireId,
        rowCount: 0,
        approvedSelected: 0,
        unresolvedReasonHistogram: {},
        note: "No question_row items found for this questionnaire.",
      });
    }

    logger.info("questionnaire:rematch:start", {
      questionnaireId,
      workspaceId: ctx.workspaceId,
      rowCount: items.length,
      userId: ctx.userId,
    });

    // Snapshot before-state for the response summary.
    const beforeApprovedSelected = items.filter((r) => r.suggestedAnswerId != null).length;
    const beforeReasonHistogram: Record<string, number> = {};
    for (const item of items) {
      const key = item.unresolvedReason ?? "__resolved__";
      beforeReasonHistogram[key] = (beforeReasonHistogram[key] ?? 0) + 1;
    }

    // Run matcher against existing rows (same shape as confirm route).
    const matchingResults = await QuestionnaireMatchingService.matchRows(
      ctx.workspaceId,
      items,
    );

    // Persist the updated suggestions back onto existing rows.
    await QuestionnaireMatchingService.applyResultsToDatabase(
      ctx.workspaceId,
      questionnaireId,
      matchingResults,
    );

    // Reload for after-state summary.
    const afterItems = await prisma.questionnaireItem.findMany({
      where: { questionnaireId, workspaceId: ctx.workspaceId, type: "question_row" },
      select: { suggestedAnswerId: true, unresolvedReason: true, confidence: true },
    });

    const afterApprovedSelected = afterItems.filter((r) => r.suggestedAnswerId != null).length;
    const afterReasonHistogram: Record<string, number> = {};
    for (const k of UNRESOLVED_REASON_KEYS) afterReasonHistogram[k] = 0;
    afterReasonHistogram["__resolved__"] = 0;
    for (const item of afterItems) {
      const key = item.unresolvedReason ?? "__resolved__";
      afterReasonHistogram[key] = (afterReasonHistogram[key] ?? 0) + 1;
    }

    logger.info("questionnaire:rematch:complete", {
      questionnaireId,
      workspaceId: ctx.workspaceId,
      rowCount: items.length,
      beforeApprovedSelected,
      afterApprovedSelected,
      delta: afterApprovedSelected - beforeApprovedSelected,
    });

    return NextResponse.json({
      questionnaireId,
      title: questionnaire.title,
      rowCount: items.length,
      before: {
        approvedSelected: beforeApprovedSelected,
        unresolvedReasonHistogram: beforeReasonHistogram,
      },
      after: {
        approvedSelected: afterApprovedSelected,
        unresolvedReasonHistogram: afterReasonHistogram,
      },
      delta: afterApprovedSelected - beforeApprovedSelected,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
