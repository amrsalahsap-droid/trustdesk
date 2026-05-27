/**
 * Single source of truth for the human-facing copy and grouping metadata of
 * every `QuestionnaireItem.unresolvedReason` value the matcher and write-time
 * integrity guard can emit.
 *
 * Keep this module DOM-free and dependency-free so every questionnaire UI
 * surface (review row, review table group header, unresolved list section,
 * evidence drawer guidance card) can import the same catalogue. Adding a new
 * reason MUST touch only this file; the UI will automatically light up.
 */

export type UnresolvedReason =
  | "missing_topic"
  | "no_approved_answer"
  | "no_evidence"
  | "low_quality_draft"
  | "low_confidence"
  | "mapping_weakness"
  | "matching_failed"
  | "pipeline_integrity_guard"
  | "pipeline_integrity_guard_backfill"
  | "approved_answer_retrieval_failed"
  | "answer_fitness_failed"
  | "provisional_draft"
  | "missing_subcontrol_coverage";

/**
 * Visual tone buckets. Consumers translate these into their own Tailwind /
 * icon conventions; keeping them as semantic names lets us rethink colors
 * without a mass find/replace.
 */
export type UnresolvedReasonTone = "warning" | "info" | "error" | "muted" | "primary";

export interface UnresolvedReasonMeta {
  /** Short chip label shown next to the confidence signal on a row. */
  label: string;
  /** Section header when grouping rows by reason. */
  groupLabel: string;
  /** "Next step" hint displayed in group headers and unresolved sections. */
  groupAction: string;
  /** Evidence drawer title. */
  drawerTitle: string;
  /** Evidence drawer body. Receives the row's topicName so reasons that call
   *  the topic out by name (e.g. `no_approved_answer`) can keep doing so. */
  drawerMessage: (topicName: string | null | undefined) => string;
  /** Evidence drawer action copy. */
  drawerAction: string;
  tone: UnresolvedReasonTone;
  /** Stable display order when iterating all reasons (lower = earlier). */
  groupOrder: number;
}

export const UNRESOLVED_REASONS: Record<UnresolvedReason, UnresolvedReasonMeta> = {
  missing_topic: {
    label: "Missing Topic",
    groupLabel: "Missing Topics",
    groupAction: "Seeding Required",
    drawerTitle: "Missing Topic Coverage",
    drawerMessage: () => "No content exists in your library for this specific subject.",
    drawerAction: "Seed library from documents or add a manual answer.",
    tone: "warning",
    groupOrder: 10,
  },
  provisional_draft: {
    label: "AI Suggestion",
    groupLabel: "AI Suggestions for Review",
    groupAction: "Verify and Accept",
    drawerTitle: "AI-Generated Provisional Draft",
    drawerMessage: (topicName) =>
      `A high-quality draft was synthesized based on your documentation evidence for '${topicName}'. It is ready for your review.`,
    drawerAction: "Review the draft and accept it if it meets your requirements.",
    tone: "primary",
    groupOrder: 5,
  },
  no_approved_answer: {
    label: "No Approved Answer",
    groupLabel: "No Answer Content",
    groupAction: "Approve more library items",
    drawerTitle: "Awaiting Answer Approval",
    drawerMessage: (topicName) =>
      `${topicName ? `'${topicName}' matches` : "Relevant content found"}, but no verified library items are currently approved.`,
    drawerAction: "Approve a draft candidate or create a new library item.",
    tone: "primary",
    groupOrder: 20,
  },
  no_evidence: {
    label: "Missing Evidence",
    groupLabel: "Missing Source Evidence",
    groupAction: "Attach document snippets",
    drawerTitle: "Missing Linked Evidence",
    drawerMessage: () => "A matching candidate was found but lacks supporting source document snippets.",
    drawerAction: "Attach document evidence to reach high confidence.",
    tone: "info",
    groupOrder: 30,
  },
  low_quality_draft: {
    label: "Rejected (Low Quality)",
    groupLabel: "Rejected Draft Candidates",
    groupAction: "Review and rewrite manually",
    drawerTitle: "Draft Rejected by Quality Gate",
    drawerMessage: () =>
      "A synthesised draft was produced but failed the factual-density check, so it was not promoted to a suggestion.",
    drawerAction: "Author a corrected answer or approve a library item manually.",
    tone: "error",
    groupOrder: 40,
  },
  low_confidence: {
    label: "Low Confidence",
    groupLabel: "Low Confidence Matches",
    groupAction: "Review similarity manually",
    drawerTitle: "Weak Match Quality",
    drawerMessage: () => "The AI trust score for this match is below the threshold for auto-approval.",
    drawerAction: "Review terminology and match similarity manually.",
    tone: "muted",
    groupOrder: 50,
  },
  mapping_weakness: {
    label: "Mapping Weakness",
    groupLabel: "Parser/Mapping Weakness",
    groupAction: "Check document structure",
    drawerTitle: "Structural Trust Weakness",
    drawerMessage: () => "The parser's trust in the spreadsheet layout is low, inhibiting auto-fill.",
    drawerAction: "Verify the row question and context manually.",
    tone: "warning",
    groupOrder: 60,
  },
  matching_failed: {
    label: "Analysis Incomplete",
    groupLabel: "Analysis Incomplete",
    groupAction: "Re-run matching",
    drawerTitle: "Analysis Incomplete",
    drawerMessage: () =>
      "The matcher could not evaluate this row before import, so no topic or library lookup has run yet.",
    drawerAction: "Re-run matching or verify the row is a question.",
    tone: "warning",
    groupOrder: 70,
  },
  pipeline_integrity_guard: {
    label: "Integrity Check Blocked",
    groupLabel: "Integrity Check Blocked",
    groupAction: "Verify manually or supply missing evidence",
    drawerTitle: "Integrity Check Blocked",
    drawerMessage: () =>
      "A candidate was found but was missing a topic, answer, or supporting evidence required for a high or medium rating.",
    drawerAction: "Verify manually or supply the missing evidence.",
    tone: "info",
    groupOrder: 80,
  },
  pipeline_integrity_guard_backfill: {
    label: "Integrity Check Blocked",
    groupLabel: "Integrity Check Blocked",
    groupAction: "Verify manually or supply missing evidence",
    drawerTitle: "Integrity Check Blocked",
    drawerMessage: () =>
      "A candidate was found but was missing a topic, answer, or supporting evidence required for a high or medium rating (auto-repaired from a prior corrupted state).",
    drawerAction: "Verify manually or supply the missing evidence.",
    tone: "info",
    groupOrder: 81,
  },
  approved_answer_retrieval_failed: {
    label: "Retrieval Issue",
    groupLabel: "Retrieval Issue",
    groupAction: "Re-embed or re-index the answer library",
    drawerTitle: "Approved Answer Retrieval Failed",
    drawerMessage: (topicName) =>
      `Approved answers exist${topicName ? ` under '${topicName}'` : ""}, but the matcher could not retrieve them. This usually means library embeddings are missing or a topic-identity split.`,
    drawerAction: "Re-run the embedding backfill, then the topic-unification migration.",
    tone: "info",
    groupOrder: 82,
  },
  answer_fitness_failed: {
    label: "Answer Mismatch",
    groupLabel: "Answer Mismatch",
    groupAction: "Synthesise a new answer or pick a different library item",
    drawerTitle: "Candidate Answer Did Not Fit the Question",
    drawerMessage: (topicName) =>
      `A library answer${topicName ? ` under '${topicName}'` : ""} was considered but rejected by the fitness verifier because it did not address the question's control family or sub-controls.`,
    drawerAction: "Write a more specific answer for this sub-control or accept a synthesised draft.",
    tone: "warning",
    groupOrder: 83,
  },
  missing_subcontrol_coverage: {
    label: "Sub-Control Missing",
    groupLabel: "Sub-Control Missing",
    groupAction: "Author a specific sub-control answer",
    drawerTitle: "No Approved Sub-Control Entry",
    drawerMessage: (topicName) =>
      `The topic${topicName ? ` '${topicName}'` : ""} is resolved, but no approved library entry covers the specific sub-control this question asks about. Author a focused answer (for example an access-review or offboarding entry) and re-run matching.`,
    drawerAction: "Author a sub-control-specific answer in the library.",
    tone: "info",
    groupOrder: 84,
  },
};

export const UNRESOLVED_REASON_KEYS = Object.keys(UNRESOLVED_REASONS) as UnresolvedReason[];

/** Type guard: accepts any string and narrows to a known reason code. */
export function isUnresolvedReason(value: unknown): value is UnresolvedReason {
  return typeof value === "string" && value in UNRESOLVED_REASONS;
}

/** Safe lookup that falls back to `null` on unknown inputs (new matcher code
 *  may temporarily produce reasons the UI hasn't shipped yet). */
export function getUnresolvedReasonMeta(value: unknown): UnresolvedReasonMeta | null {
  return isUnresolvedReason(value) ? UNRESOLVED_REASONS[value] : null;
}

/** Tailwind text color per tone. Centralized so all four consumers agree. */
export const TONE_TEXT_CLASS: Record<UnresolvedReasonTone, string> = {
  warning: "text-semantic-warning",
  info: "text-semantic-info",
  error: "text-semantic-error",
  muted: "text-text-muted",
  primary: "text-accent-primary",
};
