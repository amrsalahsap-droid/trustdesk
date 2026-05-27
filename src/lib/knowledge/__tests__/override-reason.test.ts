import { describe, it, expect } from "vitest";
import {
  overridePayloadSchema,
  questionnaireRequiresOverrideRationale,
  safeParseOverridePayload,
} from "@/lib/knowledge/override-reason";

describe("overridePayloadSchema", () => {
  it("accepts a valid payload", () => {
    const r = safeParseOverridePayload({
      overrideReasonCategory: "WORDING_CLARIFICATION",
      overrideComment: null,
      overrideScope: "QUESTIONNAIRE_ONLY",
    });
    expect(r.success).toBe(true);
  });

  it("requires a non-empty comment for OTHER_WITH_COMMENT", () => {
    const r = safeParseOverridePayload({
      overrideReasonCategory: "OTHER_WITH_COMMENT",
      overrideComment: "   ",
      overrideScope: "REQUEST_CANONICAL_UPDATE",
    });
    expect(r.success).toBe(false);
  });

  it("accepts OTHER_WITH_COMMENT when comment is present", () => {
    const r = overridePayloadSchema.safeParse({
      overrideReasonCategory: "OTHER_WITH_COMMENT",
      overrideComment: "Explained here",
      overrideScope: "QUESTIONNAIRE_ONLY",
    });
    expect(r.success).toBe(true);
  });
});

describe("questionnaireRequiresOverrideRationale", () => {
  it("returns false when final answer is unchanged", () => {
    expect(
      questionnaireRequiresOverrideRationale({
        finalAnswerNext: "same",
        finalAnswerPrev: "same",
        suggestedAnswer: "other",
        reviewedNext: true,
        reviewedPrev: false,
        verificationStatusNext: undefined,
      }),
    ).toBe(false);
  });

  it("returns true when final text changes away from the suggestion", () => {
    expect(
      questionnaireRequiresOverrideRationale({
        finalAnswerNext: "custom",
        finalAnswerPrev: "",
        suggestedAnswer: "suggested",
        reviewedNext: true,
        reviewedPrev: false,
        verificationStatusNext: undefined,
      }),
    ).toBe(true);
  });
});
