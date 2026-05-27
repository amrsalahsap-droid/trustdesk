/**
 * Text Normalization Utilities for Contradiction Detection
 *
 * Normalizes row and canonical answer text for deterministic comparison.
 */

import type { NormalizedText, PolarityDetection, ExtractedNumeric } from "./detection-types";

/** Default positive indicators for boolean polarity detection. */
const DEFAULT_POSITIVE_INDICATORS = [
  "yes", "true", "enabled", "active", "implemented", "in place", "in use",
  "we do", "we have", "we provide", "supported", "required", "mandatory",
  "enforced", "applied", "deployed", "operational", "functional"
];

/** Default negative indicators for boolean polarity detection. */
const DEFAULT_NEGATIVE_INDICATORS = [
  "no", "false", "disabled", "inactive", "not implemented", "not in place",
  "we do not", "we don't", "we haveno", "not supported", "not required",
  "n/a", "not applicable", "none", "not enforced", "absent"
];

/** Common units for numeric extraction. */
const UNIT_PATTERNS: Array<{ pattern: RegExp; unit: string }> = [
  { pattern: /(\d+)\s*(?:days?|d)\b/i, unit: "days" },
  { pattern: /(\d+)\s*(?:hours?|hrs?|h)\b/i, unit: "hours" },
  { pattern: /(\d+)\s*(?:minutes?|mins?|m)\b/i, unit: "minutes" },
  { pattern: /(\d+)\s*(?:months?|mos?)\b/i, unit: "months" },
  { pattern: /(\d+)\s*(?:years?|yrs?|y)\b/i, unit: "years" },
  { pattern: /(\d+)\s*(?:quarters?|qtrs?|q)\b/i, unit: "quarters" },
  { pattern: /(\d+)%/i, unit: "percent" },
  { pattern: /(\d+)\s*(?:gb|gigabytes?)\b/i, unit: "GB" },
  { pattern: /(\d+)\s*(?:mb|megabytes?)\b/i, unit: "MB" },
];

/**
 * Normalizes text for comparison.
 */
export function normalizeText(text: string): NormalizedText {
  const trimmed = text.trim();
  const lowercased = trimmed.toLowerCase();
  
  // Remove extra whitespace and normalize
  const normalized = lowercased
    .replace(/\s+/g, " ")
    .replace(/[.,;:!?]+$/, "");
  
  // Extract words (alphanumeric only)
  const words = normalized
    .split(/\s+/)
    .map(w => w.replace(/[^a-z0-9]/g, ""))
    .filter(w => w.length > 0);
  
  // Extract numbers
  const numbers = extractNumbers(trimmed);
  
  // Detect polarity
  const polarity = detectPolarity(lowercased);
  
  return {
    original: trimmed,
    normalized,
    lowercased,
    words,
    numbers,
    hasPolarity: polarity.polarity,
  };
}

/**
 * Extracts all numbers from text.
 */
export function extractNumbers(text: string): number[] {
  const matches = text.match(/\b\d+(?:\.\d+)?\b/g);
  return matches ? matches.map(n => parseFloat(n)) : [];
}

/**
 * Extracts numeric values with units.
 */
export function extractNumerics(text: string): ExtractedNumeric[] {
  const results: ExtractedNumeric[] = [];
  
  for (const { pattern, unit } of UNIT_PATTERNS) {
    const regex = new RegExp(pattern.source, "gi");
    let match;
    while ((match = regex.exec(text)) !== null) {
      results.push({
        value: parseFloat(match[1]),
        unit,
        original: match[0],
      });
    }
  }
  
  // Also extract bare numbers (no unit)
  const bareNumbers = text.match(/\b\d+(?:\.\d+)?\b/g);
  if (bareNumbers) {
    for (const num of bareNumbers) {
      // Check if this number was already captured with a unit
      const alreadyCaptured = results.some(r => r.original.includes(num));
      if (!alreadyCaptured) {
        results.push({
          value: parseFloat(num),
          unit: undefined,
          original: num,
        });
      }
    }
  }
  
  return results;
}

/**
 * Detects boolean polarity in text.
 */
export function detectPolarity(
  text: string,
  positiveIndicators: string[] = DEFAULT_POSITIVE_INDICATORS,
  negativeIndicators: string[] = DEFAULT_NEGATIVE_INDICATORS,
): PolarityDetection {
  const lowerText = text.toLowerCase();
  
  const positiveMatches = positiveIndicators.filter(ind => 
    lowerText.includes(ind.toLowerCase())
  );
  const negativeMatches = negativeIndicators.filter(ind => 
    lowerText.includes(ind.toLowerCase())
  );
  
  const hasPositive = positiveMatches.length > 0;
  const hasNegative = negativeMatches.length > 0;
  
  // Handle conflicting signals
  if (hasPositive && hasNegative) {
    // Count matches - more specific indicators win
    if (positiveMatches.length > negativeMatches.length) {
      return {
        hasPolarity: true,
        polarity: "positive",
        confidence: 0.7,
        matchedIndicators: positiveMatches,
      };
    } else if (negativeMatches.length > positiveMatches.length) {
      return {
        hasPolarity: true,
        polarity: "negative",
        confidence: 0.7,
        matchedIndicators: negativeMatches,
      };
    }
    // Equal - neutral/ambiguous
    return {
      hasPolarity: false,
      polarity: "neutral",
      confidence: 0.5,
      matchedIndicators: [...positiveMatches, ...negativeMatches],
    };
  }
  
  if (hasPositive) {
    return {
      hasPolarity: true,
      polarity: "positive",
      confidence: 0.9,
      matchedIndicators: positiveMatches,
    };
  }
  
  if (hasNegative) {
    return {
      hasPolarity: true,
      polarity: "negative",
      confidence: 0.9,
      matchedIndicators: negativeMatches,
    };
  }
  
  return {
    hasPolarity: false,
    polarity: "neutral",
    confidence: 0,
    matchedIndicators: [],
  };
}

/**
 * Checks if text contains any of the given terms.
 */
export function containsAny(text: string, terms: string[], options?: { 
  caseInsensitive?: boolean;
  wholeWordsOnly?: boolean;
}): { found: boolean; matched: string[] } {
  const matched: string[] = [];
  const searchText = options?.caseInsensitive !== false ? text.toLowerCase() : text;
  
  for (const term of terms) {
    const searchTerm = options?.caseInsensitive !== false ? term.toLowerCase() : term;
    
    if (options?.wholeWordsOnly) {
      // Match whole words only
      const regex = new RegExp(`\\b${escapeRegex(searchTerm)}\\b`, "i");
      if (regex.test(searchText)) {
        matched.push(term);
      }
    } else {
      // Simple substring match
      if (searchText.includes(searchTerm)) {
        matched.push(term);
      }
    }
  }
  
  return { found: matched.length > 0, matched };
}

/**
 * Checks if text contains all of the given terms.
 */
export function containsAll(text: string, terms: string[], options?: {
  caseInsensitive?: boolean;
  wholeWordsOnly?: boolean;
}): { found: boolean; matched: string[]; missing: string[] } {
  const matched: string[] = [];
  const missing: string[] = [];
  const searchText = options?.caseInsensitive !== false ? text.toLowerCase() : text;
  
  for (const term of terms) {
    const searchTerm = options?.caseInsensitive !== false ? term.toLowerCase() : term;
    
    if (options?.wholeWordsOnly) {
      const regex = new RegExp(`\\b${escapeRegex(searchTerm)}\\b`, "i");
      if (regex.test(searchText)) {
        matched.push(term);
      } else {
        missing.push(term);
      }
    } else {
      if (searchText.includes(searchTerm)) {
        matched.push(term);
      } else {
        missing.push(term);
      }
    }
  }
  
  return { found: missing.length === 0, matched, missing };
}

/**
 * Calculates text coverage (what % of canonical words appear in row).
 */
export function calculateCoverage(rowText: string, canonicalText: string): number {
  const rowWords = new Set(normalizeText(rowText).words);
  const canonicalWords = normalizeText(canonicalText).words;
  
  if (canonicalWords.length === 0) return 0;
  
  let matches = 0;
  for (const word of canonicalWords) {
    if (rowWords.has(word)) {
      matches++;
    }
  }
  
  return matches / canonicalWords.length;
}

/**
 * Creates an excerpt of text (truncated to max length).
 */
export function excerpt(text: string, maxLength: number = 200): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + "...";
}

/**
 * Escapes special regex characters.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Compares two numbers within tolerance.
 */
export function numbersMatch(
  a: number,
  b: number,
  options?: {
    absoluteTolerance?: number;
    relativeTolerance?: number;
  },
): boolean {
  const absDiff = Math.abs(a - b);
  
  if (options?.absoluteTolerance !== undefined) {
    if (absDiff <= options.absoluteTolerance) return true;
  }
  
  if (options?.relativeTolerance !== undefined && b !== 0) {
    const relDiff = absDiff / Math.abs(b);
    if (relDiff <= options.relativeTolerance) return true;
  }
  
  // Exact match if no tolerance specified
  if (options?.absoluteTolerance === undefined && options?.relativeTolerance === undefined) {
    return a === b;
  }
  
  return false;
}
