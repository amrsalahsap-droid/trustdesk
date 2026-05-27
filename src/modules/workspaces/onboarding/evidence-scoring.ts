/**
 * Evidence-Based Decision Scoring for Trust Profile
 *
 * Profile decisions are supported by:
 * - Quantity: Number of supporting evidence signals
 * - Quality: Usefulness of source pages
 * - Diversity: Multiple independent sources
 * - Directness: Explicit vs inferred wording
 *
 * Never presents raw score as statistical accuracy.
 */

import { logger } from "@/lib/logging/logger";
import { type PageType, type UsefulnessTier, type CrawlAttempt } from "./domain-crawler";
import {
  type EvidenceFieldKey,
  type EvidenceSignal,
  type EvidenceStrength,
  type FieldEvidence,
  type EvidenceExtractionResult,
} from "./evidence-extraction";
import {
  type FieldCoverage,
  assessFieldCoverage,
  getFieldConfidenceCap,
} from "./quality-coverage";

/**
 * Confidence bands (not statistical accuracy).
 */
export type ConfidenceBand = "high" | "medium" | "low" | "uncertain";

/**
 * Evidence reference for audit trail.
 */
export type EvidenceRef = {
  sourceUrl: string;
  pageType: PageType;
  snippet: string;
  signalType: string;
  strength: EvidenceStrength;
};

/**
 * Scored candidate for a field.
 */
export type ScoredCandidate = {
  /** The candidate value */
  value: string;
  /** Evidence-based support score (0-100, NOT accuracy) */
  supportScore: number;
  /** Confidence band based on evidence coverage */
  confidenceBand: ConfidenceBand;
  /** Evidence coverage level */
  evidenceCoverage: FieldCoverage;
  /** Human-readable reasons for this score */
  reasons: string[];
  /** References to supporting evidence */
  evidenceRefs: EvidenceRef[];
  /** Number of supporting signals */
  signalCount: number;
  /** Number of unique source pages */
  sourceDiversity: number;
  /** Whether this came from direct legal/security source */
  hasDirectLegalSecuritySource: boolean;
};

/**
 * Field decision result with conflict detection.
 */
export type FieldDecision = {
  fieldKey: EvidenceFieldKey;
  /** Selected candidate (highest support score) */
  selectedCandidate: ScoredCandidate;
  /** All candidates sorted by support score */
  allCandidates: ScoredCandidate[];
  /** Whether field has conflicts */
  hasConflict: boolean;
  /** Conflicting candidates if any (within threshold) */
  conflictCandidates: ScoredCandidate[];
  /** Overall field coverage */
  fieldCoverage: FieldCoverage;
  /** Can this field support high confidence decision? */
  canSupportHighConfidence: boolean;
  /** Human-readable decision summary */
  decisionSummary: string;
};

/**
 * Complete evidence-based scoring result.
 */
export type EvidenceScoringResult = {
  /** Decisions for all fields */
  fieldDecisions: Record<EvidenceFieldKey, FieldDecision>;
  /** Fields with detected conflicts */
  conflictedFields: EvidenceFieldKey[];
  /** Fields that can support high confidence */
  highConfidenceFields: EvidenceFieldKey[];
  /** Overall confidence band */
  overallConfidence: ConfidenceBand;
  /** Human-readable summary */
  summary: string;
};

/**
 * Configuration for scoring.
 */
const SCORING_CONFIG = {
  /** Conflict threshold: candidates within this score gap are conflicting */
  conflictThreshold: 15,
  /** Minimum score gap to avoid conflict */
  clearWinnerThreshold: 20,
  /** Max confidence band by evidence coverage */
  coverageToConfidence: {
    strong: "high" as ConfidenceBand,
    medium: "medium" as ConfidenceBand,
    limited: "low" as ConfidenceBand,
    weak: "uncertain" as ConfidenceBand,
    none: "uncertain" as ConfidenceBand,
  },
  /** Score weights */
  weights: {
    signalCount: 10,      // Per signal (max 30)
    quality: 20,          // Source page usefulness
    diversity: 15,        // Multiple sources (max 15)
    directness: 25,       // Explicit vs inferred
    repetition: 10,         // Same signal on multiple pages
  },
  /** Direct source page types that can boost confidence */
  directSourceTypes: ["security", "trust", "compliance", "privacy", "legal", "dpa"] as PageType[],
};

/**
 * Calculate quality score from source page usefulness.
 */
function calculateQualityScore(usefulnessTier: UsefulnessTier): number {
  const scores: Record<UsefulnessTier, number> = {
    critical: 20,
    high: 15,
    medium: 10,
    low: 5,
    minimal: 2,
  };
  return scores[usefulnessTier];
}

/**
 * Calculate directness score from signal type.
 */
function calculateDirectnessScore(signalType: string): number {
  const scores: Record<string, number> = {
    DIRECT_QUOTE: 25,
    HEADING_MATCH: 20,
    META_EXTRACT: 18,
    STRUCTURED_DATA: 22,
    INFERRED: 8,
    CONFLICTING: 0,
  };
  return scores[signalType] || 5;
}

/**
 * Group signals by candidate value.
 */
function groupSignalsByCandidate(
  signals: EvidenceSignal[],
): Map<string, EvidenceSignal[]> {
  const groups = new Map<string, EvidenceSignal[]>();

  for (const signal of signals) {
    const existing = groups.get(signal.candidateValue) || [];
    existing.push(signal);
    groups.set(signal.candidateValue, existing);
  }

  return groups;
}

/**
 * Calculate repetition bonus for signals appearing on multiple pages.
 */
function calculateRepetitionBonus(signals: EvidenceSignal[]): number {
  const pageCounts = new Map<string, number>();

  for (const signal of signals) {
    const count = pageCounts.get(signal.sourceUrl) || 0;
    pageCounts.set(signal.sourceUrl, count + 1);
  }

  // Bonus for appearing on 2+ pages
  const multiPageSignals = Array.from(pageCounts.values()).filter((c) => c > 1).length;
  return Math.min(multiPageSignals * 5, 10);
}

/**
 * Score a single candidate based on its evidence signals.
 */
function scoreCandidate(
  value: string,
  signals: EvidenceSignal[],
  pages: Map<string, CrawlAttempt>,
  fieldCoverage: FieldCoverage,
): ScoredCandidate {
  const reasons: string[] = [];
  const evidenceRefs: EvidenceRef[] = [];

  let score = 0;

  // 1. Signal count (up to 30 points)
  const signalCount = signals.length;
  const signalScore = Math.min(signalCount * SCORING_CONFIG.weights.signalCount, 30);
  score += signalScore;
  if (signalCount >= 2) {
    reasons.push(`${signalCount} supporting signals`);
  } else if (signalCount === 1) {
    reasons.push("Single supporting signal");
  }

  // 2. Quality score from source pages (up to 20 points)
  let qualityScore = 0;
  const uniquePages = new Set(signals.map((s) => s.sourceUrl));
  for (const url of uniquePages) {
    const page = pages.get(url);
    if (page) {
      qualityScore += calculateQualityScore(page.usefulnessTier);
    }
  }
  score += Math.min(qualityScore, SCORING_CONFIG.weights.quality);

  // 3. Source diversity (up to 15 points)
  const sourceDiversity = uniquePages.size;
  const diversityScore = Math.min(sourceDiversity * 5, SCORING_CONFIG.weights.diversity);
  score += diversityScore;
  if (sourceDiversity >= 2) {
    reasons.push(`${sourceDiversity} independent sources`);
  }

  // 4. Directness of wording (up to 25 points)
  let directnessScore = 0;
  let hasDirectLegalSecuritySource = false;

  for (const signal of signals) {
    const signalDirectness = calculateDirectnessScore(signal.signalType);
    directnessScore = Math.max(directnessScore, signalDirectness);

    // Check for direct legal/security sources
    if (
      SCORING_CONFIG.directSourceTypes.includes(signal.pageType) &&
      signal.strength === "strong"
    ) {
      hasDirectLegalSecuritySource = true;
    }

    // Build evidence refs
    evidenceRefs.push({
      sourceUrl: signal.sourceUrl,
      pageType: signal.pageType,
      snippet: signal.snippet,
      signalType: signal.signalType,
      strength: signal.strength,
    });
  }
  score += Math.min(directnessScore, SCORING_CONFIG.weights.directness);

  // 5. Repetition bonus (up to 10 points)
  const repetitionScore = calculateRepetitionBonus(signals);
  score += repetitionScore;

  // Normalize to 0-100
  score = Math.min(100, Math.max(0, score));

  // Determine confidence band based on coverage and direct sources
  let confidenceBand = SCORING_CONFIG.coverageToConfidence[fieldCoverage];

  // Boost confidence if we have direct legal/security source
  if (hasDirectLegalSecuritySource && confidenceBand === "medium") {
    confidenceBand = "high";
    reasons.push("Direct legal/security source");
  }

  // Cap confidence based on coverage
  if (fieldCoverage === "weak" || fieldCoverage === "none") {
    confidenceBand = "uncertain";
  } else if (fieldCoverage === "limited" && !hasDirectLegalSecuritySource) {
    confidenceBand = "low";
  }

  return {
    value,
    supportScore: Math.round(score),
    confidenceBand,
    evidenceCoverage: fieldCoverage,
    reasons,
    evidenceRefs: evidenceRefs.slice(0, 5), // Top 5 refs
    signalCount,
    sourceDiversity,
    hasDirectLegalSecuritySource,
  };
}

/**
 * Detect conflicts between candidates.
 */
function detectConflicts(candidates: ScoredCandidate[]): {
  hasConflict: boolean;
  conflictCandidates: ScoredCandidate[];
} {
  if (candidates.length < 2) {
    return { hasConflict: false, conflictCandidates: [] };
  }

  const sorted = [...candidates].sort((a, b) => b.supportScore - a.supportScore);
  const winner = sorted[0];
  const runnerUp = sorted[1];

  const scoreGap = winner.supportScore - runnerUp.supportScore;

  // Conflict if gap is within threshold
  if (scoreGap <= SCORING_CONFIG.conflictThreshold) {
    return {
      hasConflict: true,
      conflictCandidates: sorted.filter(
        (c) => winner.supportScore - c.supportScore <= SCORING_CONFIG.conflictThreshold,
      ),
    };
  }

  return { hasConflict: false, conflictCandidates: [] };
}

/**
 * Make evidence-based decision for a single field.
 */
export function makeFieldDecision(
  fieldKey: EvidenceFieldKey,
  fieldEvidence: FieldEvidence | undefined,
  pages: Map<string, CrawlAttempt>,
): FieldDecision {
  // Default for no evidence
  if (!fieldEvidence || fieldEvidence.signals.length === 0) {
    return {
      fieldKey,
      selectedCandidate: {
        value: "unknown",
        supportScore: 0,
        confidenceBand: "uncertain",
        evidenceCoverage: "none",
        reasons: ["No evidence found"],
        evidenceRefs: [],
        signalCount: 0,
        sourceDiversity: 0,
        hasDirectLegalSecuritySource: false,
      },
      allCandidates: [],
      hasConflict: false,
      conflictCandidates: [],
      fieldCoverage: "none",
      canSupportHighConfidence: false,
      decisionSummary: `${fieldKey}: No evidence available`,
    };
  }

  // Assess field coverage
  const coverage = assessFieldCoverage(fieldKey, fieldEvidence);

  // Group signals by candidate
  const signalGroups = groupSignalsByCandidate(fieldEvidence.signals);

  // Score each candidate
  const allCandidates: ScoredCandidate[] = [];
  for (const [value, signals] of signalGroups) {
    const candidate = scoreCandidate(value, signals, pages, coverage.coverage);
    allCandidates.push(candidate);
  }

  // Sort by support score (descending)
  allCandidates.sort((a, b) => b.supportScore - a.supportScore);

  // Detect conflicts
  const { hasConflict, conflictCandidates } = detectConflicts(allCandidates);

  // Select winner
  const selectedCandidate = allCandidates[0] || {
    value: "unknown",
    supportScore: 0,
    confidenceBand: "uncertain",
    evidenceCoverage: coverage.coverage,
    reasons: ["No valid candidates"],
    evidenceRefs: [],
    signalCount: 0,
    sourceDiversity: 0,
    hasDirectLegalSecuritySource: false,
  };

  // Build decision summary
  let summary = `${fieldKey}: ${selectedCandidate.value} `;
  summary += `(support: ${selectedCandidate.supportScore}, `;
  summary += `confidence: ${selectedCandidate.confidenceBand})`;

  if (hasConflict) {
    summary += ` [CONFLICT with ${conflictCandidates.length} other candidate(s)]`;
  }

  if (selectedCandidate.reasons.length > 0) {
    summary += ` - ${selectedCandidate.reasons.join(", ")}`;
  }

  return {
    fieldKey,
    selectedCandidate,
    allCandidates,
    hasConflict,
    conflictCandidates,
    fieldCoverage: coverage.coverage,
    canSupportHighConfidence: coverage.supportsHighConfidence && !hasConflict,
    decisionSummary: summary,
  };
}

/**
 * Score all fields based on evidence.
 */
export function scoreEvidenceBasedDecisions(
  evidenceResult: EvidenceExtractionResult,
  pages: CrawlAttempt[],
): EvidenceScoringResult {
  const fieldDecisions: Partial<Record<EvidenceFieldKey, FieldDecision>> = {};
  const conflictedFields: EvidenceFieldKey[] = [];
  const highConfidenceFields: EvidenceFieldKey[] = [];

  // Build pages map for lookup
  const pagesMap = new Map<string, CrawlAttempt>();
  for (const page of pages) {
    if (page.fetchedUrl) {
      pagesMap.set(page.fetchedUrl, page);
    }
  }

  // Score each field
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
    const decision = makeFieldDecision(fieldKey, fieldEvidence, pagesMap);

    fieldDecisions[fieldKey] = decision;

    if (decision.hasConflict) {
      conflictedFields.push(fieldKey);
    }

    if (decision.canSupportHighConfidence) {
      highConfidenceFields.push(fieldKey);
    }
  }

  // Determine overall confidence
  const confidenceScores: Record<ConfidenceBand, number> = {
    high: 3,
    medium: 2,
    low: 1,
    uncertain: 0,
  };

  const decisions = Object.values(fieldDecisions);
  const avgConfidenceScore =
    decisions.reduce((sum, d) => sum + confidenceScores[d.selectedCandidate.confidenceBand], 0) /
    decisions.length;

  let overallConfidence: ConfidenceBand;
  if (avgConfidenceScore >= 2.5) {
    overallConfidence = "high";
  } else if (avgConfidenceScore >= 1.5) {
    overallConfidence = "medium";
  } else if (avgConfidenceScore >= 0.5) {
    overallConfidence = "low";
  } else {
    overallConfidence = "uncertain";
  }

  // Build summary
  const parts: string[] = [];
  parts.push(`Overall confidence: ${overallConfidence}`);
  parts.push(`${highConfidenceFields.length} fields with high confidence`);

  if (conflictedFields.length > 0) {
    parts.push(`${conflictedFields.length} conflicted fields: ${conflictedFields.join(", ")}`);
  }

  const weakFields = decisions.filter((d) => d.selectedCandidate.confidenceBand === "uncertain");
  if (weakFields.length > 0) {
    parts.push(`${weakFields.length} fields need more evidence`);
  }

  logger.info("evidence-scoring:complete", {
    fieldsScored: decisions.length,
    conflictedFields: conflictedFields.length,
    highConfidenceFields: highConfidenceFields.length,
    overallConfidence,
  });

  return {
    fieldDecisions: fieldDecisions as Record<EvidenceFieldKey, FieldDecision>,
    conflictedFields,
    highConfidenceFields,
    overallConfidence,
    summary: parts.join(" | "),
  };
}

/**
 * Get decision for a specific field.
 */
export function getFieldDecision(
  result: EvidenceScoringResult,
  fieldKey: EvidenceFieldKey,
): FieldDecision | undefined {
  return result.fieldDecisions[fieldKey];
}

/**
 * Check if a field is conflicted.
 */
export function isFieldConflicted(
  result: EvidenceScoringResult,
  fieldKey: EvidenceFieldKey,
): boolean {
  return result.conflictedFields.includes(fieldKey);
}

/**
 * Get human-readable explanation of scoring for a field.
 */
export function explainFieldScoring(decision: FieldDecision): string {
  const lines: string[] = [];

  lines.push(`Field: ${decision.fieldKey}`);
  lines.push(`Selected: ${decision.selectedCandidate.value}`);
  lines.push(`Support Score: ${decision.selectedCandidate.supportScore}/100 (NOT accuracy)`);
  lines.push(`Confidence Band: ${decision.selectedCandidate.confidenceBand}`);
  lines.push(`Evidence Coverage: ${decision.selectedCandidate.evidenceCoverage}`);

  if (decision.selectedCandidate.reasons.length > 0) {
    lines.push(`Reasons:`);
    for (const reason of decision.selectedCandidate.reasons) {
      lines.push(`  - ${reason}`);
    }
  }

  lines.push(`Signals: ${decision.selectedCandidate.signalCount}`);
  lines.push(`Source Diversity: ${decision.selectedCandidate.sourceDiversity} page(s)`);

  if (decision.hasConflict) {
    lines.push(`⚠️ CONFLICT detected with ${decision.conflictCandidates.length} other candidate(s)`);
    for (const conflict of decision.conflictCandidates.slice(1)) {
      lines.push(`  - ${conflict.value} (score: ${conflict.supportScore})`);
    }
  }

  if (decision.selectedCandidate.evidenceRefs.length > 0) {
    lines.push(`Evidence Sources:`);
    for (const ref of decision.selectedCandidate.evidenceRefs.slice(0, 3)) {
      lines.push(`  - ${ref.pageType}: "${ref.snippet.slice(0, 50)}..."`);
    }
  }

  return lines.join("\n");
}
