import { describe, it, expect } from "vitest";
import { getRowState, hasAnswerContext } from "../row-state";

describe("getRowState", () => {
  it("classifies blank unanswered rows", () => {
    const input = {
      reviewed: false,
      finalAnswer: null,
      suggestedAnswer: null,
      importedAnswer: null,
      suggestedAnswerId: null,
    };
    expect(getRowState(input)).toBe("blank_unanswered");
    expect(hasAnswerContext(input)).toBe(false);
  });

  it("classifies whitespace-only imported answers as blank", () => {
    const input = {
      reviewed: false,
      finalAnswer: "",
      suggestedAnswer: "  ",
      importedAnswer: "\n\t ",
      suggestedAnswerId: null,
    };
    expect(getRowState(input)).toBe("blank_unanswered");
  });

  it("classifies uncommitted drafts with suggestions", () => {
    const input = {
      reviewed: false,
      finalAnswer: "",
      suggestedAnswer: "AI Suggestion",
      importedAnswer: null,
      suggestedAnswerId: "ans_123",
    };
    expect(getRowState(input)).toBe("uncommitted_draft");
    expect(hasAnswerContext(input)).toBe(true);
  });

  it("classifies uncommitted drafts with imported answers", () => {
    const input = {
      reviewed: false,
      finalAnswer: "",
      suggestedAnswer: "",
      importedAnswer: "Manual Import",
    };
    expect(getRowState(input)).toBe("uncommitted_draft");
  });

  it("classifies verified empty rows (reviewed with empty final)", () => {
    const input = {
      reviewed: true,
      finalAnswer: "  ",
      suggestedAnswer: "AI Suggestion",
      importedAnswer: "Manual Import",
    };
    expect(getRowState(input)).toBe("verified_empty");
    expect(hasAnswerContext(input)).toBe(true);
  });

  it("classifies answered rows", () => {
    const input = {
      reviewed: true,
      finalAnswer: "Final Answer",
      suggestedAnswer: "AI Suggestion",
      importedAnswer: "Manual Import",
    };
    expect(getRowState(input)).toBe("answered");
  });

  it("handles nulls gracefully", () => {
    const input = {
      reviewed: false,
      finalAnswer: null,
      suggestedAnswer: null,
      importedAnswer: null,
    };
    expect(getRowState(input as any)).toBe("blank_unanswered");
  });
});
