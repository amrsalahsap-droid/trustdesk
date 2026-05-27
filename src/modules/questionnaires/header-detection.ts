import type { ParserConfidence } from "@/lib/questionnaires/types";

const HEADER_KEYWORDS = [
  /question/i, /answer/i, /response/i, /vendor response/i,
  /control/i, /requirement/i, /id/i, /status/i, /comment/i,
  /category/i, /domain/i, /standard/i, /mapping/i
];

export interface HeaderDetectionResult {
  index: number;
  confidence: ParserConfidence;
  reasons: string[];
}

interface RowScore {
  index: number;
  totalScore: number;
  reasons: string[];
}

export function detectHeaderRow(matrix: string[][]): HeaderDetectionResult {
  if (matrix.length === 0) {
    return { index: 0, confidence: "low", reasons: ["Empty matrix."] };
  }

  const rowScores: RowScore[] = [];
  const limit = Math.min(matrix.length, 20);

  for (let r = 0; r < limit; r++) {
    const row = matrix[r] ?? [];
    const score = scoreCandidateRow(row, r);
    rowScores.push(score);
  }

  // Sort by score descending
  rowScores.sort((a, b) => b.totalScore - a.totalScore);

  const best = rowScores[0]!;
  
  // Decide confidence
  let confidence: ParserConfidence = "high";
  if (best.totalScore < 15) confidence = "low";
  else if (best.totalScore < 40) confidence = "medium";

  // If even the best score is based on zero keywords and low text count, it's low
  const hasKeywords = best.reasons.some(r => r.includes("Matched keyword"));
  if (!hasKeywords && best.totalScore < 30) {
    confidence = "low";
  }

  return {
    index: best.index,
    confidence,
    reasons: best.reasons
  };
}

function scoreCandidateRow(row: string[], index: number): RowScore {
  let totalScore = 0;
  const reasons: string[] = [];
  
  const cells = row.map(c => c.trim()).filter(Boolean);
  const totalCols = row.length;
  const textCols = cells.length;

  if (textCols === 0) {
    return { index, totalScore: -100, reasons: ["Empty row"] };
  }

  // 1. Density Heuristic
  const densityPercent = textCols / totalCols;
  if (textCols >= 2) {
    const pts = Math.min(textCols * 5, 25);
    totalScore += pts;
    reasons.push(`Row has ${textCols} non-empty columns (+${pts} pts)`);
  }

  // 2. Keyword Heuristic
  let keywordsFound = 0;
  for (const cell of cells) {
    for (const re of HEADER_KEYWORDS) {
      if (re.test(cell)) {
        keywordsFound++;
        totalScore += 15;
        reasons.push(`Matched keyword in "${cell}" (+15 pts)`);
        break; // Count each cell once
      }
    }
  }

  // 3. Uniqueness Heuristic
  const uniqueCells = new Set(cells.map(c => c.toLowerCase()));
  if (uniqueCells.size === textCols && textCols >= 2) {
    totalScore += 20;
    reasons.push(`Row has 100% unique labels (+20 pts)`);
  }

  // 4. Content Signals (Negative Heuristics)
  let sentenceCount = 0;
  let questionCount = 0;
  for (const cell of cells) {
    // Looks like a sentence if it's long and has spaces
    if (cell.length > 50 || cell.split(/\s+/).length > 8) {
      sentenceCount++;
    }
    if (cell.endsWith("?")) {
      questionCount++;
    }
  }

  if (sentenceCount > 0) {
    const penalty = sentenceCount * 15;
    totalScore -= penalty;
    reasons.push(`Penalized for ${sentenceCount} long text/sentence cells (-${penalty} pts)`);
  }
  if (questionCount > 0) {
    const penalty = questionCount * 20;
    totalScore -= penalty;
    reasons.push(`Penalized for ${questionCount} question-like cells (-${penalty} pts)`);
  }

  // 5. Positional Heuristic (Heads-up)
  if (index === 0 && textCols >= 3) {
    totalScore += 5; // Slight bias for top row if it's healthy
  }

  return { index, totalScore, reasons };
}
