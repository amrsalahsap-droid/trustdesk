import { describe, it, expect } from "vitest";
import { QuestionnaireMatchingService } from "../questionnaire-matching-service";

describe("QuestionnaireMatchingService - Answer Integrity (Day 2 Hardening)", () => {
  describe("canUpdateFinalAnswerFromMatching", () => {
    it("returns true when finalAnswerSelection is null (unselected)", () => {
      const item = { finalAnswerSelection: null };
      expect(QuestionnaireMatchingService.canUpdateFinalAnswerFromMatching(item)).toBe(true);
    });

    it("returns false when finalAnswerSelection is 'imported'", () => {
      const item = { finalAnswerSelection: "imported" };
      expect(QuestionnaireMatchingService.canUpdateFinalAnswerFromMatching(item)).toBe(false);
    });

    it("returns false when finalAnswerSelection is 'suggested'", () => {
      const item = { finalAnswerSelection: "suggested" };
      expect(QuestionnaireMatchingService.canUpdateFinalAnswerFromMatching(item)).toBe(false);
    });

    it("returns false when finalAnswerSelection is 'edited'", () => {
      const item = { finalAnswerSelection: "edited" };
      expect(QuestionnaireMatchingService.canUpdateFinalAnswerFromMatching(item)).toBe(false);
    });

    it("returns false when finalAnswerSelection is 'canonical_aligned'", () => {
      const item = { finalAnswerSelection: "canonical_aligned" };
      expect(QuestionnaireMatchingService.canUpdateFinalAnswerFromMatching(item)).toBe(false);
    });
  });
});
