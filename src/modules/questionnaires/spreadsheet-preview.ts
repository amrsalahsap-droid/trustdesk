import * as XLSX from "xlsx";
import type { ParseIssue, QuestionnaireImportPreview, ScoredSheet } from "@/lib/questionnaires/types";
import type { ParserConfidence } from "@/lib/questionnaires/types";
import { rankSheets } from "./sheet-scoring";
import { detectHeaderRow } from "./header-detection";
import { detectQuestionColumn, detectAnswerColumn } from "./column-detection";
import { classifyRow } from "./row-classifier";

const Q_PATTERNS = [/question/i, /vendor control/i, /control\s*#?/i, /inquiry/i];
const A_PATTERNS = [/answer/i, /response/i, /vendor response/i, /reply/i];

function cellStr(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v).trim();
  return String(v).trim();
}

function sheetToMatrix(sheet: XLSX.WorkSheet, maxRows = 400): string[][] {
  const ref = sheet["!ref"];
  if (!ref) return [];
  const range = XLSX.utils.decode_range(ref);
  const rows: string[][] = [];
  const lastRow = Math.min(range.e.r, range.s.r + maxRows - 1);
  for (let r = range.s.r; r <= lastRow; r++) {
    const row: string[] = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = sheet[addr];
      const w = cell?.w;
      const v = cell?.v;
      row.push(w != null ? String(w).trim() : cellStr(v));
    }
    rows.push(row);
  }
  return rows;
}

// Removed legacy findHeaderRowIndex in favor of header-detection module

function findColumnByPatterns(headers: string[], patterns: RegExp[]): number {
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i]?.toLowerCase() ?? "";
    if (patterns.some((p) => p.test(h))) return i;
  }
  return -1;
}

function buildIssues(args: {
  matrix: string[][];
  headerRow0: number;
  qCol: number;
  aCol: number;
  sheetNames: string[];
  scoredSheets: ScoredSheet[];
  questionMatched: boolean;
  answerMatched: boolean;
}): ParseIssue[] {
  const issues: ParseIssue[] = [];
  const { matrix, headerRow0, qCol, aCol, sheetNames, scoredSheets, questionMatched, answerMatched } = args;

  if (sheetNames.length > 1) {
    const topScore = scoredSheets[0]?.totalScore ?? 0;
    const secondScore = scoredSheets[1]?.totalScore ?? 0;
    const isAmbiguous = topScore - secondScore < 20 && topScore > 0;

    if (isAmbiguous) {
      issues.push({
        severity: "review",
        title: "Sheet selection ambiguous",
        detail: `Workbook contains ${sheetNames.length} sheets. TrustDesk selected the most likely questionnaire tab based on content scoring.`,
      });
    }
  }

  if (!questionMatched || !answerMatched) {
    issues.push({
      severity: "warning",
      title: "Column headers inferred",
      detail:
        "We couldn't find columns clearly named 'Question' or 'Answer'. Defaulting to the first two populated columns — please verify.",
    });
  }

  let emptyAnswers = 0;
  let rowsWithQuestion = 0;
  let numericAnswers = 0;
  let dateLikeAnswers = 0;
  
  for (let r = headerRow0 + 1; r < matrix.length; r++) {
    const q = (matrix[r]?.[qCol] ?? "").trim();
    const a = (matrix[r]?.[aCol] ?? "").trim();
    
    // Evaluate only "real question rows"
    // Heuristic: Must have text and at least 3 words to avoid ID/Category headers
    if (!q || q.split(/\s+/).length < 2) continue;
    
    rowsWithQuestion++;
    if (!a) {
      emptyAnswers++;
      continue;
    }

    // Risk: Mixed baggage detection
    if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(a) || /^\d{4}-\d{2}-\d{2}$/.test(a)) {
      dateLikeAnswers++;
    } else if (!isNaN(parseFloat(a)) && isFinite(a as any)) {
      numericAnswers++;
    }
  }

  // 1. Blank state (Expected for security questionnaires)
  const emptyRatio = rowsWithQuestion > 0 ? emptyAnswers / rowsWithQuestion : 0;
  if (emptyRatio > 0.9) {
    issues.push({
      severity: "info",
      title: "Clean slate detected",
      detail: `No existing responses found in this column. TrustDesk will use it for generated responses.`,
    });
  } else if (emptyRatio > 0) {
    issues.push({
      severity: "info",
      title: "Partially filled responses",
      detail: `${emptyAnswers} question(s) are currently blank and ready for autofill.`,
    });
  }

  // 2. Overwrite Risk
  const fillRatio = 1 - emptyRatio;
  if (fillRatio > 0.5) {
    issues.push({
      severity: "info",
      title: "Existing data found",
      detail: `This column is ${Math.round(fillRatio * 100)}% full. TrustDesk will fill remaining blanks while keeping your existing responses preserved.`,
    });
  }

  // 3. Mixed Content Risk (Heuristic warnings)
  if (rowsWithQuestion > 0) {
    const mixedRisk = (dateLikeAnswers + numericAnswers) / rowsWithQuestion;
    if (mixedRisk > 0.3) {
      issues.push({
        severity: "warning",
        title: "Possible column mismatch",
        detail: `This answer column contains many dates or numbers (${Math.round(mixedRisk * 100)}% of rows). It might be a score or metadata field instead of responses.`,
      });
    }
  }

  const mergedHeaderRisk = (args.matrix[headerRow0] ?? []).some((h) => h.includes("\n"));
  if (mergedHeaderRisk) {
    issues.push({
      severity: "info",
      title: "Multi-line header cell",
      detail: "Column titles contain line breaks (alt-enter). This often happens in decorative headers above the real column names.",
    });
  }

  return issues;
}

function confidenceFrom(
  questionMatched: boolean,
  answerMatched: boolean,
  colCount: number,
  issues: ParseIssue[],
): ParserConfidence {
  if (colCount < 2) return "low";
  const hasErr = issues.some((i) => i.severity === "error");
  if (hasErr) return "low";
  
  // If we matched headers but they are blank, we should still stay "high" if no severe warnings
  const hasMixedRisk = issues.some(i => i.title === "Possible column mismatch" && i.severity === "warning");
  if (questionMatched && answerMatched && !hasMixedRisk) return "high";
  if (questionMatched || answerMatched) return "medium";
  return "low";
}

export function buildRowPreview(
  matrix: string[][],
  headerRow0: number,
  qCol: number,
  aCol: number,
  max = 5,
): { question: string; answer: string }[] {
  const out: { question: string; answer: string }[] = [];
  for (let r = headerRow0 + 1; r < matrix.length && out.length < max; r++) {
    const q = (matrix[r]?.[qCol] ?? "").trim();
    const a = (matrix[r]?.[aCol] ?? "").trim();
    if (!q && !a) continue;
    out.push({ question: q, answer: a });
  }
  return out;
}

export function extractImportedRows(
  matrix: string[][],
  headerRow0: number,
  qCol: number,
  aCol: number,
): { question: string; answer: string; type: string; confidence: string; rowNumber: number }[] {
  const out: { question: string; answer: string; type: string; confidence: string; rowNumber: number }[] = [];
  for (let r = headerRow0 + 1; r < matrix.length; r++) {
    const q = (matrix[r]?.[qCol] ?? "").trim();
    const a = (matrix[r]?.[aCol] ?? "").trim();
    if (!q && !a) {
      // For truly empty rows, classify and preserve
      const { type, confidence } = classifyRow(q, a, matrix[r]);
      out.push({ question: q, answer: a, type, confidence, rowNumber: r + 1 });
      continue;
    }
    
    const { type, confidence } = classifyRow(q, a, matrix[r]);
    out.push({ question: q, answer: a, type, confidence, rowNumber: r + 1 });
  }
  return out;
}

export function readSheetMatrix(buffer: Buffer, sheetName: string, maxRows = 5000): string[][] | { error: string } {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  } catch {
    return { error: "Could not read this spreadsheet. It may be corrupted or password-protected." };
  }
  const ws = workbook.Sheets[sheetName];
  if (!ws) return { error: "Selected sheet is missing." };
  const matrix = sheetToMatrix(ws, maxRows);
  const maxCols = matrix.length > 0 ? Math.max(...matrix.map((row) => row.length), 0) : 0;
  for (const row of matrix) {
    while (row.length < maxCols) row.push("");
  }
  return matrix;
}

export function listSheetNames(buffer: Buffer): string[] | { error: string } {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  } catch {
    return { error: "Could not read this spreadsheet." };
  }
  return workbook.SheetNames.filter(Boolean);
}

export function buildSpreadsheetPreview(
  buffer: Buffer,
  _mimeType: string,
  selectedSheet?: string,
  overrides?: {
    manualHeaderRow?: number;
    manualQuestionCol?: number;
    manualAnswerCol?: number;
  },
): { preview: QuestionnaireImportPreview } | { error: string; issues?: ParseIssue[] } {
  const names = listSheetNames(buffer);
  if (!Array.isArray(names)) {
    return { error: "error" in names ? names.error : "Invalid workbook" };
  }
  const sheetNames = names;
  if (sheetNames.length === 0) {
    return { error: "No sheets found in this workbook." };
  }

  const scoredSheets = rankSheets(buffer);
  const topSheet = scoredSheets.length > 0 ? scoredSheets[0]!.name : null;
  const sheet = selectedSheet && sheetNames.includes(selectedSheet) ? selectedSheet : (topSheet ?? sheetNames[0]);
  const matrixResult = readSheetMatrix(buffer, sheet, 500);
  if ("error" in matrixResult) {
    return { error: matrixResult.error };
  }
  const matrix = matrixResult;
  if (matrix.length === 0) {
    return { error: "The sheet appears empty." };
  }

  const maxCols = Math.max(...matrix.map((row) => row.length), 0);

  const headerDetection = detectHeaderRow(matrix);
  const headerRow0 = overrides?.manualHeaderRow !== undefined ? overrides.manualHeaderRow : headerDetection.index;
  const headers = matrix[headerRow0] ?? [];

  const questionDetection = detectQuestionColumn(matrix, headerRow0);
  let qCol = overrides?.manualQuestionCol !== undefined ? overrides.manualQuestionCol : questionDetection.bestIndex;
  
  const answerDetection = detectAnswerColumn(matrix, headerRow0, qCol);
  let aCol = overrides?.manualAnswerCol !== undefined ? overrides.manualAnswerCol : answerDetection.bestIndex;

  const questionMatched = questionDetection.confidence !== "low";
  const answerMatched = answerDetection.confidence !== "low";
  const suggestNewAnswerColumn = !answerMatched; // simplified for now, can refine score check

  if (qCol < 0) qCol = 0;
  if (aCol < 0) aCol = Math.min(1, maxCols - 1);
  if (qCol === aCol && maxCols > 1) {
    aCol = qCol === 0 ? 1 : 0;
  }

  if (maxCols < 2) {
    return {
      error: "Need at least two columns (question and answer).",
      issues: [
        {
          severity: "error",
          title: "Not enough columns",
          detail: "Add separate columns for questions and answers, then try again.",
        },
      ],
    };
  }

  const issues = buildIssues({
    matrix,
    headerRow0,
    qCol,
    aCol,
    sheetNames,
    scoredSheets,
    questionMatched,
    answerMatched,
  });

  const blocking = issues.some((i) => i.severity === "error");
  if (blocking) {
    return { error: issues.find((i) => i.severity === "error")?.detail ?? "Import blocked.", issues };
  }

  const confidence = confidenceFrom(questionMatched, answerMatched, maxCols, issues);
  
  let sheetConfidence: ParserConfidence = "high";
  if (sheetNames.length > 1) {
    const topScore = scoredSheets[0]?.totalScore ?? 0;
    const secondScore = scoredSheets[1]?.totalScore ?? 0;
    const isAmbiguous = topScore - secondScore < 20 && topScore > 0;
    sheetConfidence = isAmbiguous ? "low" : topScore > 60 ? "high" : "medium";
  }

  const explainerBullets = [
    sheetNames.length > 1
      ? `Workbook contains multiple sheets. TrustDesk selected the most likely questionnaire tab ("${sheet}").`
      : "Single sheet workbook detected.",
    overrides?.manualHeaderRow !== undefined 
      ? `Using manual header row choice (row ${overrides.manualHeaderRow + 1}).`
      : `We identified row ${headerRow0 + 1} as the header row because it contains the most unique column labels.`,
    ...(overrides?.manualHeaderRow !== undefined ? [] : headerDetection.reasons.slice(0, 2).map((r) => r.replace("Matched keyword", "Found column title matching questionnaire keyword"))),
    overrides?.manualQuestionCol !== undefined
      ? `Using manual question column choice.`
      : questionDetection.reasons[0] ? questionDetection.reasons[0].replace("Header", "Column title").replace("(+", " (+") : "Question column identified based on text density.",
    overrides?.manualAnswerCol !== undefined
      ? `Using manual answer column choice.`
      : answerDetection.reasons[0] ? answerDetection.reasons[0].replace("Header", "Column title").replace("(+", " (+") : "Answer column identified based on adjacency to questions.",
    suggestNewAnswerColumn ? "Recommended: Creating a new 'TrustDesk Suggested Answer' column for results." : "Using existing column: TrustDesk will fill blank cells and preserve your current responses.",
    "Preview shows the first few data rows using this mapping.",
  ];

  const gridSample = matrix.slice(0, 25);
  const columnHeaders = headers.map((h, i) => (h.trim() ? h.trim() : `Column ${i + 1}`));
  const rowPreview = buildRowPreview(matrix, headerRow0, qCol, aCol, 5);

  const preview: QuestionnaireImportPreview = {
    sheetNames,
    selectedSheet: sheet,
    headerRow1Based: headerRow0 + 1,
    questionColIndex: qCol,
    answerColIndex: aCol,
    columnHeaders,
    rowPreview,
    confidence,
    headerConfidence: headerDetection.confidence,
    questionConfidence: questionDetection.confidence,
    answerConfidence: answerDetection.confidence,
    sheetConfidence,
    suggestNewAnswerColumn,
    issues,
    explainerBullets,
    scoredSheets,
    gridSample,
    rowCount: matrix.length,
  };

  return { preview };
}
