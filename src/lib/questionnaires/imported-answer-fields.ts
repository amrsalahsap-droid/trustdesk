/**
 * Pure helper that decides the imported-answer and suggested-answer fields to persist
 * when creating a `QuestionnaireItem` during import-confirm. Factored out of the route
 * so the behaviour can be unit-tested without Prisma / auth / transactions.
 *
 * Contract:
 *   - `importedAnswer` is ALWAYS the customer's raw spreadsheet text (trimmed),
 *     regardless of `suggestNewAnswer`. This is audit-grade: we must be able to show
 *     what the customer uploaded even if the product opted to start fresh.
 *   - `suggestedAnswer` is ONLY the AI/library suggestion. Importantly, we no longer
 *     fall back to `row.answer` when the matcher returned nothing — that old
 *     fallback is what silently replaced the manual answer later in the pipeline.
 *   - `finalAnswer` stays empty; the reviewer must explicitly pick via the PATCH
 *     route's `finalAnswerSelection`.
 *   - `finalAnswerSelection` is null on create: the user has not chosen yet.
 *   - `importedAnswerSource` is `"raw_import"` only when we actually captured text
 *     from the spreadsheet; null when the cell was empty.
 */

export interface ImportedAnswerFields {
  importedAnswer: string | null;
  importedAnswerSource: "raw_import" | null;
  suggestedAnswer: string;
  finalAnswer: string;
  finalAnswerSelection: null;
}

export function buildImportedAnswerFields(args: {
  rowAnswer: string | null | undefined;
  aiSuggestedAnswer: string | null | undefined;
}): ImportedAnswerFields {
  const rawImportedAnswer = (args.rowAnswer ?? "").trim();
  const aiSuggestion = args.aiSuggestedAnswer ?? "";
  return {
    importedAnswer: rawImportedAnswer.length > 0 ? rawImportedAnswer : null,
    importedAnswerSource: rawImportedAnswer.length > 0 ? "raw_import" : null,
    suggestedAnswer: aiSuggestion,
    finalAnswer: "",
    finalAnswerSelection: null,
  };
}
