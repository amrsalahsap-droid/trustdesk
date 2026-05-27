import { EvidenceNeed, ResolvedEvidenceNeed, ProcurementRiskArea, TrustTopicRecommendation, SecurityPillar } from "../vendor-intelligence-types";
import { EVIDENCE_NEED_TAXONOMY, TaxonomyEvidenceNeed } from "./evidence-need-taxonomy";
import { EvidenceNeedNormalizer } from "./evidence-need-normalizer";

export class EvidenceNeedResolutionEngine {
  /**
   * Resolves a raw list of evidence needs into a consolidated, canonical, and highly auditable
   * list of resolved evidence gaps, fully preserving relations, rationales, and impact scores.
   */
  static resolve(
    rawNeeds: EvidenceNeed[],
    context: {
      riskAreas: ProcurementRiskArea[];
      topics: TrustTopicRecommendation[];
      pillars: SecurityPillar[];
    }
  ): ResolvedEvidenceNeed[] {
    const { riskAreas = [], topics = [], pillars = [] } = context;
    const resolvedMap = new Map<string, {
      canonicalKey: string;
      title: string;
      description: string;
      relatedRisks: Set<string>;
      relatedPillars: Set<string>;
      relatedTopics: Set<string>;
      procurementImpact: string;
      severities: string[];
      reasons: Set<string>;
    }>();

    const rawCount = rawNeeds.length;

    rawNeeds.forEach(need => {
      const canonicalKey = EvidenceNeedNormalizer.normalize(need.type);
      const taxonomyEntry = EVIDENCE_NEED_TAXONOMY.find(t => t.canonicalKey === canonicalKey);

      // Determine default properties
      const title = taxonomyEntry ? taxonomyEntry.title : need.type;
      const description = taxonomyEntry ? taxonomyEntry.description : `Verification evidence required for ${need.type}.`;
      const procurementImpact = taxonomyEntry ? taxonomyEntry.procurementImpact : "Required to verify posture controls and satisfy procurement security criteria.";
      const defaultSeverity = taxonomyEntry ? taxonomyEntry.defaultSeverity : "MEDIUM";
      const defaultPillar = taxonomyEntry ? taxonomyEntry.defaultPillar : "Compliance & Audit Readiness";

      // 1. Resolve related risks
      const relatedRisks = new Set<string>();
      const needText = `${need.type} ${need.reason}`.toLowerCase();

      riskAreas.forEach(risk => {
        const keyMatch = needText.includes(risk.key.toLowerCase());
        const labelMatch = needText.includes(risk.label.toLowerCase());
        
        // Explicit mappings based on canonical keys
        let explicitMatch = false;
        if (canonicalKey === "ai_data_usage_policy" && risk.key === "ai_training_risk") explicitMatch = true;
        if (canonicalKey === "tenant_isolation_architecture" && risk.key === "tenant_escape_risk") explicitMatch = true;
        if (canonicalKey === "connector_permission_guide" && (risk.key === "privileged_access" || risk.key === "infrastructure_reach")) explicitMatch = true;

        if (keyMatch || labelMatch || explicitMatch) {
          relatedRisks.add(risk.key);
        }
      });

      // 2. Resolve related topics
      const relatedTopics = new Set<string>();
      topics.forEach(topic => {
        const keyMatch = needText.includes(topic.key.toLowerCase());
        const titleMatch = needText.includes(topic.title.toLowerCase());
        
        // Topic matches related risk
        const riskMatch = Array.from(relatedRisks).some(rk => topic.triggeredBy.includes(rk));

        if (keyMatch || titleMatch || riskMatch) {
          relatedTopics.add(topic.key);
        }
      });

      // 3. Resolve related pillars
      const relatedPillars = new Set<string>();
      pillars.forEach(pillar => {
        // Direct matching by topic
        const hasTopic = pillar.topicKeys.some(tk => relatedTopics.has(tk));
        // Direct text match
        const nameMatch = pillar.title.toLowerCase().includes(defaultPillar.toLowerCase()) || needText.includes(pillar.title.toLowerCase());
        
        if (hasTopic || nameMatch) {
          relatedPillars.add(pillar.key);
        }
      });
      if (relatedPillars.size === 0 && taxonomyEntry) {
        // Fallback to default pillar key if known
        const matchingPillar = pillars.find(p => p.title.toLowerCase().includes(defaultPillar.toLowerCase()));
        if (matchingPillar) {
          relatedPillars.add(matchingPillar.key);
        }
      }

      // Determine severity for this specific need instance
      let severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" = defaultSeverity;
      const reasonLower = need.reason.toLowerCase();
      const severityHierarchy = { "CRITICAL": 4, "HIGH": 3, "MEDIUM": 2, "LOW": 1 };

      let inferredSeverity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" = "LOW";
      if (reasonLower.includes("critical") || reasonLower.includes("blocker")) {
        inferredSeverity = "CRITICAL";
      } else if (reasonLower.includes("high") || reasonLower.includes("required")) {
        inferredSeverity = "HIGH";
      } else if (reasonLower.includes("medium") || reasonLower.includes("suggested") || reasonLower.includes("review")) {
        inferredSeverity = "MEDIUM";
      }

      if (severityHierarchy[inferredSeverity] > severityHierarchy[defaultSeverity]) {
        severity = inferredSeverity;
      }

      // Initialize or Merge in Map
      const existing = resolvedMap.get(canonicalKey);
      if (existing) {
        relatedRisks.forEach(r => existing.relatedRisks.add(r));
        relatedTopics.forEach(t => existing.relatedTopics.add(t));
        relatedPillars.forEach(p => existing.relatedPillars.add(p));
        existing.reasons.add(need.reason);
        existing.severities.push(severity);
      } else {
        resolvedMap.set(canonicalKey, {
          canonicalKey,
          title,
          description,
          relatedRisks,
          relatedPillars,
          relatedTopics,
          procurementImpact,
          severities: [severity],
          reasons: new Set([need.reason])
        });
      }
    });

    // 4. Build output models with promoted severities and merged rationales
    const resolvedNeeds: ResolvedEvidenceNeed[] = [];
    const severityHierarchy = { "CRITICAL": 4, "HIGH": 3, "MEDIUM": 2, "LOW": 1 };

    resolvedMap.forEach((val, canonicalKey) => {
      // Find highest severity among contributing occurrences
      let highestSeverity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" = "LOW";
      let maxScore = 0;
      val.severities.forEach(sev => {
        const score = severityHierarchy[sev as keyof typeof severityHierarchy] || 0;
        if (score > maxScore) {
          maxScore = score;
          highestSeverity = sev as any;
        }
      });

      // Aggregate reasons cleanly
      const uniqueReasons = Array.from(val.reasons).filter(Boolean);
      const rationaleSummary = uniqueReasons.length > 1
        ? uniqueReasons.map((r, idx) => `${idx + 1}. ${r}`).join(" ")
        : (uniqueReasons[0] || `Required to verify operational compliance posture.`);

      resolvedNeeds.push({
        canonicalKey: val.canonicalKey,
        title: val.title,
        description: val.description,
        relatedRisks: Array.from(val.relatedRisks),
        relatedPillars: Array.from(val.relatedPillars),
        relatedTopics: Array.from(val.relatedTopics),
        procurementImpact: val.procurementImpact,
        severity: highestSeverity,
        rationaleSummary
      });
    });

    // 5. Instrumentation and Logging
    console.log(`[EvidenceNeedResolutionEngine] Consolidated ${rawCount} raw evidence needs into ${resolvedNeeds.length} canonical resolved needs.`);
    resolvedNeeds.forEach(need => {
      console.log(`[EvidenceNeedResolutionEngine] -> Canonical Need: ${need.title} (Key: ${need.canonicalKey}, Severity: ${need.severity}) merged from ${rawNeeds.filter(rn => EvidenceNeedNormalizer.normalize(rn.type) === need.canonicalKey).length} duplicates.`);
    });

    return resolvedNeeds;
  }
}
