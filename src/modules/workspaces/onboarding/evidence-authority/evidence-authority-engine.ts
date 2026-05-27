import { logger } from "@/lib/logging/logger";
import { EvidenceRef } from "../evidence-scoring";
import { StructuredPageEvidence, EvidenceBlock } from "../evidence";
import { EvidenceAuthorityProfile, AuthorityAwareEvidenceRef, AuthorityTier } from "./evidence-authority-types";
import { getAuthorityConfig } from "./authority-source-registry";

export class EvidenceAuthorityEngine {
  /**
   * Evaluates a single EvidenceRef, optionally scanning page block details to determine authority profiles.
   */
  static evaluate(ref: EvidenceRef, page?: StructuredPageEvidence): EvidenceAuthorityProfile {
    const config = getAuthorityConfig(ref.sourceUrl, ref.pageType);
    
    let authorityScore = config.baseAuthorityScore;
    let confidenceModifier = config.baseConfidenceModifier;
    let extractionQuality = 60; // default medium quality
    let rationale = "";

    // 1. Refine authority based on block type if page is available
    if (page) {
      const matchingBlock = page.blocks.find(b => {
        if (b.kind === "heading-section") {
          return ref.snippet.includes(b.heading) || ref.snippet.includes(b.bodyText);
        }
        if (b.kind === "body-fallback") {
          return ref.snippet.includes(b.text) || b.text.includes(ref.snippet);
        }
        if (b.kind === "meta") {
          return b.metaDescription?.includes(ref.snippet) || b.ogDescription?.includes(ref.snippet);
        }
        return false;
      });

      if (matchingBlock) {
        if (matchingBlock.kind === "json-ld") {
          authorityScore = Math.min(100, authorityScore + 5);
          extractionQuality = 95;
        } else if (matchingBlock.kind === "heading-section") {
          extractionQuality = 85;
        } else if (matchingBlock.kind === "meta") {
          extractionQuality = 70;
        } else if (matchingBlock.kind === "body-fallback") {
          authorityScore = Math.max(20, authorityScore - 5);
          extractionQuality = 50;
        }
      }
    } else {
      // Infers extraction quality from strength field
      if (ref.strength === "strong") {
        extractionQuality = 85;
      } else if (ref.strength === "medium") {
        extractionQuality = 70;
      } else {
        extractionQuality = 45;
      }
    }

    // 2. Assess Freshness Score
    // Scans text for dates (e.g. 2026, 2025, 2024, 2023) or keywords
    let freshnessScore = 85; // default fallback
    const lowerText = ref.snippet.toLowerCase();
    
    if (lowerText.includes("2026") || lowerText.includes("2025") || lowerText.includes("last updated") || lowerText.includes("current as of")) {
      freshnessScore = 95;
    } else if (lowerText.includes("2024")) {
      freshnessScore = 80;
    } else if (lowerText.includes("2023") || lowerText.includes("outdated") || lowerUrlIncludesOutdated(ref.sourceUrl)) {
      freshnessScore = 45;
    }

    // 3. Assess Contradiction Risk
    // Scans snippet for negative or transient cues
    let contradictionRisk = 5;
    const transientKeywords = [
      "not supported", "does not support", "no support", "coming soon", "in preview",
      "planned", "under development", "roadmap", "deprecated", "legacy only", "not yet"
    ];

    for (const kw of transientKeywords) {
      if (lowerText.includes(kw)) {
        contradictionRisk = 80;
        confidenceModifier = Math.max(0.2, confidenceModifier - 0.5);
        break;
      }
    }

    rationale = `Evaluated authority for source type '${config.sourceType}' (Tier: ${config.tier.toUpperCase()}). Authority Score: ${authorityScore}, Quality: ${extractionQuality}, Freshness: ${freshnessScore}, Contradiction Risk: ${contradictionRisk}.`;

    return {
      authorityScore,
      freshnessScore,
      contradictionRisk,
      confidenceModifier,
      sourceType: config.sourceType,
      extractionQuality,
      rationale,
    };
  }

  /**
   * Maps a raw list of EvidenceRefs to AuthorityAwareEvidenceRefs by resolving page matching.
   */
  static evaluateRefList(
    refs: EvidenceRef[],
    pages: StructuredPageEvidence[] = []
  ): AuthorityAwareEvidenceRef[] {
    return refs.map(ref => {
      const page = pages.find(p => p.url === ref.sourceUrl);
      const authority = this.evaluate(ref, page);
      return {
        ...ref,
        authority,
      };
    });
  }

  /**
   * Adjusts a confidence score dynamically based on the authority of its supporting evidence.
   */
  static adjustConfidence(
    rawConfidence: number,
    refs: AuthorityAwareEvidenceRef[]
  ): number {
    if (!refs || refs.length === 0) {
      return rawConfidence;
    }

    let maxScore = 0;
    let hasVeryHigh = false;
    let hasHigh = false;
    let hasMedium = false;
    let hasLow = false;
    let maxContradictionRisk = 0;
    let totalModifier = 0;

    for (const ref of refs) {
      const auth = ref.authority || this.evaluate(ref);
      maxScore = Math.max(maxScore, auth.authorityScore);
      maxContradictionRisk = Math.max(maxContradictionRisk, auth.contradictionRisk);
      totalModifier += auth.confidenceModifier;

      if (auth.authorityScore >= 90) hasVeryHigh = true;
      else if (auth.authorityScore >= 80) hasHigh = true;
      else if (auth.authorityScore >= 60) hasMedium = true;
      else hasLow = true;
    }

    const avgModifier = totalModifier / refs.length;
    let adjusted = rawConfidence;

    // 1. Apply multiplier adjustments based on the best tier present
    if (hasVeryHigh) {
      // Very High Authority (e.g. Trust Center, SOC) boosts confidence
      adjusted = adjusted * 1.15;
    } else if (hasHigh) {
      // High Authority (e.g. Docs) keeps score high
      adjusted = adjusted * 1.02;
    } else if (hasMedium) {
      // Medium Authority (e.g. Product Page) scales down slightly
      adjusted = adjusted * 0.85;
    } else if (hasLow) {
      // Low Authority (e.g. Blog/Marketing only) significantly discounts confidence
      adjusted = adjusted * 0.60;
    }

    // 2. Adjust using the average confidence modifier
    adjusted = adjusted * avgModifier;

    // 3. Contradiction risk penalty
    if (maxContradictionRisk >= 60) {
      adjusted = adjusted - 0.20;
    }

    // Clamp values inside secure bounds
    return Math.max(0.10, Math.min(0.98, adjusted));
  }

  /**
   * Summarizes all conflicting/contradictory signals inside a ref list.
   */
  static detectContradictions(refs: AuthorityAwareEvidenceRef[]): {
    hasContradiction: boolean;
    riskScore: number;
    details: string[];
  } {
    const details: string[] = [];
    let highestRisk = 0;

    for (const ref of refs) {
      const auth = ref.authority || this.evaluate(ref);
      highestRisk = Math.max(highestRisk, auth.contradictionRisk);

      if (auth.contradictionRisk >= 60) {
        details.push(`High contradiction risk detected at ${ref.sourceUrl}: "${ref.snippet.slice(0, 80)}..."`);
      }
    }

    return {
      hasContradiction: highestRisk >= 60,
      riskScore: highestRisk,
      details,
    };
  }
}

function lowerUrlIncludesOutdated(url: string): boolean {
  const l = url.toLowerCase();
  return l.includes("/v1/archive") || l.includes("/deprecated") || l.includes("/legacy");
}
