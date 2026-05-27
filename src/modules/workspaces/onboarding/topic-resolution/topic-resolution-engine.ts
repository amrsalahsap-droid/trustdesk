import { TRUST_TOPIC_REGISTRY } from "../trust-topic-registry";
import { TOPIC_ALIAS_REGISTRY } from "./topic-alias-registry";
import { TaxonomyNormalizer } from "./taxonomy-normalizer";
import { ResolvedTopic } from "./topic-resolution-types";

export class TopicResolutionEngine {
  /**
   * Resolves a raw topic key into a canonical trust topic or structured provisional topic.
   */
  static resolve(key: string, confidence = 0.5, rationale = ""): ResolvedTopic {
    if (!key) {
      return {
        originalKey: "",
        resolutionType: "unresolved",
        confidence: 0,
        rationale: "Empty key provided.",
      };
    }

    const normalized = TaxonomyNormalizer.normalizeKey(key);

    // 1. Exact Match in Registry
    const exactMatch = TRUST_TOPIC_REGISTRY.find(d => d.key === normalized || d.key === key);
    if (exactMatch) {
      return {
        originalKey: key,
        canonicalKey: exactMatch.key,
        resolutionType: "exact",
        confidence,
        rationale: rationale || `Resolved via exact registry match for key '${exactMatch.key}'`,
        inferredPillarKey: exactMatch.pillarKey,
      };
    }

    // 2. Alias Match in Registry
    const aliasMatch = TOPIC_ALIAS_REGISTRY.find(
      a => a.sourceKey === key || a.sourceKey === normalized
    );
    if (aliasMatch) {
      // Re-verify that target exists in registry
      const targetDef = TRUST_TOPIC_REGISTRY.find(d => d.key === aliasMatch.targetKey);
      return {
        originalKey: key,
        canonicalKey: aliasMatch.targetKey,
        resolutionType: "alias",
        confidence,
        rationale: rationale || `Resolved via deprecated alias: '${key}' -> '${aliasMatch.targetKey}'`,
        inferredPillarKey: targetDef?.pillarKey || aliasMatch.inferredPillarKey,
      };
    }

    // 3. Dynamic Pillar Key Heuristic Inference for Provisional Topics
    const inferredPillar = this.inferPillarKey(normalized);
    if (inferredPillar) {
      // Instrument with warning log for monitoring provisional extensions
      console.warn(`[TopicResolutionEngine] Provisional topic inferred for: ${key} -> Pillar: ${inferredPillar}`);

      return {
        originalKey: key,
        canonicalKey: normalized,
        resolutionType: "provisional",
        confidence,
        rationale: rationale || `Resolved as provisional topic under pillar '${inferredPillar}'`,
        inferredPillarKey: inferredPillar,
      };
    }

    // 4. Unresolved Key Fallback
    console.error(`[TopicResolutionEngine] Unresolved topic key detected: ${key}`);
    return {
      originalKey: key,
      resolutionType: "unresolved",
      confidence,
      rationale: rationale || `Could not resolve topic key '${key}'`,
    };
  }

  /**
   * Helper to dynamically map a topic key to a security pillar using regex substring matches
   */
  private static inferPillarKey(key: string): string | undefined {
    const k = key.toLowerCase();

    // Supply Chain & Subprocessors (must precede privacy_handling)
    if (
      k.includes("subprocessor") ||
      k.includes("vendor") ||
      k.includes("supply") ||
      k.includes("third")
    ) {
      return "supply_chain";
    }

    // Data Privacy & Handling
    if (
      k.includes("priv") ||
      k.includes("comply") ||
      k.includes("compli") ||
      k.includes("reg") ||
      k.includes("law") ||
      k.includes("dpa")
    ) {
      return "privacy_handling";
    }

    // AI & Model Governance
    if (
      k.includes("ai") ||
      k.includes("model") ||
      k.includes("ml") ||
      k.includes("llm") ||
      k.includes("train") ||
      k.includes("algorithm") ||
      k.includes("prompt")
    ) {
      return "ai_model";
    }

    // Sensitive Data Management
    if (
      k.includes("sens") ||
      k.includes("pii") ||
      k.includes("enc") ||
      k.includes("key") ||
      k.includes("pay") ||
      k.includes("financial") ||
      k.includes("card") ||
      k.includes("pci") ||
      k.includes("fraud")
    ) {
      return "sensitive_data";
    }

    // Infrastructure & Cloud Governance
    if (
      k.includes("cloud") ||
      k.includes("infra") ||
      k.includes("tenant") ||
      k.includes("network") ||
      k.includes("segment") ||
      k.includes("api") ||
      k.includes("connect") ||
      k.includes("port") ||
      k.includes("gateway")
    ) {
      return "infrastructure_cloud";
    }

    // Identity & Access Governance
    if (
      k.includes("access") ||
      k.includes("sso") ||
      k.includes("mfa") ||
      k.includes("iam") ||
      k.includes("role") ||
      k.includes("user") ||
      k.includes("auth") ||
      k.includes("identity") ||
      k.includes("verify") ||
      k.includes("provision") ||
      k.includes("pam") ||
      k.includes("rbac")
    ) {
      return "identity_access";
    }

    // Data Storage & Sovereignty
    if (
      k.includes("storage") ||
      k.includes("residen") ||
      k.includes("backup") ||
      k.includes("recover") ||
      k.includes("delet") ||
      k.includes("retain") ||
      k.includes("localiz") ||
      k.includes("sovereign")
    ) {
      return "storage_sovereignty";
    }

    // Compliance & Evidence Readiness
    if (
      k.includes("vuln") ||
      k.includes("patch") ||
      k.includes("incident") ||
      k.includes("audit") ||
      k.includes("monitor") ||
      k.includes("log") ||
      k.includes("scan") ||
      k.includes("test") ||
      k.includes("readiness") ||
      k.includes("framework") ||
      k.includes("standard")
    ) {
      return "compliance_readiness";
    }

    return undefined;
  }
}
