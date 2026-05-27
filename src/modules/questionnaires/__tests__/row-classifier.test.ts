import { describe, it, expect } from "vitest";
import { classifyRow } from "../row-classifier";

describe("row-classifier", () => {
  describe("Section Header Detection", () => {
    it("should detect all-caps headers with high confidence", () => {
      const result = classifyRow("SECURITY COMPLIANCE", "", []);
      expect(result.type).toBe("section_header");
      expect(result.confidence).toBe("high");
    });

    it("should detect keyword-based headers", () => {
      const result = classifyRow("Section 1: Access Control", "", []);
      expect(result.type).toBe("section_header");
      expect(result.confidence).toBe("high");
    });

    it("should detect numbered headers", () => {
      const result = classifyRow("1.1 Data Privacy", "", []);
      expect(result.type).toBe("section_header");
      expect(result.confidence).toBe("high");
    });

    it("should detect very short headers as high confidence", () => {
      const result = classifyRow("Network", "", []);
      expect(result.type).toBe("section_header");
      expect(result.confidence).toBe("high");
    });

    it("should not detect questions as headers just because they are short", () => {
      const result = classifyRow("Is MFA enabled?", "", []);
      expect(result.type).toBe("question_row");
    });
  });

  describe("Question Row Detection", () => {
    it("should detect questions ending with ?", () => {
      const result = classifyRow("Do you use encryption at rest?", "", []);
      expect(result.type).toBe("question_row");
      expect(result.confidence).toBe("high");
    });

    it("should detect imperative commands as questions", () => {
      const result = classifyRow("Describe your incident response process.", "", []);
      expect(result.type).toBe("question_row");
      expect(result.confidence).toBe("medium"); // medium because no ?
    });

    it("should detect interrogative starters as questions", () => {
      const result = classifyRow("How is user access reviewed", "", []);
      expect(result.type).toBe("question_row");
      expect(result.confidence).toBe("medium");
    });

    it("should classify rows with answers as question rows", () => {
      const result = classifyRow("Random text here", "Yes", []);
      expect(result.type).toBe("question_row");
      expect(result.confidence).toBe("medium");
    });
  });

  describe("Note or Instruction Detection", () => {
    it("should detect long text without signals as instruction", () => {
      const longText = "Please ensure that you fill out all sections of this questionnaire accurately and provide evidence where required. Failure to do so may delay the review process.";
      const result = classifyRow(longText, "", []);
      expect(result.type).toBe("note_or_instruction");
      expect(result.confidence).toBe("high");
    });

    it("should detect default rows without answers as notes", () => {
      const result = classifyRow("Some informational text", "", []);
      expect(result.type).toBe("note_or_instruction");
      expect(result.confidence).toBe("medium");
    });
  });

  describe("Blank or Spacer Detection", () => {
    it("should detect truly empty rows as high confidence", () => {
      const result = classifyRow("", "", ["", "  ", ""]);
      expect(result.type).toBe("blank_or_spacer");
      expect(result.confidence).toBe("high");
    });

    it("should detect rows with sparse unrelated data as spacers", () => {
      const result = classifyRow("", "", ["", "   ", "x"]);
      expect(result.type).toBe("blank_or_spacer");
      expect(result.confidence).toBe("medium");
    });
  });
});
