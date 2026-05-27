import { describe, it, expect } from "vitest";
import { TopicResolutionEngine } from "../topic-resolution/topic-resolution-engine";
import { TaxonomyNormalizer } from "../topic-resolution/taxonomy-normalizer";
import { FoundationBuilder } from "../foundation-builder";

describe("TopicResolutionEngine", () => {
  describe("Taxonomy Normalizer", () => {
    it("should standardize casing and convert separators", () => {
      expect(TaxonomyNormalizer.normalizeKey("Privacy-Compliance ")).toBe("privacy_compliance");
      expect(TaxonomyNormalizer.normalizeKey("model-training")).toBe("model_training");
    });

    it("should strip prefixes and suffixes", () => {
      expect(TaxonomyNormalizer.normalizeKey("topic_access_control")).toBe("access_control");
      expect(TaxonomyNormalizer.normalizeKey("cloud_security_risk")).toBe("cloud_security");
    });

    it("should map common singulars and plurals standardly", () => {
      expect(TaxonomyNormalizer.normalizeKey("subprocessor")).toBe("subprocessors");
      expect(TaxonomyNormalizer.normalizeKey("backup")).toBe("backups");
    });
  });

  describe("Topic Key Resolution", () => {
    it("should resolve exact canonical keys directly", () => {
      const res = TopicResolutionEngine.resolve("cloud_security");
      expect(res.resolutionType).toBe("exact");
      expect(res.canonicalKey).toBe("cloud_security");
      expect(res.inferredPillarKey).toBe("infrastructure_cloud");
    });

    it("should resolve deprecated or semantic aliases cleanly", () => {
      const res1 = TopicResolutionEngine.resolve("privacy_compliance");
      expect(res1.resolutionType).toBe("alias");
      expect(res1.canonicalKey).toBe("privacy_data_protection");
      expect(res1.inferredPillarKey).toBe("privacy_handling");

      const res2 = TopicResolutionEngine.resolve("subprocessors");
      expect(res2.resolutionType).toBe("alias");
      expect(res2.canonicalKey).toBe("subprocessor_management");
      expect(res2.inferredPillarKey).toBe("supply_chain");

      const res3 = TopicResolutionEngine.resolve("monitoring");
      expect(res3.resolutionType).toBe("alias");
      expect(res3.canonicalKey).toBe("audit_logging_monitoring");
      expect(res3.inferredPillarKey).toBe("compliance_readiness");
    });

    it("should infer dynamic pillar key for unknown provisional topics", () => {
      const res1 = TopicResolutionEngine.resolve("custom_ai_policy");
      expect(res1.resolutionType).toBe("provisional");
      expect(res1.canonicalKey).toBe("custom_ai_policy");
      expect(res1.inferredPillarKey).toBe("ai_model");

      const res2 = TopicResolutionEngine.resolve("gateway_api_connector");
      expect(res2.resolutionType).toBe("provisional");
      expect(res2.inferredPillarKey).toBe("infrastructure_cloud");
    });

    it("should return unresolved for entirely unknown strings with no heuristics", () => {
      const res = TopicResolutionEngine.resolve("xyz_unknown_concept");
      expect(res.resolutionType).toBe("unresolved");
      expect(res.canonicalKey).toBeUndefined();
    });
  });

  describe("End-to-End Integration in FoundationBuilder", () => {
    it("should map and merge risk-associated topic aliases in FoundationBuilder.build", () => {
      const result = FoundationBuilder.build({
        mode: "preview",
        riskAreas: [
          {
            key: "customer_data_exposure",
            label: "Customer Data Exposure",
            severity: "CRITICAL",
            confidence: 0.90,
            evidenceStrength: "strong",
            reason: "Detected processing of sensitive datasets.",
            recommendedTopicKeys: ["privacy_compliance", "subprocessors"],
            recommendedEvidenceNeeds: [],
          },
          {
            key: "regulated_data_risk",
            label: "Regulated Data Exposure",
            severity: "HIGH",
            confidence: 0.85,
            evidenceStrength: "medium",
            reason: "Processes GDPR datasets.",
            recommendedTopicKeys: ["privacy_compliance"],
            recommendedEvidenceNeeds: [],
          }
        ],
        capabilities: [],
        operationalModel: {
          accessesCustomerData: true,
          processesSensitiveData: true,
          storesCustomerData: false,
          scansInfrastructure: false,
          integratesWithCloudProviders: false,
          usesAIOnCustomerData: false,
          handlesPayments: false,
          handlesPII: true,
        },
        evidenceRefs: [],
        citations: [],
        sourcePages: ["https://cybral.com"],
      });

      // The key "privacy_compliance" resolves to "privacy_data_protection"
      // The key "subprocessors" resolves to "subprocessor_management"
      // privacy_data_protection groups under the Data Privacy & Handling pillar
      const privacyPillar = result.pillars.find(p => p.key === "privacy_handling");
      expect(privacyPillar).toBeDefined();
      expect(privacyPillar?.topicKeys).toContain("privacy_data_protection");

      // subprocessor_management groups under the Supply Chain & Subprocessors provisional pillar
      const supplyChainPillar = result.pillars.find(p => p.key === "provisional_supply_chain");
      expect(supplyChainPillar).toBeDefined();
      expect(supplyChainPillar?.topicKeys).toContain("subprocessor_management");

      // Verify no duplicate keys exist in finalTopics
      const privacyDataProtectionTopics = result.generatedTopics.filter(t => t.key === "privacy_data_protection");
      expect(privacyDataProtectionTopics.length).toBe(1);

      // Aggregated confidence
      expect(privacyDataProtectionTopics[0].confidence).toBe(0.90);
      expect(privacyDataProtectionTopics[0].triggeredBy).toContain("customer_data_exposure");
      expect(privacyDataProtectionTopics[0].triggeredBy).toContain("regulated_data_risk");
    });
  });
});
