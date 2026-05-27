import { z } from "zod";

export const OVERRIDE_REASON_CATEGORIES = [
  "BUYER_REQUESTED_DETAIL",
  "LEGAL_REQUIRED_CHANGE",
  "PRODUCT_LIMITATION_DISCLOSURE",
  "TEMPORARY_EXCEPTION",
  "WORDING_CLARIFICATION",
  "OTHER_WITH_COMMENT",
] as const;

export type OverrideReasonCategoryValue = (typeof OVERRIDE_REASON_CATEGORIES)[number];

export const OVERRIDE_SCOPES = ["QUESTIONNAIRE_ONLY", "REQUEST_CANONICAL_UPDATE"] as const;

export type OverrideScopeValue = (typeof OVERRIDE_SCOPES)[number];

export const OVERRIDE_REASON_LABELS: Record<OverrideReasonCategoryValue, string> = {
  BUYER_REQUESTED_DETAIL: "Buyer-requested detail",
  LEGAL_REQUIRED_CHANGE: "Legal / regulatory required change",
  PRODUCT_LIMITATION_DISCLOSURE: "Product limitation disclosure",
  TEMPORARY_EXCEPTION: "Temporary exception",
  WORDING_CLARIFICATION: "Wording clarification",
  OTHER_WITH_COMMENT: "Other (comment required)",
};

export const OVERRIDE_SCOPE_LABELS: Record<OverrideScopeValue, string> = {
  QUESTIONNAIRE_ONLY: "This questionnaire only (one-off)",
  REQUEST_CANONICAL_UPDATE: "Flag for canonical / library update",
};

const MAX_COMMENT = 8000;

export const overridePayloadSchema = z
  .object({
    overrideReasonCategory: z.enum(OVERRIDE_REASON_CATEGORIES),
    overrideComment: z.string().max(MAX_COMMENT).nullable().optional(),
    overrideScope: z.enum(OVERRIDE_SCOPES),
  })
  .superRefine((val, ctx) => {
    if (val.overrideReasonCategory === "OTHER_WITH_COMMENT") {
      const c = (val.overrideComment ?? "").trim();
      if (!c) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "overrideComment is required when category is OTHER_WITH_COMMENT",
          path: ["overrideComment"],
        });
      }
    }
  });

export type OverridePayloadInput = z.infer<typeof overridePayloadSchema>;

export function parseOverridePayload(body: unknown): OverridePayloadInput {
  return overridePayloadSchema.parse(body);
}

export function safeParseOverridePayload(body: unknown): z.SafeParseReturnType<unknown, OverridePayloadInput> {
  return overridePayloadSchema.safeParse(body);
}

export function trimFinal(s: string | null | undefined): string {
  return (s ?? "").trim();
}

/** Questionnaire row: final text differs from suggestion and is not a pure accept path. */
export function questionnaireRequiresOverrideRationale(args: {
  finalAnswerNext: string | undefined;
  finalAnswerPrev: string;
  suggestedAnswer: string;
  /**
   * The customer's uploaded manual answer, when available. When the reviewer
   * explicitly picks the imported answer as final, `finalAnswer` will equal this
   * value and the system should NOT require an override rationale — the user is
   * selecting a recorded answer, not writing new free-form text.
   */
  importedAnswer?: string | null;
  /**
   * The selection enum the reviewer chose in the same PATCH. When this is `imported`
   * or `suggested`, we never require an override rationale because the choice
   * itself is the audit trail.
   */
  finalAnswerSelectionNext?: "imported" | "suggested" | "edited" | "canonical_aligned" | null;
  reviewedNext: boolean | undefined;
  reviewedPrev: boolean;
  verificationStatusNext: string | undefined;
}): boolean {
  if (args.finalAnswerNext === undefined) return false;
  const next = trimFinal(args.finalAnswerNext);
  const prev = trimFinal(args.finalAnswerPrev);
  const sug = trimFinal(args.suggestedAnswer);
  const imp = trimFinal(args.importedAnswer ?? "");
  if (next === prev) return false;
  // Explicit "use imported" / "use suggested" selections carry their own audit via
  // the QUESTIONNAIRE_ITEM_FINAL_ANSWER_SELECTED event; no override rationale
  // needed. The "edited" path still needs rationale because it is free-form text.
  if (args.finalAnswerSelectionNext === "imported" && imp.length > 0 && next === imp) {
    return false;
  }
  if (args.finalAnswerSelectionNext === "suggested" && sug.length > 0 && next === sug) {
    return false;
  }
  const accepting =
    (args.reviewedNext === true && (!args.finalAnswerNext || next === sug)) ||
    args.verificationStatusNext === "ACCEPTED";
  if (accepting && next === sug) return false;
  if (next === sug && args.reviewedNext === true) return false;
  
  // Only require override rationale when finalizing the review (reviewed: true).
  // Drafting or selecting alternatives without committing the review should be free.
  if (args.reviewedNext !== true) return false;
  
  return next !== sug;
}
