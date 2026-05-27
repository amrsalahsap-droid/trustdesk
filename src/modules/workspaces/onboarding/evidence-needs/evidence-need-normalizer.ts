import { EVIDENCE_NEED_TAXONOMY } from "./evidence-need-taxonomy";

export class EvidenceNeedNormalizer {
  /**
   * Normalizes a raw evidence need type string into a canonical key.
   * If the name cannot be matched against standard patterns, a slugified
   * fallback key is generated to preserve all dynamic inputs without data loss.
   */
  static normalize(rawName: string): string {
    if (!rawName) return "generic_evidence_need";
    
    const normalizedRaw = rawName.toLowerCase().trim();

    // 1. Look for canonical patterns in the taxonomy
    for (const item of EVIDENCE_NEED_TAXONOMY) {
      const matchFound = item.patterns.some(pattern => 
        normalizedRaw.includes(pattern.toLowerCase())
      );
      if (matchFound) {
        return item.canonicalKey;
      }
    }

    // 2. Extra direct matches/heuristics
    if (normalizedRaw.includes("retention") || normalizedRaw.includes("deletion")) {
      return "data_retention_policy";
    }
    if (normalizedRaw.includes("least privilege") || normalizedRaw.includes("connector permission")) {
      return "connector_permission_guide";
    }

    // 3. Dynamic slugified fallback for custom/unresolved needs
    return "custom_" + normalizedRaw
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/(^_+|_+$)/g, "");
  }
}
