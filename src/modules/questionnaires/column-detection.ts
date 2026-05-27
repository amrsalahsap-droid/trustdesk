import type { ParserConfidence } from "@/lib/questionnaires/types";

const HEADER_Q_KEYWORDS = [
  /question/i, /inquiry/i, /requirement/i, /prompt/i, /control/i, /description/i, /item/i
];

const QUESTION_WORD_PATTERNS = [
  /\bhow\b/i, /\bwhat\b/i, /\bwhere\b/i, /\bwhen\b/i, /\bwhy\b/i,
  /\bdescribe\b/i, /\bprovide\b/i, /\bexplain\b/i, /\bdetail\b/i,
  /\bdo you\b/i, /\bis there\b/i, /\bcan you\b/i, /\bare there\b/i
];

const HEADER_A_KEYWORDS = [
  /answer/i, /response/i, /vendor response/i, /supplier response/i, /resolution/i, /reply/i
];

const HEADER_AVOID_KEYWORDS = [
  /id/i, /category/i, /comment/i, /note/i, /remark/i, /score/i, /internal/i, /status/i
];

const ANSWER_CELL_SNIPPETS = [
  /\byes\b/i, /\bno\b/i, /\bn\/a\b/i, /\bcompliant\b/i, /\bcompleted\b/i
];

export interface ColumnDetectionResult {
  bestIndex: number;
  confidence: ParserConfidence;
  reasons: string[];
}

interface ColumnScore {
  index: number;
  totalScore: number;
  reasons: string[];
}

/** 1. Detect Question Column */
export function detectQuestionColumn(
  matrix: string[][],
  headerRow0: number
): ColumnDetectionResult {
  const maxCols = matrix.length > 0 ? Math.max(...matrix.map(r => r.length)) : 0;
  if (maxCols === 0) {
    return { bestIndex: 0, confidence: "low", reasons: ["Empty matrix."] };
  }

  const columnScores: ColumnScore[] = [];
  const scannedData = matrix.slice(headerRow0 + 1, headerRow0 + 101);
  const headers = matrix[headerRow0] ?? [];

  for (let c = 0; c < maxCols; c++) {
    const score = scoreQuestionColumn(scannedData, headers[c] || "", c);
    columnScores.push(score);
  }

  columnScores.sort((a, b) => b.totalScore - a.totalScore);

  const best = columnScores[0]!;
  
  let confidence: ParserConfidence = "high";
  if (best.totalScore < 30) confidence = "low";
  else if (best.totalScore < 60) confidence = "medium";

  return {
    bestIndex: best.index,
    confidence,
    reasons: best.reasons
  };
}

/** 2. Detect Answer Column */
export function detectAnswerColumn(
  matrix: string[][],
  headerRow0: number,
  questionCol0: number
): ColumnDetectionResult {
  const maxCols = matrix.length > 0 ? Math.max(...matrix.map(r => r.length)) : 0;
  if (maxCols === 0) {
    return { bestIndex: 0, confidence: "low", reasons: ["Empty matrix."] };
  }

  const columnScores: ColumnScore[] = [];
  const scannedData = matrix.slice(headerRow0 + 1, headerRow0 + 101);
  const headers = matrix[headerRow0] ?? [];

  for (let c = 0; c < maxCols; c++) {
    const score = scoreAnswerColumn(scannedData, headers[c] || "", c, questionCol0);
    columnScores.push(score);
  }

  columnScores.sort((a, b) => b.totalScore - a.totalScore);

  const best = columnScores[0]!;
  
  let confidence: ParserConfidence = "high";
  if (best.totalScore < 20) confidence = "low";
  else if (best.totalScore < 50) confidence = "medium";

  return {
    bestIndex: best.index,
    confidence,
    reasons: best.reasons
  };
}

function scoreQuestionColumn(data: string[][], header: string, index: number): ColumnScore {
  let totalScore = 0;
  const reasons: string[] = [];
  
  const cells = data.map(r => (r[index] || "").trim()).filter(Boolean);
  if (cells.length === 0) {
    return { index, totalScore: -500, reasons: ["Column is empty"] };
  }

  const avgLen = cells.reduce((sum, c) => sum + c.length, 0) / cells.length;
  const avgWords = cells.reduce((sum, c) => sum + c.split(/\s+/).length, 0) / cells.length;

  for (const re of HEADER_Q_KEYWORDS) {
    if (re.test(header)) {
      totalScore += 50;
      reasons.push(`Header "${header}" matches Q-keyword (+50 pts)`);
      break;
    }
  }

  const questionMarks = cells.filter(c => c.includes("?")).length;
  const qmRatio = questionMarks / cells.length;
  if (qmRatio > 0.1) {
    const pts = Math.floor(qmRatio * 100);
    totalScore += pts;
    reasons.push(`High question mark density (${Math.round(qmRatio * 100)}%) (+${pts} pts)`);
  }

  let verbCount = 0;
  for (const cell of cells) {
    if (QUESTION_WORD_PATTERNS.some(re => re.test(cell))) {
      verbCount++;
    }
  }
  const verbRatio = verbCount / cells.length;
  if (verbRatio > 0.2) {
    const pts = Math.floor(verbRatio * 50);
    totalScore += pts;
    reasons.push(`Linguistic patterns (describe, how, what) in ${Math.round(verbRatio * 100)}% of rows (+${pts} pts)`);
  }

  if (avgWords > 8) {
    totalScore += 20;
    reasons.push(`High text density (avg ${Math.round(avgWords)} words) (+20 pts)`);
  } else if (avgLen > 30) {
    totalScore += 10;
    reasons.push(`Medium text length (avg ${Math.round(avgLen)} chars) (+10 pts)`);
  }

  const uniqueCells = new Set(cells.map(c => c.toLowerCase()));
  const uniquenessRatio = uniqueCells.size / cells.length;
  if (uniquenessRatio > 0.8) {
    totalScore += 30;
    reasons.push(`High uniqueness (${Math.round(uniquenessRatio * 100)}%) (+30 pts)`);
  } else if (uniquenessRatio < 0.3) {
    totalScore -= 40;
    reasons.push(`Low uniqueness (likely a category/status column) (-40 pts)`);
  }

  let numericCount = 0;
  for (const cell of cells) {
    if (!isNaN(parseFloat(cell)) && isFinite(cell as any)) {
      numericCount++;
    }
  }
  const numericRatio = numericCount / cells.length;
  if (numericRatio > 0.5) {
    totalScore -= 100;
    reasons.push(`Predominantly numeric data (-100 pts)`);
  }

  return { index, totalScore, reasons };
}

function scoreAnswerColumn(
  data: string[][],
  header: string,
  index: number,
  questionCol0: number
): ColumnScore {
  let totalScore = 0;
  const reasons: string[] = [];
  
  const cells = data.map(r => (r[index] || "").trim()).filter(Boolean);
  if (index === questionCol0) {
    return { index, totalScore: -1000, reasons: ["Same as Question column"] };
  }

  // 1. Header Keyword Match (Stronger signal for blank columns)
  for (const re of HEADER_A_KEYWORDS) {
    if (re.test(header)) {
      totalScore += 65;
      reasons.push(`Header "${header}" matches Answer-keyword (+65 pts)`);
      break;
    }
  }

  // 2. Avoidance Penalty
  for (const re of HEADER_AVOID_KEYWORDS) {
    if (re.test(header)) {
      totalScore -= 40;
      reasons.push(`Header "${header}" looks like metadata/note (-40 pts)`);
      break;
    }
  }

  // 3. Adjacency Bonus
  if (index === questionCol0 + 1) {
    totalScore += 40;
    reasons.push(`Column is immediately right of Question (+40 pts)`);
  }

  // 4. Content Snippets (Yes/No/NA)
  let snippetCount = 0;
  for (const cell of cells) {
    if (ANSWER_CELL_SNIPPETS.some(re => re.test(cell))) {
      snippetCount++;
    }
  }
  if (snippetCount > 0 && cells.length > 0) {
    const ratio = snippetCount / cells.length;
    const pts = Math.floor(ratio * 40);
    totalScore += pts;
    reasons.push(`Found typical answer tokens (Yes/No/NA) in ${Math.round(ratio * 100)}% of rows (+${pts} pts)`);
  } else if (cells.length === 0 && index === questionCol0 + 1) {
    // "Clean slate" bonus for blank columns in standard position
    totalScore += 25;
    reasons.push(`Clean slate column adjacent to question (+25 pts)`);
  }

  // 5. Text Length
  const avgLen = cells.length > 0 ? cells.reduce((sum, c) => sum + c.length, 0) / cells.length : 0;
  if (avgLen > 1 && avgLen < 150) {
    totalScore += 10;
    reasons.push(`Appropriate response length (+10 pts)`);
  }

  return { index, totalScore, reasons };
}
