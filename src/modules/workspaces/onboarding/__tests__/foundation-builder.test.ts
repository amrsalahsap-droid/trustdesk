
import { describe, it, expect } from "vitest";
import { FoundationBuilder } from "../foundation-builder";
import { 
  ProcurementRiskArea, 
  CapabilitySignal, 
  InferredBooleanSignal 
} from "../vendor-intelligence-types";

describe("FoundationBuilder", () => {
  describe("buildWorkspaceFoundationResult", () => {
    it("ensures risk areas with recommendedTopicKeys produce foundation topics (Regression #1)", () => {
      const riskAreas: ProcurementRiskArea[] = [
        {
          key: "data_privacy_risk",
          label: "Data Privacy Risk",
          reason: "Handles PII without clear DPA",
          recommendedTopicKeys: ["privacy_data_protection", "data_retention_deletion"],
          confidence: 0.75,
          evidenceStrength: "medium",
          severity: "HIGH",
          triggeringSignals: ["pii_detected"],
          evidenceRefs: [{ url: "https://example.com/privacy", title: "Privacy", snippet: "...", confidence: 0.75 }],
          recommendedEvidenceNeeds: [],
          clarificationTasks: []
        }
      ];

      const result = FoundationBuilder.build({
        riskAreas,
        capabilities: [],
        operationalModel: { usesAIOnCustomerData: false } as any,
        evidenceRefs: [],
        citations: [],
        sourcePages: []
      });

      expect(result.totalRelevantTopicsCount).toBeGreaterThan(0);
      expect(result.generatedTopicKeys).toContain("privacy_data_protection");
      expect(result.generatedTopicKeys).toContain("data_retention_deletion");
      
      // Check status mapping
      const privacyTopic = result.generatedTopics.find(t => t.key === "privacy_data_protection");
      expect(privacyTopic?.status).toBe("review_suggested");
    });

    it("ensures low evidence topics are marked as needs_evidence and generate evidence needs (Regression #2)", () => {
      const riskAreas: ProcurementRiskArea[] = [
        {
          key: "ai_risk",
          label: "AI Governance Risk",
          reason: "Using AI on customer data with weak evidence",
          recommendedTopicKeys: ["ai_data_processing"],
          confidence: 0.55,
          evidenceStrength: "weak",
          severity: "MEDIUM",
          triggeringSignals: ["ai_keywords"],
          evidenceRefs: [],
          recommendedEvidenceNeeds: [],
          clarificationTasks: []
        }
      ];

      const result = FoundationBuilder.build({
        riskAreas,
        capabilities: [],
        operationalModel: { usesAIOnCustomerData: true } as any,
        evidenceRefs: [],
        citations: [],
        sourcePages: []
      });

      const aiTopic = result.generatedTopics.find(t => t.key === "ai_data_processing");
      expect(aiTopic?.status).toBe("needs_evidence");
      expect(result.needsEvidenceTopicsCount).toBeGreaterThan(0);
      
      // Evidence need should be generated
      expect(result.evidenceNeedsCount).toBeGreaterThan(0);
    });

    it("creates clarification tasks from uncertain operational signals (Regression #3)", () => {
      const result = FoundationBuilder.build({
        riskAreas: [],
        capabilities: [],
        operationalModel: { usesAIOnCustomerData: true } as any,
        evidenceRefs: [],
        citations: [],
        sourcePages: [],
        clarificationTasks: []
      });

      expect(result.clarificationTasksCount).toBeGreaterThan(0);
    });

    it("ensures sourcePagesCount is consistent with citations (Regression #4)", () => {
      const result = FoundationBuilder.build({
        riskAreas: [],
        capabilities: [],
        operationalModel: {} as any,
        evidenceRefs: [],
        citations: [
          { sourceUrl: "https://example.com/sec1", snippet: "...", field: "ind" },
          { sourceUrl: "https://example.com/sec2", snippet: "...", field: "ind" }
        ],
        sourcePages: ["https://example.com/sec1"]
      });

      expect(result.sourcePagesCount).toBe(2);
      expect(result.citationsCount).toBe(2);
    });

    it("generates mapping gap warning when risks exist but no topics generated (Regression #6)", () => {
      const riskAreas: ProcurementRiskArea[] = [
        {
          key: "unknown_risk",
          label: "Unknown Risk",
          reason: "Unknown",
          recommendedTopicKeys: [],
          confidence: 0.9,
          evidenceStrength: "strong",
          severity: "HIGH",
          triggeringSignals: [],
          evidenceRefs: [],
          recommendedEvidenceNeeds: [],
          clarificationTasks: []
        }
      ];

      const result = FoundationBuilder.build({
        riskAreas,
        capabilities: [],
        operationalModel: {} as any,
        evidenceRefs: [],
        citations: [],
        sourcePages: []
      });

      expect(result.totalRelevantTopicsCount).toBe(0);
      expect(result.warnings.some(w => w.toLowerCase().includes("mapping gap"))).toBe(true);
    });

    it("caps auto_ready status to review_suggested when evidenceException is present (New Exception Feature)", () => {
      const riskAreas: ProcurementRiskArea[] = [
        {
          key: "data_privacy_risk",
          label: "Data Privacy Risk",
          reason: "Handles PII without clear DPA",
          recommendedTopicKeys: ["privacy_data_protection"],
          confidence: 0.95, // high confidence normally yields auto_ready
          evidenceStrength: "strong",
          severity: "HIGH",
          triggeringSignals: ["pii_detected"],
          evidenceRefs: [{ url: "https://example.com/privacy", title: "Privacy", snippet: "...", confidence: 0.95 }],
          recommendedEvidenceNeeds: [],
          clarificationTasks: []
        }
      ];

      const result = FoundationBuilder.build({
        riskAreas,
        capabilities: [],
        operationalModel: {} as any,
        evidenceRefs: [],
        citations: [],
        sourcePages: [],
        evidenceExceptions: {
          "privacy_data_protection": {
            status: "unavailable",
            reason: "Not available yet"
          }
        }
      });

      const privacyTopic = result.generatedTopics.find(t => t.key === "privacy_data_protection");
      expect(privacyTopic).toBeDefined();
      expect(privacyTopic?.status).toBe("review_suggested");
    });
  });
});
