import { DeepInferredProfile, Signal } from "./onboarding-core-types";
import { TrustTopicRecommendation } from "./vendor-intelligence-types";
import { TRUST_TOPIC_REGISTRY, TrustTopicDefinition } from "./trust-topic-registry";
import { TopicResolutionEngine } from "./topic-resolution/topic-resolution-engine";

/**
 * Maps high-confidence capability keys to trust topic keys
 */
/**
 * Universal mapping from high-level capabilities to Trust Topics.
 */
const CAPABILITY_TOPIC_MAP: Record<string, string[]> = {
  // Cybersecurity & Infrastructure
  "cloud_scanning": ["infrastructure_security", "cloud_security", "vulnerability_management"],
  "cloud_connector": ["cloud_security", "integration_security", "shared_responsibility"],
  "identity_access_control": ["access_control", "mfa_sso", "user_provisioning", "privileged_access"],
  "identity_management": ["access_control", "user_provisioning"],
  "access_control": ["access_control", "least_privilege"],
  "api_integration": ["api_security", "authentication", "authorization"],
  "vulnerability_management": ["vulnerability_management", "patch_policy", "security_testing"],
  "incident_response": ["incident_response", "business_continuity", "disaster_recovery"],
  
  // Finance & Payments
  "kyc_aml": ["aml_kyc", "transaction_monitoring", "identity_verification"],
  "fraud_detection": ["fraud_prevention", "transaction_security", "account_verification"],
  "payment_processing": ["payment_security", "pci_review", "financial_controls"],
  "transaction_processing": ["transaction_security", "audit_logging", "financial_compliance"],
  
  // Healthcare & Privacy
  "phi_handling": ["hipaa_privacy", "phi_protection", "clinical_security"],
  "health_data_processing": ["healthcare_compliance", "privacy_policy", "data_retention"],
  "patient_consent_management": ["consent_management", "privacy_rights", "user_access_control"],
  
  // AI & Data Science
  "ai_processing": ["ai_governance", "model_security", "ai_privacy"],
  "model_training": ["data_provenance", "ai_ethics", "model_risk_management"],
  "automated_decision_making": ["algorithmic_transparency", "automated_decisions", "fairness_audit"],
  
  // Marketplace & Consumer
  "marketplace_listing": ["transaction_security", "content_moderation", "seller_verification"],
  "identity_verification": ["account_verification", "kyc_aml", "identity_protection"],

  // Sensitive Data Discovery & Classification Capabilities
  "sensitive_data_discovery": ["sensitive_data_management", "encryption_key_management"],
  "data_classification": ["sensitive_data_management", "encryption_key_management"],
};

/**
 * Signal-Driven Topic Inference Engine
 */
export class TopicInferenceEngine {
  
  /**
   * Direct fallback mapping for Procurement Risk Areas to Trust Topics.
   */
  private static readonly RISK_TOPIC_FALLBACK: Record<string, string[]> = {
    "data_privacy_risk": ["privacy_data_protection", "data_retention_deletion", "subprocessor_management"],
    "sensitive_data_risk": ["data_handling", "sensitive_data_management", "encryption_key_management", "access_control"],
    "data_storage_sovereignty_risk": ["data_storage", "data_residency", "backups_recovery", "data_deletion"],
    "infrastructure_cloud_risk": ["cloud_security", "connector_credential_security", "least_privilege", "audit_logging_monitoring"],
    "ai_governance_risk": ["ai_data_processing", "model_governance", "training_data_policy"],
    "identity_verification_risk": ["identity_verification", "pii_handling", "fraud_controls"],
    "identity_access_governance_risk": ["access_control", "mfa_sso", "rbac", "user_provisioning", "privileged_access"],
    "third_party_risk": ["vendor_management", "supply_chain_security"],
    "compliance_gap": ["compliance_frameworks", "audit_readiness"],
  };
  
  /**
   * Infer trust topics from the detected profile signals and risks
   */
  static inferTopics(profile: DeepInferredProfile): TrustTopicRecommendation[] {
    const recommendations: Map<string, TrustTopicRecommendation> = new Map();
    
    const risks = profile.procurementRiskAreas?.value || [];
    for (const risk of risks) {
      // Use explicit keys from inference, or fallback to direct mapping
      let topicKeys = risk.recommendedTopicKeys || [];
      
      if (topicKeys.length === 0) {
        topicKeys = this.RISK_TOPIC_FALLBACK[risk.key] || [];
      }

      for (const topicKey of topicKeys) {
        this.addOrMergeRecommendation(topicKey, recommendations, {
          confidence: risk.confidence,
          sourceKey: risk.key,
          sourceLabel: risk.label,
          evidenceStrength: risk.evidenceStrength || "medium",
          evidenceRefs: risk.evidenceRefs,
          evidenceNeeds: risk.recommendedEvidenceNeeds,
          severity: risk.severity
        });
      }
    }

    // 2. Map Capabilities to Topics
    const caps = profile.structuredCapabilities?.value || [];
    for (const cap of caps) {
      const topicKeys = CAPABILITY_TOPIC_MAP[cap.key as keyof typeof CAPABILITY_TOPIC_MAP] || [];
      for (const topicKey of topicKeys) {
        this.addOrMergeRecommendation(topicKey, recommendations, {
          confidence: cap.confidence || 0.8,
          sourceKey: cap.key,
          sourceLabel: cap.label,
          evidenceStrength: cap.evidenceStrength || "medium",
          evidenceRefs: cap.sourceUrl ? [cap.sourceUrl] : [],
          evidenceNeeds: [],
          severity: "MEDIUM"
        });
      }
    }

    // 3. Map Privacy Posture Signals
    const privacySignals = profile.privacyPostureSignals?.value || [];
    for (const sig of privacySignals) {
      if (sig.toLowerCase().includes("retention") || sig.toLowerCase().includes("deletion")) {
        this.addOrMergeRecommendation("data_retention_deletion", recommendations, {
          confidence: 0.8,
          sourceKey: "privacy_signal",
          sourceLabel: `Privacy Signal: ${sig}`,
          evidenceRefs: [],
          evidenceNeeds: [],
          severity: "HIGH"
        });
      }
    }

    // 4. Handle "Never 0 Topics" rule
    if (recommendations.size === 0) {
      this.addFallbackTopics(profile, recommendations);
    }

    return Array.from(recommendations.values());
  }

  private static addOrMergeRecommendation(
    topicKey: string, 
    recommendations: Map<string, TrustTopicRecommendation>,
    input: {
      confidence: number;
      sourceKey: string;
      sourceLabel: string;
      evidenceStrength: string;
      evidenceRefs: string[];
      evidenceNeeds: string[];
      severity?: string;
    }
  ) {
    const resolved = TopicResolutionEngine.resolve(topicKey, input.confidence, `Inferred via: ${input.sourceLabel}`);
    const resolvedKey = resolved.canonicalKey || topicKey;
    const isProvisional = resolved.resolutionType === "provisional";

    const def = TRUST_TOPIC_REGISTRY.find(d => d.key === resolvedKey);
    if (!def && !isProvisional) return;

    const existing = recommendations.get(resolvedKey);
    if (existing) {
      existing.confidence = Math.max(existing.confidence, input.confidence);
      existing.triggeredBy = Array.from(new Set([...existing.triggeredBy, input.sourceKey]));
      
      const newRefs = input.evidenceRefs.map(url => ({ 
        url, 
        title: input.sourceLabel, 
        snippet: "", 
        confidence: input.confidence 
      }));
      existing.evidenceRefs = Array.from(new Map([...existing.evidenceRefs, ...newRefs].map(r => [r.url, r])).values());
      
      if (!existing.rationale.includes(input.sourceLabel)) {
        existing.rationale = `${existing.rationale}; Supported by: ${input.sourceLabel}`;
      }
      existing.evidenceNeeds = Array.from(new Set([...existing.evidenceNeeds, ...(input.evidenceNeeds || [])]));
      
      // Upgrade priority if source is critical
      if (input.severity === "CRITICAL") existing.priority = "CRITICAL";
      else if (input.severity === "HIGH" && existing.priority !== "CRITICAL") existing.priority = "HIGH";
      
      // Re-determine status based on new highest confidence
      existing.status = this.determineStatus(existing.confidence, input.evidenceStrength); 
    } else {
      const status = this.determineStatus(input.confidence, input.evidenceStrength);
      
      if (def) {
        recommendations.set(resolvedKey, {
          id: `topic_${resolvedKey}`,
          key: resolvedKey,
          title: def.title,
          description: def.description,
          priority: input.severity === "CRITICAL" ? "CRITICAL" : (input.severity === "HIGH" ? "HIGH" : (def.defaultPriority || "MEDIUM")),
          topicKeys: [resolvedKey],
          confidence: input.confidence,
          status: status,
          triggeredBy: [input.sourceKey],
          rationale: `Triggered by: ${input.sourceLabel}`,
          evidenceRefs: (input.evidenceRefs || []).map(url => ({ 
            url, 
            title: input.sourceLabel, 
            snippet: "", 
            confidence: input.confidence 
          })),
          answerScaffoldAreas: def.impliedAnswerAreas || [],
          evidenceNeeds: Array.from(new Set([...(def.impliedEvidenceNeeds || []), ...(input.evidenceNeeds || [])])),
        });
      } else {
        // Provisional topic creation
        const title = resolvedKey.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        recommendations.set(resolvedKey, {
          id: `topic_${resolvedKey}`,
          key: resolvedKey,
          title: title,
          description: `Provisional trust topic inferred for ${title}.`,
          priority: input.severity === "CRITICAL" ? "CRITICAL" : (input.severity === "HIGH" ? "HIGH" : "MEDIUM"),
          topicKeys: [resolvedKey],
          confidence: input.confidence,
          status: status,
          triggeredBy: [input.sourceKey],
          rationale: `Triggered by: ${input.sourceLabel} (${resolved.rationale})`,
          evidenceRefs: (input.evidenceRefs || []).map(url => ({ 
            url, 
            title: input.sourceLabel, 
            snippet: "", 
            confidence: input.confidence 
          })),
          answerScaffoldAreas: [],
          evidenceNeeds: input.evidenceNeeds || [],
        });
      }
    }
  }

  /**
   * Determine topic status based on confidence rules
   */
  private static determineStatus(confidence: number, strength: string): TrustTopicRecommendation["status"] {
    const isStrong = strength === "strong" || strength === "authoritative";
    
    if (confidence >= 0.85 && isStrong) {
      return "auto_ready";
    }
    
    if (confidence >= 0.60) {
      return "review_suggested";
    }
    
    return "needs_evidence";
  }

  /**
   * Add fallback recommendations if no high-confidence topics were found
   */
  private static addFallbackTopics(profile: DeepInferredProfile, map: Map<string, TrustTopicRecommendation>) {
    // If it's a B2B SaaS, always at least suggest Access Control and Incident Response
    const isB2B = profile.customerSegment?.value === "b2b";
    const isSaaS = profile.productType?.value === "saas";

    if (isB2B && isSaaS) {
      const fallbackKeys = ["access_control", "incident_response"];
      for (const key of fallbackKeys) {
        const def = TRUST_TOPIC_REGISTRY.find(d => d.key === key);
        if (def) {
          map.set(key, {
            id: `fallback_${key}`,
            key: key,
            title: def.title,
            description: def.description,
            priority: "MEDIUM",
            topicKeys: [key],
            confidence: 0.5,
            status: "needs_evidence",
            triggeredBy: ["b2b_saas_context"],
            rationale: "Standard enterprise governance for B2B SaaS platforms.",
            evidenceRefs: [],
            answerScaffoldAreas: def.impliedAnswerAreas,
            evidenceNeeds: def.impliedEvidenceNeeds,
          });
        }
      }
    }
  }
}
