/**
 * Contradiction Detection Types
 *
 * Types for the core contradiction detection engine.
 */

import type { ContradictionRule, ContradictionSeverity } from "./rule-types";
import type { CanonicalAnswerMetadata } from "./canonical-retrieval";

/**
 * A questionnaire row to check for contradictions.
 */
export interface QuestionnaireRow {
  id: string;
  question: string;
  finalAnswer: string;
  suggestedAnswer: string;
  topicId?: string;
  topicKey?: string;
  subControlKey?: string | null;
}

/**
 * Result of applying a single rule.
 */
export interface RuleApplicationResult {
  rule: ContradictionRule;
  matched: boolean;
  excerpts?: {
    rowExcerpt: string;
    canonicalExcerpt: string;
  };
  extractedValues?: {
    rowValue?: string | number | boolean;
    canonicalValue?: string | number | boolean;
  };
}

/**
 * Contradiction detection hit from a rule.
 */
export interface ContradictionHit {
  ruleId: string;
  ruleDescription: string;
  contradictionType: string;
  severity: ContradictionSeverity;
  message: string;
  reason: string;
  rowExcerpt: string;
  canonicalExcerpt: string;
  confidence: number; // 0-1, deterministic rules = 1.0
}

/**
 * Final contradiction detection result.
 */
export interface ContradictionDetectionResult {
  /** Whether a contradiction was found */
  contradictionFound: boolean;
  /** Highest severity among all hits */
  severity: ContradictionSeverity | null;
  /** Primary contradiction type */
  contradictionType: string | null;
  /** Human-readable message */
  message: string | null;
  /** Detailed reason */
  reason: string | null;
  /** Row answer excerpt for display */
  rowExcerpt: string | null;
  /** Canonical answer excerpt for display */
  canonicalExcerpt: string | null;
  /** All contradiction hits found */
  hits: ContradictionHit[];
  /** Number of rules evaluated */
  rulesEvaluated: number;
  /** Canonical truth used for comparison */
  canonical: CanonicalAnswerMetadata | null;
  /** Detection metadata */
  detectionMeta: {
    detectedAt: Date;
    detectorVersion: string;
    rulePackVersion: string;
    mode: "internal" | "export";
  };
}

/**
 * Result when no canonical answer is available.
 */
export interface CanonicalUnavailableResult {
  contradictionFound: false;
  canonicalUnavailable: true;
  reason: string;
  severity: null;
  contradictionType: null;
  message: string;
  hits: [];
  rulesEvaluated: 0;
  canonical: null;
  detectionMeta: {
    detectedAt: Date;
    detectorVersion: string;
    rulePackVersion: string;
    mode: "internal" | "export";
  };
}

/**
 * Union type for all detection results.
 */
export type DetectionResult = ContradictionDetectionResult | CanonicalUnavailableResult;

/**
 * Contradiction classification for analytics/reporting.
 */
export type ContradictionClass =
  | "opposite_security_claim"      // Row says opposite of canonical (yes vs no)
  | "required_control_missing"     // Required term not in row answer
  | "numeric_retention_mismatch"   // Numbers don't align (RTO, retention days)
  | "export_safety_mismatch"       // Export-safe required but row lacks it
  | "scope_mismatch"               // Scope/topic mismatch
  | "stale_canonical_warning"      // Canonical is expired/past due
  | "boolean_polarity_mismatch"    // Yes/no contradiction
  | "enum_mismatch"                // Enumerated values don't match
  | "forbidden_term_present"       // Row contains forbidden terms
  | "required_term_missing";        // Required terms not in row

/**
 * Normalized text for comparison.
 */
export interface NormalizedText {
  original: string;
  normalized: string;
  lowercased: string;
  words: string[];
  numbers: number[];
  hasPolarity: "positive" | "negative" | "neutral";
}

/**
 * Detection configuration options.
 */
export interface DetectionConfig {
  /** Detection mode */
  mode: "internal" | "export";
  /** Maximum excerpt length */
  maxExcerptLength?: number;
  /** Whether to check canonical freshness */
  checkFreshness?: boolean;
  /** Minimum confidence threshold (0-1) */
  minConfidence?: number;
  /** Rule pack version to use */
  rulePackVersion?: string;
}

/**
 * Extracted numeric value with unit.
 */
export interface ExtractedNumeric {
  value: number;
  unit?: string;
  original: string;
}

/**
 * Boolean polarity detection result.
 */
export interface PolarityDetection {
  hasPolarity: boolean;
  polarity: "positive" | "negative" | "neutral";
  confidence: number;
  matchedIndicators: string[];
}
