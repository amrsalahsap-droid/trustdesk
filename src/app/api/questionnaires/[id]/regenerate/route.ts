import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { buildAuthContext } from "@/lib/auth/build-context";
import { handleApiError } from "@/lib/api/error-handler";
import { QuestionnaireMatchingService } from "@/modules/workspaces/intelligence/questionnaire-matching-service";
import { assertAnswerGenerate } from "@/lib/auth/governance-actions";
import { logger } from "@/lib/logging/logger";

export async function POST(
  request: Request,
  segment: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await buildAuthContext(request);
    assertAnswerGenerate(ctx);
    const { id } = await segment.params;
    logger.info("api:questionnaires:regenerate:start", { id, workspaceId: ctx.workspaceId });
    const body = await request.json();
    const { tone } = body;

    const questionnaire = await prisma.questionnaire.findFirst({
      where: { id, workspaceId: ctx.workspaceId },
      include: { items: { where: { type: "question_row" } } }
    });

    if (!questionnaire) {
      return NextResponse.json({ error: { code: "NOT_FOUND", message: "Questionnaire not found" } }, { status: 404 });
    }

    // If tone is provided, update it on the questionnaire first
    if (tone) {
      await prisma.questionnaire.update({
        where: { id, workspaceId: ctx.workspaceId },
        data: { tone }
      });

      // D14-EN-02: Bulk Revert on Style Change
      // If the tone changed, we "revert" all previously accepted suggestions
      // that weren't manually edited. This forces the user to re-review the 
      // new tone-adjusted wording.
      await prisma.questionnaireItem.updateMany({
        where: {
          workspaceId: ctx.workspaceId,
          questionnaireId: id,
          verificationStatus: "ACCEPTED",
          reviewed: true,
        },
        data: {
          reviewed: false,
          verificationStatus: "UNREVIEWED",
        }
      });
    }

    const currentTone = tone || questionnaire.tone;

    // We can re-run the matching service for the whole questionnaire
    // but we need the raw rows. Since we already have the items, we can
    logger.info("api:questionnaires:regenerate:fetched_items", { id, count: questionnaire.items.length });
    const rows = questionnaire.items.map(item => ({
      rowNumber: item.rowNumber,
      question: item.question,
      answer: item.finalAnswer,
      type: item.type,
      confidence: item.confidence,
    }));

    logger.info("api:questionnaires:regenerate:matching_start", { id });
    const results = await QuestionnaireMatchingService.matchRows(ctx.workspaceId, rows, currentTone);
    
    logger.info("api:questionnaires:regenerate:applying_start", { id, resultCount: results.size });
    await QuestionnaireMatchingService.applyResultsToDatabase(ctx.workspaceId, id, results);
    logger.info("api:questionnaires:regenerate:applying_done", { id });

    return NextResponse.json({ success: true, tone: currentTone });
  } catch (err) {
    logger.error("api:questionnaires:regenerate:failed", { 
      id, 
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined
    });
    return handleApiError(err);
  }
}
