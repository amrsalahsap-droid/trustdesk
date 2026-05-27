/**
 * Contradiction Rule Loader
 *
 * Loads and validates JSON rule packs from the filesystem.
 * Fails loudly on invalid rule files with detailed validation errors.
 */

import { readFileSync } from "fs";
import { join } from "path";
import type {
  ContradictionRule,
  ContradictionRulePack,
  ContradictionRuleConfig,
  ContradictionRuleType,
  ContradictionSeverity,
  RowFieldTarget,
  CanonicalFieldTarget,
  RuleFilter,
  RuleValidationResult,
  RuleValidationError,
  RulePackLoadResult,
} from "./rule-types";
import { SEVERITY_RANK } from "./rule-types";

/** Directory containing rule pack JSON files. */
const RULES_DIRECTORY = join(process.cwd(), "src", "lib", "contradiction", "rules");

/** Error thrown when rule pack loading fails. */
export class RulePackLoadError extends Error {
  constructor(
    message: string,
    public readonly topicKey: string,
    public readonly validationErrors: RuleValidationError[],
  ) {
    super(message);
    this.name = "RulePackLoadError";
  }
}

/** Error thrown when a rule pack file is not found. */
export class RulePackNotFoundError extends Error {
  constructor(public readonly topicKey: string) {
    super(`Rule pack not found for topic: ${topicKey}`);
    this.name = "RulePackNotFoundError";
  }
}

/** Valid rule types. */
const VALID_RULE_TYPES: ContradictionRuleType[] = [
  "exact_match",
  "contains",
  "regex",
  "numeric_range",
  "boolean_polarity",
  "enum_mismatch",
  "forbidden_term",
  "required_term_missing",
];

/** Valid severity levels. */
const VALID_SEVERITIES: ContradictionSeverity[] = ["critical", "high", "medium", "low", "info"];

/** Valid row field targets. */
const VALID_ROW_FIELDS: RowFieldTarget[] = ["finalAnswer", "suggestedAnswer", "extracted_facts"];

/** Valid canonical field targets. */
const VALID_CANONICAL_FIELDS: CanonicalFieldTarget[] = ["answer", "title", "extracted_facts"];

/**
 * Validates a single rule configuration based on its type.
 */
function validateRuleConfig(
  config: ContradictionRuleConfig,
  ruleId: string,
): RuleValidationError[] {
  const errors: RuleValidationError[] = [];

  // Validate type exists and is valid
  if (!config.type) {
    errors.push({
      ruleId,
      path: "config.type",
      message: "Rule config must have a type",
      code: "MISSING_RULE_TYPE",
    });
    return errors;
  }

  if (!VALID_RULE_TYPES.includes(config.type)) {
    errors.push({
      ruleId,
      path: "config.type",
      message: `Invalid rule type: ${config.type}. Must be one of: ${VALID_RULE_TYPES.join(", ")}`,
      code: "INVALID_RULE_TYPE",
    });
    return errors;
  }

  // Type-specific validation
  switch (config.type) {
    case "regex": {
      const regexConfig = config as { pattern?: string; flags?: string };
      if (!regexConfig.pattern) {
        errors.push({
          ruleId,
          path: "config.pattern",
          message: "Regex rule requires a pattern",
          code: "MISSING_REGEX_PATTERN",
        });
      } else {
        // Validate regex compiles
        try {
          new RegExp(regexConfig.pattern, regexConfig.flags || "");
        } catch (e) {
          errors.push({
            ruleId,
            path: "config.pattern",
            message: `Invalid regex pattern: ${e instanceof Error ? e.message : "unknown error"}`,
            code: "INVALID_REGEX_PATTERN",
          });
        }
      }
      break;
    }

    case "numeric_range": {
      const numConfig = config as {
        absoluteTolerance?: number;
        relativeTolerance?: number;
      };
      if (numConfig.absoluteTolerance !== undefined && numConfig.absoluteTolerance < 0) {
        errors.push({
          ruleId,
          path: "config.absoluteTolerance",
          message: "absoluteTolerance must be non-negative",
          code: "NEGATIVE_TOLERANCE",
        });
      }
      if (numConfig.relativeTolerance !== undefined) {
        if (numConfig.relativeTolerance < 0 || numConfig.relativeTolerance > 1) {
          errors.push({
            ruleId,
            path: "config.relativeTolerance",
            message: "relativeTolerance must be between 0 and 1",
            code: "INVALID_RELATIVE_TOLERANCE",
          });
        }
      }
      break;
    }

    case "enum_mismatch": {
      const enumConfig = config as { enumValues?: unknown };
      if (!enumConfig.enumValues || !Array.isArray(enumConfig.enumValues)) {
        errors.push({
          ruleId,
          path: "config.enumValues",
          message: "Enum mismatch rule requires enumValues array",
          code: "MISSING_ENUM_VALUES",
        });
      } else if (enumConfig.enumValues.length === 0) {
        errors.push({
          ruleId,
          path: "config.enumValues",
          message: "enumValues array cannot be empty",
          code: "EMPTY_ENUM_VALUES",
        });
      } else if (!enumConfig.enumValues.every((v) => typeof v === "string")) {
        errors.push({
          ruleId,
          path: "config.enumValues",
          message: "All enumValues must be strings",
          code: "INVALID_ENUM_VALUE_TYPE",
        });
      }
      break;
    }

    case "forbidden_term": {
      const forbiddenConfig = config as { forbiddenTerms?: unknown };
      if (!forbiddenConfig.forbiddenTerms || !Array.isArray(forbiddenConfig.forbiddenTerms)) {
        errors.push({
          ruleId,
          path: "config.forbiddenTerms",
          message: "Forbidden term rule requires forbiddenTerms array",
          code: "MISSING_FORBIDDEN_TERMS",
        });
      } else if (forbiddenConfig.forbiddenTerms.length === 0) {
        errors.push({
          ruleId,
          path: "config.forbiddenTerms",
          message: "forbiddenTerms array cannot be empty",
          code: "EMPTY_FORBIDDEN_TERMS",
        });
      } else if (!forbiddenConfig.forbiddenTerms.every((t) => typeof t === "string" && t.length > 0)) {
        errors.push({
          ruleId,
          path: "config.forbiddenTerms",
          message: "All forbiddenTerms must be non-empty strings",
          code: "INVALID_FORBIDDEN_TERM",
        });
      }
      break;
    }

    case "required_term_missing": {
      const requiredConfig = config as { requiredTerms?: unknown; canonicalContainsAny?: unknown };
      if (!requiredConfig.requiredTerms || !Array.isArray(requiredConfig.requiredTerms)) {
        errors.push({
          ruleId,
          path: "config.requiredTerms",
          message: "Required term rule requires requiredTerms array",
          code: "MISSING_REQUIRED_TERMS",
        });
      } else if (requiredConfig.requiredTerms.length === 0) {
        errors.push({
          ruleId,
          path: "config.requiredTerms",
          message: "requiredTerms array cannot be empty",
          code: "EMPTY_REQUIRED_TERMS",
        });
      } else if (!requiredConfig.requiredTerms.every((t) => typeof t === "string" && t.length > 0)) {
        errors.push({
          ruleId,
          path: "config.requiredTerms",
          message: "All requiredTerms must be non-empty strings",
          code: "INVALID_REQUIRED_TERM",
        });
      }
      if (requiredConfig.canonicalContainsAny !== undefined) {
        if (!Array.isArray(requiredConfig.canonicalContainsAny)) {
          errors.push({
            ruleId,
            path: "config.canonicalContainsAny",
            message: "canonicalContainsAny must be an array of strings if provided",
            code: "INVALID_CANONICAL_CONTAINS_ANY_TYPE",
          });
        } else if (requiredConfig.canonicalContainsAny.length === 0) {
          errors.push({
            ruleId,
            path: "config.canonicalContainsAny",
            message: "canonicalContainsAny cannot be empty; omit the field instead",
            code: "EMPTY_CANONICAL_CONTAINS_ANY",
          });
        } else if (
          !requiredConfig.canonicalContainsAny.every((t) => typeof t === "string" && t.length > 0)
        ) {
          errors.push({
            ruleId,
            path: "config.canonicalContainsAny",
            message: "All canonicalContainsAny entries must be non-empty strings",
            code: "INVALID_CANONICAL_CONTAINS_ANY_TERM",
          });
        }
      }
      break;
    }

    case "contains": {
      // Contains rule is valid with just type, optional fields are validated if present
      const containsConfig = config as { minCoverage?: number };
      if (containsConfig.minCoverage !== undefined) {
        if (containsConfig.minCoverage < 0 || containsConfig.minCoverage > 1) {
          errors.push({
            ruleId,
            path: "config.minCoverage",
            message: "minCoverage must be between 0 and 1",
            code: "INVALID_MIN_COVERAGE",
          });
        }
      }
      break;
    }

    case "boolean_polarity": {
      const boolConfig = config as {
        positiveIndicators?: unknown[];
        negativeIndicators?: unknown[];
      };
      if (boolConfig.positiveIndicators !== undefined) {
        if (!Array.isArray(boolConfig.positiveIndicators)) {
          errors.push({
            ruleId,
            path: "config.positiveIndicators",
            message: "positiveIndicators must be an array",
            code: "INVALID_POSITIVE_INDICATORS",
          });
        } else if (!boolConfig.positiveIndicators.every((t) => typeof t === "string")) {
          errors.push({
            ruleId,
            path: "config.positiveIndicators",
            message: "All positiveIndicators must be strings",
            code: "INVALID_POSITIVE_INDICATOR_TYPE",
          });
        }
      }
      if (boolConfig.negativeIndicators !== undefined) {
        if (!Array.isArray(boolConfig.negativeIndicators)) {
          errors.push({
            ruleId,
            path: "config.negativeIndicators",
            message: "negativeIndicators must be an array",
            code: "INVALID_NEGATIVE_INDICATORS",
          });
        } else if (!boolConfig.negativeIndicators.every((t) => typeof t === "string")) {
          errors.push({
            ruleId,
            path: "config.negativeIndicators",
            message: "All negativeIndicators must be strings",
            code: "INVALID_NEGATIVE_INDICATOR_TYPE",
          });
        }
      }
      break;
    }

    case "exact_match":
      // No required fields beyond type
      break;

    default:
      // Exhaustive check - this should never happen due to earlier type validation
      errors.push({
        ruleId,
        path: "config.type",
        message: `Unhandled rule type: ${(config as { type: string }).type}`,
        code: "UNHANDLED_RULE_TYPE",
      });
  }

  return errors;
}

/**
 * Validates a single rule.
 */
function validateRule(rule: ContradictionRule, index: number): RuleValidationError[] {
  const errors: RuleValidationError[] = [];
  const ruleId = rule.id || `(rule at index ${index})`;

  // Required string fields
  if (!rule.id || typeof rule.id !== "string" || rule.id.trim() === "") {
    errors.push({
      path: `rules[${index}].id`,
      message: "Rule must have a non-empty id",
      code: "MISSING_RULE_ID",
    });
  }

  if (!rule.description || typeof rule.description !== "string") {
    errors.push({
      ruleId,
      path: `rules[${index}].description`,
      message: "Rule must have a description",
      code: "MISSING_RULE_DESCRIPTION",
    });
  }

  if (!rule.topicKey || typeof rule.topicKey !== "string") {
    errors.push({
      ruleId,
      path: `rules[${index}].topicKey`,
      message: "Rule must have a topicKey",
      code: "MISSING_RULE_TOPIC_KEY",
    });
  }

  if (!rule.messageTemplate || typeof rule.messageTemplate !== "string") {
    errors.push({
      ruleId,
      path: `rules[${index}].messageTemplate`,
      message: "Rule must have a messageTemplate",
      code: "MISSING_RULE_MESSAGE_TEMPLATE",
    });
  }

  // Severity validation
  if (!rule.severity) {
    errors.push({
      ruleId,
      path: `rules[${index}].severity`,
      message: "Rule must have a severity",
      code: "MISSING_RULE_SEVERITY",
    });
  } else if (!VALID_SEVERITIES.includes(rule.severity)) {
    errors.push({
      ruleId,
      path: `rules[${index}].severity`,
      message: `Invalid severity: ${rule.severity}. Must be one of: ${VALID_SEVERITIES.join(", ")}`,
      code: "INVALID_RULE_SEVERITY",
    });
  }

  // Field target validation
  if (!rule.rowField) {
    errors.push({
      ruleId,
      path: `rules[${index}].rowField`,
      message: "Rule must have a rowField",
      code: "MISSING_RULE_ROW_FIELD",
    });
  } else if (!VALID_ROW_FIELDS.includes(rule.rowField)) {
    errors.push({
      ruleId,
      path: `rules[${index}].rowField`,
      message: `Invalid rowField: ${rule.rowField}. Must be one of: ${VALID_ROW_FIELDS.join(", ")}`,
      code: "INVALID_RULE_ROW_FIELD",
    });
  }

  if (!rule.canonicalField) {
    errors.push({
      ruleId,
      path: `rules[${index}].canonicalField`,
      message: "Rule must have a canonicalField",
      code: "MISSING_RULE_CANONICAL_FIELD",
    });
  } else if (!VALID_CANONICAL_FIELDS.includes(rule.canonicalField)) {
    errors.push({
      ruleId,
      path: `rules[${index}].canonicalField`,
      message: `Invalid canonicalField: ${rule.canonicalField}. Must be one of: ${VALID_CANONICAL_FIELDS.join(", ")}`,
      code: "INVALID_RULE_CANONICAL_FIELD",
    });
  }

  // Config validation (only if config exists)
  if (!rule.config) {
    errors.push({
      ruleId,
      path: `rules[${index}].config`,
      message: "Rule must have a config",
      code: "MISSING_RULE_CONFIG",
    });
  } else {
    errors.push(...validateRuleConfig(rule.config, ruleId));
  }

  // Optional field type checks
  if (rule.subControlKey !== undefined && typeof rule.subControlKey !== "string") {
    errors.push({
      ruleId,
      path: `rules[${index}].subControlKey`,
      message: "subControlKey must be a string if provided",
      code: "INVALID_SUBCONTROL_KEY_TYPE",
    });
  }

  if (rule.resolutionGuidance !== undefined && typeof rule.resolutionGuidance !== "string") {
    errors.push({
      ruleId,
      path: `rules[${index}].resolutionGuidance`,
      message: "resolutionGuidance must be a string if provided",
      code: "INVALID_RESOLUTION_GUIDANCE_TYPE",
    });
  }

  if (rule.version !== undefined && (typeof rule.version !== "number" || rule.version < 1)) {
    errors.push({
      ruleId,
      path: `rules[${index}].version`,
      message: "version must be a positive number if provided",
      code: "INVALID_RULE_VERSION",
    });
  }

  return errors;
}

/**
 * Validates an entire rule pack.
 */
export function validateRulePack(pack: unknown): RuleValidationResult {
  const errors: RuleValidationError[] = [];

  if (!pack || typeof pack !== "object") {
    return {
      valid: false,
      errors: [{ path: "", message: "Rule pack must be an object", code: "INVALID_PACK_TYPE" }],
    };
  }

  const packObj = pack as Record<string, unknown>;

  // Required pack fields
  if (!packObj.topicKey || typeof packObj.topicKey !== "string") {
    errors.push({ path: "topicKey", message: "Rule pack must have a topicKey", code: "MISSING_PACK_TOPIC_KEY" });
  }

  if (!packObj.topicName || typeof packObj.topicName !== "string") {
    errors.push({ path: "topicName", message: "Rule pack must have a topicName", code: "MISSING_PACK_TOPIC_NAME" });
  }

  if (!packObj.version || typeof packObj.version !== "string") {
    errors.push({ path: "version", message: "Rule pack must have a version string", code: "MISSING_PACK_VERSION" });
  }

  // Rules array validation
  if (!packObj.rules) {
    errors.push({ path: "rules", message: "Rule pack must have a rules array", code: "MISSING_PACK_RULES" });
  } else if (!Array.isArray(packObj.rules)) {
    errors.push({ path: "rules", message: "rules must be an array", code: "INVALID_RULES_TYPE" });
  } else if (packObj.rules.length === 0) {
    errors.push({ path: "rules", message: "rules array cannot be empty", code: "EMPTY_RULES_ARRAY" });
  } else {
    // Validate each rule
    for (let i = 0; i < packObj.rules.length; i++) {
      const rule = packObj.rules[i];
      if (!rule || typeof rule !== "object") {
        errors.push({ path: `rules[${i}]`, message: "Rule must be an object", code: "INVALID_RULE_TYPE" });
      } else {
        errors.push(...validateRule(rule as ContradictionRule, i));
      }
    }
  }

  // Check for duplicate rule IDs
  if (Array.isArray(packObj.rules)) {
    const ruleIds = packObj.rules
      .filter((r) => r && typeof r === "object" && (r as ContradictionRule).id)
      .map((r) => (r as ContradictionRule).id);
    const seen = new Set<string>();
    for (const id of ruleIds) {
      if (seen.has(id)) {
        errors.push({ path: "rules", message: `Duplicate rule id: ${id}`, code: "DUPLICATE_RULE_ID" });
      }
      seen.add(id);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Loads a rule pack from a JSON file.
 * Fails loudly with detailed validation errors.
 *
 * @param topicKey Topic key to load rules for (e.g., "access_control")
 * @returns Loaded and validated rule pack
 * @throws RulePackNotFoundError if file doesn't exist
 * @throws RulePackLoadError if validation fails
 */
export function loadRulePack(topicKey: string): ContradictionRulePack {
  const filePath = join(RULES_DIRECTORY, `${topicKey}.json`);

  let fileContent: string;
  try {
    fileContent = readFileSync(filePath, "utf-8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new RulePackNotFoundError(topicKey);
    }
    throw new RulePackLoadError(
      `Failed to read rule pack file for topic "${topicKey}": ${error instanceof Error ? error.message : "unknown error"}`,
      topicKey,
      [{ path: "", message: `File read error: ${error instanceof Error ? error.message : "unknown"}`, code: "FILE_READ_ERROR" }],
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(fileContent);
  } catch (error) {
    throw new RulePackLoadError(
      `Invalid JSON in rule pack for topic "${topicKey}": ${error instanceof Error ? error.message : "parse error"}`,
      topicKey,
      [{ path: "", message: `JSON parse error: ${error instanceof Error ? error.message : "unknown"}`, code: "JSON_PARSE_ERROR" }],
    );
  }

  const validation = validateRulePack(parsed);
  if (!validation.valid) {
    const errorMessages = validation.errors.map((e) => `  - ${e.path}: ${e.message} (${e.code})`).join("\n");
    throw new RulePackLoadError(
      `Rule pack validation failed for topic "${topicKey}":\n${errorMessages}`,
      topicKey,
      validation.errors,
    );
  }

  return parsed as ContradictionRulePack;
}

/**
 * Safely attempts to load a rule pack.
 * Returns a result object instead of throwing.
 */
export function loadRulePackSafe(topicKey: string): RulePackLoadResult {
  try {
    const pack = loadRulePack(topicKey);
    return { success: true, pack };
  } catch (error) {
    if (error instanceof RulePackLoadError) {
      return {
        success: false,
        errors: error.validationErrors.map((e) => `${e.path}: ${e.message} (${e.code})`),
      };
    }
    if (error instanceof RulePackNotFoundError) {
      return {
        success: false,
        errors: [`Rule pack not found for topic: ${topicKey}`],
      };
    }
    return {
      success: false,
      errors: [`Unexpected error: ${error instanceof Error ? error.message : "unknown"}`],
    };
  }
}

/**
 * Gets applicable rules from a pack based on filter criteria.
 *
 * Sub-control scoping rules (must match {@link detection-service.getApplicableRules}):
 * - Concrete `filter.subControlKey` (e.g. "admin_mfa"): rules matching exactly, plus
 *   generic rules that omit `subControlKey`.
 * - `null` / `""` (row has no sub-control): only generic rules run. Sub-control-scoped
 *   rules must not fire on rows whose sub-control we cannot determine.
 * - `undefined` (caller did not specify): unchanged — the call is treated as "give me
 *   the full pack ordered"; the runtime engine is the safeguard, not this helper.
 *
 * @param pack Rule pack to filter
 * @param filter Filter criteria
 * @returns Applicable rules sorted by severity (highest first)
 */
export function getApplicableRules(
  pack: ContradictionRulePack,
  filter: Omit<RuleFilter, "topicKey">, // topicKey already implied by pack
): ContradictionRule[] {
  let rules = pack.rules;

  if (filter.subControlKey !== undefined) {
    const subKey = typeof filter.subControlKey === "string" ? filter.subControlKey.trim() : "";
    if (subKey) {
      rules = rules.filter((r) => !r.subControlKey || r.subControlKey === subKey);
    } else {
      rules = rules.filter((r) => !r.subControlKey);
    }
  }

  // Filter by active status
  if (filter.activeOnly !== false) {
    rules = rules.filter((r) => r.config.enabled !== false);
  }

  // Filter by minimum severity
  if (filter.minSeverity) {
    const minRank = SEVERITY_RANK[filter.minSeverity];
    rules = rules.filter((r) => SEVERITY_RANK[r.severity] >= minRank);
  }

  // Sort by severity (highest first), then by rule id
  return rules.sort((a, b) => {
    const severityDiff = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
    if (severityDiff !== 0) return severityDiff;
    return a.id.localeCompare(b.id);
  });
}

/**
 * Lists all available rule pack files.
 *
 * @returns Array of topic keys that have rule packs
 */
export function listAvailableRulePacks(): string[] {
  try {
    const { readdirSync } = require("fs");
    const files = readdirSync(RULES_DIRECTORY);
    return files
      .filter((f: string) => f.endsWith(".json"))
      .map((f: string) => f.replace(".json", ""));
  } catch {
    return [];
  }
}

/**
 * Loads multiple rule packs at once.
 *
 * @param topicKeys Topic keys to load
 * @returns Object with successful loads and errors
 */
export function loadMultipleRulePacks(topicKeys: string[]): {
  packs: Map<string, ContradictionRulePack>;
  errors: Map<string, RuleValidationError[]>;
} {
  const packs = new Map<string, ContradictionRulePack>();
  const errors = new Map<string, RuleValidationError[]>();

  for (const key of topicKeys) {
    try {
      const pack = loadRulePack(key);
      packs.set(key, pack);
    } catch (error) {
      if (error instanceof RulePackLoadError) {
        errors.set(key, error.validationErrors);
      } else {
        errors.set(key, [{ path: "", message: error instanceof Error ? error.message : "unknown", code: "LOAD_ERROR" }]);
      }
    }
  }

  return { packs, errors };
}
