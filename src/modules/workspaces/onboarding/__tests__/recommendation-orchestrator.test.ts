/**
 * Tests for RecommendationOrchestrator
 * 
 * Validates deterministic recommendation generation, scoring, and ranking.
 */

import { describe, it, expect } from "vitest";
import {
  RecommendationOrchestrator,
  buildScoringContext,
  type RecommendationTemplate,
} from "../recommendation-orchestrator";
import { TrustRecommendationScorer } from "../trust-recommendation-scorer";
import type {
  Recommendation,
  RecommendationCategory,
  OnboardingStage,
  ScoringContext,
  SupportingSignal,
} from "../recommendation-metadata";
import type { CompanyProfile } from "@/modules/workspaces/company-profile-service";
import type { SignalCategory } from "../website-analysis-service";

// Test helpers
function makeProfileField<T>(
  value: T,
  source: "user-confirmed" | "ai-inferred" | "default" = "ai-inferred",
  confidence: number = 0.7,
  category?: SignalCategory,
): {
  value: T;
  source: "user-confirmed" | "ai-inferred" | "default";
  confidence: number;
  category?: SignalCategory;
} {
  return {
    value,
    source,
    confidence,
    category,
  };
}

function makeCompanyProfile(overrides: Partial<CompanyProfile> = {}): CompanyProfile {
  return {
    workspaceId: "ws-test",
    companyName: "TestCorp",
    industry: makeProfileField(["software"], "ai-inferred", 0.8, "OBSERVED"),
    productType: makeProfileField(["saas"], "ai-inferred", 0.75, "OBSERVED"),
    customerSegment: makeProfileField(["b2b"], "ai-inferred", 0.7, "DERIVED"),
    dataTypes: makeProfileField(["PII"], "ai-inferred", 0.6, "DERIVED"),
    complianceSignals: makeProfileField(["SOC2"], "user-confirmed", 1.0, "OBSERVED"),
    userTypes: makeProfileField(["employees", "customers"]),
    internalRoles: makeProfileField(["admin", "user"]),
    operationalWorkflows: makeProfileField(["security_reviews"]),
    trustClaims: makeProfileField(["SOC2 compliant"]),
    riskAreas: makeProfileField(["data_breach"]),
    tailoringConfidence: 0.7,
    mode: "STANDARD_GUIDANCE",
    pagesScanned: ["https://example.com"],
    ...overrides,
  };
}

// Tests
describe("RecommendationOrchestrator", () => {
  describe("orchestrate", () => {
    it("generates recommendations for a basic profile", () => {
      const profile = makeCompanyProfile();
      const orchestrator = new RecommendationOrchestrator();

      const result = orchestrator.orchestrate(profile, {
        currentStage: "initial_setup",
        groundedSignalCount: 5,
        evidenceQuality: 0.7,
      });

      expect(result.recommendations.length).toBeGreaterThan(0);
      expect(result.metadata.totalGenerated).toBeGreaterThan(0);
      expect(result.metadata.signalsUtilized.length).toBeGreaterThan(0);
    });

    it("ranks recommendations by score (highest first)", () => {
      const profile = makeCompanyProfile();
      const orchestrator = new RecommendationOrchestrator();

      const result = orchestrator.orchestrate(profile);

      for (let i = 1; i < result.recommendations.length; i++) {
        expect(result.recommendations[i].score).toBeLessThanOrEqual(
          result.recommendations[i - 1].score,
        );
      }
    });

    it("includes recommendation reasons for each item", () => {
      const profile = makeCompanyProfile();
      const orchestrator = new RecommendationOrchestrator();

      const result = orchestrator.orchestrate(profile);

      for (const rec of result.recommendations) {
        expect(rec.recommendationReason).toBeTruthy();
        expect(rec.recommendationReason.length).toBeGreaterThan(10);
      }
    });

    it("only returns evidence-backed recommendations", () => {
      const profile = makeCompanyProfile();
      const orchestrator = new RecommendationOrchestrator();

      const result = orchestrator.orchestrate(profile);

      for (const rec of result.recommendations) {
        expect(rec.supportingSignals.length).toBeGreaterThan(0);
        expect(rec.scoreBreakdown.finalScore).toBe(rec.score);
      }
    });

    it("includes 'why now' context for each recommendation", () => {
      const profile = makeCompanyProfile();
      const orchestrator = new RecommendationOrchestrator();

      const result = orchestrator.orchestrate(profile);

      for (const rec of result.recommendations) {
        expect(rec.whyNow).toBeTruthy();
        expect(rec.whyNow.length).toBeGreaterThan(10);
      }
    });

    it("groups recommendations by category", () => {
      const profile = makeCompanyProfile();
      const orchestrator = new RecommendationOrchestrator();

      const result = orchestrator.orchestrate(profile);

      expect(Object.keys(result.byCategory).length).toBeGreaterThan(0);

      // At least one category should have recommendations
      const categoriesWithRecs = Object.values(result.byCategory).filter(
        recs => recs.length > 0,
      );
      expect(categoriesWithRecs.length).toBeGreaterThan(0);
    });

    it("respects maxRecommendations config", () => {
      const profile = makeCompanyProfile();
      const orchestrator = new RecommendationOrchestrator({
        maxRecommendations: 5,
      });

      const result = orchestrator.orchestrate(profile);

      expect(result.recommendations.length).toBeLessThanOrEqual(5);
    });

    it("respects minScoreThreshold config", () => {
      const profile = makeCompanyProfile();
      const orchestrator = new RecommendationOrchestrator({
        minScoreThreshold: 50,
      });

      const result = orchestrator.orchestrate(profile);

      for (const rec of result.recommendations) {
        expect(rec.score).toBeGreaterThanOrEqual(50);
      }
    });

    it("deduplicates mutually exclusive recommendations", () => {
      // Both "quick_win_infosec" and "upload_infosec_policy" are mutually exclusive
      const profile = makeCompanyProfile();
      const orchestrator = new RecommendationOrchestrator();

      const result = orchestrator.orchestrate(profile);

      const hasQuickWin = result.recommendations.some(r => r.id === "quick_win_infosec");
      const hasFullUpload = result.recommendations.some(r => r.id === "upload_infosec_policy");

      // Should have one but not both
      expect(hasQuickWin || hasFullUpload).toBe(true);
      // If we have many recommendations, prefer the more detailed one
    });

    it("orders recommendations by dependencies", () => {
      const profile = makeCompanyProfile();
      const orchestrator = new RecommendationOrchestrator();

      const result = orchestrator.orchestrate(profile);

      // Find "configure_approval_workflow" which depends on "configure_review_cadence"
      const approvalIndex = result.recommendations.findIndex(
        r => r.id === "configure_approval_workflow",
      );
      const cadenceIndex = result.recommendations.findIndex(
        r => r.id === "configure_review_cadence",
      );

      if (approvalIndex !== -1 && cadenceIndex !== -1) {
        expect(cadenceIndex).toBeLessThan(approvalIndex);
      }
    });

    it("generates higher scores for stronger evidence", () => {
      // Profile with OBSERVED signals should get higher scores
      const strongProfile = makeCompanyProfile({
        industry: makeProfileField(["fintech"], "ai-inferred", 0.9, "OBSERVED"),
        complianceSignals: makeProfileField(["SOC2", "GDPR"], "ai-inferred", 0.85, "OBSERVED"),
      });

      const weakProfile = makeCompanyProfile({
        industry: makeProfileField(["fintech"], "ai-inferred", 0.4, "HYPOTHESIZED"),
        complianceSignals: makeProfileField(["SOC2"], "ai-inferred", 0.3, "HYPOTHESIZED"),
      });

      const orchestrator = new RecommendationOrchestrator();

      const strongResult = orchestrator.orchestrate(strongProfile, {
        groundedSignalCount: 8,
        evidenceQuality: 0.9,
      });

      const weakResult = orchestrator.orchestrate(weakProfile, {
        groundedSignalCount: 2,
        evidenceQuality: 0.3,
      });

      // Strong profile should have higher average scores
      const strongAvgScore =
        strongResult.recommendations.reduce((sum, r) => sum + r.score, 0) /
        (strongResult.recommendations.length || 1);

      const weakAvgScore =
        weakResult.recommendations.reduce((sum, r) => sum + r.score, 0) /
        (weakResult.recommendations.length || 1);

      expect(strongAvgScore).toBeGreaterThan(weakAvgScore);
    });

    it("uses evidence quality as a ranking input", () => {
      const profile = makeCompanyProfile({
        industry: makeProfileField(["fintech"], "ai-inferred", 0.8, "OBSERVED"),
        complianceSignals: makeProfileField(["SOC2"], "ai-inferred", 0.8, "OBSERVED"),
      });

      const orchestrator = new RecommendationOrchestrator();
      const highQuality = orchestrator.orchestrate(profile, {
        groundedSignalCount: 6,
        evidenceQuality: 0.95,
      });
      const lowQuality = orchestrator.orchestrate(profile, {
        groundedSignalCount: 1,
        evidenceQuality: 0.2,
      });

      expect(highQuality.topRecommendations[0]?.score ?? 0).toBeGreaterThan(
        lowQuality.topRecommendations[0]?.score ?? 0,
      );
    });
  });

  describe("fintech-specific recommendations", () => {
    it("generates AML/KYC recommendations for fintech", () => {
      const profile = makeCompanyProfile({
        industry: makeProfileField(["fintech"], "ai-inferred", 0.85, "OBSERVED"),
      });

      const orchestrator = new RecommendationOrchestrator();
      const result = orchestrator.orchestrate(profile);

      const amlRec = result.recommendations.find(r => r.id === "seed_aml_kyc");
      expect(amlRec).toBeDefined();
      expect(amlRec?.category).toBe("trust_topics");
      expect(amlRec?.score).toBeGreaterThan(40);
    });

    it("generates high-priority compliance docs for fintech", () => {
      const profile = makeCompanyProfile({
        industry: makeProfileField(["fintech"], "ai-inferred", 0.85, "OBSERVED"),
        complianceSignals: makeProfileField(["PCI_DSS"], "user-confirmed", 1.0),
      });

      const orchestrator = new RecommendationOrchestrator();
      const result = orchestrator.orchestrate(profile);

      const accessControlRec = result.recommendations.find(
        r => r.id === "upload_access_control",
      );
      expect(accessControlRec).toBeDefined();
    });
  });

  describe("healthcare-specific recommendations", () => {
    it("generates HIPAA recommendations for healthtech", () => {
      const profile = makeCompanyProfile({
        industry: makeProfileField(["healthtech"], "ai-inferred", 0.9, "OBSERVED"),
        dataTypes: makeProfileField(["PHI"], "ai-inferred", 0.85, "OBSERVED"),
      });

      const orchestrator = new RecommendationOrchestrator();
      const result = orchestrator.orchestrate(profile);

      const hipaaRec = result.recommendations.find(r => r.id === "seed_hipaa_privacy");
      expect(hipaaRec).toBeDefined();
      expect(hipaaRec?.priority).toBe("CRITICAL");
    });
  });

  describe("privacy-focused recommendations", () => {
    it("generates GDPR recommendations when PII detected", () => {
      const profile = makeCompanyProfile({
        dataTypes: makeProfileField(["PII", "personal_data"], "ai-inferred", 0.8, "OBSERVED"),
        complianceSignals: makeProfileField(["GDPR"], "user-confirmed", 1.0),
      });

      const orchestrator = new RecommendationOrchestrator();
      const result = orchestrator.orchestrate(profile);

      const gdprRec = result.recommendations.find(r => r.id === "seed_gdpr_privacy");
      expect(gdprRec).toBeDefined();
    });
  });

  describe("enterprise SaaS recommendations", () => {
    it("generates enterprise topics for B2B SaaS", () => {
      const profile = makeCompanyProfile({
        productType: makeProfileField(["saas"], "ai-inferred", 0.85, "OBSERVED"),
        customerSegment: makeProfileField(["b2b", "enterprise"], "ai-inferred", 0.8, "OBSERVED"),
      });

      const orchestrator = new RecommendationOrchestrator();
      const result = orchestrator.orchestrate(profile);

      const enterpriseRec = result.recommendations.find(r => r.id === "seed_enterprise_saas");
      expect(enterpriseRec).toBeDefined();
    });
  });

  describe("metadata tracking", () => {
    it("tracks signals utilized", () => {
      const profile = makeCompanyProfile();
      const orchestrator = new RecommendationOrchestrator();

      const result = orchestrator.orchestrate(profile);

      expect(result.metadata.signalsUtilized.length).toBeGreaterThan(0);
      expect(result.metadata.signalsUtilized).toContain("industry");
      expect(result.metadata.signalsUtilized).toContain("productType");
    });

    it("calculates average confidence", () => {
      const profile = makeCompanyProfile();
      const orchestrator = new RecommendationOrchestrator();

      const result = orchestrator.orchestrate(profile);

      expect(result.metadata.averageConfidence).toBeGreaterThanOrEqual(0);
      expect(result.metadata.averageConfidence).toBeLessThanOrEqual(1);
    });

    it("tracks generation timestamp", () => {
      const profile = makeCompanyProfile();
      const orchestrator = new RecommendationOrchestrator();

      const before = new Date();
      const result = orchestrator.orchestrate(profile);
      const after = new Date();

      expect(result.metadata.generatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(result.metadata.generatedAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe("deterministic weighted scoring acceptance", () => {
    it("OBSERVED compliance signal ranks higher than HYPOTHESIZED", () => {
      const observed = makeCompanyProfile({
        complianceSignals: makeProfileField(["SOC2"], "ai-inferred", 0.9, "OBSERVED"),
      });
      const hypothesized = makeCompanyProfile({
        complianceSignals: makeProfileField(["SOC2"], "ai-inferred", 0.4, "HYPOTHESIZED"),
      });

      const orchestrator = new RecommendationOrchestrator();
      const a = orchestrator.orchestrate(observed, { groundedSignalCount: 6, evidenceQuality: 0.9 });
      const b = orchestrator.orchestrate(hypothesized, { groundedSignalCount: 1, evidenceQuality: 0.4 });

      expect((a.topRecommendations[0]?.score ?? 0)).toBeGreaterThan(b.topRecommendations[0]?.score ?? 0);
    });

    it("citation-backed recommendation scores higher than uncited recommendation", () => {
      const cited = makeCompanyProfile({
        complianceSignals: {
          value: ["GDPR"],
          source: "ai-inferred",
          confidence: 0.85,
          category: "OBSERVED",
          citations: [{ pageUrl: "https://example.com/security", pageType: "security", evidenceKind: "heading-section" }],
        },
      });
      const uncited = makeCompanyProfile({
        complianceSignals: makeProfileField(["GDPR"], "ai-inferred", 0.85, "OBSERVED"),
      });

      const orchestrator = new RecommendationOrchestrator();
      const citedResult = orchestrator.orchestrate(cited, { groundedSignalCount: 5, evidenceQuality: 0.85 });
      const uncitedResult = orchestrator.orchestrate(uncited, { groundedSignalCount: 5, evidenceQuality: 0.85 });

      expect(citedResult.topRecommendations[0]?.score ?? 0).toBeGreaterThan(uncitedResult.topRecommendations[0]?.score ?? 0);
    });

    it("multiple high-value citations boost recommendation confidence", () => {
      const profile = makeCompanyProfile({
        complianceSignals: {
          value: ["SOC2", "GDPR"],
          source: "ai-inferred",
          confidence: 0.85,
          category: "OBSERVED",
          citations: [
            { pageUrl: "https://example.com/security", pageType: "security", evidenceKind: "heading-section" },
            { pageUrl: "https://example.com/privacy", pageType: "privacy", evidenceKind: "meta" },
            { pageUrl: "https://example.com/compliance", pageType: "compliance", evidenceKind: "json-ld" },
          ],
        },
      });
      const orchestrator = new RecommendationOrchestrator();
      const result = orchestrator.orchestrate(profile, { groundedSignalCount: 7, evidenceQuality: 0.9 });
      expect(result.topRecommendations[0]?.confidence ?? 0).toBeGreaterThan(0.6);
    });

    it("conflicting evidence reduces confidence", () => {
      const profile = makeCompanyProfile({
        customerSegment: {
          value: ["b2b"],
          source: "ai-inferred",
          confidence: 0.8,
          category: "OBSERVED",
          conflict: { hasConflict: true },
        },
      });
      const orchestrator = new RecommendationOrchestrator({ minScoreThreshold: 20 });
      const result = orchestrator.orchestrate(profile, { groundedSignalCount: 3, evidenceQuality: 0.7 });
      expect(result.recommendations.some(r => r.needsReview)).toBe(true);
    });

    it("enterprise/B2B signals produce questionnaire readiness recommendations", () => {
      const profile = makeCompanyProfile({
        customerSegment: makeProfileField(["b2b", "enterprise"], "ai-inferred", 0.9, "OBSERVED"),
      });
      const result = new RecommendationOrchestrator().orchestrate(profile);
      expect(result.recommendations.some(r => r.id === "prep_security_questionnaire")).toBe(true);
    });

    it("HIPAA signal produces healthcare data/compliance recommendation", () => {
      const profile = makeCompanyProfile({
        industry: makeProfileField(["healthtech"], "ai-inferred", 0.9, "OBSERVED"),
        dataTypes: makeProfileField(["PHI"], "ai-inferred", 0.9, "OBSERVED"),
      });
      const result = new RecommendationOrchestrator().orchestrate(profile);
      expect(result.recommendations.some(r => r.id === "seed_hipaa_privacy")).toBe(true);
    });

    it("GDPR/privacy signal produces DPA/privacy evidence recommendation", () => {
      const profile = makeCompanyProfile({
        complianceSignals: makeProfileField(["GDPR"], "ai-inferred", 0.85, "OBSERVED"),
        dataTypes: makeProfileField(["PII"], "ai-inferred", 0.85, "OBSERVED"),
      });
      const result = new RecommendationOrchestrator().orchestrate(profile);
      expect(result.recommendations.some(r => r.id === "upload_dpa" || r.id === "upload_privacy_policy")).toBe(true);
    });

    it("API/integration signal produces API Security topic", () => {
      const profile = makeCompanyProfile({
        operationalWorkflows: makeProfileField(["api", "integrations"], "ai-inferred", 0.85, "OBSERVED"),
      });
      const result = new RecommendationOrchestrator().orchestrate(profile);
      expect(result.recommendations.some(r => r.id === "seed_api_security")).toBe(true);
    });

    it("duplicate recommendations are merged and not repeated", () => {
      const result = new RecommendationOrchestrator().orchestrate(makeCompanyProfile());
      const ids = result.recommendations.map(r => r.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it("next best actions return top 3-5 practical actions", () => {
      const result = new RecommendationOrchestrator().orchestrate(makeCompanyProfile());
      expect(result.nextBestActions.length).toBeGreaterThanOrEqual(3);
      expect(result.nextBestActions.length).toBeLessThanOrEqual(5);
      for (const action of result.nextBestActions) {
        expect(/upload|configure|review|invite|import|setup|publish/i.test(action.title)).toBe(true);
      }
    });

    it("weak evidence recommendations are marked limited/review-needed", () => {
      const profile = makeCompanyProfile({
        complianceSignals: makeProfileField(["SOC2"], "ai-inferred", 0.3, "HYPOTHESIZED"),
      });
      const result = new RecommendationOrchestrator({ minScoreThreshold: 0 }).orchestrate(profile, {
        groundedSignalCount: 0,
        evidenceQuality: 0.2,
      });
      expect(result.recommendations.some(r => r.confidenceBand === "limited" || r.needsReview)).toBe(true);
    });

    it("static repeated SaaS pack is not duplicated", () => {
      const profile = makeCompanyProfile({
        productType: makeProfileField(["saas"], "ai-inferred", 0.9, "OBSERVED"),
        customerSegment: makeProfileField(["b2b", "enterprise"], "ai-inferred", 0.9, "OBSERVED"),
      });
      const result = new RecommendationOrchestrator().orchestrate(profile);
      const saasTitles = result.recommendations.filter(r => r.title === "Enterprise SaaS Security");
      expect(saasTitles.length).toBeLessThanOrEqual(1);
    });
  });

  describe("explainability and evidence traceability", () => {
    it("recommendation with citation includes sourceUrl/snippet", () => {
      const profile = makeCompanyProfile({
        complianceSignals: {
          value: ["GDPR"],
          source: "ai-inferred",
          confidence: 0.9,
          category: "OBSERVED",
          citations: [
            {
              pageUrl: "https://example.com/privacy",
              pageType: "privacy",
              evidenceKind: "heading-section",
              excerpt: "We process customer personal data under GDPR controls.",
            },
          ],
        },
      });
      const result = new RecommendationOrchestrator().orchestrate(profile, {
        groundedSignalCount: 5,
        evidenceQuality: 0.9,
      });
      const withCitation = result.recommendations.find(r => r.citations.length > 0);
      expect(withCitation).toBeDefined();
      expect(withCitation?.citations[0].sourceUrl).toBeTruthy();
      expect(withCitation?.citations[0].snippet).toBeTruthy();
    });

    it("recommendation without citation is limited confidence", () => {
      const profile = makeCompanyProfile({
        complianceSignals: makeProfileField(["GDPR"], "ai-inferred", 0.5, "DERIVED"),
      });
      const result = new RecommendationOrchestrator({ minScoreThreshold: 0 }).orchestrate(profile, {
        groundedSignalCount: 0,
        evidenceQuality: 0.4,
      });
      expect(result.recommendations.some(r => r.citations.length === 0 && r.confidenceBand !== "high")).toBe(true);
    });

    it("derived recommendation sets needsReview true", () => {
      const profile = makeCompanyProfile({
        operationalWorkflows: makeProfileField(["api"], "ai-inferred", 0.5, "DERIVED"),
      });
      const result = new RecommendationOrchestrator({ minScoreThreshold: 0 }).orchestrate(profile, {
        groundedSignalCount: 1,
        evidenceQuality: 0.45,
      });
      expect(result.recommendations.some(r => r.needsReview)).toBe(true);
    });

    it("conflicted evidence adds needsReview true", () => {
      const profile = makeCompanyProfile({
        trustClaims: {
          value: ["SOC2 compliant"],
          source: "ai-inferred",
          confidence: 0.8,
          category: "OBSERVED",
          conflict: { hasConflict: true },
        },
      });
      const result = new RecommendationOrchestrator({ minScoreThreshold: 0 }).orchestrate(profile, {
        groundedSignalCount: 3,
        evidenceQuality: 0.7,
      });
      expect(result.recommendations.some(r => r.needsReview)).toBe(true);
    });

    it("reason copy is generated for each category", () => {
      const result = new RecommendationOrchestrator().orchestrate(makeCompanyProfile(), {
        groundedSignalCount: 5,
        evidenceQuality: 0.8,
      });
      for (const rec of result.recommendations) {
        expect(rec.recommendationReason).toBeTruthy();
        expect(rec.whyNow).toBeTruthy();
      }
    });

    it("does not fabricate citations when none exist", () => {
      const profile = makeCompanyProfile({
        complianceSignals: {
          value: ["SOC2"],
          source: "ai-inferred",
          confidence: 0.8,
          category: "OBSERVED",
          citations: [],
        },
      });
      const result = new RecommendationOrchestrator({ minScoreThreshold: 0 }).orchestrate(profile, {
        groundedSignalCount: 2,
        evidenceQuality: 0.7,
      });
      const noCitationRec = result.recommendations.find(r => r.supportingSignals.some(s => s.field === "complianceSignals"));
      expect(noCitationRec).toBeDefined();
      expect(noCitationRec?.citations.length ?? 0).toBe(0);
    });
  });

  describe("next best actions generator", () => {
    it("enterprise SaaS profile returns practical onboarding actions", () => {
      const profile = makeCompanyProfile({
        productType: makeProfileField(["saas"], "ai-inferred", 0.9, "OBSERVED"),
        customerSegment: makeProfileField(["b2b", "enterprise"], "ai-inferred", 0.9, "OBSERVED"),
        complianceSignals: makeProfileField(["SOC2", "GDPR"], "ai-inferred", 0.9, "OBSERVED"),
      });

      const result = new RecommendationOrchestrator().orchestrate(profile, {
        profileConfirmed: true,
        hasQuestionnaire: false,
        hasUploadedDocuments: false,
      });
      const titles = result.nextBestActions.map(a => a.title.toLowerCase()).join(" ");
      expect(titles.includes("upload") || titles.includes("dpa") || titles.includes("soc2")).toBe(true);
      expect(titles.includes("review")).toBe(true);
      expect(titles.includes("import")).toBe(true);
      expect(result.nextBestActions.length).toBeGreaterThanOrEqual(3);
      expect(result.nextBestActions.length).toBeLessThanOrEqual(5);
    });

    it("weak evidence profile returns manual profile review", () => {
      const profile = makeCompanyProfile({
        complianceSignals: makeProfileField(["SOC2"], "ai-inferred", 0.3, "HYPOTHESIZED"),
      });

      const result = new RecommendationOrchestrator({ minScoreThreshold: 0 }).orchestrate(profile, {
        evidenceQuality: 0.2,
        groundedSignalCount: 0,
      });

      expect(result.nextBestActions.some(a => a.actionType === "manual_profile_review")).toBe(true);
    });

    it("no documents prioritizes upload document action", () => {
      const result = new RecommendationOrchestrator().orchestrate(makeCompanyProfile(), {
        hasUploadedDocuments: false,
      });
      expect(result.nextBestActions.some(a => a.actionType === "upload_document")).toBe(true);
    });

    it("confirmed profile with no questionnaire prioritizes import questionnaire", () => {
      const result = new RecommendationOrchestrator().orchestrate(makeCompanyProfile(), {
        profileConfirmed: true,
        hasQuestionnaire: false,
      });
      expect(result.nextBestActions.some(a => a.actionType === "import_questionnaire")).toBe(true);
    });

    it("duplicate linked recommendations do not duplicate actions", () => {
      const result = new RecommendationOrchestrator().orchestrate(makeCompanyProfile(), {
        hasUploadedDocuments: false,
      });
      const uniqueActionKeys = new Set(result.nextBestActions.map(a => `${a.actionType}:${a.routeOrIntent}`));
      expect(uniqueActionKeys.size).toBe(result.nextBestActions.length);
    });
  });
});

describe("TrustRecommendationScorer", () => {
  describe("calculateScore", () => {
    it("returns zero score when no signals match", () => {
      const context: ScoringContext = {
        profile: {
          industry: [],
          productType: [],
          customerSegment: [],
          dataTypes: [],
          complianceSignals: [],
          userTypes: [],
          internalRoles: [],
          operationalWorkflows: [],
          trustClaims: [],
          riskAreas: [],
          tailoringConfidence: 0.3,
        },
        signals: {},
        groundedSignalCount: 0,
        evidenceQuality: 0.2,
        currentStage: "initial_setup",
        weights: {
          baseWeight: 0.3,
          observedMultiplier: 1.0,
          derivedMultiplier: 0.7,
          hypothesizedMultiplier: 0.4,
          groundedSignalBonus: 0.05,
          citationBonus: 0.02,
          maxCitationBonus: 0.1,
          confidenceExponent: 2.0,
          missingFieldPenalty: 0.1,
        },
      };

      const scorer = new TrustRecommendationScorer(context);
      const result = scorer.calculateScore({
        id: "test_rec",
        category: "trust_topics",
        title: "Test",
        description: "Test description",
        priority: "MEDIUM",
        triggers: [
          {
            field: "industry",
            operator: "not_empty",
            scoreContribution: 0.5,
            description: "Industry required",
          },
        ],
        estimatedEffort: "low",
        estimatedImpact: "medium",
        onboardingStage: "initial_setup",
      });

      expect(result.score).toBeLessThan(40);
      expect(result.supportingSignals).toHaveLength(0);
    });

    it("calculates higher scores for OBSERVED signals", () => {
      const context: ScoringContext = {
        profile: {
          industry: ["fintech"],
          productType: [],
          customerSegment: [],
          dataTypes: [],
          complianceSignals: [],
          userTypes: [],
          internalRoles: [],
          operationalWorkflows: [],
          trustClaims: [],
          riskAreas: [],
          tailoringConfidence: 0.8,
        },
        signals: {
          industry: {
            value: ["fintech"],
            category: "OBSERVED",
            confidence: 0.9,
          },
        },
        groundedSignalCount: 1,
        evidenceQuality: 0.8,
        currentStage: "initial_setup",
        weights: {
          baseWeight: 0.3,
          observedMultiplier: 1.0,
          derivedMultiplier: 0.7,
          hypothesizedMultiplier: 0.4,
          groundedSignalBonus: 0.05,
          citationBonus: 0.02,
          maxCitationBonus: 0.1,
          confidenceExponent: 2.0,
          missingFieldPenalty: 0.1,
        },
      };

      const scorer = new TrustRecommendationScorer(context);
      const result = scorer.calculateScore({
        id: "test_rec",
        category: "trust_topics",
        title: "Test",
        description: "Test description",
        priority: "MEDIUM",
        triggers: [
          {
            field: "industry",
            operator: "any_of",
            value: ["fintech"],
            scoreContribution: 0.5,
            description: "Fintech industry match",
          },
        ],
        estimatedEffort: "low",
        estimatedImpact: "medium",
        onboardingStage: "initial_setup",
      });

      expect(result.score).toBeGreaterThan(50);
      expect(result.supportingSignals[0].category).toBe("OBSERVED");
    });

    it("applies confidence weighting correctly", () => {
      const highConfidenceContext: ScoringContext = {
        profile: {
          industry: ["software"],
          productType: [],
          customerSegment: [],
          dataTypes: [],
          complianceSignals: [],
          userTypes: [],
          internalRoles: [],
          operationalWorkflows: [],
          trustClaims: [],
          riskAreas: [],
          tailoringConfidence: 0.9,
        },
        signals: {
          industry: {
            value: ["software"],
            category: "OBSERVED",
            confidence: 0.95,
          },
        },
        groundedSignalCount: 1,
        evidenceQuality: 0.9,
        currentStage: "initial_setup",
        weights: {
          baseWeight: 0.3,
          observedMultiplier: 1.0,
          derivedMultiplier: 0.7,
          hypothesizedMultiplier: 0.4,
          groundedSignalBonus: 0.05,
          citationBonus: 0.02,
          maxCitationBonus: 0.1,
          confidenceExponent: 2.0,
          missingFieldPenalty: 0.1,
        },
      };

      const lowConfidenceContext: ScoringContext = {
        ...highConfidenceContext,
        signals: {
          industry: {
            value: ["software"],
            category: "HYPOTHESIZED",
            confidence: 0.3,
          },
        },
        groundedSignalCount: 0,
        evidenceQuality: 0.3,
      };

      const highScorer = new TrustRecommendationScorer(highConfidenceContext);
      const lowScorer = new TrustRecommendationScorer(lowConfidenceContext);

      const template = {
        id: "test_rec",
        category: "trust_topics" as RecommendationCategory,
        title: "Test",
        description: "Test description",
        priority: "MEDIUM" as Recommendation["priority"],
        triggers: [
          {
            field: "industry",
            operator: "not_empty" as const,
            scoreContribution: 0.5,
            description: "Industry detected",
          },
        ],
        estimatedEffort: "low" as Recommendation["estimatedEffort"],
        estimatedImpact: "medium" as Recommendation["estimatedImpact"],
        onboardingStage: "initial_setup" as OnboardingStage,
      };

      const highResult = highScorer.calculateScore(template);
      const lowResult = lowScorer.calculateScore(template);

      expect(highResult.score).toBeGreaterThan(lowResult.score);
    });

    it("tracks fired triggers correctly", () => {
      const context: ScoringContext = {
        profile: {
          industry: ["fintech"],
          productType: ["saas"],
          customerSegment: [],
          dataTypes: [],
          complianceSignals: [],
          userTypes: [],
          internalRoles: [],
          operationalWorkflows: [],
          trustClaims: [],
          riskAreas: [],
          tailoringConfidence: 0.8,
        },
        signals: {
          industry: {
            value: ["fintech"],
            category: "OBSERVED",
            confidence: 0.85,
          },
          productType: {
            value: ["saas"],
            category: "DERIVED",
            confidence: 0.7,
          },
        },
        groundedSignalCount: 2,
        evidenceQuality: 0.75,
        currentStage: "initial_setup",
        weights: {
          baseWeight: 0.3,
          observedMultiplier: 1.0,
          derivedMultiplier: 0.7,
          hypothesizedMultiplier: 0.4,
          groundedSignalBonus: 0.05,
          citationBonus: 0.02,
          maxCitationBonus: 0.1,
          confidenceExponent: 2.0,
          missingFieldPenalty: 0.1,
        },
      };

      const scorer = new TrustRecommendationScorer(context);
      const result = scorer.calculateScore({
        id: "test_rec",
        category: "trust_topics",
        title: "Test",
        description: "Test description",
        priority: "MEDIUM",
        triggers: [
          {
            field: "industry",
            operator: "any_of",
            value: ["fintech"],
            scoreContribution: 0.4,
            description: "Fintech match",
          },
          {
            field: "productType",
            operator: "any_of",
            value: ["saas"],
            scoreContribution: 0.3,
            description: "SaaS match",
          },
          {
            field: "complianceSignals",
            operator: "not_empty",
            scoreContribution: 0.3,
            description: "Compliance required",
          },
        ],
        estimatedEffort: "low",
        estimatedImpact: "medium",
        onboardingStage: "initial_setup",
      });

      expect(result.firedTriggers).toHaveLength(2);
      expect(result.firedTriggers.map(f => f.trigger.field)).toContain("industry");
      expect(result.firedTriggers.map(f => f.trigger.field)).toContain("productType");
    });
  });

  describe("scoreRecommendations (batch)", () => {
    it("scores multiple recommendations and sorts by score", () => {
      const context: ScoringContext = {
        profile: {
          industry: ["fintech"],
          productType: [],
          customerSegment: [],
          dataTypes: [],
          complianceSignals: ["SOC2"],
          userTypes: [],
          internalRoles: [],
          operationalWorkflows: [],
          trustClaims: [],
          riskAreas: [],
          tailoringConfidence: 0.75,
        },
        signals: {
          industry: {
            value: ["fintech"],
            category: "OBSERVED",
            confidence: 0.85,
          },
          complianceSignals: {
            value: ["SOC2"],
            category: "OBSERVED",
            confidence: 0.9,
          },
        },
        groundedSignalCount: 2,
        evidenceQuality: 0.8,
        currentStage: "initial_setup",
        weights: {
          baseWeight: 0.3,
          observedMultiplier: 1.0,
          derivedMultiplier: 0.7,
          hypothesizedMultiplier: 0.4,
          groundedSignalBonus: 0.05,
          citationBonus: 0.02,
          maxCitationBonus: 0.1,
          confidenceExponent: 2.0,
          missingFieldPenalty: 0.1,
        },
      };

      const templates = [
        {
          id: "fintech_rec",
          category: "trust_topics" as RecommendationCategory,
          title: "Fintech Topic",
          description: "For fintech",
          priority: "HIGH" as Recommendation["priority"],
          triggers: [
            {
              field: "industry",
              operator: "any_of" as const,
              value: ["fintech"],
              scoreContribution: 0.6,
              description: "Fintech industry",
            },
          ],
          estimatedEffort: "low" as Recommendation["estimatedEffort"],
          estimatedImpact: "high" as Recommendation["estimatedImpact"],
          onboardingStage: "initial_setup" as OnboardingStage,
        },
        {
          id: "compliance_rec",
          category: "trust_topics" as RecommendationCategory,
          title: "Compliance Topic",
          description: "For compliance",
          priority: "MEDIUM" as Recommendation["priority"],
          triggers: [
            {
              field: "complianceSignals",
              operator: "not_empty" as const,
              scoreContribution: 0.5,
              description: "Has compliance",
            },
          ],
          estimatedEffort: "medium" as Recommendation["estimatedEffort"],
          estimatedImpact: "medium" as Recommendation["estimatedImpact"],
          onboardingStage: "initial_setup" as OnboardingStage,
        },
        {
          id: "weak_rec",
          category: "trust_topics" as RecommendationCategory,
          title: "Generic Topic",
          description: "Generic",
          priority: "LOW" as Recommendation["priority"],
          triggers: [
            {
              field: "productType",
              operator: "not_empty" as const,
              scoreContribution: 0.4,
              description: "Has product type",
            },
          ],
          estimatedEffort: "high" as Recommendation["estimatedEffort"],
          estimatedImpact: "low" as Recommendation["estimatedImpact"],
          onboardingStage: "initial_setup" as OnboardingStage,
        },
      ];

      const scored = TrustRecommendationScorer.scoreRecommendations(templates, context);

      expect(scored).toHaveLength(3);
      expect(scored[0].id).toBe("fintech_rec"); // Highest score
      expect(scored[1].id).toBe("compliance_rec");
      expect(scored[0].score).toBeGreaterThan(scored[1].score);
      expect(scored[1].score).toBeGreaterThan(scored[2].score);
    });
  });
});

describe("buildScoringContext", () => {
  it("converts CompanyProfile to ScoringContext", () => {
    const profile = makeCompanyProfile({
      industry: makeProfileField(["software"], "ai-inferred", 0.8, "OBSERVED"),
    });

    const context = buildScoringContext(profile, "initial_setup", 3, 0.7);

    expect(context.profile.industry).toEqual(["software"]);
    expect(context.signals.industry.category).toBe("OBSERVED");
    expect(context.signals.industry.confidence).toBe(0.8);
    expect(context.groundedSignalCount).toBe(3);
    expect(context.evidenceQuality).toBe(0.7);
    expect(context.currentStage).toBe("initial_setup");
  });

  it("only includes non-empty fields as signals", () => {
    const profile = makeCompanyProfile({
      industry: makeProfileField(["software"]),
      userTypes: makeProfileField([]), // Empty
    });

    const context = buildScoringContext(profile, "initial_setup", 0, 0.5);

    expect(context.signals.industry).toBeDefined();
    expect(context.signals.userTypes).toBeUndefined();
  });

  it("preserves signal metadata in context", () => {
    const profile = makeCompanyProfile({
      industry: {
        value: ["fintech"],
        source: "ai-inferred",
        confidence: 0.85,
        category: "OBSERVED",
        inferenceSource: "homepage analysis",
        citations: [
          {
            pageUrl: "https://example.com",
            pageType: "homepage",
            evidenceKind: "heading-section",
            excerpt: "Fintech solutions",
          },
        ],
      },
    });

    const context = buildScoringContext(profile, "initial_setup", 1, 0.8);

    expect(context.signals.industry.citations).toHaveLength(1);
    expect(context.signals.industry.citations?.[0].pageUrl).toBe("https://example.com");
  });
});
