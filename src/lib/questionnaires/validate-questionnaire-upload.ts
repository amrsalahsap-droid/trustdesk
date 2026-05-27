import { InvalidFileError } from "@/lib/storage/errors";

/** Questionnaire imports: XLSX/CSV only, smaller cap than source documents. */
export const QUESTIONNAIRE_IMPORT_MAX_BYTES = 10 * 1024 * 1024;

export const QUESTIONNAIRE_ALLOWED_MIMES = new Set([
  "text/csv",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

const EXT_TO_MIME: Record<string, string> = {
  csv: "text/csv",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

export const QUESTIONNAIRE_FRIENDLY_TYPES = "XLSX or CSV";

export function resolveQuestionnaireMime(originalName: string, mimeType: string): string {
  const normalized = mimeType.trim().toLowerCase();
  if (normalized && QUESTIONNAIRE_ALLOWED_MIMES.has(normalized)) return normalized;
  const ext = originalName.split(".").pop()?.toLowerCase() ?? "";
  return EXT_TO_MIME[ext] ?? normalized;
}

export function validateQuestionnaireUpload(input: {
  originalName: string;
  mimeType: string;
  byteLength: number;
}): void {
  if (input.byteLength <= 0) {
    throw new InvalidFileError("File is empty");
  }
  if (input.byteLength > QUESTIONNAIRE_IMPORT_MAX_BYTES) {
    throw new InvalidFileError(`File exceeds maximum size of ${QUESTIONNAIRE_IMPORT_MAX_BYTES} bytes`);
  }
  const effective = resolveQuestionnaireMime(input.originalName, input.mimeType);
  if (!QUESTIONNAIRE_ALLOWED_MIMES.has(effective)) {
    throw new InvalidFileError(
      `File type is not supported for questionnaire import. Use ${QUESTIONNAIRE_FRIENDLY_TYPES}.`,
    );
  }
  if (!input.originalName?.trim()) {
    throw new InvalidFileError("Filename is required");
  }
}

export function validateQuestionnaireFileClient(file: File): { ok: true } | { ok: false; message: string } {
  if (!file.name?.trim()) return { ok: false, message: "Filename is required." };
  if (file.size <= 0) return { ok: false, message: "File is empty." };
  if (file.size > QUESTIONNAIRE_IMPORT_MAX_BYTES) {
    return { ok: false, message: `File exceeds the maximum size (10 MiB for questionnaires).` };
  }
  const effective = resolveQuestionnaireMime(file.name, file.type || "");
  if (!QUESTIONNAIRE_ALLOWED_MIMES.has(effective)) {
    return { ok: false, message: `Unsupported type. Allowed: ${QUESTIONNAIRE_FRIENDLY_TYPES}.` };
  }
  return { ok: true };
}
