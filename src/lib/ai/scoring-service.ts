import { logger } from "@/lib/logging/logger";

export interface ScoringInput {
  answerText: string;
  concreteFacts: string[];
  sourceRelevanceScore: number;
  topicName?: string; // D10-EN-03: Contextual check
}

export interface ScoringResult {
  confidenceScore: number; // 0 - 1.0
  isQualityPassed: boolean;
  rejectionRationale?: string;
  metrics: {
    factCount: number;
    textLength: number;
    evidenceStrength: number;
    headerDensity: number;
  };
}

/**
 * D10-EN-02: Local Intelligence Scoring Service.
 * Ensures TrustDesk owns the quality gates and confidence math.
 * Hardened in Turn 29 to enforce high-signal, anti-boilerplate rules.
 */
export class ScoringService {
  private static MIN_FACT_COUNT = 1; // Lowered from 2 to allow single-fact evidence drafts
  private static MIN_TEXT_LENGTH = 60; // Increased from 50

  /**
   * Deterministically evaluates the quality of an AI-generated draft.
   */
  static evaluateQuality(input: ScoringInput): ScoringResult {
    const factCount = input.concreteFacts?.length || 0;
    const lines = input.answerText?.split("\n").filter(l => l.trim().length > 0) || [];
    const textLength = input.answerText?.trim().length || 0;
    
    // 1. Topic Repetition Check (D10-EN-03)
    let isRepetitive = false;
    if (input.topicName) {
        const topicLower = input.topicName.toLowerCase();
        const answerLower = input.answerText.toLowerCase();
        // If the topic name appears too many times relative to length, it's likely filler
        const occurrences = answerLower.split(topicLower).length - 1;
        if (occurrences > 3 && textLength < 300) isRepetitive = true;
    }

    // 2. Header-Density Check (D10-EN-03)
    // If more than 60% of lines end in colons, it's just a set of headers
    const headerLines = lines.filter(l => l.trim().endsWith(":")).length;
    const headerDensity = lines.length > 0 ? headerLines / lines.length : 0;
    const isMostlyHeaders = headerDensity > 0.6 && lines.length > 2;

    // 3. Vague Phrases (Filler)
    const lowerText = input.answerText.toLowerCase();
    const isVague = 
      lowerText.includes("takes security seriously") || 
      lowerText.includes("aligns with internal standards") ||
      lowerText.includes("ensure compliance") ||
      lowerText.includes("regarding access control") ||
      lowerText.includes("we follow industry best practices") ||
      lowerText.includes("intended to support") ||
      lowerText.includes("this policy is designed to");
    
    // 4. Banned Starters
    const isFillerStarted = 
      lowerText.startsWith("regarding") || 
      lowerText.startsWith("to ensure") ||
      lowerText.startsWith("in terms of");

    // 5. Failure Conditions (Aggressive Hard Gating)
    let rejectionRationale: string | undefined;
    
    if (textLength < this.MIN_TEXT_LENGTH) {
        rejectionRationale = "Answer is too short to be a reusable security draft.";
    } else if (isMostlyHeaders) {
        rejectionRationale = "Answer consists mostly of headers/placeholders without descriptive content.";
    } else if (factCount < this.MIN_FACT_COUNT) {
        rejectionRationale = `Insufficient factual density: only ${factCount} concrete facts found.`;
    } else if (isRepetitive) {
        rejectionRationale = "Answer repeats the topic name excessively as filler.";
    } else if (isVague && factCount < 3) {
        rejectionRationale = "Answer contains generic boilerplate without sufficient supporting facts.";
    } else if (isFillerStarted && textLength < 150) {
        rejectionRationale = "Answer leads with conversational filler and lacks substance.";
    }

    const isQualityPassed = !rejectionRationale;

    // --- Hardened Confidence Math (D10-EN-03) ---
    // Start with retrieval quality (similarity)
    let confidenceScore = input.sourceRelevanceScore * 0.5; // Increased from 0.4
    
    // Add density bonus (up to 0.3)
    confidenceScore += Math.min(0.3, factCount * 0.15);
    
    // Length bonus (up to 0.2)
    if (textLength > 200) confidenceScore += 0.2;
    else if (textLength > 100) confidenceScore += 0.1;

    // HARD PENALTIES
    if (isVague) confidenceScore -= 0.3;
    if (isMostlyHeaders) confidenceScore -= 0.4;
    if (isRepetitive) confidenceScore -= 0.3;
    if (!isQualityPassed) confidenceScore *= 0.5; // Halve confidence if it fails the gate

    const result: ScoringResult = {
      confidenceScore: Math.min(1.0, Math.max(0, confidenceScore)),
      isQualityPassed,
      rejectionRationale,
      metrics: {
        factCount,
        textLength,
        evidenceStrength: input.sourceRelevanceScore,
        headerDensity
      }
    };

    logger.info("ai:scoring:complete", { 
      isQualityPassed, 
      confidenceScore: result.confidenceScore,
      factCount,
      rejectionRationale,
      topicName: input.topicName
    });

    return result;
  }
}
