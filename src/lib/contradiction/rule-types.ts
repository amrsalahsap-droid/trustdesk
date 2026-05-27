/**
 * Contradiction Rule Types and Schemas
 *
 * Type-safe foundation for the TrustDesk contradiction detection rule engine.
 * Supports JSON-defined rules for topic-specific canonical answer validation.
 */

/** Supported rule types for V1 contradiction detection. */
export type ContradictionRuleType =
  | "exact_match"        // Canonical answer must exactly match row answer
  | "contains"           // Row answer must contain specific text from canonical
  | "regex"              // Row answer must match regex pattern derived from canonical
  | "numeric_range"      // Numeric values in canonical/row must align within tolerance
  | "boolean_polarity"     // Boolean assertions (yes/no) must align
  | "enum_mismatch"      // Enumerated values (e.g., "quarterly", "annually") must match
  | "forbidden_term"     // Row answer must not contain terms forbidden by canonical
  | "required_term_missing"; // Row answer must contain terms required by canonical

/** Severity levels for detected contradictions. */
export type ContradictionSeverity = "critical" | "high" | "medium" | "low" | "info";

/** Target field in the row to compare against canonical. */
export type RowFieldTarget =
  | "finalAnswer"        // User-confirmed final answer
  | "suggestedAnswer"    // AI-suggested answer
  | "extracted_facts";    // Normalized/extracted fact structure (future)

/** Canonical field to use as truth source. */
export type CanonicalFieldTarget =
  | "answer"             // Full canonical answer text
  | "title"              // Canonical answer title
  | "extracted_facts";   // Normalized facts from canonical (future)

/**
 * Base configuration shared by all rule types.
 */
export interface BaseRuleConfig {
  /** Whether the rule is active (default: true) */
  enabled?: boolean;
  /** Case-insensitive matching (default: true for text rules) */
  caseInsensitive?: boolean;
  /** Trim whitespace before comparison (default: true) */
  trimWhitespace?: boolean;
  /** Maximum length difference allowed (as percentage, 0-1) for text comparison */
  maxLengthVariance?: number;
}

/**
 * Exact match rule — canonical and row answers must be identical.
 */
export interface ExactMatchConfig extends BaseRuleConfig {
  type: "exact_match";
  /** Whether to normalize whitespace (collapse multiple spaces) */
  normalizeWhitespace?: boolean;
  /** Whether to ignore punctuation differences */
  ignorePunctuation?: boolean;
}

/**
 * Contains rule — row answer must contain specific text from canonical.
 */
export interface ContainsConfig extends BaseRuleConfig {
  type: "contains";
  /** Text that must be present in row answer (extracted from canonical if not specified) */
  requiredText?: string;
  /** Minimum percentage of canonical text that must appear in row (0-1) */
  minCoverage?: number;
  /** Whether to match whole words only */
  wholeWordsOnly?: boolean;
}

/**
 * Regex rule — row answer must match a pattern derived from canonical.
 */
export interface RegexConfig extends BaseRuleConfig {
  type: "regex";
  /** Regex pattern to match (can include canonical-derived placeholders) */
  pattern: string;
  /** Regex flags (e.g., "i" for case-insensitive) */
  flags?: string;
  /** Whether pattern should NOT match (inverse) */
  invert?: boolean;
}

/**
 * Numeric range rule — numeric values must align within tolerance.
 */
export interface NumericRangeConfig extends BaseRuleConfig {
  type: "numeric_range";
  /** Unit of measurement (e.g., "days", "hours", "percent") */
  unit?: string;
  /** Absolute tolerance (+/-) */
  absoluteTolerance?: number;
  /** Relative tolerance (as percentage, 0-1) */
  relativeTolerance?: number;
  /** Whether row value must be >= canonical */
  mustBeGreaterOrEqual?: boolean;
  /** Whether row value must be <= canonical */
  mustBeLessOrEqual?: boolean;
  /** Extract numbers from text (default: true) */
  extractNumbers?: boolean;
}

/**
 * Boolean polarity rule — yes/no assertions must align.
 */
export interface BooleanPolarityConfig extends BaseRuleConfig {
  type: "boolean_polarity";
  /** Positive indicators (e.g., "yes", "true", "enabled") */
  positiveIndicators?: string[];
  /** Negative indicators (e.g., "no", "false", "disabled", "n/a") */
  negativeIndicators?: string[];
  /** Whether polarity must match exactly (true) or just not contradict (false) */
  strictPolarity?: boolean;
}

/**
 * Enum mismatch rule — enumerated values must match.
 */
export interface EnumMismatchConfig extends BaseRuleConfig {
  type: "enum_mismatch";
  /** Valid enum values */
  enumValues: string[];
  /** Whether values must match exactly or just both be valid enum members */
  strictMatch?: boolean;
  /** Canonical-to-row value mappings for equivalent values (e.g., {"Q1": "quarterly"}) */
  equivalencies?: Record<string, string>;
}

/**
 * Forbidden term rule — row must not contain terms forbidden by canonical.
 */
export interface ForbiddenTermConfig extends BaseRuleConfig {
  type: "forbidden_term";
  /** Terms that indicate contradiction if present in row answer */
  forbiddenTerms: string[];
  /** Whether to match partial words (default: false = whole words only) */
  partialMatch?: boolean;
}

/**
 * Required term missing rule — row must contain terms required by canonical.
 */
export interface RequiredTermMissingConfig extends BaseRuleConfig {
  type: "required_term_missing";
  /** Terms that must be present in row answer (extracted from canonical if not specified) */
  requiredTerms: string[];
  /** Minimum number of required terms that must be present */
  minRequired?: number;
  /** Whether all terms are required (default: true) */
  requireAll?: boolean;
  /**
   * If set, the rule only evaluates row requiredTerms when the canonical answer
   * contains at least one of these phrases (case-insensitive substring).
   * Avoids false positives when canonical does not assert the requirement.
   */
  canonicalContainsAny?: string[];
}

/**
 * Union type for all rule configurations.
 */
export type ContradictionRuleConfig =
  | ExactMatchConfig
  | ContainsConfig
  | RegexConfig
  | NumericRangeConfig
  | BooleanPolarityConfig
  | EnumMismatchConfig
  | ForbiddenTermConfig
  | RequiredTermMissingConfig;

/**
 * A single contradiction detection rule.
 */
export interface ContradictionRule {
  /** Unique rule identifier (e.g., "access_control_rbac_exact_match") */
  id: string;
  /** Human-readable description of what this rule checks */
  description: string;
  /** Topic this rule applies to (e.g., "access_control") */
  topicKey: string;
  /** Optional sub-control key for granular rules (e.g., "rbac") */
  subControlKey?: string;
  /** Rule type and configuration */
  config: ContradictionRuleConfig;
  /** Severity if contradiction is detected */
  severity: ContradictionSeverity;
  /** Which row field to compare */
  rowField: RowFieldTarget;
  /** Which canonical field to use as truth */
  canonicalField: CanonicalFieldTarget;
  /** Message template shown when contradiction detected (can use {{placeholders}}) */
  messageTemplate: string;
  /** Optional resolution guidance for users */
  resolutionGuidance?: string;
  /** Rule version for future migrations */
  version?: number;
}

/**
 * A rule pack — collection of rules for a topic.
 */
export interface ContradictionRulePack {
  /** Topic key this pack covers */
  topicKey: string;
  /** Human-readable topic name */
  topicName: string;
  /** Rule pack version (semver recommended) */
  version: string;
  /** Rules in this pack */
  rules: ContradictionRule[];
  /** Default severity for rules in this pack (can be overridden per-rule) */
  defaultSeverity?: ContradictionSeverity;
  /** Last updated timestamp */
  lastUpdated?: string;
}

/**
 * Result of loading a rule pack.
 */
export interface RulePackLoadResult {
  /** Whether load succeeded */
  success: boolean;
  /** Loaded rule pack (if success) */
  pack?: ContradictionRulePack;
  /** Validation errors (if failed) */
  errors?: string[];
}

/**
 * Filter for retrieving applicable rules.
 */
export interface RuleFilter {
  /** Workspace ID (for future workspace-specific rules) */
  workspaceId?: string;
  /** Topic key to filter by */
  topicKey: string;
  /** Optional sub-control key for granular filtering */
  subControlKey?: string | null;
  /** Minimum severity to include */
  minSeverity?: ContradictionSeverity;
  /** Only active rules */
  activeOnly?: boolean;
}

/**
 * Validation error for rule schema violations.
 */
export interface RuleValidationError {
  /** Rule ID that failed validation */
  ruleId?: string;
  /** Field path with error (e.g., "config.pattern") */
  path: string;
  /** Human-readable error message */
  message: string;
  /** Error code for programmatic handling */
  code: string;
}

/**
 * Result of rule validation.
 */
export interface RuleValidationResult {
  /** Whether validation passed */
  valid: boolean;
  /** Validation errors if any */
  errors: RuleValidationError[];
}

/**
 * Severity ranking for comparison (higher = more severe).
 */
export const SEVERITY_RANK: Record<ContradictionSeverity, number> = {
  critical: 5,
  high: 4,
  medium: 3,
  low: 2,
  info: 1,
};

/**
 * Default boolean indicators.
 */
export const DEFAULT_POSITIVE_INDICATORS = [
  "yes", "true", "enabled", "active", "implemented", "in place", "in use",
  "we do", "we have", "we provide", "supported", "required", "mandatory"
];

export const DEFAULT_NEGATIVE_INDICATORS = [
  "no", "false", "disabled", "inactive", "not implemented", "not in place",
  "we do not", "we don't", "we haveno", "not supported", "not required",
  "n/a", "not applicable", "none"
];
