import * as XLSX from "xlsx";
import type { ScoredSheet } from "@/lib/questionnaires/types";

const Q_KEYWORDS = [/question/i, /vendor control/i, /control\s*#?/i, /inquiry/i];
const A_KEYWORDS = [/answer/i, /response/i, /vendor response/i, /reply/i, /comment/i];

interface ScoreComponent {
  points: number;
  reason: string;
}

export function scoreSheet(sheet: XLSX.WorkSheet, name: string): ScoredSheet {
  const ref = sheet["!ref"];
  if (!ref) return { name, totalScore: 0, reasons: ["Sheet is empty"] };

  const range = XLSX.utils.decode_range(ref);
  const rowCount = range.e.r - range.s.r + 1;
  const colCount = range.e.c - range.s.c + 1;

  if (rowCount < 2 || colCount < 2) {
    return { name, totalScore: 0, reasons: ["Insufficient rows or columns"] };
  }

  const components: ScoreComponent[] = [];

  // 1. Data volume heuristic
  if (rowCount > 100) {
    components.push({ points: 20, reason: `Substantial data: ${rowCount} rows found` });
  } else if (rowCount > 20) {
    components.push({ points: 10, reason: `Moderate data: ${rowCount} rows found` });
  }

  // Sample rows for deeper analysis (first 100)
  const sampleLimit = Math.min(range.s.r + 100, range.e.r);
  let qMarkCount = 0;
  let longTextCount = 0;
  let totalTextLen = 0;
  let sampledCellCount = 0;
  let headerMatchPoints = 0;
  const matchedKeywords = new Set<string>();

  for (let r = range.s.r; r <= sampleLimit; r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = sheet[XLSX.utils.encode_cell({ r, c })];
      if (!cell?.v) continue;
      const str = String(cell.v).trim();
      if (!str) continue;

      sampledCellCount++;
      totalTextLen += str.length;

      if (str.endsWith("?")) qMarkCount++;
      if (str.length > 50) longTextCount++;

      // Check for headers in the first 15 rows
      if (r < range.s.r + 15) {
        const lower = str.toLowerCase();
        for (const re of Q_KEYWORDS) {
          if (re.test(lower) && !matchedKeywords.has("q")) {
            headerMatchPoints += 15;
            matchedKeywords.add("q");
            components.push({ points: 15, reason: `Matched question-like header: "${str}"` });
          }
        }
        for (const re of A_KEYWORDS) {
          if (re.test(lower) && !matchedKeywords.has("a")) {
            headerMatchPoints += 10;
            matchedKeywords.add("a");
            components.push({ points: 10, reason: `Matched answer-like header: "${str}"` });
          }
        }
      }
    }
  }

  // 2. Question density
  if (qMarkCount >= 1) {
    const pts = Math.min(qMarkCount * 10, 40);
    components.push({ points: pts, reason: `Pattern match: ${qMarkCount} cells end with "?"` });
  }

  // 3. Text characteristics
  const avgLen = sampledCellCount > 0 ? totalTextLen / sampledCellCount : 0;
  if (avgLen > 30) {
    components.push({ points: 15, reason: `High text density: average cell length of ${avgLen.toFixed(1)}` });
  }

  if (longTextCount > 5) {
    const pts = Math.min(longTextCount * 3, 30);
    components.push({ points: pts, reason: `${longTextCount} cells contain long-form text (>50 chars)` });
  }

  // 4. Tab name heuristic
  const lowerName = name.toLowerCase();
  if (lowerName.includes("question") || lowerName.includes("vendor") || lowerName.includes("security")) {
    components.push({ points: 15, reason: `Sheet name "${name}" is highly relevant` });
  }

  // 5. Negative heuristic for non-questionnaire sheets
  if (lowerName.includes("instruction") || lowerName.includes("glossary") || lowerName.includes("metadata") || lowerName.includes("ref") || lowerName.includes("index")) {
    components.push({ points: -50, reason: `Sheet name "${name}" suggests reference material (-50 pts)` });
  }

  const totalScore = components.reduce((acc, c) => acc + c.points, 0);
  return {
    name,
    totalScore,
    reasons: components.map(c => c.reason)
  };
}

export function rankSheets(buffer: Buffer): ScoredSheet[] {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const results: ScoredSheet[] = [];

  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    if (sheet) {
      results.push(scoreSheet(sheet, name));
    }
  }

  return results.sort((a, b) => b.totalScore - a.totalScore);
}
