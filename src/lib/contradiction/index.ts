/**
 * Contradiction Detection Module — Public API
 *
 * Foundation layer for TrustDesk contradiction detection.
 * Use these exports to build the detection engine and UI integration.
 */

// Rule types
export type {
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
  // Config types
  ExactMatchConfig,
  ContainsConfig,
  RegexConfig,
  NumericRangeConfig,
  BooleanPolarityConfig,
  EnumMismatchConfig,
  ForbiddenTermConfig,
  RequiredTermMissingConfig,
} from "./rule-types";

// Canonical retrieval types
export type {
  CanonicalRetrievalInput,
  CanonicalAnswerMetadata,
  CanonicalRetrievalSuccess,
  CanonicalRetrievalNone,
  CanonicalRetrievalResult,
  CanonicalRetrievalScope,
} from "./canonical-retrieval";

// Persistence types
export type {
  SaveContradictionInput,
  UpdateContradictionInput,
  MarkStaleInput,
  ContradictionResultDTO,
  ContradictionQueryFilter,
  ContradictionSummary,
  RerunCheckResult,
  RowConflictStatus,
  ConflictType,
  ContradictionResolutionStatus,
} from "./persistence-types";

// Detection types
export type {
  QuestionnaireRow,
  RuleApplicationResult,
  ContradictionHit,
  ContradictionDetectionResult,
  CanonicalUnavailableResult,
  DetectionResult,
  ContradictionClass,
  NormalizedText,
  DetectionConfig,
  ExtractedNumeric,
  PolarityDetection,
} from "./detection-types";

// Detection service
export { detect } from "./detection-service";

// Text normalization utilities
export {
  normalizeText,
  extractNumbers,
  detectPolarity,
  containsAny,
  containsAll,
  calculateCoverage,
  excerpt,
  numbersMatch,
} from "./text-normalization";

// Persistence service
export {
  saveContradictionResult,
  upsertContradictionDetection,
  forceDetectionAndPendingResolution,
  saveNoContradiction,
  updateContradictionResolution,
  getContradictionResult,
  getContradictionForItem,
  queryContradictions,
  getContradictionSummary,
  markResultsAsStale,
  checkRerunNeeded,
  getRowConflictStatus,
  deleteContradictionResult,
  deleteContradictionsForQuestionnaire,
} from "./persistence-service";

// Constants
export {
  SEVERITY_RANK,
  DEFAULT_POSITIVE_INDICATORS,
  DEFAULT_NEGATIVE_INDICATORS,
} from "./rule-types";

// Rule loader
export {
  loadRulePack,
  loadRulePackSafe,
  validateRulePack,
  getApplicableRules,
  listAvailableRulePacks,
  loadMultipleRulePacks,
  RulePackLoadError,
  RulePackNotFoundError,
} from "./rule-loader";

// Canonical retrieval
export {
  retrieveCanonicalAnswer,
  retrieveExportCanonical,
  retrieveInternalCanonical,
  CanonicalRetrievalError,
} from "./canonical-retrieval";
