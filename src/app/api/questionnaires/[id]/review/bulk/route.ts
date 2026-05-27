import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { buildAuthContext } from "@/lib/auth/build-context";
import { handleApiError } from "@/lib/api/error-handler";
import { z } from "zod";
import { Prisma } from "@prisma/client";

import { assertQuestionnaireBulkAction } from "@/lib/auth/governance-actions";
import { reconcileQuestionnaireItemContradiction } from "@/lib/questionnaires/reconcile-questionnaire-item-contradiction";

const bulkUpdateSchema = z.object({
  itemIds: z.array(z.string()),
  action: z.enum(["accept", "reject", "mark_reviewed"]),
});

export async function POST(
  request: Request,
  segment: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await buildAuthContext(request);
    assertQuestionnaireBulkAction(ctx);
    const { id: questionnaireId } = await segment.params;

    const body = await request.json();
    const { itemIds, action } = bulkUpdateSchema.parse(body);
    const schemaWithExtra = bulkUpdateSchema.extend({ action: z.enum(["accept", "reject", "mark_reviewed", "needs_review"]) });
    const { action: validatedAction } = schemaWithExtra.parse(body);

    const items = await prisma.questionnaireItem.findMany({
      where: {
        id: { in: itemIds },
        workspaceId: ctx.workspaceId,
        questionnaireId: questionnaireId,
        type: "question_row",
      },
      select: {
        id: true,
        suggestedAnswer: true,
        importedAnswer: true,
        unresolvedReason: true,
        verificationStatus: true,
      }
    });

    if (items.length === 0) {
      return NextResponse.json({ updatedCount: 0 });
    }

    const skippedRows: Array<{
      id: string;
      reason:
        | "no_suggested_answer"
        | "critical_gap"
        | "ambiguous_match"
        | "imported_differs_from_suggestion";
    }> = [];

    const eligibleItemIds = items
      .filter((item) => {
        if (validatedAction === "accept") {
          const hasAnswer = !!item.suggestedAnswer && item.suggestedAnswer.trim() !== "";
          const isCriticalGap =
            item.unresolvedReason === "missing_topic" || item.unresolvedReason === "no_evidence";
          const isAmbiguous = item.verificationStatus === "AMBIGUOUS_MATCH";
          if (!hasAnswer) {
            skippedRows.push({ id: item.id, reason: "no_suggested_answer" });
            return false;
          }
          if (isCriticalGap) {
            skippedRows.push({ id: item.id, reason: "critical_gap" });
            return false;
          }
          if (isAmbiguous) {
            skippedRows.push({ id: item.id, reason: "ambiguous_match" });
            return false;
          }
          // Bulk-accept silently commits to the suggested answer. Refuse when the
          // uploaded manual answer differs — the reviewer must open the drawer and
          // explicitly pick via AnswerSourcePicker. Prevents the silent-overwrite bug
          // from returning via the bulk path.
          const imported = (item.importedAnswer ?? "").trim();
          const suggested = (item.suggestedAnswer ?? "").trim();
          if (imported.length > 0 && suggested.length > 0 && imported !== suggested) {
            skippedRows.push({ id: item.id, reason: "imported_differs_from_suggestion" });
            return false;
          }
        }
        return true;
      })
      .map((item) => item.id);

    if (eligibleItemIds.length === 0) {
      return NextResponse.json({
        updatedCount: 0,
        skipped: skippedRows,
        message:
          skippedRows.some((r) => r.reason === "imported_differs_from_suggestion")
            ? "Some rows have an imported answer that differs from the AI suggestion. Open those rows individually and pick which answer becomes final."
            : "No eligible rows found. Unresolved or Ambiguous rows cannot be bulk-accepted.",
      });
    }

    const { count } = await prisma.$transaction(async (tx) => {
      let data: any = {};
      
      if (validatedAction === "accept" || validatedAction === "mark_reviewed") {
        data = { 
          reviewed: true, 
          verificationStatus: "ACCEPTED",
          unresolvedReason: null,
        };
      } else if (validatedAction === "needs_review") {
        data = {
          reviewed: false,
          verificationStatus: "NEEDS_REVIEW"
        };
      } else {
        // action === "reject"
        data = { 
          reviewed: true,
          verificationStatus: "REJECTED",
          finalAnswer: "",
          unresolvedReason: null,
          finalAnswerSelection: null,
        };
      }

      // 1. Delete GapFlags for these items
      await tx.gapFlag.deleteMany({
        where: { workspaceId: ctx.workspaceId, questionnaireItemId: { in: eligibleItemIds } }
      });

      // 2. Perform bulk update for metadata
      const updateResult = await tx.questionnaireItem.updateMany({
        where: { id: { in: eligibleItemIds }, workspaceId: ctx.workspaceId },
        data,
      });

      // 3. Optimized column copy for Accepted/Reviewed items
      // Using raw SQL to copy suggestedAnswer to finalAnswer in a single operation
      // This fixes the N+1 performance bottleneck for large questionnaires (QNS-001).
      // Also records `finalAnswerSelection = 'suggested'` so the server audit trail
      // matches the single-row PATCH path and the review UI knows where finalAnswer
      // came from.
      if (validatedAction === "accept" || validatedAction === "mark_reviewed") {
        await tx.$executeRaw`
          UPDATE "QuestionnaireItem"
          SET "finalAnswer" = "suggestedAnswer",
              "finalAnswerSelection" = 'suggested'::"FinalAnswerSelection",
              "finalAnswerSelectedAt" = NOW(),
              "finalAnswerSelectedByUserId" = ${ctx.userId}
          WHERE "id" IN (${Prisma.join(eligibleItemIds)})
          AND "workspaceId" = ${ctx.workspaceId}
        `;
      }

      return updateResult;
    });

    for (const rowId of eligibleItemIds) {
      await reconcileQuestionnaireItemContradiction({
        workspaceId: ctx.workspaceId,
        questionnaireId,
        questionnaireItemId: rowId,
        actorUserId: ctx.userId,
        auditDetectedReason: "material_detection_after_bulk_review",
      });
    }

    return NextResponse.json({ updatedCount: count, skipped: skippedRows });
  } catch (err) {
    return handleApiError(err);
  }
}
