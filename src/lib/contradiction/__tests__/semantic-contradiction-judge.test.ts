import { describe, it, expect } from "vitest";
import {
  passesSemanticJudgeTextGate,
  semanticConfidenceToSeverity,
  SEMANTIC_JUDGE_MIN_TEXT_CHARS,
} from "../semantic-contradiction-judge";

describe("passesSemanticJudgeTextGate", () => {
  it("requires both sides at least SEMANTIC_JUDGE_MIN_TEXT_CHARS trimmed", () => {
    const pad = "x".repeat(SEMANTIC_JUDGE_MIN_TEXT_CHARS);
    expect(passesSemanticJudgeTextGate(pad, pad)).toBe(true);
    expect(passesSemanticJudgeTextGate(pad, "short")).toBe(false);
    expect(passesSemanticJudgeTextGate("  short  ", pad)).toBe(false);
  });
});

describe("semanticConfidenceToSeverity", () => {
  it("caps at medium for high confidence", () => {
    expect(semanticConfidenceToSeverity(0.99)).toBe("medium");
    expect(semanticConfidenceToSeverity(0.85)).toBe("medium");
  });

  it("uses low below medium threshold", () => {
    expect(semanticConfidenceToSeverity(0.84)).toBe("low");
    expect(semanticConfidenceToSeverity(0.65)).toBe("low");
  });
});
