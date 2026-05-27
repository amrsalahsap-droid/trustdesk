/**
 * Centralized row state classification for TrustDesk questionnaires.
 * Ensures consistent handling of "blank", "unresolved", and "answered" rows 
 * across the Review UI, Contradiction Engine, and Exporter.
 */

export type RowState =
  /** Row has no reviewed answer, and no suggestion or import to fall back on. */
  | "blank_unanswered"
  /** Row has an AI suggestion or imported answer, but the reviewer has not committed yet. */
  | "uncommitted_draft"
  /** Reviewer explicitly committed to an empty state (e.g. accepted a blank import or cleared text). */
  | "verified_empty"
  /** Reviewer committed to a non-empty final answer. */
  | "answered";

/**
 * Verification statuses representing an explicit reviewer commitment to a suggestion.
 */
export const COMMITTED_VERIFICATION_STATUSES = new Set<string>([
  "ACCEPTED",
  "EDITED",
  "MANUAL_OVERRIDE",
]);

export interface RowStateInput {
  reviewed: boolean;
  finalAnswer: string | null;
  suggestedAnswer: string | null;
  importedAnswer?: string | null;
  suggestedAnswerId?: string | null;
  verificationStatus?: string | null;
}

/**
 * Pure helper to classify a row's semantic state.
 */
export function getRowState(item: RowStateInput): RowState {
  const finalTrimmed = (item.finalAnswer ?? "").trim();
  const suggestedTrimmed = (item.suggestedAnswer ?? "").trim();
  const importedTrimmed = (item.importedAnswer ?? "").trim();
  const hasLinkedAnswer = Boolean(item.suggestedAnswerId);

  if (item.reviewed) {
    return finalTrimmed.length > 0 ? "answered" : "verified_empty";
  }

  // Row is unreviewed. Check for "draft context" (suggestion or import).
  // Note: if finalAnswer was somehow partially typed but not reviewed, we 
  // still treat it as a draft/uncommitted state.
  const hasContext = 
    finalTrimmed.length > 0 || 
    suggestedTrimmed.length > 0 || 
    importedTrimmed.length > 0 || 
    hasLinkedAnswer;

  return hasContext ? "uncommitted_draft" : "blank_unanswered";
}

/**
 * Returns a human-readable label for a given RowState.
 */
export function getRowStateLabel(state: RowState): string {
  switch (state) {
    case "blank_unanswered":
      return "Blank / Unanswered";
    case "uncommitted_draft":
      return "Unresolved Suggestion";
    case "verified_empty":
      return "Verified Empty";
    case "answered":
      return "Answered";
  }
}

/**
 * Reports whether a row has any plausible answer content (final, suggested, or imported).
 * Used by contradiction logic to determine if a check is meaningful.
 */
export function hasAnswerContext(item: RowStateInput): boolean {
  const state = getRowState(item);
  return state !== "blank_unanswered";
}
