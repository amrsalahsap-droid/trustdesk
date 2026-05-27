// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AnswerSourcePicker } from "../answer-source-picker";
import type { ReviewQuestionDTO } from "@/lib/questionnaires/types";

function makeQuestion(overrides: Partial<ReviewQuestionDTO> = {}): ReviewQuestionDTO {
  return {
    id: "item-1",
    question: "Do you encrypt at rest?",
    suggestedAnswer: "",
    finalAnswer: "",
    type: "question_row",
    reviewed: false,
    confidence: "medium",
    status: "ok",
    sources: [],
    candidates: [],
    verificationStatus: "SUGGESTED",
    ...overrides,
  } as ReviewQuestionDTO;
}

function render(question: ReviewQuestionDTO): string {
  return renderToStaticMarkup(
    React.createElement(AnswerSourcePicker, {
      question,
      isUpdating: false,
      onUseImported: vi.fn(),
      onUseSuggested: vi.fn(),
      onStartEditing: vi.fn(),
    }),
  );
}

describe("AnswerSourcePicker", () => {
  it("renders basic sections", () => {
    const html = render(
      makeQuestion({
        importedAnswer: "Manual uploaded answer",
        suggestedAnswer: "Prepared answer",
      }),
    );
    expect(html).toContain("Imported answer");
    expect(html).toContain("Recommendation");
  });

  it("shows the Authoritative Source label", () => {
    const html = render(
      makeQuestion({
        importedAnswer: "Manual",
        suggestedAnswer: "AI",
        finalAnswer: "Manual",
        finalAnswerSelection: "imported",
      }),
    );
    expect(html).toContain("Authoritative Source");
  });
});
