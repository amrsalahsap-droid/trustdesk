/**
 * Evidence-Based Decision Engine for TrustDesk
 * 
 * Computes supportScore, evidenceCoverage, confidenceBand, and conflict state
 * from extracted evidence signals to make deterministic, explainable decisions.
 */

import type { EvidenceSignal, ExtractedSignals } from "./evidence-signal-extractor";

/**
 * Confidence bands for evidence-based decisions
 */
export type ConfidenceBand = 
  | "high" 
  | "medium" 
  | "limited" 
  | "conflicted" 
  | "unknown";

/**
 * Evidence reference for traceability
 */
export interface EvidenceReference {
  fieldKey: string;
  candidateValue: string;
  sourceUrl: string;
  pageType: string;
  snippet: string;
  signalType: string;
  strength: string;
  confidenceScore: number;
}

/**
 * Conflicting signal information
 */
export interface ConflictingSignal {
  candidateValue: string;
  supportScore: number;
  conflictingEvidence: EvidenceReference[];
}

/**
 * Evidence-based decision candidate
 */
export interface EvidenceBasedCandidate {
  /** Candidate value */
  value: string;
  /** Original LLM confidence (kept for reference) */
  aiConfidence: number;
  /** Evidence-based support score (0-100) */
  supportScore: number;
  /** Confidence band based on evidence */
  confidenceBand: ConfidenceBand;
  /** Evidence coverage percentage (0-100) */
  evidenceCoverage: number;
  /** Reasons for this decision */
  reasons: string[];
  /** Evidence references supporting this decision */
  evidenceRefs: EvidenceReference[];
  /** Conflicting signals that reduce clarity */
  conflictingSignals: ConflictingSignal[];
}

/**
 * Field-specific decision with evidence-based scoring
 */
export interface EvidenceBasedDecision {
  /** Field being decided */
  fieldKey: string;
  /** All candidates with evidence-based scoring */
  candidates: EvidenceBasedCandidate[];
  /** Top selected candidate */
  topCandidate?: EvidenceBasedCandidate;
  /** Overall decision confidence */
  overallConfidence: ConfidenceBand;
  /** Is this decision conflicted? */
  isConflicted: boolean;
}

/**
 * Page type importance weights for evidence scoring
 */
const PAGE_TYPE_WEIGHTS: Record<string, number> = {
  homepage: 1.0,
  product: 1.2,
  platform: 1.2,
  security: 1.5,
  privacy: 1.5,
  legal: 1.4,
  compliance: 1.5,
  trust: 1.4,
  dpa: 1.4,
  about: 1.1,
  company: 1.1,
  pricing: 1.0,
  customers: 1.2,
  case_study: 1.2,
  integrations: 1.1,
  docs: 0.8,
  unknown: 0.5,
};

/**
 * Signal strength weights for evidence scoring
 */
const SIGNAL_STRENGTH_WEIGHTS: Record<string, number> = {
  high: 1.5,
  medium: 1.0,
  low: 0.5,
};

/**
 * Signal type weights for evidence scoring
 */
const SIGNAL_TYPE_WEIGHTS: Record<string, number> = {
  direct_quote: 2.0,
  product_language: 1.8,
  compliance_language: 1.7,
  security_language: 1.6,
  industry_language: 1.5,
  customer_language: 1.3,
  business_model_language: 1.4,
  integration_language: 1.2,
};

/**
 * Compute evidence-based decisions for all fields
 */
export function computeEvidenceBasedDecisions(
  extractedSignals: ExtractedSignals,
  llmCandidates?: Record<string, Array<{ value: string; aiConfidence: number }>>
): Record<string, EvidenceBasedDecision> {
  const decisions: Record<string, EvidenceBasedDecision> = {};

  // Process each field
  const fields: (keyof ExtractedSignals)[] = [
    "industry",
    "businessModel",
    "customerIndustries",
    "complianceFocus",
    "securityPosture",
    "dataHandling",
    "integrations",
  ];

  for (const field of fields) {
    const fieldSignals = getFieldSignals(extractedSignals, field);
    const fieldLlmCandidates = llmCandidates?.[field] || [];
    
    decisions[field] = computeFieldDecision(field, fieldSignals, fieldLlmCandidates);
  }

  return decisions;
}

/**
 * Get signals for a specific field
 */
function getFieldSignals(signals: ExtractedSignals, field: keyof ExtractedSignals): EvidenceSignal[] {
  const fieldSignals = signals[field];
  
  if (Array.isArray(fieldSignals)) {
    return fieldSignals;
  }
  
  if (fieldSignals && typeof fieldSignals === 'object') {
    return [fieldSignals as EvidenceSignal];
  }
  
  return [];
}

/**
 * Compute evidence-based decision for a specific field
 */
function computeFieldDecision(
  fieldKey: string,
  signals: EvidenceSignal[],
  llmCandidates: Array<{ value: string; aiConfidence: number }> = []
): EvidenceBasedDecision {
  // Group signals by candidate value
  const signalsByValue = groupSignalsByValue(signals);
  
  // Generate candidates from both evidence and LLM
  const allValues = new Set([
    ...Object.keys(signalsByValue),
    ...llmCandidates.map(c => c.value)
  ]);
  
  const candidates: EvidenceBasedCandidate[] = [];
  
  for (const value of allValues) {
    const valueSignals = signalsByValue[value] || [];
    const llmCandidate = llmCandidates.find(c => c.value === value);
    
    const candidate = computeCandidateScore(
      fieldKey,
      value,
      valueSignals,
      llmCandidate?.aiConfidence || 0
    );
    
    candidates.push(candidate);
  }
  
  // Sort candidates by support score
  candidates.sort((a, b) => b.supportScore - a.supportScore);
  
  // Determine conflicts
  const conflictedCandidates = detectConflicts(candidates);
  
  // Set confidence bands
  candidates.forEach(candidate => {
    candidate.confidenceBand = computeConfidenceBand(candidate, conflictedCandidates);
    candidate.conflictingSignals = conflictedCandidates
      .filter(conflict => conflict.candidateValue !== candidate.value)
      .map(conflict => ({
        candidateValue: conflict.candidateValue,
        supportScore: conflict.supportScore,
        conflictingEvidence: conflict.evidenceRefs,
      }));
  });
  
  const topCandidate = candidates[0];
  const overallConfidence = topCandidate?.confidenceBand || "unknown";
  const isConflicted = overallConfidence === "conflicted";
  
  return {
    fieldKey,
    candidates,
    topCandidate,
    overallConfidence,
    isConflicted,
  };
}

/**
 * Group signals by candidate value
 */
function groupSignalsByValue(signals: EvidenceSignal[]): Record<string, EvidenceSignal[]> {
  const grouped: Record<string, EvidenceSignal[]> = {};
  
  for (const signal of signals) {
    if (!grouped[signal.candidateValue]) {
      grouped[signal.candidateValue] = [];
    }
    grouped[signal.candidateValue].push(signal);
  }
  
  return grouped;
}

/**
 * Compute support score for a specific candidate
 */
function computeCandidateScore(
  fieldKey: string,
  value: string,
  signals: EvidenceSignal[],
  aiConfidence: number
): EvidenceBasedCandidate {
  if (signals.length === 0) {
    // No evidence - use LLM confidence only
    return {
      value,
      aiConfidence,
      supportScore: Math.round(aiConfidence * 0.3), // Heavily discount LLM-only
      confidenceBand: "limited",
      evidenceCoverage: 0,
      reasons: ["No direct evidence found, relying on LLM inference"],
      evidenceRefs: [],
      conflictingSignals: [],
    };
  }
  
  // Calculate evidence-based support score
  let totalScore = 0;
  let maxPossibleScore = 0;
  const evidenceRefs: EvidenceReference[] = [];
  const reasons: string[] = [];
  
  // Group signals by source page to avoid double-counting
  const signalsByUrl = groupSignalsByUrl(signals);
  
  for (const [url, pageSignals] of Object.entries(signalsByUrl)) {
    let pageScore = 0;
    let pageMaxScore = 0;
    
    for (const signal of pageSignals) {
      // Calculate weighted score for this signal
      const pageTypeWeight = PAGE_TYPE_WEIGHTS[signal.pageType] || 1.0;
      const strengthWeight = SIGNAL_STRENGTH_WEIGHTS[signal.strength] || 1.0;
      const typeWeight = SIGNAL_TYPE_WEIGHTS[signal.signalType] || 1.0;
      
      const signalScore = signal.confidenceScore * pageTypeWeight * strengthWeight * typeWeight;
      const signalMaxScore = 100 * pageTypeWeight * strengthWeight * typeWeight;
      
      pageScore += signalScore;
      pageMaxScore += signalMaxScore;
      
      evidenceRefs.push({
        fieldKey,
        candidateValue: value,
        sourceUrl: signal.sourceUrl,
        pageType: signal.pageType,
        snippet: signal.snippet,
        signalType: signal.signalType,
        strength: signal.strength,
        confidenceScore: signal.confidenceScore,
      });
    }
    
    // Boost score for multiple signals on same page
    if (pageSignals.length > 1) {
      pageScore *= 1.2; // 20% boost for multiple corroborating signals
      pageMaxScore *= 1.2;
    }
    
    totalScore += pageScore;
    maxPossibleScore += pageMaxScore;
  }
  
  // Normalize to 0-100 scale
  const evidenceScore = maxPossibleScore > 0 ? (totalScore / maxPossibleScore) * 100 : 0;
  
  // Boost for signals across multiple pages
  const uniquePages = Object.keys(signalsByUrl).length;
  const multiPageBoost = uniquePages > 1 ? 1.1 : 1.0; // 10% boost for multi-page evidence
  
  const finalScore = Math.min(100, evidenceScore * multiPageBoost);
  
  // Calculate evidence coverage
  const evidenceCoverage = calculateEvidenceCoverage(signals);
  
  // Generate reasons
  if (signals.some(s => s.signalType === "direct_quote")) {
    reasons.push("Direct quotes found");
  }
  if (signals.some(s => PAGE_TYPE_WEIGHTS[s.pageType] >= 1.4)) {
    reasons.push("High-value source pages");
  }
  if (uniquePages > 1) {
    reasons.push("Evidence across multiple pages");
  }
  if (signals.some(s => s.strength === "high")) {
    reasons.push("Strong signal strength");
  }
  
  return {
    value,
    aiConfidence,
    supportScore: Math.round(finalScore),
    confidenceBand: "medium", // Will be recalculated after conflict detection
    evidenceCoverage,
    reasons,
    evidenceRefs,
    conflictingSignals: [],
  };
}

/**
 * Group signals by URL for page-level analysis
 */
function groupSignalsByUrl(signals: EvidenceSignal[]): Record<string, EvidenceSignal[]> {
  const grouped: Record<string, EvidenceSignal[]> = {};
  
  for (const signal of signals) {
    if (!grouped[signal.sourceUrl]) {
      grouped[signal.sourceUrl] = [];
    }
    grouped[signal.sourceUrl].push(signal);
  }
  
  return grouped;
}

/**
 * Calculate evidence coverage percentage
 */
function calculateEvidenceCoverage(signals: EvidenceSignal[]): number {
  if (signals.length === 0) return 0;
  
  // Coverage based on signal strength and confidence
  let totalCoverage = 0;
  let maxPossibleCoverage = 0;
  
  for (const signal of signals) {
    const strengthMultiplier = SIGNAL_STRENGTH_WEIGHTS[signal.strength] || 1.0;
    const coverage = signal.confidenceScore * strengthMultiplier;
    const maxCoverage = 100 * strengthMultiplier;
    
    totalCoverage += coverage;
    maxPossibleCoverage += maxCoverage;
  }
  
  return maxPossibleCoverage > 0 ? Math.round((totalCoverage / maxPossibleCoverage) * 100) : 0;
}

/**
 * Detect conflicts between close candidates
 */
function detectConflicts(candidates: EvidenceBasedCandidate[]): EvidenceBasedCandidate[] {
  if (candidates.length < 2) return candidates;
  
  const topCandidate = candidates[0];
  const secondCandidate = candidates[1];
  
  // Check if top two candidates are within 15 points
  if (topCandidate.supportScore - secondCandidate.supportScore <= 15) {
    // Mark both as conflicted
    topCandidate.confidenceBand = "conflicted";
    secondCandidate.confidenceBand = "conflicted";
    
    // Also mark any other candidates within 15 points of the top
    for (let i = 2; i < candidates.length; i++) {
      if (topCandidate.supportScore - candidates[i].supportScore <= 15) {
        candidates[i].confidenceBand = "conflicted";
      } else {
        break;
      }
    }
  }
  
  return candidates;
}

/**
 * Compute confidence band for a candidate
 */
function computeConfidenceBand(
  candidate: EvidenceBasedCandidate,
  conflictedCandidates: EvidenceBasedCandidate[]
): ConfidenceBand {
  // If already marked as conflicted
  if (candidate.confidenceBand === "conflicted") {
    return "conflicted";
  }
  
  const { supportScore, evidenceCoverage } = candidate;
  
  // High confidence: strong evidence and good coverage
  if (supportScore >= 80 && evidenceCoverage >= 70) {
    return "high";
  }
  
  // Medium confidence: moderate evidence
  if (supportScore >= 60 && evidenceCoverage >= 50) {
    return "medium";
  }
  
  // Limited confidence: weak evidence
  if (supportScore >= 30 && evidenceCoverage >= 30) {
    return "limited";
  }
  
  // Unknown: very weak or no evidence
  return "unknown";
}

/**
 * Get top candidate for a field (convenience function)
 */
export function getTopCandidate(
  decisions: Record<string, EvidenceBasedDecision>,
  fieldKey: string
): EvidenceBasedCandidate | undefined {
  return decisions[fieldKey]?.topCandidate;
}

/**
 * Get all high-confidence decisions
 */
export function getHighConfidenceDecisions(
  decisions: Record<string, EvidenceBasedDecision>
): Record<string, EvidenceBasedDecision> {
  const result: Record<string, EvidenceBasedDecision> = {};
  
  for (const [field, decision] of Object.entries(decisions)) {
    if (decision.overallConfidence === "high" && !decision.isConflicted) {
      result[field] = decision;
    }
  }
  
  return result;
}

/**
 * Get conflicted decisions that need human review
 */
export function getConflictedDecisions(
  decisions: Record<string, EvidenceBasedDecision>
): Record<string, EvidenceBasedDecision> {
  const result: Record<string, EvidenceBasedDecision> = {};
  
  for (const [field, decision] of Object.entries(decisions)) {
    if (decision.isConflicted) {
      result[field] = decision;
    }
  }
  
  return result;
}
