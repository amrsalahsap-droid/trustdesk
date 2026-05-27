import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { buildAuthContext } from "@/lib/auth/build-context";
import { handleApiError } from "@/lib/api/error-handler";
import { AnswerGenerationService } from "@/modules/workspaces/intelligence/answer-generation-service";
import { QuestionnaireMatchingService } from "@/modules/workspaces/intelligence/questionnaire-matching-service";
import { reconcileQuestionnaireItemContradiction } from "@/lib/questionnaires/reconcile-questionnaire-item-contradiction";

import { assertAnswerGenerate, assertQuestionnaireReview } from "@/lib/auth/governance-actions";

export async function POST(
  request: Request,
  segment: { params: Promise<{ id: string; itemId: string }> },
) {
  try {
    const ctx = await buildAuthContext(request);
    assertAnswerGenerate(ctx);
    const { id: questionnaireId, itemId } = await segment.params;
    const body = await request.json();
    const { tone } = body;

    const item = await prisma.questionnaireItem.findFirst({
      where: { id: itemId, questionnaireId, workspaceId: ctx.workspaceId },
      include: { questionnaire: true },
    });

    if (!item) {
      return NextResponse.json({ error: { code: "NOT_FOUND", message: "Item not found" } }, { status: 404 });
    }

    assertQuestionnaireReview(ctx, item.assigneeId);

    const provenance = (item.provenanceJson as any) || {};
    const origin = provenance.answerOrigin;

    // Only regenerate if it was synthesized or evidence-based
    if (origin !== "subcontrol_synthesis" && origin !== "evidence_only") {
      return NextResponse.json({ 
        message: "Item is not a synthetic suggestion; tone regeneration skipped.",
        suggestedAnswer: item.suggestedAnswer 
      });
    }

    let regenerated;
    if (origin === "subcontrol_synthesis") {
      // Re-fetch candidates or use from provenance
      const candidates = (item.candidatesJson as any[]) || [];
      const subControls = candidates.map(c => ({
        answerId: c.id,
        answer: c.answer,
        cosine: c.score,
        subControlKey: null, // We don't have these here easily but compose uses them for labels
        subControlLabel: c.topicName
      }));

      regenerated = await AnswerGenerationService.composeFromSubControls({
        question: item.question,
        topicName: item.topicName,
        subControls,
        workspaceId: ctx.workspaceId,
        tone: tone || item.questionnaire.tone,
      });
    } else {
      // evidence_only
      regenerated = await AnswerGenerationService.generate(item.question, ctx.workspaceId, tone || item.questionnaire.tone);
    }

    if (regenerated.answer) {
      const newProvenance = {
        ...provenance,
        tone: tone || item.questionnaire.tone,
        synthesisUsed: true,
      };

      const updateData = QuestionnaireMatchingService.enforceItemInvariants(item, {
        suggestedAnswer: regenerated.answer,
        reviewSummary: item.reviewSummary,
        provenanceJson: newProvenance,
        isLowQuality: regenerated.isLowQuality,
      });

      // Remove the internal flag before passing to Prisma
      delete (updateData as any).isLowQuality;

      const updatedItem = await prisma.questionnaireItem.update({
        where: { id: itemId, workspaceId: ctx.workspaceId },
        data: updateData,
      });

      if (updatedItem.type === "question_row") {
        await reconcileQuestionnaireItemContradiction({
          workspaceId: ctx.workspaceId,
          questionnaireId,
          questionnaireItemId: itemId,
          actorUserId: ctx.userId,
          auditDetectedReason: "material_detection_after_regenerate",
        });
      }

      return NextResponse.json({
        suggestedAnswer: updatedItem.suggestedAnswer,
        provenance: updatedItem.provenanceJson,
      });
    }

    return NextResponse.json({ error: { code: "REGENERATION_FAILED", message: "Could not regenerate answer" } }, { status: 500 });
  } catch (err) {
    return handleApiError(err);
  }
}
