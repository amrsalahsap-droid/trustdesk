import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { buildAuthContext } from "@/lib/auth/build-context";
import { logger } from "@/lib/logging/logger";
import { handleApiError } from "@/lib/api/error-handler";
import { validateQuestionnaireUpload } from "@/lib/questionnaires/validate-questionnaire-upload";
import { extractImportedRows, readSheetMatrix } from "@/modules/questionnaires/spreadsheet-preview";
import type { ConfidenceLevel } from "@/components/ui/confidence-pill";
import type { ReviewStatus } from "@/lib/questionnaires/types";
import { buildImportedAnswerFields } from "@/lib/questionnaires/imported-answer-fields";
import {
  enforceAnswerConfidenceInvariant,
  type MatchingResult,
  QuestionnaireMatchingService,
} from "@/modules/workspaces/intelligence/questionnaire-matching-service";

const QUESTIONNAIRE_DIAG_ENABLED = process.env.QUESTIONNAIRE_DIAG === "1";

interface ConfirmBody {
  selectedSheet?: string;
  headerRow1Based: number;
  questionColIndex: number;
  answerColIndex: number;
  title?: string;
  suggestNewAnswer?: boolean;
  outputColumnName?: string;
}

export async function POST(
  request: Request,
  segment: { params: Promise<{ jobId: string }> },
) {
  try {
    const ctx = await buildAuthContext(request);
    const { jobId } = await segment.params;
    logger.info("questionnaire:import:confirm:start", { jobId, userId: ctx.userId });
    const body = (await request.json()) as ConfirmBody;

    const headerRow0 = Math.max(0, Math.floor(body.headerRow1Based) - 1);
    const qCol = Math.max(0, Math.floor(body.questionColIndex));
    const aCol = Math.max(0, Math.floor(body.answerColIndex));

    if (qCol === aCol && !body.suggestNewAnswer) {
      return NextResponse.json(
        { error: { code: "INVALID_MAPPING", message: "Question and answer columns must differ." } },
        { status: 400 },
      );
    }

    const job = await prisma.questionnaireJob.findFirst({
      where: { id: jobId, workspaceId: ctx.workspaceId },
    });

    if (!job?.fileBytes) {
      return NextResponse.json({ error: { code: "NOT_FOUND", message: "Import job not found" } }, { status: 404 });
    }

    const buf = Buffer.from(job.fileBytes);
    validateQuestionnaireUpload({
      originalName: job.originalName ?? "file",
      mimeType: job.mimeType ?? "",
      byteLength: buf.length,
    });

    const preview = job.previewJson as { selectedSheet?: string; sheetNames?: string[] } | null;
    const sheetName =
      body.selectedSheet ||
      preview?.selectedSheet ||
      (Array.isArray(preview?.sheetNames) ? preview!.sheetNames![0] : null);
    if (!sheetName) {
      return NextResponse.json({ error: { code: "INVALID_SHEET", message: "Sheet name required" } }, { status: 400 });
    }

    const matrixResult = readSheetMatrix(buf, sheetName, 5000);
    if ("error" in matrixResult) {
      return NextResponse.json({ error: { code: "PARSE_FAILED", message: matrixResult.error } }, { status: 422 });
    }
    const fullMatrix = matrixResult;

    const maxCols = Math.max(...fullMatrix.map((row) => row.length), 0);
    if (headerRow0 >= fullMatrix.length || qCol >= maxCols || aCol >= maxCols) {
      return NextResponse.json(
        { error: { code: "INVALID_MAPPING", message: "Header row or column index is out of range." } },
        { status: 400 },
      );
    }

    const rows = extractImportedRows(fullMatrix, headerRow0, qCol, aCol);
    if (rows.length === 0) {
      return NextResponse.json(
        { error: { code: "NO_ROWS", message: "No data rows found with this mapping." } },
        { status: 400 },
      );
    }

    const title =
      body.title?.trim() ||
      (job.originalName ? job.originalName.replace(/\.(csv|xlsx|xls)$/i, "") : "Imported questionnaire");

    // Pre-process rows for intelligent matching (Story D9-US-01)
    const workspace = await prisma.workspace.findUnique({ where: { id: ctx.workspaceId } });
    const defaultTone = workspace?.defaultTone || "concise";
    const matchingResults = await QuestionnaireMatchingService.matchRows(ctx.workspaceId, rows, defaultTone);

    // Diagnostic counters for the end-of-import summary.
    let diagWrittenHighNoTopic = 0;
    let diagWrittenHighNoAnswer = 0;
    let diagWrittenWithMatch = 0;

    const questionnaire = await prisma.$transaction(async (tx) => {
      const qn = await tx.questionnaire.create({
        data: {
          workspaceId: ctx.workspaceId,
          title,
          sourceFileName: job.originalName,
          createdById: ctx.userId,
          suggestNewAnswer: body.suggestNewAnswer ?? false,
          outputColumnName: body.outputColumnName ?? null,
          tone: defaultTone,
        },
      });

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i]!;
        // Clean Slate: If creating a new column, ignore existing spreadsheet content in the answer column
        const finalAnswerValue = body.suggestNewAnswer ? "" : row.answer;
        const emptyAnswer = !finalAnswerValue.trim();
        const reviewStatus: ReviewStatus = emptyAnswer ? "missing" : "ok";

        const isQuestion = row.type === "question_row";
        const rawMatch = matchingResults.get(row.rowNumber);
        let enforcedMatch: MatchingResult | null = null;
        if (rawMatch) {
          const { result } = enforceAnswerConfidenceInvariant({
            ...rawMatch,
            sources: Array.isArray(rawMatch.sources) ? rawMatch.sources : [],
          });
          enforcedMatch = result;
        }

        // `match.confidence` is the only acceptable AI-confidence source.
        // Parser structural confidence (`row.confidence`) must NOT leak into
        // the AI column when matching is absent or skipped.
        let resolvedConfidence: ConfidenceLevel;
        let resolvedUnresolvedReason: string | null;
        let resolvedVerificationStatus: "UNREVIEWED" | "UNRESOLVED";
        if (!isQuestion) {
          resolvedConfidence = "low";
          resolvedUnresolvedReason = null;
          resolvedVerificationStatus = "UNREVIEWED";
        } else if (!enforcedMatch) {
          resolvedConfidence = "low";
          resolvedUnresolvedReason = "matching_failed";
          resolvedVerificationStatus = "UNRESOLVED";
        } else {
          resolvedConfidence = (enforcedMatch.confidence as ConfidenceLevel) ?? "low";
          resolvedUnresolvedReason = enforcedMatch.unresolvedReason ?? null;
          resolvedVerificationStatus = resolvedUnresolvedReason ? "UNRESOLVED" : "UNREVIEWED";
        }

        if (QUESTIONNAIRE_DIAG_ENABLED) {
          logger.info("questionnaire.confirm:row", {
            rowNumber: row.rowNumber,
            matchDefined: rawMatch !== undefined,
            parserConfidence: row.confidence,
            matchConfidence: enforcedMatch?.confidence ?? null,
            matchTopicId: enforcedMatch?.topicId ?? null,
            matchSuggestedAnswerId: enforcedMatch?.suggestedAnswerId ?? null,
            matchUnresolvedReason: enforcedMatch?.unresolvedReason ?? null,
            resolvedConfidence,
            resolvedUnresolvedReason,
          });
          if (resolvedConfidence === "high") {
            if (!enforcedMatch?.topicId) diagWrittenHighNoTopic++;
            if (!enforcedMatch?.suggestedAnswerId) diagWrittenHighNoAnswer++;
          }
          if (rawMatch !== undefined) diagWrittenWithMatch++;
        }

        let itemReviewStatus: ReviewStatus = reviewStatus;
        if (isQuestion && (resolvedUnresolvedReason || enforcedMatch?.status === "unresolved")) {
          itemReviewStatus = "unresolved";
        }

        // Separate the two answer sources cleanly via a shared helper so the exact
        // contract ("imported wins audit, suggested holds only AI text") stays in
        // one place and is unit-tested. See `buildImportedAnswerFields` docs.
        const answerFields = buildImportedAnswerFields({
          rowAnswer: row.answer,
          aiSuggestedAnswer: enforcedMatch?.suggestedAnswer,
        });

        const item = await tx.questionnaireItem.create({
          data: {
            workspaceId: ctx.workspaceId,
            questionnaireId: qn.id,
            sortOrder: i,
            question: row.question,
            importedAnswer: answerFields.importedAnswer,
            importedAnswerSource: answerFields.importedAnswerSource,
            suggestedAnswer: answerFields.suggestedAnswer,
            finalAnswer: answerFields.finalAnswer,
            finalAnswerSelection: answerFields.finalAnswerSelection,
            type: row.type,
            reviewStatus: itemReviewStatus,
            confidence: resolvedConfidence,
            reviewed: enforcedMatch?.reviewed || false,
            reviewSummary: enforcedMatch?.explanation || null,
            rowNumber: row.rowNumber,
            sourcesJson: (enforcedMatch?.sources as object[] | undefined) ?? [],
            topicId: enforcedMatch?.topicId || null,
            topicName: enforcedMatch?.topicName || null,
            suggestedAnswerId: enforcedMatch?.suggestedAnswerId || null,
            candidatesJson: enforcedMatch?.candidates || [],
            unresolvedReason: resolvedUnresolvedReason,
            verificationStatus: resolvedVerificationStatus,
          },
        });

        // Sync GapFlags (D13-EN-04)
        await QuestionnaireMatchingService.syncGapFlags(
          tx,
          ctx.workspaceId,
          qn.id,
          item.id,
          resolvedUnresolvedReason,
          enforcedMatch?.explanation || null,
        );
      }

      await tx.questionnaireJob.update({
        where: { id: jobId, workspaceId: ctx.workspaceId },
        data: {

          status: "imported",
          questionnaireId: qn.id,
          selectedSheetName: sheetName,
          headerRowIndex: headerRow0,
          questionColIndex: qCol,
          answerColIndex: aCol,
          suggestNewAnswer: body.suggestNewAnswer ?? false,
          // fileBytes intentionally retained so the XLSX exporter can
          // re-inject answers into the original workbook (Story D12-US-01).
        },
      });

      return qn;
    });

    logger.info("questionnaire:import:confirm:success", { 
      questionnaireId: questionnaire.id, 
      rowCount: rows.length,
      userId: ctx.userId 
    });

    if (QUESTIONNAIRE_DIAG_ENABLED) {
      logger.info("questionnaire.confirm:summary", {
        questionnaireId: questionnaire.id,
        rowsTotal: rows.length,
        matchEntries: matchingResults.size,
        writtenHighNoTopic: diagWrittenHighNoTopic,
        writtenHighNoAnswer: diagWrittenHighNoAnswer,
        writtenWithMatch: diagWrittenWithMatch,
      });
    }

    return NextResponse.json({ questionnaireId: questionnaire.id });
  } catch (err) {
    return handleApiError(err);
  }
}
