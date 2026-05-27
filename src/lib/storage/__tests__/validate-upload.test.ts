import { describe, it, expect } from "vitest";
import {
  validateUpload,
  MAX_FILE_SIZE_BYTES,
  validateSourceDocumentFileClient,
} from "../validate-upload";
import { InvalidFileError } from "../errors";

describe("validateUpload", () => {
  const validDocxMime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  const validPdfMime = "application/pdf";
  const validTxtMime = "text/plain";

  it("accepts valid PDF, DOCX, and TXT files within size limits", () => {
    expect(() =>
      validateUpload({
        mimeType: validPdfMime,
        byteLength: 1024,
        originalName: "test.pdf",
      }),
    ).not.toThrow();

    expect(() =>
      validateUpload({
        mimeType: validDocxMime,
        byteLength: MAX_FILE_SIZE_BYTES,
        originalName: "test.docx",
      }),
    ).not.toThrow();

    expect(() =>
      validateUpload({
        mimeType: validTxtMime.toUpperCase(), // Test case insensitivity
        byteLength: 1,
        originalName: "test.txt",
      }),
    ).not.toThrow();
  });

  it("rejects empty files", () => {
    expect(() =>
      validateUpload({
        mimeType: validPdfMime,
        byteLength: 0,
        originalName: "empty.pdf",
      }),
    ).toThrow(new InvalidFileError("File is empty"));

    expect(() =>
      validateUpload({
        mimeType: validPdfMime,
        byteLength: -1,
        originalName: "negative.pdf",
      }),
    ).toThrow(new InvalidFileError("File is empty"));
  });

  it("rejects files exceeding the maximum size limit", () => {
    expect(() =>
      validateUpload({
        mimeType: validPdfMime,
        byteLength: MAX_FILE_SIZE_BYTES + 1,
        originalName: "too-large.pdf",
      }),
    ).toThrow(new InvalidFileError(`File exceeds maximum size of ${MAX_FILE_SIZE_BYTES} bytes`));
  });

  it("rejects unsupported MIME types with a clear message", () => {
    const unsupportedMime = "application/zip";
    expect(() =>
      validateUpload({
        mimeType: unsupportedMime,
        byteLength: 1024,
        originalName: "illegal.zip",
      }),
    ).toThrow(
      new InvalidFileError(
        `File type '${unsupportedMime}' is not supported. Please upload PDF, DOCX, or TXT.`,
      ),
    );

    // Test previously supported (now unsupported) types
    expect(() =>
      validateUpload({
        mimeType: "text/csv",
        byteLength: 1024,
        originalName: "data.csv",
      }),
    ).toThrow(/not supported/);
  });

  it("accepts PDF when browser omits MIME type but extension is .pdf", () => {
    expect(() =>
      validateUpload({
        mimeType: "",
        byteLength: 1024,
        originalName: "report.pdf",
      }),
    ).not.toThrow();
  });

  it("rejects missing or empty filenames", () => {
    expect(() =>
      validateUpload({
        mimeType: validPdfMime,
        byteLength: 1024,
        originalName: "",
      }),
    ).toThrow(new InvalidFileError("Filename is required"));

    expect(() =>
      validateUpload({
        mimeType: validPdfMime,
        byteLength: 1024,
        originalName: "   ",
      }),
    ).toThrow(new InvalidFileError("Filename is required"));
  });
});

describe("validateSourceDocumentFileClient", () => {
  it("rejects oversize and accepts valid File-shaped input", () => {
    const bad = new File([new Uint8Array(100)], "x.pdf", { type: "application/pdf" });
    Object.defineProperty(bad, "size", { value: MAX_FILE_SIZE_BYTES + 1 });
    expect(validateSourceDocumentFileClient(bad).ok).toBe(false);

    const good = new File([new Uint8Array(10)], "y.pdf", { type: "application/pdf" });
    expect(validateSourceDocumentFileClient(good)).toEqual({ ok: true });
  });
});
