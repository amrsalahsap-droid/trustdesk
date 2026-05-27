/**
 * Quality and Coverage Separation
 *
 * Separates technical crawl quality from field-level evidence coverage,
 * enabling independent assessment of:
 * - Overall crawl/evidence collection quality (technical success)
 * - Per-field evidence coverage (decision-supporting evidence)
 */

import { logger } from "@/lib/logging/logger";
import { type CrawlResult, type CrawlAttempt, type UsefulnessTier, type PageType } from "./domain-crawler";
import {
  type EvidenceExtractionResult,
  type EvidenceFieldKey,
  type EvidenceStrength,
  type FieldEvidence,
  hasSufficientEvidence,
} from "./evidence-extraction";
import { getUsableTextFromEvidence } from "./evidence";

/**
 * Overall crawl quality levels.
 */
export type CrawlQuality = "excellent" | "good" | "fair" | "poor" | "failed";

/**
 * Field evidence coverage levels (more granular than EvidenceStrength).
 */
export type FieldCoverage = "strong" | "medium" | "limited" | "weak" | "none";

/**
 * Crawl quality assessment result.
 */
export type CrawlQualityAssessment = {
  /** Overall quality rating */
  quality: CrawlQuality;
  /** Numerical score (0-100) */
  score: number;
  /** Detailed breakdown */
  metrics: {
    pagesAttempted: number;
    pagesFetched: number;
    pagesSuccessful: number;
    successRate: number;
    highValuePagesFound: number;
    highValuePagesSuccessful: number;
    extractionSuccessRate: number;
    errorCount: number;
    blockedCount: number;
    timeoutCount: number;
  };
  /** Quality issues detected */
  issues: string[];
  /** Is the crawl usable for inference? */
  usableForInference: boolean;
};

/**
 * Per-field coverage assessment.
 */
export type FieldCoverageAssessment = {
  fieldKey: EvidenceFieldKey;
  coverage: FieldCoverage;
  /** Numerical score (0-100) */
  score: number;
  /** Number of supporting pages */
  supportingPages: number;
  /** Number of conflicting signals */
  conflictCount: number;
  /** Best available evidence strength */
  bestEvidenceStrength: EvidenceStrength;
  /** Whether this coverage supports high confidence */
  supportsHighConfidence: boolean;
  /** Human-readable assessment */
  assessment: string;
};

/**
 * Complete quality and coverage assessment.
 */
export type QualityCoverageResult = {
  crawlQuality: CrawlQualityAssessment;
  fieldCoverage: Record<EvidenceFieldKey, FieldCoverageAssessment>;
  /** Overall evidence coverage across all fields */
  overallCoverage: FieldCoverage;
  /** Fields sorted by coverage (best first) */
  fieldsByCoverage: FieldCoverageAssessment[];
  /** Fields with insufficient coverage */
  weakFields: FieldCoverageAssessment[];
  /** Can we make any high-confidence decisions? */
  canMakeHighConfidenceDecisions: boolean;
  /** Recommended confidence cap based on weakest field */
  recommendedConfidenceCap: number;
};

/**
 * Coverage thresholds for field assessment.
 */
const COVERAGE_THRESHOLDS: Record<FieldCoverage, { min: number; max: number }> = {
  strong: { min: 80, max: 100 },
  medium: { min: 60, max: 79 },
  limited: { min: 40, max: 59 },
  weak: { min: 20, max: 39 },
  none: { min: 0, max: 19 },
};

/**
 * Minimum coverage required for high confidence per field type.
 */
const HIGH_CONFIDENCE_MIN_COVERAGE: Record<EvidenceFieldKey, FieldCoverage> = {
  industry: "medium",
  productType: "medium",
  customerSegment: "limited",
  complianceFocus: "medium",
  securityPosture: "medium",
  dataHandling: "limited",
  integrations: "limited",
};

/**
 * Calculate coverage score from field evidence.
 */
function calculateCoverageScore(fieldEvidence: FieldEvidence | undefined): number {
  if (!fieldEvidence || fieldEvidence.signals.length === 0) {
    return 0;
  }

  let score = 0;

  // Base score from evidence strength
  const strengthScores: Record<EvidenceStrength, number> = {
    strong: 40,
    moderate: 25,
    weak: 10,
    unknown: 0,
  };
  score += strengthScores[fieldEvidence.coverage];

  // Bonus for multiple supporting pages
  const uniquePages = new Set(fieldEvidence.signals.map((s) => s.sourceUrl)).size;
  score += Math.min(uniquePages * 10, 30); // Max 30 points for diversity

  // Bonus for no conflicts
  if (!fieldEvidence.hasConflicts) {
    score += 10;
  } else {
    // Penalty for conflicts (indicates uncertainty)
    score -= 15;
  }

  // Bonus for high-quality signals
  const strongSignals = fieldEvidence.signals.filter((s) => s.strength === "strong").length;
  score += strongSignals * 5;

  return Math.max(0, Math.min(100, score));
}

/**
 * Counts the number of non-boilerplate characters in structured evidence.
 * Replaces the old snippet-only character count.
 */
export function countUsefulCharacters(items: Array<{ structured: any }>): number {
  const boilerplate = /\b(home|about|contact|menu|login|sign\s*up|cookie|privacy\s*policy|terms)\b/gi;
  return items.reduce((total, item) => {
    const text = getUsableTextFromEvidence(item.structured);
    return total + text.replace(boilerplate, "").length;
  }, 0);
}

/**
 * Map evidence strength to coverage level.
 */
function evidenceStrengthToCoverage(strength: EvidenceStrength): FieldCoverage {
  const mapping: Record<EvidenceStrength, FieldCoverage> = {
    strong: "strong",
    moderate: "medium",
    weak: "weak",
    unknown: "none",
  };
  return mapping[strength];
}

/**
 * Assess crawl quality independently of evidence coverage.
 */
export function assessCrawlQuality(crawlResult: CrawlResult): CrawlQualityAssessment {
  const metrics = {
    pagesAttempted: crawlResult.totalAttempted,
    pagesFetched: crawlResult.totalFetched,
    pagesSuccessful: crawlResult.totalSuccessful,
    successRate: crawlResult.totalAttempted > 0 
      ? crawlResult.totalSuccessful / crawlResult.totalAttempted 
      : 0,
    highValuePagesFound: crawlResult.highValueUrls.length,
    highValuePagesSuccessful: crawlResult.pages.filter(
      (p) => p.success && crawlResult.highValueUrls.includes(p.attemptedUrl)
    ).length,
    extractionSuccessRate: crawlResult.totalFetched > 0
      ? crawlResult.pages.filter((p) => p.extractionStatus === "success").length / crawlResult.totalFetched
      : 0,
    errorCount: crawlResult.pages.filter((p) => p.extractionStatus === "error").length,
    blockedCount: crawlResult.pages.filter((p) => p.extractionStatus === "blocked").length,
    timeoutCount: crawlResult.pages.filter((p) => p.extractionStatus === "timeout").length,
  };

  const issues: string[] = [];
  let score = 0;

  // Score based on success rate (0-40 points)
  if (metrics.successRate >= 0.9) {
    score += 40;
  } else if (metrics.successRate >= 0.7) {
    score += 30;
    issues.push("Some pages failed to fetch");
  } else if (metrics.successRate >= 0.5) {
    score += 20;
    issues.push("High failure rate");
  } else {
    score += 10;
    issues.push("Most pages failed to fetch");
  }

  // Score based on high-value pages (0-30 points)
  const criticalOrHigh = crawlResult.pages.filter(
    (p) => (p.usefulnessTier === "critical" || p.usefulnessTier === "high") && p.success
  ).length;
  
  if (criticalOrHigh >= 3) {
    score += 30;
  } else if (criticalOrHigh >= 2) {
    score += 20;
  } else if (criticalOrHigh >= 1) {
    score += 10;
    issues.push("Limited high-value pages");
  } else {
    issues.push("No high-value pages found");
  }

  // Score based on extraction success (0-20 points)
  if (metrics.extractionSuccessRate >= 0.9) {
    score += 20;
  } else if (metrics.extractionSuccessRate >= 0.7) {
    score += 15;
  } else if (metrics.extractionSuccessRate >= 0.5) {
    score += 10;
    issues.push("Content extraction issues");
  } else {
    score += 5;
    issues.push("Severe extraction failures");
  }

  // Penalties for errors (0-10 points deduction)
  if (metrics.timeoutCount > 0) {
    score -= Math.min(metrics.timeoutCount * 2, 6);
    if (metrics.timeoutCount > 2) {
      issues.push("Multiple timeouts");
    }
  }

  if (metrics.blockedCount > 0) {
    score -= Math.min(metrics.blockedCount * 3, 6);
    if (metrics.blockedCount > 1) {
      issues.push("Pages blocked");
    }
  }

  // Determine quality level
  let quality: CrawlQuality;
  if (score >= 85) {
    quality = "excellent";
  } else if (score >= 70) {
    quality = "good";
  } else if (score >= 50) {
    quality = "fair";
  } else if (score >= 30) {
    quality = "poor";
  } else {
    quality = "failed";
  }

  const usableForInference = quality !== "failed" && metrics.pagesSuccessful >= 1;

  logger.info("quality-coverage:crawl-quality", {
    quality,
    score,
    metrics,
    issues: issues.length,
  });

  return {
    quality,
    score: Math.max(0, score),
    metrics,
    issues,
    usableForInference,
  };
}

/**
 * Assess field-level evidence coverage.
 */
export function assessFieldCoverage(
  fieldKey: EvidenceFieldKey,
  fieldEvidence: FieldEvidence | undefined,
): FieldCoverageAssessment {
  if (!fieldEvidence || fieldEvidence.signals.length === 0) {
    return {
      fieldKey,
      coverage: "none",
      score: 0,
      supportingPages: 0,
      conflictCount: 0,
      bestEvidenceStrength: "unknown",
      supportsHighConfidence: false,
      assessment: `No evidence found for ${fieldKey}`,
    };
  }

  const score = calculateCoverageScore(fieldEvidence);
  
  // Determine coverage level
  let coverage: FieldCoverage = "none";
  for (const [level, range] of Object.entries(COVERAGE_THRESHOLDS)) {
    if (score >= range.min && score <= range.max) {
      coverage = level as FieldCoverage;
      break;
    }
  }

  // Supporting pages count
  const supportingPages = new Set(fieldEvidence.signals.map((s) => s.sourceUrl)).size;

  // Conflict count
  const conflictCount = fieldEvidence.hasConflicts 
    ? new Set(fieldEvidence.signals.filter((s) => s.signalType === "CONFLICTING").map((s) => s.candidateValue)).size
    : 0;

  // Best evidence strength
  const strengthOrder: EvidenceStrength[] = ["strong", "moderate", "weak", "unknown"];
  const bestSignal = fieldEvidence.signals.sort(
    (a, b) => strengthOrder.indexOf(a.strength) - strengthOrder.indexOf(b.strength)
  )[0];
  const bestEvidenceStrength = bestSignal?.strength || "unknown";

  // Can this field support high confidence?
  const minRequired = HIGH_CONFIDENCE_MIN_COVERAGE[fieldKey];
  const minRequiredScore = COVERAGE_THRESHOLDS[minRequired].min;
  const supportsHighConfidence = score >= minRequiredScore && !fieldEvidence.hasConflicts;

  // Human-readable assessment
  let assessment: string;
  if (coverage === "strong") {
    assessment = `${fieldKey}: Strong evidence from ${supportingPages} page(s)`;
  } else if (coverage === "medium") {
    assessment = `${fieldKey}: Moderate evidence available`;
  } else if (coverage === "limited") {
    assessment = `${fieldKey}: Limited evidence, review recommended`;
  } else if (coverage === "weak") {
    assessment = `${fieldKey}: Weak evidence, may need manual input`;
  } else {
    assessment = `${fieldKey}: No evidence found`;
  }

  if (conflictCount > 0) {
    assessment += ` (${conflictCount} conflicting signals)`;
  }

  return {
    fieldKey,
    coverage,
    score,
    supportingPages,
    conflictCount,
    bestEvidenceStrength,
    supportsHighConfidence,
    assessment,
  };
}

/**
 * Complete quality and coverage assessment.
 */
export function assessQualityAndCoverage(
  crawlResult: CrawlResult,
  evidenceResult: EvidenceExtractionResult,
): QualityCoverageResult {
  // Assess crawl quality (technical success)
  const crawlQuality = assessCrawlQuality(crawlResult);

  // Assess each field's evidence coverage
  const fieldCoverage: Partial<Record<EvidenceFieldKey, FieldCoverageAssessment>> = {};
  
  const allFieldKeys: EvidenceFieldKey[] = [
    "industry",
    "productType",
    "customerSegment",
    "complianceFocus",
    "securityPosture",
    "dataHandling",
    "integrations",
  ];

  for (const fieldKey of allFieldKeys) {
    const fieldEvidence = evidenceResult.fields[fieldKey];
    fieldCoverage[fieldKey] = assessFieldCoverage(fieldKey, fieldEvidence);
  }

  // Calculate overall coverage
  const scores = Object.values(fieldCoverage).map((f) => f.score);
  const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
  
  let overallCoverage: FieldCoverage = "none";
  for (const [level, range] of Object.entries(COVERAGE_THRESHOLDS)) {
    if (avgScore >= range.min && avgScore <= range.max) {
      overallCoverage = level as FieldCoverage;
      break;
    }
  }

  // Sort fields by coverage (best first)
  const fieldsByCoverage = Object.values(fieldCoverage).sort((a, b) => b.score - a.score);

  // Find weak fields
  const weakFields = fieldsByCoverage.filter(
    (f) => f.coverage === "weak" || f.coverage === "none"
  );

  // Can we make high-confidence decisions?
  const criticalFields: EvidenceFieldKey[] = ["industry", "productType", "complianceFocus"];
  const criticalCoverage = criticalFields.map((k) => fieldCoverage[k]);
  const canMakeHighConfidenceDecisions = criticalCoverage.every((f) => f?.supportsHighConfidence);

  // Recommended confidence cap based on weakest critical field
  const minCriticalScore = Math.min(...criticalCoverage.map((f) => f?.score || 0));
  const recommendedConfidenceCap = Math.min(1.0, minCriticalScore / 100);

  logger.info("quality-coverage:complete", {
    crawlQuality: crawlQuality.quality,
    crawlScore: crawlQuality.score,
    overallCoverage,
    coverageScore: avgScore,
    canMakeHighConfidenceDecisions,
    recommendedConfidenceCap,
    weakFields: weakFields.map((f) => f.fieldKey),
  });

  return {
    crawlQuality,
    fieldCoverage: fieldCoverage as Record<EvidenceFieldKey, FieldCoverageAssessment>,
    overallCoverage,
    fieldsByCoverage,
    weakFields,
    canMakeHighConfidenceDecisions,
    recommendedConfidenceCap,
  };
}

/**
 * Get a human-readable summary of quality and coverage.
 */
export function getQualityCoverageSummary(result: QualityCoverageResult): string {
  const parts: string[] = [];

  parts.push(`Crawl Quality: ${result.crawlQuality.quality} (${result.crawlQuality.score}/100)`);
  
  if (result.crawlQuality.issues.length > 0) {
    parts.push(`Issues: ${result.crawlQuality.issues.join(", ")}`);
  }

  parts.push(`Overall Evidence Coverage: ${result.overallCoverage}`);

  const strongFields = result.fieldsByCoverage.filter((f) => f.coverage === "strong" || f.coverage === "medium");
  if (strongFields.length > 0) {
    parts.push(`Well-supported fields: ${strongFields.map((f) => f.fieldKey).join(", ")}`);
  }

  if (result.weakFields.length > 0) {
    parts.push(`Fields needing attention: ${result.weakFields.map((f) => f.fieldKey).join(", ")}`);
  }

  parts.push(`Can make high-confidence decisions: ${result.canMakeHighConfidenceDecisions ? "Yes" : "No"}`);

  if (result.recommendedConfidenceCap < 1.0) {
    parts.push(`Recommended confidence cap: ${(result.recommendedConfidenceCap * 100).toFixed(0)}%`);
  }

  return parts.join(" | ");
}

/**
 * Check if a specific field can support a decision.
 */
export function canFieldSupportDecision(
  result: QualityCoverageResult,
  fieldKey: EvidenceFieldKey,
  minimumCoverage: FieldCoverage = "limited",
): boolean {
  const field = result.fieldCoverage[fieldKey];
  if (!field) return false;

  const coverageOrder: FieldCoverage[] = ["strong", "medium", "limited", "weak", "none"];
  const fieldIndex = coverageOrder.indexOf(field.coverage);
  const requiredIndex = coverageOrder.indexOf(minimumCoverage);

  return fieldIndex <= requiredIndex;
}

/**
 * Get confidence cap for a specific field.
 */
export function getFieldConfidenceCap(
  result: QualityCoverageResult,
  fieldKey: EvidenceFieldKey,
): number {
  const field = result.fieldCoverage[fieldKey];
  if (!field) return 0;

  if (!field.supportsHighConfidence) {
    return 0.7; // Cap at 70% if coverage is insufficient
  }

  if (field.conflictCount > 0) {
    return 0.8; // Cap at 80% if there are conflicts
  }

  return 1.0; // Full confidence allowed
}
