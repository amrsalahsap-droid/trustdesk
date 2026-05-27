import { describe, expect, it } from "vitest";
import { buildImportedAnswerFields } from "../imported-answer-fields";

describe("buildImportedAnswerFields", () => {
  it("captures rawImportedAnswer when the spreadsheet had text and AI matched", () => {
    const fields = buildImportedAnswerFields({
      rowAnswer: "We use AES-256 only on databases.",
      aiSuggestedAnswer: "We encrypt all data at rest with AES-256.",
    });
    expect(fields.importedAnswer).toBe("We use AES-256 only on databases.");
    expect(fields.importedAnswerSource).toBe("raw_import");
    // Critical: the AI text does NOT overwrite the imported text; both coexist.
    expect(fields.suggestedAnswer).toBe("We encrypt all data at rest with AES-256.");
    expect(fields.finalAnswer).toBe("");
    expect(fields.finalAnswerSelection).toBeNull();
  });

  it("captures rawImportedAnswer when spreadsheet had text and AI did NOT match", () => {
    const fields = buildImportedAnswerFields({
      rowAnswer: "We use AES-256 only on databases.",
      aiSuggestedAnswer: "",
    });
    expect(fields.importedAnswer).toBe("We use AES-256 only on databases.");
    expect(fields.importedAnswerSource).toBe("raw_import");
    // Regression guard: the old import path stored row.answer here when AI did not
    // match. That fallback is gone — `suggestedAnswer` stays empty.
    expect(fields.suggestedAnswer).toBe("");
  });

  it("leaves importedAnswer null when the spreadsheet cell was empty", () => {
    const fields = buildImportedAnswerFields({
      rowAnswer: "   ",
      aiSuggestedAnswer: "AI-drafted answer",
    });
    expect(fields.importedAnswer).toBeNull();
    expect(fields.importedAnswerSource).toBeNull();
    expect(fields.suggestedAnswer).toBe("AI-drafted answer");
  });

  it("trims importedAnswer whitespace but preserves internal formatting", () => {
    const fields = buildImportedAnswerFields({
      rowAnswer: "  Multi\n line\n answer  ",
      aiSuggestedAnswer: null,
    });
    expect(fields.importedAnswer).toBe("Multi\n line\n answer");
  });

  it("treats null rowAnswer as no import", () => {
    const fields = buildImportedAnswerFields({
      rowAnswer: null,
      aiSuggestedAnswer: "AI",
    });
    expect(fields.importedAnswer).toBeNull();
    expect(fields.importedAnswerSource).toBeNull();
  });

  it("never sets finalAnswer or finalAnswerSelection at import time", () => {
    const fields = buildImportedAnswerFields({
      rowAnswer: "Manual answer",
      aiSuggestedAnswer: "AI answer",
    });
    expect(fields.finalAnswer).toBe("");
    expect(fields.finalAnswerSelection).toBeNull();
  });
});
