import type {
  Recommendation,
  RecommendationTrigger,
  RecommendationCitation,
  SupportingSignal,
  SuppressingSignal,
  ScoringContext,
} from "./recommendation-metadata";
import { findCanonicalCapability } from "./capability-registry";

interface TriggerScoreResult {
  trigger: RecommendationTrigger;
  fired: boolean;
  matchedValue?: string | string[];
  actualConfidence: number;
  contribution: number;
  reason: string;
}

export class TrustRecommendationScorer {
  private context: ScoringContext;

  constructor(context: ScoringContext) {
    this.context = context;
  }

  calculateScore(recommendation: any): any {
    const triggerResults = this.scoreTriggers(recommendation.triggers);
    const firedTriggers = triggerResults
      .filter(r => r.fired)
      .map(r => ({ trigger: r.trigger, matchedValue: r.matchedValue!, actualConfidence: r.actualConfidence }));
    const supportingSignals = this.buildSupportingSignals(triggerResults);
    const suppressors = this.checkSuppressors();

    let suppressionFactor = 1.0;
    for (const suppressor of suppressors) {
      if (suppressor.effect === "blocks_completely") {
        suppressionFactor = 0;
        break;
      }
      if (suppressor.effect === "reduces_score" && suppressor.reduction) {
        suppressionFactor -= suppressor.reduction;
      }
      if (suppressor.effect === "deprioritizes") suppressionFactor *= 0.7;
    }
    suppressionFactor = Math.max(0, Math.min(1, suppressionFactor));

    if (firedTriggers.length === 0 || suppressionFactor === 0) {
      return {
        score: 0,
        confidence: 0,
        confidenceBand: "low",
        evidenceStrength: "missing",
        needsReview: true,
        missingEvidence: ["No supporting onboarding evidence detected for this recommendation."],
        supportingSignals,
        firedTriggers,
        suppressors,
        scoreBreakdown: {
          baseScore: 0,
          signalScore: 0,
          citationBoost: 0,
          pageTypeBoost: 0,
          confidenceWeight: 0,
          conflictPenalty: 0,
          weakEvidencePenalty: 0,
          evidenceQualityMultiplier: 0,
          complianceBoost: 0,
          enterpriseBoost: 0,
          sensitiveDataBoost: 0,
          finalScore: 0,
        },
      };
    }

    const baseRaw = triggerResults.filter(r => r.fired).reduce((sum, r) => sum + r.contribution, 0);
    const baseScore = Math.min(1, baseRaw) * 30;
    const signalScore = this.calculateSignalScore(supportingSignals);
    const citationBoost = this.calculateCitationBoost(supportingSignals);
    const pageTypeBoost = this.calculatePageTypeBoost(supportingSignals);
    const confidenceWeight = this.calculateConfidenceWeight(supportingSignals);
    const conflictPenalty = this.calculateConflictPenalty(supportingSignals);
    const weakEvidencePenalty = this.calculateWeakEvidencePenalty(supportingSignals);
    const evidenceQualityMultiplier = 0.6 + (Math.max(0, Math.min(1, this.context.evidenceQuality)) * 0.4);
    const complianceBoost = this.context.profile.complianceSignals.length > 0 ? 12 : 0;
    const enterpriseBoost = this.hasEnterpriseSignal() ? 10 : 0;
    const sensitiveDataBoost = this.hasSensitiveDataSignal() ? 10 : 0;

    const prePenalty =
      baseScore +
      signalScore +
      citationBoost +
      pageTypeBoost +
      complianceBoost +
      enterpriseBoost +
      sensitiveDataBoost;
    const penalized = prePenalty - conflictPenalty - weakEvidencePenalty;
    const score = Math.max(0, Math.min(100, penalized * confidenceWeight * evidenceQualityMultiplier * suppressionFactor));
    const confidence = this.calculateOverallConfidence(supportingSignals, firedTriggers.length);
    const confidenceBand = this.getConfidenceBand(score);
    const evidenceStrength = this.getEvidenceStrength(supportingSignals, confidenceBand);
    const needsReview =
      evidenceStrength === "limited" ||
      evidenceStrength === "missing" ||
      confidenceBand === "limited" ||
      confidenceBand === "low" ||
      supportingSignals.some(s => this.context.signals[s.field]?.hasConflict);
    const missingEvidence = this.getMissingEvidenceHints(recommendation, supportingSignals, evidenceStrength);

    return {
      score,
      confidence,
      confidenceBand,
      evidenceStrength,
      needsReview,
      missingEvidence,
      supportingSignals,
      firedTriggers,
      suppressors,
      scoreBreakdown: {
        baseScore,
        signalScore,
        citationBoost,
        pageTypeBoost,
        confidenceWeight,
        conflictPenalty,
        weakEvidencePenalty,
        evidenceQualityMultiplier,
        complianceBoost,
        enterpriseBoost,
        sensitiveDataBoost,
        finalScore: score,
      },
    };
  }

  private scoreTriggers(triggers: RecommendationTrigger[]): TriggerScoreResult[] {
    return triggers.map(trigger => this.scoreSingleTrigger(trigger));
  }

  private scoreSingleTrigger(trigger: RecommendationTrigger): TriggerScoreResult {
    if (trigger.operator === "capability_match") {
      const capabilities = this.context.profile.structuredCapabilities || [];
      const expectedValues = Array.isArray(trigger.value) ? trigger.value : (typeof trigger.value === "string" ? [trigger.value] : []);
      const matchedCaps = capabilities.filter(c => {
        const canonical = findCanonicalCapability(c.key) || findCanonicalCapability(c.label);
        const canonicalKey = canonical?.key || c.key.toLowerCase();
        return expectedValues.some(v => 
          canonicalKey === v.toLowerCase() ||
          c.key.toLowerCase() === v.toLowerCase() || 
          c.label.toLowerCase().includes(v.toLowerCase()) ||
          (canonical && canonical.aliases.some(a => a.toLowerCase() === v.toLowerCase()))
        );
      });
      if (matchedCaps.length === 0) return { trigger, fired: false, actualConfidence: 0, contribution: 0, reason: "No matching capability found" };
      const bestCap = matchedCaps.reduce((best, curr) => curr.confidence > best.confidence ? curr : best, matchedCaps[0]);
      const maxConfidence = bestCap.confidence;
      const strength = bestCap.evidenceStrength;
      let shouldAutoRecommend = false;
      let shouldReviewSuggest = false;
      if (strength === "authoritative" && maxConfidence >= 0.70) shouldAutoRecommend = true;
      else if (strength === "strong" && maxConfidence >= 0.80) shouldAutoRecommend = true;
      else if (maxConfidence >= 0.90 && strength !== "weak") shouldAutoRecommend = true;
      else if (maxConfidence >= 0.60 && strength !== "weak") shouldReviewSuggest = true;
      else if (maxConfidence >= 0.85 && strength === "weak") shouldReviewSuggest = true;
      if (!shouldAutoRecommend && !shouldReviewSuggest) return { trigger, fired: false, actualConfidence: maxConfidence, contribution: 0, reason: "Evidence too low" };
      return {
        trigger,
        fired: true,
        matchedValue: bestCap.label,
        actualConfidence: shouldAutoRecommend ? maxConfidence : (maxConfidence * 0.7),
        contribution: trigger.scoreContribution * Math.pow(maxConfidence, 1.2) * (strength === "authoritative" ? 1.2 : strength === "weak" ? 0.5 : 1.0),
        reason: `Triggered by ${bestCap.label}`,
        capability: bestCap as any,
      };
    }

    if (trigger.operator === "procurement_risk_match") {
      const riskAreas = this.context.profile.procurementRiskAreas || [];
      const expectedValues = Array.isArray(trigger.value) ? trigger.value : (typeof trigger.value === "string" ? [trigger.value] : []);
      const matchedArea = riskAreas.find(a => expectedValues.some(v => a.key.toLowerCase() === v.toLowerCase()));
      if (!matchedArea) return { trigger, fired: false, actualConfidence: 0, contribution: 0, reason: "No matching risk area" };
      return {
        trigger,
        fired: true,
        matchedValue: matchedArea.key,
        actualConfidence: matchedArea.confidence,
        contribution: trigger.scoreContribution * Math.pow(matchedArea.confidence, 1.2),
        reason: `Risk area detected: ${matchedArea.key}`,
        riskArea: matchedArea as any,
      };
    }

    if (trigger.operator === "data_interaction_match") {
      const dataInteraction = this.context.profile.dataInteractionModel || {};
      const expectedValues = Array.isArray(trigger.value) ? trigger.value : (typeof trigger.value === "string" ? [trigger.value] : []);
      const matchedFields = expectedValues.filter(v => (dataInteraction as any)[v] === true);
      if (matchedFields.length === 0) return { trigger, fired: false, actualConfidence: 0, contribution: 0, reason: "No matching interaction" };
      return {
        trigger,
        fired: true,
        matchedValue: matchedFields,
        actualConfidence: 1.0, 
        contribution: trigger.scoreContribution,
        reason: `Triggered by data interaction: ${matchedFields.join(", ")}`,
      };
    }

    const signal = this.context.signals[trigger.field];
    if (!signal) return { trigger, fired: false, actualConfidence: 0, contribution: 0, reason: "Field not found" };
    const { matches, matchedValue } = this.evaluateOperator(trigger.operator, trigger.value, signal.value);
    if (!matches) return { trigger, fired: false, actualConfidence: signal.confidence, contribution: 0, reason: "Operator mismatch" };

    return {
      trigger,
      fired: true,
      matchedValue,
      actualConfidence: signal.confidence,
      contribution: trigger.scoreContribution * Math.pow(signal.confidence, 1.2),
      reason: trigger.description,
    };
  }

  private evaluateOperator(
    operator: string,
    expected: any,
    actual: string[],
  ): { matches: boolean; matchedValue: string | string[] } {
    switch (operator) {
      case "not_empty":
        return { matches: actual.length > 0, matchedValue: actual };
      case "contains":
        if (typeof expected !== "string") return { matches: false, matchedValue: actual };
        return {
          matches: actual.some(v => v.toLowerCase().includes(expected.toLowerCase())),
          matchedValue: actual.find(v => v.toLowerCase().includes(expected.toLowerCase())) ?? actual,
        };
      case "equals":
        if (typeof expected !== "string") return { matches: false, matchedValue: actual };
        return { matches: actual.some(v => v.toLowerCase() === expected.toLowerCase()), matchedValue: expected };
      case "any_of":
        if (!Array.isArray(expected)) return { matches: false, matchedValue: actual };
        return {
          matches: actual.some(v => expected.some(e => e.toLowerCase() === v.toLowerCase())),
          matchedValue: actual.filter(v => expected.some(e => e.toLowerCase() === v.toLowerCase())),
        };
      case "all_of":
        if (!Array.isArray(expected)) return { matches: false, matchedValue: actual };
        return { matches: expected.every(e => actual.some(v => v.toLowerCase() === e.toLowerCase())), matchedValue: actual };
      case "regex":
        if (!(expected instanceof RegExp)) return { matches: false, matchedValue: actual };
        return { matches: actual.some(v => expected.test(v)), matchedValue: actual.find(v => expected.test(v)) ?? actual };
      default:
        return { matches: false, matchedValue: actual };
    }
  }

  private buildSupportingSignals(triggerResults: TriggerScoreResult[]): SupportingSignal[] {
    const out: SupportingSignal[] = [];
    for (const result of triggerResults) {
      if (!result.fired || !result.matchedValue) continue;
      const triggerField = result.trigger.field;
      const signal = this.context.signals[triggerField];
      if (triggerField === "structuredCapabilities" && (result as any).capability) {
        const cap = (result as any).capability;
        out.push({
          field: triggerField,
          value: result.matchedValue,
          category: "OBSERVED",
          confidence: result.actualConfidence,
          contribution: result.contribution,
          reason: result.trigger.description,
          citations: [{
            pageUrl: cap.sourceUrl,
            pageType: cap.pageType as any,
            evidenceKind: "capability" as any,
            excerpt: cap.snippet
          }],
        });
        continue;
      }
      if (triggerField === "procurementRiskAreas" && (result as any).riskArea) {
        const area = (result as any).riskArea;
        out.push({
          field: triggerField,
          value: result.matchedValue,
          category: "DERIVED",
          confidence: result.actualConfidence,
          contribution: result.contribution,
          reason: result.reason,
          citations: area.evidenceRefs.map((url: string) => ({
            pageUrl: url,
            pageType: "unknown" as any,
            evidenceKind: "risk_area" as any,
            excerpt: area.reason
          })),
        });
        continue;
      }
      if (!signal) continue;
      out.push({
        field: triggerField,
        value: result.matchedValue,
        category: signal.category,
        confidence: result.actualConfidence,
        contribution: result.contribution,
        reason: result.trigger.description,
        citations: signal.citations,
      });
    }
    return out;
  }

  private calculateSignalScore(signals: SupportingSignal[]): number {
    return signals.reduce((sum, signal) => {
      if (signal.category === "OBSERVED") return sum + 30;
      if (signal.category === "DERIVED") return sum + 18;
      if (signal.category === "HYPOTHESIZED") return sum + 8;
      return sum;
    }, 0);
  }

  private calculateConfidenceWeight(signals: SupportingSignal[]): number {
    if (signals.length === 0) return 0.35;
    const avg = signals.reduce((sum, s) => sum + s.confidence, 0) / signals.length;
    return 0.35 + (avg * 0.65);
  }

  private calculateCitationBoost(signals: SupportingSignal[]): number {
    const citations = signals.flatMap(s => s.citations ?? []);
    if (citations.length === 0) return 0;
    const unique = new Set(citations.map(c => `${c.pageUrl}:${c.evidenceKind}`));
    return 10 + Math.min(Math.max(0, unique.size - 1) * 5, 20);
  }

  private calculatePageTypeBoost(signals: SupportingSignal[]): number {
    const keywords = ["security", "trust", "compliance", "privacy", "legal", "dpa", "product", "platform", "solutions"];
    const citations = signals.flatMap(s => s.citations ?? []);
    const hits = citations.filter(c => {
      const pageType = String(c.pageType || "").toLowerCase();
      const url = c.pageUrl.toLowerCase();
      return keywords.some(k => pageType.includes(k) || url.includes(k));
    }).length;
    return Math.min(hits * 8, 24);
  }

  private calculateConflictPenalty(signals: SupportingSignal[]): number {
    return signals.some(s => this.context.signals[s.field]?.hasConflict) ? 15 : 0;
  }

  private calculateWeakEvidencePenalty(signals: SupportingSignal[]): number {
    if (signals.length === 0) return 10;
    const avg = signals.reduce((sum, s) => sum + s.confidence, 0) / signals.length;
    return avg < 0.45 || this.context.evidenceQuality < 0.45 || this.context.groundedSignalCount < 2 ? 10 : 0;
  }

  private hasEnterpriseSignal(): boolean {
    return [...this.context.profile.customerSegment, ...this.context.profile.productType]
      .map(v => v.toLowerCase())
      .some(v => v.includes("b2b") || v.includes("enterprise"));
  }

  private hasSensitiveDataSignal(): boolean {
    return this.context.profile.dataTypes
      .map(v => v.toLowerCase())
      .some(v => ["pii", "phi", "personal_data", "sensitive", "financial"].includes(v));
  }

  private checkSuppressors(): SuppressingSignal[] {
    const suppressors: SuppressingSignal[] = [];
    for (const [field, signal] of Object.entries(this.context.signals)) {
      const values = Array.isArray(signal.value) ? signal.value : [signal.value];
      if (values.some(v => typeof v === 'string' && ["complete", "done"].includes(v.toLowerCase()))) {
        suppressors.push({
          field,
          value: signal.value,
          effect: "reduces_score",
          reduction: 0.5,
          reason: "Evidence suggests satisfied",
        });
      }
    }
    return suppressors;
  }

  private calculateOverallConfidence(signals: SupportingSignal[], firedTriggerCount: number): number {
    if (signals.length === 0) return 0.15;
    const avgSignalConfidence = signals.reduce((sum, s) => sum + s.confidence, 0) / signals.length;
    const grounded = Math.min(1, this.context.groundedSignalCount / 6);
    const triggerCoverage = Math.min(1, firedTriggerCount / 3);
    return Math.min(1, (avgSignalConfidence * 0.5) + (grounded * 0.2) + (this.context.evidenceQuality * 0.2) + (triggerCoverage * 0.1));
  }

  private getConfidenceBand(score: number): any {
    if (score >= 80) return "high";
    if (score >= 60) return "medium";
    if (score >= 40) return "limited";
    return "low";
  }

  private getEvidenceStrength(supportingSignals: SupportingSignal[], confidenceBand: any): any {
    if (supportingSignals.length === 0) return "missing";
    const observedCount = supportingSignals.filter(s => s.category === "OBSERVED").length;
    const citationCount = supportingSignals.reduce((sum, s) => sum + (s.citations?.length ?? 0), 0);
    if (observedCount >= 1 && citationCount >= 2) return "strong";
    if (citationCount >= 1 || supportingSignals.filter(s => s.category !== "HYPOTHESIZED").length >= 2) return "medium";
    return "limited";
  }

  private getMissingEvidenceHints(recommendation: any, supportingSignals: SupportingSignal[], evidenceStrength: any): string[] {
    if (evidenceStrength === "strong" || evidenceStrength === "medium") return [];
    const hints: string[] = [];
    if (supportingSignals.every(s => (s.citations?.length ?? 0) === 0)) hints.push("Add source documents.");
    return hints;
  }

  private generateRecommendationReason(recommendation: any, supportingSignals: SupportingSignal[], evidenceStrength: any): string {
    return "Recommended based on evidence.";
  }

  private generateWhyNow(category: string, stage: string): string {
    return "Action recommended now.";
  }

  private collectCitations(signals: SupportingSignal[]): RecommendationCitation[] {
    const all = signals.flatMap(s => s.citations ?? []);
    const seen = new Set<string>();
    return all.filter(c => {
      const key = `${c.pageUrl}:${c.pageType}:${c.evidenceKind}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).map(c => ({
      sourceUrl: c.pageUrl,
      pageType: c.pageType,
      snippet: c.excerpt,
      signalType: c.evidenceKind,
    }));
  }

  static scoreRecommendations(recommendations: any[], context: ScoringContext): Recommendation[] {
    const scorer = new TrustRecommendationScorer(context);
    return recommendations
      .map(rec => {
        const scored = scorer.calculateScore(rec);
        const citations = scorer.collectCitations(scored.supportingSignals);
        return { ...rec, ...scored, citations, recommendationReason: "Reason", whyNow: "Why now" } as Recommendation;
      })
      .sort((a, b) => b.score - a.score);
  }
}
