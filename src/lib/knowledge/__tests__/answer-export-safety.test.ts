import { describe, it, expect } from "vitest";
import {
  getAnswerExportSafetyTier,
  reviewedRowUsesSuggestedLibraryText,
  EXPORT_SAFETY_TIERS,
} from "@/lib/knowledge/answer-export-safety";

describe("reviewedRowUsesSuggestedLibraryText", () => {
  it("matches trimmed equality and ignores empty", () => {
    expect(
      reviewedRowUsesSuggestedLibraryText({
        finalAnswer: "  hello ",
        suggestedAnswer: "hello",
      }),
    ).toBe(true);
    expect(reviewedRowUsesSuggestedLibraryText({ finalAnswer: "  ", suggestedAnswer: "" })).toBe(false);
  });
});

describe("getAnswerExportSafetyTier", () => {
  it("maps export-eligible answers to approved_for_export", () => {
    const tier = getAnswerExportSafetyTier({
      status: "APPROVED",
      governanceStatus: "APPROVED_FOR_EXPORT",
      approvalScope: "EXPORT_ALLOWED",
      exportSafe: true,
      nextReviewDueAt: null,
    });
    expect(tier).toBe("approved_for_export");
  });

  it("maps export path without export-safe to restricted", () => {
    const tier = getAnswerExportSafetyTier({
      status: "APPROVED",
      governanceStatus: "APPROVED_FOR_EXPORT",
      approvalScope: "EXPORT_ALLOWED",
      exportSafe: false,
      nextReviewDueAt: null,
    });
    expect(tier).toBe("restricted");
  });
});

describe("EXPORT_SAFETY_TIERS", () => {
  it("exports five tiers for API filters", () => {
    expect(EXPORT_SAFETY_TIERS.length).toBe(5);
  });
});
