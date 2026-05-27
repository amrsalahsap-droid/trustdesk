import { InvalidFileError } from "./errors";

/** Max upload size for MVP (25 MiB). */
export const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;

/** MIME types accepted for source documents (server and client validation). */
export const SOURCE_DOCUMENT_ALLOWED_MIMES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
  "text/plain", // .txt
  "image/png",
  "image/jpeg",
  "image/jpg",
]);

const EXTENSION_TO_MIME: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
};

export const SOURCE_DOCUMENT_FRIENDLY_TYPES = "PDF, DOCX, TXT, PNG, or JPG";

/** Human-readable max size for UI copy (matches byte limit). */
export const SOURCE_DOCUMENT_MAX_SIZE_LABEL = "25 MiB per file";

export type ValidateUploadInput = {
  mimeType: string;
  byteLength: number;
  originalName: string;
};

/** Resolve effective MIME from declared type and filename extension (browser may omit `type`). */
export function resolveSourceDocumentMime(originalName: string, mimeType: string): string {
  const normalized = mimeType.trim().toLowerCase();
  if (normalized && SOURCE_DOCUMENT_ALLOWED_MIMES.has(normalized)) return normalized;
  const ext = originalName.split(".").pop()?.toLowerCase() ?? "";
  const fromExt = EXTENSION_TO_MIME[ext];
  if (fromExt) return fromExt;
  return normalized;
}

/** Client-safe validation for source document uploads (mirrors `validateUpload`). */
export function validateSourceDocumentFileClient(file: File): { ok: true } | { ok: false; message: string } {
  if (!file.name?.trim()) return { ok: false, message: "Filename is required." };
  if (file.size <= 0) return { ok: false, message: "File is empty." };
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return {
      ok: false,
      message: `File exceeds the maximum size (${SOURCE_DOCUMENT_MAX_SIZE_LABEL}).`,
    };
  }
  const effective = resolveSourceDocumentMime(file.name, file.type || "");
  if (!SOURCE_DOCUMENT_ALLOWED_MIMES.has(effective)) {
    return {
      ok: false,
      message: `This file type is not supported. Allowed types: ${SOURCE_DOCUMENT_FRIENDLY_TYPES}.`,
    };
  }
  return { ok: true };
}

export function validateUpload(input: ValidateUploadInput): void {
  if (input.byteLength <= 0) {
    throw new InvalidFileError("File is empty");
  }
  if (input.byteLength > MAX_FILE_SIZE_BYTES) {
    throw new InvalidFileError(`File exceeds maximum size of ${MAX_FILE_SIZE_BYTES} bytes`);
  }
  const effective = resolveSourceDocumentMime(input.originalName, input.mimeType);
  if (!SOURCE_DOCUMENT_ALLOWED_MIMES.has(effective)) {
    const display = effective || input.mimeType.trim().toLowerCase() || "(unknown)";
    throw new InvalidFileError(
      `File type '${display}' is not supported. Please upload ${SOURCE_DOCUMENT_FRIENDLY_TYPES}.`,
    );
  }
  if (!input.originalName || !input.originalName.trim()) {
    throw new InvalidFileError("Filename is required");
  }
}
