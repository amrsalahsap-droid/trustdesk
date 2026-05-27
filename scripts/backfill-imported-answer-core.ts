/**
 * Pure decision logic for the imported-answer backfill. Extracted from the CLI driver
 * so the heuristics can be unit-tested without a live Prisma client or database.
 *
 * Input:  a `BackfillItemView` (a slice of `QuestionnaireItem` with the fields needed
 *         to decide how `importedAnswer` should be populated).
 * Output: a `BackfillDecision` describing the new `importedAnswer` value and the
 *         `importedAnswerSource` flag that records how we arrived at it — never
 *         guessed. When no confident signal exists, `source` is `"unknown"` and
 *         `importedAnswer` stays `null` so audit queries can find legacy rows.
 *
 * Heuristic priority (strictest first):
 *   1. `provenanceJson.importedAnswer` — the uploader already recorded the original.
 *   2. `finalAnswer` — only when the row has never been edited, reviewed, or had an
 *      override written (so we know `finalAnswer` still equals what was imported).
 *   3. `suggestedAnswer` — only when the row has no `suggestedAnswerId` (the legacy
 *      import path stored `row.answer` into `suggestedAnswer` if there was no AI
 *      match), and the row again shows no edit/review/override signal.
 *   4. Fall-through → `unknown`.
 *
 * The `item.importedAnswer` is consulted up-front: rows that already have it are
 * returned as `"already_set"` so the CLI can skip them (enables idempotent re-runs).
 */

export type BackfillSource =
  | "raw_import"
  | "final_answer_legacy"
  | "suggested_answer_legacy"
  | "unknown";

export interface BackfillItemView {
  id: string;
  importedAnswer: string | null;
  importedAnswerSource: BackfillSource | null;
  finalAnswer: string;
  suggestedAnswer: string;
  suggestedAnswerId: string | null;
  reviewed: boolean;
  verificationStatus: string | null;
  overrideAt: Date | null;
  provenanceJson: unknown;
}

export type BackfillDecision =
  | {
      action: "update";
      importedAnswer: string | null;
      source: BackfillSource;
    }
  | { action: "skip"; reason: "already_set" };

/**
 * `provenanceJson` shapes we understand. Extend as new shapes appear — but never
 * parse keys we did not design on purpose, and always fail closed (return null).
 */
function readImportedFromProvenance(json: unknown): string | null {
  if (!json || typeof json !== "object") return null;
  const record = json as Record<string, unknown>;
  const direct = record["importedAnswer"];
  if (typeof direct === "string" && direct.trim().length > 0) {
    return direct.trim();
  }
  // Some legacy pipelines recorded the original row under `sourceAnswer`.
  const legacy = record["sourceAnswer"];
  if (typeof legacy === "string" && legacy.trim().length > 0) {
    return legacy.trim();
  }
  return null;
}

const EDITED_STATUSES = new Set(["EDITED", "MANUAL_OVERRIDE"]);

export function decideBackfillForItem(item: BackfillItemView): BackfillDecision {
  if (item.importedAnswer !== null) {
    return { action: "skip", reason: "already_set" };
  }

  // (1) Best signal: provenance recorded the original upload.
  const fromProvenance = readImportedFromProvenance(item.provenanceJson);
  if (fromProvenance) {
    return {
      action: "update",
      importedAnswer: fromProvenance,
      source: "raw_import",
    };
  }

  const neverTouched =
    item.overrideAt === null &&
    !EDITED_STATUSES.has(item.verificationStatus ?? "") &&
    !item.reviewed;

  // (2) Legacy finalAnswer: only trust when nothing has ever edited the row.
  if (neverTouched && item.finalAnswer.trim().length > 0) {
    return {
      action: "update",
      importedAnswer: item.finalAnswer.trim(),
      source: "final_answer_legacy",
    };
  }

  // (3) Legacy import path stored row.answer into suggestedAnswer ONLY when
  //     there was no AI match (so no suggestedAnswerId).
  if (
    neverTouched &&
    !item.suggestedAnswerId &&
    item.suggestedAnswer.trim().length > 0
  ) {
    return {
      action: "update",
      importedAnswer: item.suggestedAnswer.trim(),
      source: "suggested_answer_legacy",
    };
  }

  // (4) Cannot recover with confidence — mark as unknown so audit queries see it.
  return {
    action: "update",
    importedAnswer: null,
    source: "unknown",
  };
}
