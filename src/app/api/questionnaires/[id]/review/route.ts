import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { buildAuthContext } from "@/lib/auth/build-context";
import { handleApiError } from "@/lib/api/error-handler";
import { logger } from "@/lib/logging/logger";
import type { ConfidenceLevel } from "@/components/ui/confidence-pill";
import type { ReviewQuestionDTO, ReviewStatus } from "@/lib/questionnaires/types";
import { reconcileQuestionnaireItemContradiction } from "@/lib/questionnaires/reconcile-questionnaire-item-contradiction";
import { QuestionnaireMatchingService } from "@/modules/workspaces/intelligence/questionnaire-matching-service";
import { getAnswerExportSafetyTier, type ExportSafetyTier } from "@/lib/knowledge/answer-export-safety";
import { authorizePermission } from "@/lib/auth/authorize-role";
import { Permission } from "@/lib/auth/permissions";
import { isRestrictedToAssigned } from "@/lib/auth/governance-actions";

const QUESTIONNAIRE_DIAG_ENABLED = process.env.QUESTIONNAIRE_DIAG === "1";

function asConfidence(v: string): ConfidenceLevel {
  if (v === "high" || v === "medium" || v === "low") return v;
  return "medium";
}

function asReviewStatus(v: string): ReviewStatus {
  if (v === "ok" || v === "missing" || v === "conflict") return v;
  return "ok";
}

function parseSourcesJson(json: unknown): any[] {
  if (!Array.isArray(json)) return [];
  return json; // Trust the persisted schema for now, as it matches EvidenceSource
}

export async function GET(
  request: Request,
  segment: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await buildAuthContext(request);
    authorizePermission(ctx, Permission.REVIEW_ROWS);
    const { id } = await segment.params;
    const { searchParams } = new URL(request.url);
    const hasOverrideFilter =
      searchParams.get("hasOverride") === "true" || searchParams.get("hasOverride") === "1";
    const overrideScopeFilter = searchParams.get("overrideScope");
    const scopeWhere =
      overrideScopeFilter === "QUESTIONNAIRE_ONLY" || overrideScopeFilter === "REQUEST_CANONICAL_UPDATE"
        ? { overrideScope: overrideScopeFilter as "QUESTIONNAIRE_ONLY" | "REQUEST_CANONICAL_UPDATE" }
        : {};

    const questionnaire = await prisma.questionnaire.findFirst({
      where: { id, workspaceId: ctx.workspaceId },
      include: {
      items: { 
          where: { 
            workspaceId: ctx.workspaceId,
            ...(request.url.includes("filter=my_assigned") || isRestrictedToAssigned(ctx)
              ? { assigneeId: ctx.userId }
              : {}),
            ...(hasOverrideFilter ? { overrideReasonCategory: { not: null } } : {}),
            ...scopeWhere,
          },
          orderBy: { sortOrder: "asc" },
          include: {
            assignee: { select: { id: true, name: true, email: true } }
          }
        },
      },

    });

    if (!questionnaire) {
      return NextResponse.json({ error: { code: "NOT_FOUND", message: "Questionnaire not found" } }, { status: 404 });
    }

    // Batch-load owner/approver for library answers backing questionnaire rows.
    // Only fetch answers that have a suggestedAnswerId to avoid unnecessary DB hits.
    const linkedAnswerIds = [
      ...new Set(
        questionnaire.items
          .map((item) => item.suggestedAnswerId)
          .filter((v): v is string => typeof v === "string" && v.length > 0)
      ),
    ];
    type GovernanceUser = { id: string; name: string | null; email: string };
    type AnswerGovernance = {
      ownerUser: GovernanceUser | null;
      approverUser: GovernanceUser | null;
      exportTier: ExportSafetyTier;
    };
    const answerGovernanceMap = new Map<string, AnswerGovernance>();
    if (linkedAnswerIds.length > 0) {
      const linkedAnswers = await prisma.answerLibraryItem.findMany({
        where: { id: { in: linkedAnswerIds }, workspaceId: ctx.workspaceId },
        select: {
          id: true,
          status: true,
          governanceStatus: true,
          approvalScope: true,
          exportSafe: true,
          nextReviewDueAt: true,
          ownerUser: { select: { id: true, name: true, email: true } },
          approverUser: { select: { id: true, name: true, email: true } },
        },
      });
      for (const a of linkedAnswers) {
        answerGovernanceMap.set(a.id, {
          ownerUser: a.ownerUser,
          approverUser: a.approverUser,
          exportTier: getAnswerExportSafetyTier({
            status: a.status,
            governanceStatus: a.governanceStatus,
            approvalScope: a.approvalScope,
            exportSafe: a.exportSafe,
            nextReviewDueAt: a.nextReviewDueAt,
          }),
        });
      }
    }

    const questions: ReviewQuestionDTO[] = await Promise.all(
      questionnaire.items.map(async (item) => {
        const sources = parseSourcesJson(item.sourcesJson);
        const gov = item.suggestedAnswerId ? answerGovernanceMap.get(item.suggestedAnswerId) : undefined;

        const canonicalContradiction = await reconcileQuestionnaireItemContradiction({
          workspaceId: ctx.workspaceId,
          questionnaireId: id,
          questionnaireItemId: item.id,
          actorUserId: ctx.userId,
          auditDetectedReason: "material_detection_on_review",
        });

        return {
          id: item.id,
          question: item.question,
          suggestedAnswer: item.suggestedAnswer,
          finalAnswer: item.finalAnswer,
          importedAnswer: item.importedAnswer ?? null,
          importedAnswerSource: item.importedAnswerSource ?? null,
          finalAnswerSelection: item.finalAnswerSelection ?? null,
          finalAnswerSelectedAt: item.finalAnswerSelectedAt?.toISOString() ?? null,
          finalAnswerSelectedByUserId: item.finalAnswerSelectedByUserId ?? null,
          type: item.type,
          rowNumber: item.rowNumber ?? undefined,
          reviewed: item.reviewed,
          reviewSummary: item.reviewSummary ?? undefined,
          topicKey: item.topicKey ?? undefined,
          topicName: item.topicName ?? undefined,
          confidence: asConfidence(item.confidence),
          status: asReviewStatus(item.reviewStatus),
          conflictNote: item.conflictNote ?? undefined,
          sources,
          topicId: item.topicId ?? undefined,
          suggestedAnswerId: item.suggestedAnswerId ?? undefined,
          suggestionStatus: item.suggestionStatus ?? undefined,
          exportStatus: item.exportStatus ?? undefined,
          candidates: (item.candidatesJson as any) || [],
          unresolvedReason: item.unresolvedReason ?? undefined,
          verificationStatus: item.verificationStatus as any,
          provenance: (item.provenanceJson as any) ?? undefined,
          isAmbiguous: item.isAmbiguous,
          ambiguityJson: (item.ambiguityJson as any) ?? undefined,
          assigneeId: item.assigneeId ?? undefined,
          assignee: item.assignee
            ? { id: item.assignee.id, name: item.assignee.name, email: item.assignee.email }
            : undefined,
          answerOwner: gov?.ownerUser ?? null,
          answerApprover: gov?.approverUser ?? null,
          linkedAnswerExportTier: item.suggestedAnswerId ? gov?.exportTier : undefined,
          overrideReasonCategory: item.overrideReasonCategory ?? undefined,
          overrideComment: item.overrideComment ?? undefined,
          overrideScope: item.overrideScope ?? undefined,
          overrideAt: item.overrideAt?.toISOString() ?? undefined,
          overrideByUserId: item.overrideByUserId ?? undefined,
          canonicalContradiction,
        };
      }),
    );

    const summary = await QuestionnaireMatchingService.getGapSummary(ctx.workspaceId, id);

    if (QUESTIONNAIRE_DIAG_ENABLED) {
      // Walk the outgoing DTO list and flag every row that combines the
      // forbidden signals the UI cannot render coherently:
      //   - confidence === "high"
      //   AND any of: no topic, no suggestedAnswerId, no answer text,
      //               no reviewSummary (first ` | ` segment would be empty,
      //               which is exactly why the drawer shows "Matched based
      //               on composite similarity." as a fallback).
      for (const q of questions) {
        if (q.confidence !== "high") continue;
        const violations: string[] = [];
        if (!q.topicId) violations.push("no_topic");
        if (!q.suggestedAnswerId) violations.push("no_answer_id");
        if (!q.finalAnswer && !q.suggestedAnswer) violations.push("no_answer_text");
        if (!q.reviewSummary || q.reviewSummary.trim() === "") violations.push("no_review_summary");
        const sourcesLen = Array.isArray(q.sources) ? q.sources.length : 0;
        if (sourcesLen === 0) violations.push("no_sources");
        if (violations.length > 0) {
          logger.warn("questionnaire.review:dto-invariant-broken", {
            workspaceId: ctx.workspaceId,
            questionnaireId: id,
            questionId: q.id,
            rowNumber: q.rowNumber ?? null,
            questionPreview: q.question.slice(0, 120),
            topicId: q.topicId ?? null,
            topicName: q.topicName ?? null,
            suggestedAnswerId: q.suggestedAnswerId ?? null,
            finalAnswerLen: q.finalAnswer.length,
            suggestedAnswerLen: q.suggestedAnswer.length,
            reviewSummaryLen: (q.reviewSummary ?? "").length,
            sourcesLen,
            violations,
          });
        }
      }
    }

    return NextResponse.json({
      questionnaire: {
        id: questionnaire.id,
        title: questionnaire.title,
        sourceFileName: questionnaire.sourceFileName,
        suggestNewAnswer: questionnaire.suggestNewAnswer,
        outputColumnName: questionnaire.outputColumnName,
        tone: questionnaire.tone,
        createdAt: questionnaire.createdAt.toISOString(),
      },
      questions,
      summary,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
