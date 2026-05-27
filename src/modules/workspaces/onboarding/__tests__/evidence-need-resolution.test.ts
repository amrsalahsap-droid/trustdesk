import { describe, it, expect } from "vitest";
import { EvidenceNeedResolutionEngine } from "../evidence-needs/evidence-need-resolution-engine";
import { EvidenceNeed, ProcurementRiskArea, TrustTopicRecommendation, SecurityPillar } from "../vendor-intelligence-types";

describe("EvidenceNeedResolutionEngine", () => {
  it("should merge duplicate evidence needs, preserve risk/topic/pillar relationships, promote severity, and aggregate rationales", () => {
    // 1. Arrange inputs with duplicate AI-related evidence needs
    const rawNeeds: EvidenceNeed[] = [
      {
        type: "AI Data Usage Policy",
        reason: "Required to verify AI model training risk.",
        suggestedSources: ["AI Governance Document"]
      },
      {
        type: "AI Governance Framework",
        reason: "Required to verify compliance with AI ethics and model audit safeguards.",
        suggestedSources: ["AI Policy Document"]
      },
      {
        type: "Tenant Isolation Architecture",
        reason: "Required to verify container isolation.",
        suggestedSources: ["Architecture Diagram"]
      }
    ];

    const riskAreas: ProcurementRiskArea[] = [
      {
        key: "ai_training_risk",
        label: "AI Training Risk",
        reason: "Uses customer data for training",
        severity: "CRITICAL",
        confidence: 0.9,
        evidenceStrength: "weak",
        triggeringSignals: [],
        evidenceRefs: [],
        recommendedEvidenceNeeds: [],
        clarificationTasks: []
      },
      {
        key: "tenant_escape_risk",
        label: "Tenant Escape Risk",
        reason: "Multi-tenant containers escape threat",
        severity: "HIGH",
        confidence: 0.85,
        evidenceStrength: "medium",
        triggeringSignals: [],
        evidenceRefs: [],
        recommendedEvidenceNeeds: [],
        clarificationTasks: []
      }
    ];

    const topics: TrustTopicRecommendation[] = [
      {
        id: "topic_ai_governance",
        key: "ai_governance",
        title: "AI Governance",
        description: "AI ethics and governance",
        priority: "CRITICAL",
        topicKeys: ["ai_governance"],
        confidence: 0.9,
        status: "needs_evidence",
        triggeredBy: ["ai_training_risk"],
        rationale: "Triggered by AI training risk",
        evidenceRefs: [],
        answerScaffoldAreas: [],
        evidenceNeeds: []
      },
      {
        id: "topic_infrastructure_security",
        key: "infrastructure_security",
        title: "Infrastructure Security",
        description: "Cloud security and isolation",
        priority: "HIGH",
        topicKeys: ["infrastructure_security"],
        confidence: 0.85,
        status: "review_suggested",
        triggeredBy: ["tenant_escape_risk"],
        rationale: "Triggered by tenant escape risk",
        evidenceRefs: [],
        answerScaffoldAreas: [],
        evidenceNeeds: []
      }
    ];

    const pillars: SecurityPillar[] = [
      {
        key: "ai_model_security",
        title: "AI & Model Security",
        summary: "AI model safety and security guidelines",
        topicKeys: ["ai_governance"],
        status: "needs_evidence",
        evidenceNeedsCount: 2,
        clarificationTasksCount: 0
      },
      {
        key: "infrastructure_cloud",
        title: "Infrastructure & Cloud Security",
        summary: "SaaS hosting security controls",
        topicKeys: ["infrastructure_security"],
        status: "review_suggested",
        evidenceNeedsCount: 1,
        clarificationTasksCount: 0
      }
    ];

    // 2. Act
    const resolved = EvidenceNeedResolutionEngine.resolve(rawNeeds, {
      riskAreas,
      topics,
      pillars
    });

    // 3. Assert - Duplicate merging
    expect(resolved.length).toBe(2); // AI Data Usage Policy + Tenant Isolation Architecture

    const aiNeed = resolved.find(n => n.canonicalKey === "ai_data_usage_policy");
    const tenantNeed = resolved.find(n => n.canonicalKey === "tenant_isolation_architecture");

    expect(aiNeed).toBeDefined();
    expect(tenantNeed).toBeDefined();

    // Assert - Rationale aggregation
    expect(aiNeed?.rationaleSummary).toContain("1. Required to verify AI model training risk.");
    expect(aiNeed?.rationaleSummary).toContain("2. Required to verify compliance with AI ethics and model audit safeguards.");

    // Assert - Severity merging (promoted to CRITICAL from default/individual matching)
    expect(aiNeed?.severity).toBe("CRITICAL");
    expect(tenantNeed?.severity).toBe("CRITICAL"); // Promoted because of critical/blocker keywords or default high matching

    // Assert - Risk relationship preservation
    expect(aiNeed?.relatedRisks).toContain("ai_training_risk");
    expect(tenantNeed?.relatedRisks).toContain("tenant_escape_risk");

    // Assert - Pillar relationship preservation
    expect(aiNeed?.relatedPillars).toContain("ai_model_security");
    expect(tenantNeed?.relatedPillars).toContain("infrastructure_cloud");

    // Assert - Topic relationship preservation
    expect(aiNeed?.relatedTopics).toContain("ai_governance");
    expect(tenantNeed?.relatedTopics).toContain("infrastructure_security");
  });
});
