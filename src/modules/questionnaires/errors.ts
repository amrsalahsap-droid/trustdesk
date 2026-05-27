/**
 * Typed errors thrown by the questionnaire export pipeline.
 *
 * These are mapped to structured HTTP responses by the central
 * {@link src/lib/api/error-handler.ts} so routes don't have to translate
 * them manually and so the UI can render human-friendly reasons.
 */

export type QuestionnaireExportErrorCode =
  | "EXPORT_QUESTIONNAIRE_NOT_FOUND"
  | "EXPORT_SOURCE_UNAVAILABLE"
  | "EXPORT_SHEET_MISSING"
  | "EXPORT_MAPPING_MISSING"
  | "EXPORT_PARITY_CHECK_FAILED"
  | "EXPORT_CONTRADICTION_UNRESOLVED"
  | "EXPORT_COMPLETENESS_POLICY_VIOLATED";

export class QuestionnaireExportError extends Error {
  readonly code: QuestionnaireExportErrorCode;
  readonly status: number;

  constructor(code: QuestionnaireExportErrorCode, message: string, status: number) {
    super(message);
    this.name = "QuestionnaireExportError";
    this.code = code;
    this.status = status;
  }

  static questionnaireNotFound(): QuestionnaireExportError {
    return new QuestionnaireExportError(
      "EXPORT_QUESTIONNAIRE_NOT_FOUND",
      "Questionnaire not found or access denied.",
      404,
    );
  }

  static sourceUnavailable(): QuestionnaireExportError {
    return new QuestionnaireExportError(
      "EXPORT_SOURCE_UNAVAILABLE",
      "The original spreadsheet is no longer attached to this questionnaire. Re-import the source file to enable Excel export.",
      409,
    );
  }

  static sheetMissing(sheetName: string): QuestionnaireExportError {
    return new QuestionnaireExportError(
      "EXPORT_SHEET_MISSING",
      `Sheet "${sheetName}" was not found in the source workbook.`,
      422,
    );
  }

  static mappingMissing(): QuestionnaireExportError {
    return new QuestionnaireExportError(
      "EXPORT_MAPPING_MISSING",
      "The header row or answer column for this questionnaire is not recorded. Re-run the import to enable Excel export.",
      409,
    );
  }

  static parityCheckFailed(): QuestionnaireExportError {
    return new QuestionnaireExportError(
      "EXPORT_PARITY_CHECK_FAILED",
      "Safety check failed: Export would have resulted in data loss. Some previously populated answer cells were unexpectedly cleared.",
      500,
    );
  }

  static contradictionBlocksExport(): QuestionnaireExportError {
    return new QuestionnaireExportError(
      "EXPORT_CONTRADICTION_UNRESOLVED",
      "Export is blocked until unresolved contradictions are resolved or dismissed (high/critical always; medium when workspace policy requires).",
      409,
    );
  }

  static completenessPolicyViolated(
    reason:
      | { kind: "policy"; unanswered: number }
      | { kind: "min_reviewed_percent"; threshold: number; coverage: number; unanswered: number },
  ): QuestionnaireExportError {
    const message =
      reason.kind === "policy"
        ? `Export is blocked until every row is reviewed. ${reason.unanswered} row(s) still have no reviewed answer.`
        : `Export is blocked until reviewed coverage reaches ${reason.threshold}%. Current coverage is ${Math.round(reason.coverage)}% with ${reason.unanswered} unreviewed row(s).`;
    return new QuestionnaireExportError("EXPORT_COMPLETENESS_POLICY_VIOLATED", message, 409);
  }
}
