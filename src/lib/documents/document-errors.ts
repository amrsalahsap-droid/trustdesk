import { DocumentLifecycle } from "./document-display";

/**
 * Maps technical document lifecycle errors to user-friendly guidance and advice.
 */
export function getFriendlyDocumentError(lifecycle: DocumentLifecycle): {
  reason: string;
  advice: string;
  stage: string;
  severity: "error" | "warning";
} | null {
  const isError = lifecycle.activeVariant === "error";
  const isWarning = lifecycle.activeVariant === "warning";

  if (!lifecycle.isTerminal && !isWarning) {
    return null;
  }

  const { upload, parse, seeding, currentStage } = lifecycle;
  const rawError = (upload.variant === "error" ? null : 
                    parse.variant === "error" ? parse.error :
                    seeding.variant === "error" ? seeding.error : 
                    isWarning ? (parse.isStale ? "stale_orphan" : seeding.isStale ? "stale_orphan" : null) :
                    null) || "";

  const err = rawError.toLowerCase();

  // STAGE 1: UPLOAD FAILURES
  if (upload.variant === "error") {
    return {
      stage: "Upload",
      reason: "Storage or connection failure.",
      advice: "The file could not be saved to secure workspace storage. Please check your connection and try re-uploading.",
      severity: "error",
    };
  }

  // STAGE 2: PARSE WARNINGS (stale jobs)
  if (currentStage === "Parse" && parse.variant === "warning" && parse.isStale) {
    return {
      stage: "Parsing",
      reason: "Delayed or interrupted analysis.",
      advice: "A system interruption stopped this job. Manual retry is recommended for higher-priority items.",
      severity: "warning",
    };
  }

  // STAGE 2: PARSE FAILURES
  if (currentStage === "Parse" && parse.variant === "error") {
    if (err.includes("no readable text") || err.includes("emptyextractionerror") || err.includes("no text")) {
      return {
        stage: "Parsing",
        reason: "No searchable text found.",
        advice: "This file might be a scanned image or a corrupted document. Try a PDF with selectable text.",
        severity: "error",
      };
    }

    if (err.includes("malformed") || err.includes("valid word file") || err.includes("malformeddocumenterror")) {
      return {
        stage: "Parsing",
        reason: "Corrupted or invalid format.",
        advice: "The file structure is invalid. Try opening it locally and saving it as a new PDF.",
        severity: "error",
      };
    }

    if (err.includes("no extractor available") || err.includes("unsupported")) {
      return {
        stage: "Parsing",
        reason: "Unsupported file type.",
        advice: "This file type is not yet supported for automated analysis. Try PDF, DOCX, or TXT.",
        severity: "error",
      };
    }

    if (err.includes("timeout") || err.includes("deadline")) {
      return {
        stage: "Parsing",
        reason: "Analysis timed out.",
        advice: "The document is too complex or the service is busy. Retrying often fixes this.",
        severity: "error",
      };
    }

    if (err.includes("password") || err.includes("encrypted")) {
      return {
        stage: "Parsing",
        reason: "Password protected.",
        advice: "We cannot analyze encrypted files. Please remove the password and try again.",
        severity: "error",
      };
    }

    return {
      stage: "Parsing",
      reason: "Analysis failed.",
      advice: "An internal error occurred during text extraction. Retrying the step usually works.",
      severity: "error",
    };
  }

  // STAGE 3: SEEDING WARNINGS (stale jobs)
  if (currentStage === "Seeding" && seeding.variant === "warning" && seeding.isStale) {
    return {
      stage: "Intelligence",
      reason: "Knowledge training delayed.",
      advice: "Mapping to library was interrupted. We detected an orphan process; please retry.",
      severity: "warning",
    };
  }

  // STAGE 3: SEEDING FAILURES
  if (currentStage === "Seeding" && seeding.variant === "error") {
    if (err.includes("no evidence") || err.includes("insufficient")) {
      return {
        stage: "Intelligence",
        reason: "Insufficient evidence found.",
        advice: "The AI couldn't find enough clear answers for your topics. Add more specific documents to your library.",
        severity: "error",
      };
    }

    if (err.includes("timeout") || err.includes("rate limit") || err.includes("model")) {
      return {
        stage: "Intelligence",
        reason: "AI processing timeout.",
        advice: "The intelligence layer is currently under high load. Please try retrying this stage.",
        severity: "error",
      };
    }

    return {
      stage: "Intelligence",
      reason: "Knowledge training failed.",
      advice: "The document was parsed but couldn't be indexed for AI use. Try retrying the seeding step.",
      severity: "error",
    };
  }

  // Normal transitional state - no error to display
  // This covers cases like:
  // - Upload complete, waiting for parse job to be created
  // - Parse job queued or processing
  // - Seeding job queued or running
  // These are expected states, not errors
  return null;
}
