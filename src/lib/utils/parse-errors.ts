/**
 * Maps technical parsing error messages from the backend to user-friendly advice.
 * Ensures internal system details or sensitive paths are not exposed in the UI.
 */
export function getFriendlyParseError(technicalError: string | null): string {
  if (!technicalError) return "An unexpected analysis failure occurred.";

  const err = technicalError.toLowerCase();

  if (err.includes("no readable text") || err.includes("emptyextractionerror")) {
    return "This document appears to be empty or a scanned image without searchable text.";
  }

  if (err.includes("malformed") || err.includes("valid word file") || err.includes("malformeddocumenterror")) {
    return "This file is corrupted or is not a valid document format.";
  }

  if (err.includes("no extractor available")) {
    return "This file type is not yet supported for automated analysis.";
  }

  if (err.includes("timeout")) {
    return "Analysis timed out. Try uploading a smaller or simpler document.";
  }

  if (err.includes("storage") || err.includes("access denied")) {
    return "Could not retrieve the document for analysis. Please try re-uploading.";
  }

  return "An unexpected error occurred during analysis. Please try re-uploading.";
}
