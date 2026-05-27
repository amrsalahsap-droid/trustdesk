import { describe, it, expect } from "vitest";
import { FoundationBuilder } from "../foundation-builder";

describe("ProvisionalPillars", () => {
  it("should dynamically generate provisional/unresolved pillars for unresolved topic keys", () => {
    const result = FoundationBuilder.build({
      mode: "preview",
      riskAreas: [
        {
          key: "custom_unresolved_risk",
          label: "Custom Unresolved Risk",
          severity: "CRITICAL",
          confidence: 0.90,
          evidenceStrength: "strong",
          reason: "An entirely custom business risk.",
          recommendedTopicKeys: ["xyz_non_canonical_theme"], // Totally unknown, won't match heuristics
          recommendedEvidenceNeeds: [],
          evidenceRefs: [{ url: "https://cybral.com/evidence-unresolved", title: "Unresolved Title", snippet: "snippet", confidence: 0.90 }]
        }
      ],
      capabilities: [],
      operationalModel: {} as any,
      evidenceRefs: [],
      citations: [],
      sourcePages: [],
    });

    // Verify topic was created as provisional
    const topic = result.generatedTopics.find(t => t.key === "xyz_non_canonical_theme");
    expect(topic).toBeDefined();

    // Verify unresolved custom pillar was generated dynamically
    const unresolvedPillar = result.pillars.find(p => p.key === "provisional_xyz_non_canonical_theme");
    expect(unresolvedPillar).toBeDefined();
    expect(unresolvedPillar?.pillarType).toBe("unresolved");
    expect(unresolvedPillar?.title).toContain("Xyz Non Canonical Theme (Needs Mapping Review)");
    expect(unresolvedPillar?.mappingFailedReason).toContain("taxonomy mapping review");
    expect(unresolvedPillar?.whyExists).toContain("custom_unresolved_risk");
    expect(unresolvedPillar?.supportingEvidence).toContain("https://cybral.com/evidence-unresolved");
    expect(unresolvedPillar?.supportingEvidenceCount).toBe(1);
  });

  it("should map provisional topics with inferred keys to standard pillars and mark as inferred", () => {
    const result = FoundationBuilder.build({
      mode: "preview",
      riskAreas: [
        {
          key: "ai_training_risk",
          label: "AI Training Risk",
          severity: "HIGH",
          confidence: 0.85,
          evidenceStrength: "medium",
          reason: "Model training detected.",
          recommendedTopicKeys: ["custom_ai_model_ethics"], // Provisional key, but heuristics map it to "ai_model" pillar
          recommendedEvidenceNeeds: [],
          evidenceRefs: [{ url: "https://cybral.com/evidence-ai", title: "AI Title", snippet: "snippet", confidence: 0.85 }]
        }
      ],
      capabilities: [],
      operationalModel: {} as any,
      evidenceRefs: [],
      citations: [],
      sourcePages: [],
    });

    // Topic exists
    const topic = result.generatedTopics.find(t => t.key === "custom_ai_model_ethics");
    expect(topic).toBeDefined();

    // Grouped into the standard ai_model pillar and marked as inferred
    const aiPillar = result.pillars.find(p => p.key === "ai_model");
    expect(aiPillar).toBeDefined();
    expect(aiPillar?.pillarType).toBe("inferred");
    expect(aiPillar?.topicKeys).toContain("custom_ai_model_ethics");
    expect(aiPillar?.supportingEvidence).toContain("https://cybral.com/evidence-ai");
  });

  it("ensures mixed canonical and provisional topics in the same pillar maps successfully", () => {
    const result = FoundationBuilder.build({
      mode: "preview",
      riskAreas: [
        {
          key: "ai_training_risk",
          label: "AI Training Risk",
          severity: "HIGH",
          confidence: 0.85,
          evidenceStrength: "medium",
          reason: "Model training detected.",
          recommendedTopicKeys: ["ai_data_processing", "custom_ai_model_ethics"], // Mixed: one canonical registry, one provisional
          recommendedEvidenceNeeds: [],
        }
      ],
      capabilities: [],
      operationalModel: {} as any,
      evidenceRefs: [],
      citations: [],
      sourcePages: [],
    });

    const aiPillar = result.pillars.find(p => p.key === "ai_model");
    expect(aiPillar).toBeDefined();
    expect(aiPillar?.pillarType).toBe("inferred");
    expect(aiPillar?.topicKeys).toContain("ai_data_processing");
    expect(aiPillar?.topicKeys).toContain("custom_ai_model_ethics");
  });

  it("guarantees the no-silent-suppression invariant (all topics map to a pillar)", () => {
    const result = FoundationBuilder.build({
      mode: "preview",
      riskAreas: [
        {
          key: "mixed_bag",
          label: "Mixed Risks",
          severity: "CRITICAL",
          confidence: 0.90,
          evidenceStrength: "strong",
          reason: "Checking suppression.",
          recommendedTopicKeys: ["privacy_compliance", "custom_subprocessor_log", "completely_unknown_tracking"],
          recommendedEvidenceNeeds: [],
        }
      ],
      capabilities: [],
      operationalModel: {} as any,
      evidenceRefs: [],
      citations: [],
      sourcePages: [],
    });

    // Expected generated topics:
    // 1. "privacy_data_protection" (canonical resolved from alias "privacy_compliance") -> pillar: "privacy_handling"
    // 2. "custom_subprocessor_log" (provisional resolved to pillar "privacy_handling" via heuristics) -> pillar: "privacy_handling"
    // 3. "completely_unknown_tracking" (unresolved topic) -> custom provisional pillar: "provisional_completely_unknown_tracking"

    // Verify all topics exist
    expect(result.generatedTopicKeys).toContain("privacy_data_protection");
    expect(result.generatedTopicKeys).toContain("custom_subprocessor_log");
    expect(result.generatedTopicKeys).toContain("completely_unknown_tracking");

    // All topic keys are grouped in at least one pillar
    const allTopicKeysInPillars = new Set(result.pillars.flatMap(p => p.topicKeys));
    expect(allTopicKeysInPillars.has("privacy_data_protection")).toBe(true);
    expect(allTopicKeysInPillars.has("custom_subprocessor_log")).toBe(true);
    expect(allTopicKeysInPillars.has("completely_unknown_tracking")).toBe(true);

    // Dynamic stats reflect all pillars
    expect(result.totalPillarsCount).toBe(3); // Data Privacy & Handling (with inferred topic) + 1 Supply Chain Pillar + 1 Custom Provisional Pillar
  });
});
