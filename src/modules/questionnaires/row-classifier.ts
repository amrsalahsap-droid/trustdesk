export type RowType = "question_row" | "section_header" | "blank_or_spacer" | "note_or_instruction";

export type ConfidenceLevel = "high" | "medium" | "low";

export interface ClassificationResult {
  type: RowType;
  confidence: ConfidenceLevel;
}

/**
 * Deterministic rules to classify a spreadsheet row.
 * Returns both the detected type and a confidence score.
 */
export function classifyRow(
  questionText: string,
  answerText: string,
  otherRowData: string[] = []
): ClassificationResult {
  const q = questionText.trim();
  const a = answerText.trim();

  // 1. Blank or Spacer
  if (!q && !a) {
    const hasAnyContent = otherRowData.some(cell => cell.trim().length > 0);
    if (!hasAnyContent) {
      return { type: "blank_or_spacer", confidence: "high" };
    }
    // If it has some sparse content elsewhere, it might still be a spacer
    const contentCount = otherRowData.filter(cell => cell.trim().length > 0).length;
    if (contentCount <= 1) {
      return { type: "blank_or_spacer", confidence: "medium" };
    }
    return { type: "note_or_instruction", confidence: "low" };
  }

  // 2. Question Row Detection (Heuristics: Interrogative/Imperative, "?" or length + sentence structure)
  const interrogatives = /^(how|what|where|when|why|who|is|are|do|can|has|have|will|should|would|does)\b/i.test(q);
  const imperatives = /^(describe|provide|explain|detail|list|verify|confirm|ensure|update|state|identify|outline)\b/i.test(q);
  const endsWithQuestionMark = q.endsWith("?");
  const hasQuestionMark = q.includes("?");

  if (q.length > 5) {
    if (endsWithQuestionMark || (hasQuestionMark && (interrogatives || imperatives))) {
      return { type: "question_row", confidence: "high" };
    }
    if (interrogatives || imperatives) {
      return { type: "question_row", confidence: "medium" };
    }
    // If it has an answer, it's very likely a question/data row
    if (a.length > 0) {
      return { type: "question_row", confidence: "medium" };
    }
  }

  // 3. Section Header Detection
  // Heuristics: No answer, short/labelled, structural patterns
  if (!a && q.length > 0) {
    const isAllCaps = q === q.toUpperCase() && /[A-Z]/.test(q);
    const startsWithKeyword = /^(section|category|domain|part|chapter|group|module|topic|control family)\s?\d?/i.test(q);
    const hasNumbering = /^\d+(\.\d+)*\s/.test(q) || /^[A-Z]\.?\s/.test(q);
    const veryShort = q.length < 40;
    const noQuestionMark = !q.includes("?");
    const isCapitalized = /^[A-Z]/.test(q);
    const words = q.split(/\s+/);
    const capitalizedWords = words.filter(w => /^[A-Z]/.test(w)).length;
    const isTitleCase = capitalizedWords / words.length > 0.7;

    // A header MUST have a structural signal (all caps, keyword, numbering)
    // or be very short and title-case/capitalized.
    const isLabelLike = q.length < 30 && isTitleCase && !/[.,]/.test(q);
    const hasStructuralSignal = isAllCaps || startsWithKeyword || hasNumbering || isLabelLike;

    if (noQuestionMark && hasStructuralSignal) {
      let score = 0;
      if (isAllCaps) score += 2;
      if (startsWithKeyword) score += 2;
      if (hasNumbering) score += 2;
      if (isLabelLike) score += 1;
      if (q.length < 20) score += 1;

      return {
        type: "section_header",
        confidence: score >= 2 ? "high" : "medium"
      };
    }
  }

  // 4. Note or Instruction Detection
  if (q.length > 0) {
    // Longer text without question/imperative signals often indicates instruction/note
    if (q.length > 100 && !a) {
      return { type: "note_or_instruction", confidence: "high" };
    }
    
    // If it didn't match header or question rules, and no answer, it's a note
    if (!a) {
      return { type: "note_or_instruction", confidence: "medium" };
    }

    // Default fallback for rows with text that don't match strong rules
    return { type: "question_row", confidence: "low" };
  }

  return { type: "blank_or_spacer", confidence: "low" };
}
