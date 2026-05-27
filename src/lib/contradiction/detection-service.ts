/**
 * Contradiction Detection Service
 *
 * Core engine for detecting contradictions between questionnaire row answers
 * and approved canonical answers using deterministic rules.
 */

import type {
  QuestionnaireRow,
  DetectionResult,
  ContradictionDetectionResult,
  CanonicalUnavailableResult,
  ContradictionHit,
  DetectionConfig,
  RuleApplicationResult,
} from "./detection-types";
import type { ContradictionRule, ContradictionRulePack, ContradictionSeverity } from "./rule-types";
import type { CanonicalAnswerMetadata } from "./canonical-retrieval";
import { SEVERITY_RANK } from "./rule-types";
import {
  normalizeText,
  detectPolarity,
  containsAny,
  containsAll,
  calculateCoverage,
  excerpt,
  extractNumbers,
  numbersMatch,
} from "./text-normalization";

/** Service version for tracking. */
const DETECTOR_VERSION = "1.0.0";

/** Default detection configuration. */
const DEFAULT_CONFIG: DetectionConfig = {
  mode: "internal",
  maxExcerptLength: 200,
  checkFreshness: true,
  minConfidence: 0.5,
};

/**
 * Detects contradictions between a questionnaire row and canonical answer.
 *
 * @param row The questionnaire row to check
 * @param canonical The canonical answer metadata (or null if unavailable)
 * @param rulePack The loaded rule pack for the topic
 * @param config Detection configuration
 * @returns Detection result with all hits and final determination
 */
export function detect(
  row: QuestionnaireRow,
  canonical: CanonicalAnswerMetadata | null,
  rulePack: ContradictionRulePack,
  config: Partial<DetectionConfig> = {},
): DetectionResult {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };
  const detectedAt = new Date();
  
  // Handle no canonical available
  if (!canonical) {
    return createCanonicalUnavailableResult(
      row,
      rulePack,
      mergedConfig,
      detectedAt,
    );
  }
  
  // Get the row answer to compare (prefer final, fall back to suggested)
  const rowAnswer = row.finalAnswer?.trim() || row.suggestedAnswer?.trim() || "";
  const canonicalAnswer = canonical.answer?.trim() || "";

  // Belt-and-suspenders: callers going through `runRowCanonicalContradictionCheck`
  // already short-circuit on an empty `rowAnswer`, but other callers (e.g. tests or
  // future services) can reach `detect()` directly. Running rules against an empty
  // row would allow `required_term_missing`, `contains`, or `exact_match` to produce
  // hits when there is literally nothing to compare against — refuse instead.
  if (!rowAnswer) {
    return {
      contradictionFound: false,
      severity: null,
      contradictionType: null,
      message: "No canonical contradiction detected",
      reason: "Row answer is empty; contradiction detection requires comparable row content",
      rowExcerpt: "",
      canonicalExcerpt: excerpt(canonicalAnswer, mergedConfig.maxExcerptLength),
      hits: [],
      rulesEvaluated: 0,
      canonical,
      detectionMeta: {
        detectedAt,
        detectorVersion: DETECTOR_VERSION,
        rulePackVersion: rulePack.version,
        mode: mergedConfig.mode,
      },
    };
  }

  // Normalize both answers
  const normalizedRow = normalizeText(rowAnswer);
  const normalizedCanonical = normalizeText(canonicalAnswer);
  
  // Get applicable rules (filter by sub-control if present)
  const rules = getApplicableRules(rulePack, row.subControlKey);
  
  // Apply each rule
  const hits: ContradictionHit[] = [];
  const ruleResults: RuleApplicationResult[] = [];
  
  for (const rule of rules) {
    const result = applyRule(rule, normalizedRow, normalizedCanonical, rowAnswer, canonicalAnswer);
    ruleResults.push(result);
    
    if (result.matched && result.excerpts) {
      hits.push({
        ruleId: rule.id,
        ruleDescription: rule.description,
        contradictionType: rule.config.type,
        severity: rule.severity,
        message: rule.messageTemplate,
        reason: rule.resolutionGuidance || `Rule ${rule.id} triggered`,
        rowExcerpt: excerpt(result.excerpts.rowExcerpt, mergedConfig.maxExcerptLength),
        canonicalExcerpt: excerpt(result.excerpts.canonicalExcerpt, mergedConfig.maxExcerptLength),
        confidence: 1.0, // Deterministic rules = full confidence
      });
    }
  }
  
  // Sort hits by severity (highest first)
  hits.sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);
  
  // Build final result
  if (hits.length > 0) {
    const primaryHit = hits[0];
    return {
      contradictionFound: true,
      severity: primaryHit.severity,
      contradictionType: primaryHit.contradictionType,
      message: primaryHit.message,
      reason: formatReason(hits, row, canonical),
      rowExcerpt: excerpt(rowAnswer, mergedConfig.maxExcerptLength),
      canonicalExcerpt: excerpt(canonicalAnswer, mergedConfig.maxExcerptLength),
      hits,
      rulesEvaluated: rules.length,
      canonical,
      detectionMeta: {
        detectedAt,
        detectorVersion: DETECTOR_VERSION,
        rulePackVersion: rulePack.version,
        mode: mergedConfig.mode,
      },
    };
  }
  
  // No contradiction found
  return {
    contradictionFound: false,
    severity: null,
    contradictionType: null,
    message: "No canonical contradiction detected",
    reason: `Row answer aligns with canonical answer for ${rulePack.topicKey}`,
    rowExcerpt: excerpt(rowAnswer, mergedConfig.maxExcerptLength),
    canonicalExcerpt: excerpt(canonicalAnswer, mergedConfig.maxExcerptLength),
    hits: [],
    rulesEvaluated: rules.length,
    canonical,
    detectionMeta: {
      detectedAt,
      detectorVersion: DETECTOR_VERSION,
      rulePackVersion: rulePack.version,
      mode: mergedConfig.mode,
    },
  };
}

/**
 * Applies a single contradiction rule.
 */
function applyRule(
  rule: ContradictionRule,
  normalizedRow: ReturnType<typeof normalizeText>,
  normalizedCanonical: ReturnType<typeof normalizeText>,
  originalRow: string,
  originalCanonical: string,
): RuleApplicationResult {
  const config = rule.config;
  
  switch (config.type) {
    case "exact_match":
      return applyExactMatch(rule, normalizedRow, normalizedCanonical, originalRow, originalCanonical, config);
    
    case "boolean_polarity":
      return applyBooleanPolarity(rule, normalizedRow, normalizedCanonical, originalRow, originalCanonical, config);
    
    case "contains":
      return applyContains(rule, normalizedRow, normalizedCanonical, originalRow, originalCanonical, config);
    
    case "numeric_range":
      return applyNumericRange(rule, normalizedRow, normalizedCanonical, originalRow, originalCanonical, config);
    
    case "enum_mismatch":
      return applyEnumMismatch(rule, normalizedRow, normalizedCanonical, originalRow, originalCanonical, config);
    
    case "forbidden_term":
      return applyForbiddenTerm(rule, normalizedRow, normalizedCanonical, originalRow, originalCanonical, config);
    
    case "required_term_missing":
      return applyRequiredTermMissing(rule, normalizedRow, normalizedCanonical, originalRow, originalCanonical, config);
    
    case "regex":
      return applyRegex(rule, normalizedRow, normalizedCanonical, originalRow, originalCanonical, config);
    
    default:
      return { rule, matched: false };
  }
}

/**
 * Applies exact match rule.
 */
function applyExactMatch(
  rule: ContradictionRule,
  normalizedRow: ReturnType<typeof normalizeText>,
  normalizedCanonical: ReturnType<typeof normalizeText>,
  originalRow: string,
  originalCanonical: string,
  config: { type: "exact_match"; normalizeWhitespace?: boolean; ignorePunctuation?: boolean },
): RuleApplicationResult {
  let rowText = normalizedRow.normalized;
  let canonicalText = normalizedCanonical.normalized;
  
  if (config.normalizeWhitespace) {
    rowText = rowText.replace(/\s+/g, " ").trim();
    canonicalText = canonicalText.replace(/\s+/g, " ").trim();
  }
  
  if (config.ignorePunctuation) {
    rowText = rowText.replace(/[.,;:!?]/g, "");
    canonicalText = canonicalText.replace(/[.,;:!?]/g, "");
  }
  
  const matched = rowText !== canonicalText;
  
  return {
    rule,
    matched,
    excerpts: matched ? {
      rowExcerpt: originalRow,
      canonicalExcerpt: originalCanonical,
    } : undefined,
  };
}

/**
 * Applies boolean polarity rule.
 */
function applyBooleanPolarity(
  rule: ContradictionRule,
  normalizedRow: ReturnType<typeof normalizeText>,
  normalizedCanonical: ReturnType<typeof normalizeText>,
  originalRow: string,
  originalCanonical: string,
  config: { type: "boolean_polarity"; strictPolarity?: boolean; positiveIndicators?: string[]; negativeIndicators?: string[] },
): RuleApplicationResult {
  const rowPolarity = detectPolarity(normalizedRow.original, config.positiveIndicators, config.negativeIndicators);
  const canonicalPolarity = detectPolarity(normalizedCanonical.original, config.positiveIndicators, config.negativeIndicators);
  
  // Both must have detectable polarity to contradict
  if (!rowPolarity.hasPolarity || !canonicalPolarity.hasPolarity) {
    return { rule, matched: false };
  }
  
  // Check for contradiction (opposite polarities)
  const matched = rowPolarity.polarity !== canonicalPolarity.polarity;
  
  return {
    rule,
    matched,
    excerpts: matched ? {
      rowExcerpt: originalRow,
      canonicalExcerpt: originalCanonical,
    } : undefined,
    extractedValues: matched ? {
      rowValue: rowPolarity.polarity,
      canonicalValue: canonicalPolarity.polarity,
    } : undefined,
  };
}

/**
 * Applies contains rule.
 */
function applyContains(
  rule: ContradictionRule,
  normalizedRow: ReturnType<typeof normalizeText>,
  normalizedCanonical: ReturnType<typeof normalizeText>,
  originalRow: string,
  originalCanonical: string,
  config: { type: "contains"; requiredText?: string; minCoverage?: number; wholeWordsOnly?: boolean },
): RuleApplicationResult {
  // Calculate coverage (what % of canonical appears in row)
  const coverage = calculateCoverage(originalRow, originalCanonical);
  
  const minCoverage = config.minCoverage ?? 0.5;
  const matched = coverage < minCoverage;
  
  return {
    rule,
    matched,
    excerpts: matched ? {
      rowExcerpt: originalRow,
      canonicalExcerpt: originalCanonical,
    } : undefined,
    extractedValues: matched ? {
      rowValue: `${Math.round(coverage * 100)}%`,
      canonicalValue: `${Math.round(minCoverage * 100)}%`,
    } : undefined,
  };
}

/**
 * Applies numeric range rule.
 */
function applyNumericRange(
  rule: ContradictionRule,
  normalizedRow: ReturnType<typeof normalizeText>,
  normalizedCanonical: ReturnType<typeof normalizeText>,
  originalRow: string,
  originalCanonical: string,
  config: { type: "numeric_range"; absoluteTolerance?: number; relativeTolerance?: number; mustBeGreaterOrEqual?: boolean; mustBeLessOrEqual?: boolean },
): RuleApplicationResult {
  const rowNumbers = normalizedRow.numbers;
  const canonicalNumbers = normalizedCanonical.numbers;
  
  // Need at least one number in each to compare
  if (rowNumbers.length === 0 || canonicalNumbers.length === 0) {
    return { rule, matched: false };
  }
  
  // Compare primary (first) numbers
  const rowNum = rowNumbers[0];
  const canonicalNum = canonicalNumbers[0];
  
  let matched = false;
  
  if (config.mustBeGreaterOrEqual && rowNum < canonicalNum) {
    matched = true;
  } else if (config.mustBeLessOrEqual && rowNum > canonicalNum) {
    matched = true;
  } else if (!config.mustBeGreaterOrEqual && !config.mustBeLessOrEqual) {
    // Check tolerance
    matched = !numbersMatch(rowNum, canonicalNum, {
      absoluteTolerance: config.absoluteTolerance,
      relativeTolerance: config.relativeTolerance,
    });
  }
  
  return {
    rule,
    matched,
    excerpts: matched ? {
      rowExcerpt: originalRow,
      canonicalExcerpt: originalCanonical,
    } : undefined,
    extractedValues: matched ? {
      rowValue: rowNum,
      canonicalValue: canonicalNum,
    } : undefined,
  };
}

/**
 * Applies enum mismatch rule.
 */
function applyEnumMismatch(
  rule: ContradictionRule,
  normalizedRow: ReturnType<typeof normalizeText>,
  normalizedCanonical: ReturnType<typeof normalizeText>,
  originalRow: string,
  originalCanonical: string,
  config: { type: "enum_mismatch"; enumValues: string[]; strictMatch?: boolean; equivalencies?: Record<string, string> },
): RuleApplicationResult {
  const enumValues = config.enumValues.map(v => v.toLowerCase());
  
  // Find enum value in row
  let rowValue: string | null = null;
  for (const val of enumValues) {
    if (normalizedRow.lowercased.includes(val)) {
      rowValue = val;
      break;
    }
  }
  
  // Find enum value in canonical
  let canonicalValue: string | null = null;
  for (const val of enumValues) {
    if (normalizedCanonical.lowercased.includes(val)) {
      canonicalValue = val;
      break;
    }
  }
  
  // Apply equivalencies
  if (config.equivalencies && rowValue) {
    const equiv = Object.entries(config.equivalencies).find(([k]) => k.toLowerCase() === rowValue);
    if (equiv) {
      rowValue = equiv[1].toLowerCase();
    }
  }
  
  if (config.equivalencies && canonicalValue) {
    const equiv = Object.entries(config.equivalencies).find(([k]) => k.toLowerCase() === canonicalValue);
    if (equiv) {
      canonicalValue = equiv[1].toLowerCase();
    }
  }
  
  // Match if values differ (contradiction)
  const matched = rowValue !== null && canonicalValue !== null && rowValue !== canonicalValue;
  
  return {
    rule,
    matched,
    excerpts: matched ? {
      rowExcerpt: originalRow,
      canonicalExcerpt: originalCanonical,
    } : undefined,
    extractedValues: matched ? {
      rowValue: rowValue || "not found",
      canonicalValue: canonicalValue || "not found",
    } : undefined,
  };
}

/**
 * Applies forbidden term rule.
 */
function applyForbiddenTerm(
  rule: ContradictionRule,
  normalizedRow: ReturnType<typeof normalizeText>,
  normalizedCanonical: ReturnType<typeof normalizeText>,
  originalRow: string,
  originalCanonical: string,
  config: { type: "forbidden_term"; forbiddenTerms: string[]; partialMatch?: boolean },
): RuleApplicationResult {
  const result = containsAny(originalRow, config.forbiddenTerms, {
    caseInsensitive: true,
    wholeWordsOnly: !config.partialMatch,
  });
  
  return {
    rule,
    matched: result.found,
    excerpts: result.found ? {
      rowExcerpt: originalRow,
      canonicalExcerpt: originalCanonical,
    } : undefined,
    extractedValues: result.found ? {
      rowValue: result.matched.join(", "),
      canonicalValue: "forbidden terms not allowed",
    } : undefined,
  };
}

/**
 * Applies required term missing rule.
 */
function applyRequiredTermMissing(
  rule: ContradictionRule,
  normalizedRow: ReturnType<typeof normalizeText>,
  normalizedCanonical: ReturnType<typeof normalizeText>,
  originalRow: string,
  originalCanonical: string,
  config: {
    type: "required_term_missing";
    requiredTerms: string[];
    minRequired?: number;
    requireAll?: boolean;
    canonicalContainsAny?: string[];
  },
): RuleApplicationResult {
  if (config.canonicalContainsAny?.length) {
    const canonLower = originalCanonical.toLowerCase();
    const gate = config.canonicalContainsAny.some((phrase) =>
      canonLower.includes(phrase.toLowerCase()),
    );
    if (!gate) {
      return { rule, matched: false };
    }
  }

  const result = containsAll(originalRow, config.requiredTerms, {
    caseInsensitive: true,
    wholeWordsOnly: false,
  });
  
  // Determine if we have enough required terms
  const minRequired = config.minRequired ?? (config.requireAll !== false ? config.requiredTerms.length : 1);
  const matched = result.matched.length < minRequired;
  
  return {
    rule,
    matched,
    excerpts: matched ? {
      rowExcerpt: originalRow,
      canonicalExcerpt: originalCanonical,
    } : undefined,
    extractedValues: matched ? {
      rowValue: `found ${result.matched.length}/${config.requiredTerms.length}`,
      canonicalValue: `requires ${minRequired}/${config.requiredTerms.length}`,
    } : undefined,
  };
}

/**
 * Applies regex rule.
 */
function applyRegex(
  rule: ContradictionRule,
  normalizedRow: ReturnType<typeof normalizeText>,
  normalizedCanonical: ReturnType<typeof normalizeText>,
  originalRow: string,
  originalCanonical: string,
  config: { type: "regex"; pattern: string; flags?: string; invert?: boolean },
): RuleApplicationResult {
  try {
    const regex = new RegExp(config.pattern, config.flags || "i");
    const matches = regex.test(originalRow);
    const matched = config.invert ? !matches : matches;
    
    return {
      rule,
      matched,
      excerpts: matched ? {
        rowExcerpt: originalRow,
        canonicalExcerpt: originalCanonical,
      } : undefined,
    };
  } catch {
    // Invalid regex - don't match
    return { rule, matched: false };
  }
}

/**
 * Gets applicable rules from the rule pack.
 *
 * Sub-control scoping rules:
 * - When the row has a concrete `subControlKey` (e.g. `admin_mfa`): run rules whose JSON
 *   `subControlKey` matches exactly, plus generic rules that omit `subControlKey`.
 * - When the row has no sub-control (null/empty): run ONLY generic rules that omit
 *   `subControlKey`. We must never evaluate sub-control-scoped rules (e.g. an omission rule
 *   requiring the row to mention "MFA") on a row whose sub-control we cannot determine —
 *   that is exactly how an offboarding/access-review row ends up being flagged against
 *   the admin_mfa canonical.
 */
function getApplicableRules(
  rulePack: ContradictionRulePack,
  subControlKey: string | null | undefined,
): ContradictionRule[] {
  let rules = rulePack.rules.filter((r) => r.config.enabled !== false);
  const key = typeof subControlKey === "string" ? subControlKey.trim() : "";
  if (key) {
    rules = rules.filter((r) => !r.subControlKey || r.subControlKey === key);
  } else {
    rules = rules.filter((r) => !r.subControlKey);
  }
  return rules.sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);
}

/**
 * Creates result when canonical is unavailable.
 */
function createCanonicalUnavailableResult(
  row: QuestionnaireRow,
  rulePack: ContradictionRulePack,
  config: DetectionConfig,
  detectedAt: Date,
): CanonicalUnavailableResult {
  return {
    contradictionFound: false,
    canonicalUnavailable: true,
    reason: `No approved canonical answer available for topic "${rulePack.topicKey}"${row.subControlKey ? ` / sub-control "${row.subControlKey}"` : ""}`,
    severity: null,
    contradictionType: null,
    message: "Cannot check for contradictions: canonical answer not available",
    hits: [],
    rulesEvaluated: 0,
    canonical: null,
    detectionMeta: {
      detectedAt,
      detectorVersion: DETECTOR_VERSION,
      rulePackVersion: rulePack.version,
      mode: config.mode,
    },
  };
}

/**
 * Formats a human-readable reason from hits.
 */
function formatReason(
  hits: ContradictionHit[],
  row: QuestionnaireRow,
  canonical: CanonicalAnswerMetadata,
): string {
  const parts: string[] = [];
  
  parts.push(`Found ${hits.length} contradiction(s) between row and canonical answer:`);
  
  for (const hit of hits.slice(0, 3)) {
    parts.push(`- ${hit.ruleDescription} (${hit.severity})`);
  }
  
  if (hits.length > 3) {
    parts.push(`- ... and ${hits.length - 3} more`);
  }
  
  return parts.join("\n");
}
