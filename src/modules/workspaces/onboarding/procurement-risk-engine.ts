import { DeepInferredProfile, ProcurementRiskArea, Capability } from "./onboarding-core-types";
import { findCanonicalCapability } from "./capability-registry";

/**
 * Global Procurement Risk Inference Engine
 * 
 * Logic to translate detected capabilities and data signals into 
 * standard procurement risk areas and remediation topics.
 */
export class ProcurementRiskEngine {
  
  /**
   * Infer risk areas based on the current profile
   */
  static inferRisks(profile: DeepInferredProfile): ProcurementRiskArea[] {
    const risks: Map<string, ProcurementRiskArea> = new Map();

    const addRisk = (risk: Partial<ProcurementRiskArea> & { key: string }) => {
      const existing = risks.get(risk.key);
      if (existing) {
        // Merge reasons and signals
        existing.reason = `${existing.reason}; ${risk.reason}`;
        existing.triggeringSignals = Array.from(new Set([...existing.triggeringSignals, ...(risk.triggeringSignals || [])]));
        existing.evidenceRefs = Array.from(new Set([...existing.evidenceRefs, ...(risk.evidenceRefs || [])]));
        existing.confidence = Math.max(existing.confidence, risk.confidence || 0);
        
        const STRENGTH_RANK = { weak: 1, medium: 2, strong: 3, authoritative: 4 };
        if (STRENGTH_RANK[risk.evidenceStrength || "medium"] > STRENGTH_RANK[existing.evidenceStrength]) {
          existing.evidenceStrength = risk.evidenceStrength || "medium";
        }

        existing.recommendedTopicKeys = Array.from(new Set([...existing.recommendedTopicKeys, ...(risk.recommendedTopicKeys || [])]));
        existing.recommendedEvidenceNeeds = Array.from(new Set([...existing.recommendedEvidenceNeeds, ...(risk.recommendedEvidenceNeeds || [])]));
        existing.clarificationTasks = Array.from(new Set([...existing.clarificationTasks, ...(risk.clarificationTasks || [])]));
      } else {
        risks.set(risk.key, {
          key: risk.key,
          label: risk.label || risk.key.replace(/_/g, ' ').toUpperCase(),
          reason: risk.reason || "",
          confidence: risk.confidence || 0.5,
          evidenceStrength: risk.evidenceStrength || "medium",
          severity: risk.severity || "MEDIUM",
          triggeringSignals: risk.triggeringSignals || [],
          evidenceRefs: risk.evidenceRefs || [],
          recommendedTopicKeys: risk.recommendedTopicKeys || [],
          recommendedEvidenceNeeds: risk.recommendedEvidenceNeeds || [],
          clarificationTasks: risk.clarificationTasks || [],
        });
      }
    };

    const caps = profile.structuredCapabilities?.value || [];
    const interaction = profile.dataInteractionModel?.value || {
      accessesCustomerData: false,
      processesSensitiveData: false,
      storesCustomerData: false,
      scansInfrastructure: false,
      integratesWithCloudProviders: false,
      usesAIOnCustomerData: false,
      handlesPayments: false,
      handlesPII: false,
    };

    // 1. Data Access / PII
    if (interaction.accessesCustomerData || interaction.handlesPII) {
      addRisk({
        key: "data_privacy_risk",
        label: "Data Privacy & Handling",
        reason: "Product accesses customer data or handles PII, requiring robust privacy controls.",
        confidence: 0.9,
        evidenceStrength: "strong",
        severity: "HIGH",
        triggeringSignals: ["accessesCustomerData", "handlesPII"],
        recommendedTopicKeys: ["privacy_data_protection", "data_retention_deletion", "subprocessor_management"],
        recommendedEvidenceNeeds: ["Privacy Policy", "Data Processing Agreement"],
      });
    }

    // 2. Sensitive Data
    if (interaction.processesSensitiveData) {
      addRisk({
        key: "sensitive_data_risk",
        label: "Sensitive Data Management",
        reason: "Product processes sensitive assets, necessitating advanced encryption and access controls.",
        confidence: 0.95,
        severity: "CRITICAL",
        triggeringSignals: ["processesSensitiveData"],
        recommendedTopicKeys: ["data_handling", "sensitive_data_management", "encryption_key_management", "access_control"],
        recommendedEvidenceNeeds: ["Encryption Standards", "Access Control Policy"],
      });
    }

    // 3. Storage
    if (interaction.storesCustomerData) {
      addRisk({
        key: "data_storage_sovereignty_risk",
        label: "Data Storage & Sovereignty",
        reason: "Customer data is stored by the vendor, introducing retention, residency, and backup risks.",
        confidence: 0.9,
        evidenceStrength: "strong",
        severity: "HIGH",
        triggeringSignals: ["storesCustomerData"],
        recommendedTopicKeys: ["data_storage", "data_residency", "backups_recovery", "data_deletion"],
        recommendedEvidenceNeeds: ["Backup Policy", "Data Residency Map"],
      });
    }

    // 4. Cloud / Infrastructure
    const cloudCaps = caps.filter(c => c.key === "cloud_connector" || c.key === "cloud_scanning");
    if (cloudCaps.length > 0 || interaction.integratesWithCloudProviders || interaction.scansInfrastructure) {
      addRisk({
        key: "infrastructure_cloud_risk",
        label: "Infrastructure & Cloud Governance",
        reason: "Direct integration with cloud environments or infrastructure scanning detected.",
        confidence: 0.85,
        evidenceStrength: "strong",
        severity: "HIGH",
        triggeringSignals: cloudCaps.map(c => c.key),
        evidenceRefs: cloudCaps.map(c => c.sourceUrl),
        recommendedTopicKeys: ["cloud_security", "connector_credential_security", "least_privilege", "audit_logging_monitoring"],
        recommendedEvidenceNeeds: ["Cloud Security Assessment", "IAM Policy"],
      });
    }

    // 5. API
    const apiCaps = caps.filter(c => c.key === "api_integration");
    if (apiCaps.length > 0) {
      addRisk({
        key: "api_security_risk",
        label: "API & Integration Security",
        reason: "External API surfaces detected, requiring authentication and rate limiting controls.",
        confidence: 0.8,
        severity: "MEDIUM",
        triggeringSignals: apiCaps.map(c => c.key),
        evidenceRefs: apiCaps.map(c => c.sourceUrl),
        recommendedTopicKeys: ["api_security", "access_control", "audit_logging_monitoring"],
        recommendedEvidenceNeeds: ["API Security Documentation"],
      });
    }

    // 6. AI
    const aiCaps = caps.filter(c => c.key === "ai_processing" || c.key === "model_training" || c.key === "model_inference");
    if (aiCaps.length > 0 || interaction.usesAIOnCustomerData) {
      addRisk({
        key: "ai_governance_risk",
        label: "AI & Model Governance",
        reason: "Product utilizes AI/ML on customer data or performs model training/inference.",
        confidence: 0.9,
        evidenceStrength: "strong",
        severity: "HIGH",
        triggeringSignals: aiCaps.map(c => c.key),
        evidenceRefs: aiCaps.map(c => c.sourceUrl),
        recommendedTopicKeys: ["ai_data_processing", "model_governance", "training_data_policy"],
        recommendedEvidenceNeeds: ["AI Ethics Policy", "Model Card / Datasheet"],
      });
    }

    // 7. Payments
    const payCaps = caps.filter(c => c.key === "payment_processing" || c.key === "transaction_processing");
    if (payCaps.length > 0 || interaction.handlesPayments) {
      addRisk({
        key: "payment_risk",
        label: "Payment & Financial Security",
        reason: "Financial transaction processing or payment handling detected.",
        confidence: 0.95,
        severity: "CRITICAL",
        triggeringSignals: payCaps.map(c => c.key),
        evidenceRefs: payCaps.map(c => c.sourceUrl),
        recommendedTopicKeys: ["payment_security", "pci_review", "fraud_controls"],
        recommendedEvidenceNeeds: ["PCI AOC", "PCI SAQ"],
      });
    }

    // 8. Identity / Account Verification
    const idCaps = caps.filter(c => c.key === "identity_verification" || c.key === "account_verification");
    if (idCaps.length > 0 || interaction.handlesPII) {
      addRisk({
        key: "identity_verification_risk",
        label: "Identity & Verification Trust",
        reason: "Product performs customer identity verification or account validation.",
        confidence: 0.8,
        severity: "MEDIUM",
        triggeringSignals: idCaps.map(c => c.key),
        evidenceRefs: idCaps.map(c => c.sourceUrl),
        recommendedTopicKeys: ["identity_verification", "pii_handling", "fraud_controls"],
        recommendedEvidenceNeeds: ["Identity Verification Policy"],
      });
    }

    // 9. Identity / Access Control (New Section)
    const accessCaps = caps.filter(c => c.key === "identity_access_control" || c.key === "access_control" || c.key === "identity_management");
    if (accessCaps.length > 0) {
      addRisk({
        key: "identity_access_governance_risk",
        label: "Identity & Access Governance",
        reason: "Advanced identity management or access control capabilities detected.",
        confidence: 0.9,
        evidenceStrength: "strong",
        severity: "HIGH",
        triggeringSignals: accessCaps.map(c => c.key),
        evidenceRefs: accessCaps.map(c => c.sourceUrl),
        recommendedTopicKeys: ["access_control", "mfa_sso", "rbac", "user_provisioning", "privileged_access"],
        recommendedEvidenceNeeds: ["Access Control Policy", "IAM Audit"],
      });
    }

    // 10. Security Tooling
    const securityCaps = caps.filter(c => c.key === "vulnerability_management" || c.key === "infrastructure_scanning" || c.key === "threat_detection");
    if (securityCaps.length > 0) {
      addRisk({
        key: "security_tooling_risk",
        label: "Security Operations Maturity",
        reason: "Product provides security scanning, vulnerability management, or threat detection.",
        confidence: 0.85,
        severity: "HIGH",
        triggeringSignals: securityCaps.map(c => c.key),
        evidenceRefs: securityCaps.map(c => c.sourceUrl),
        recommendedTopicKeys: ["vulnerability_management", "audit_logging_monitoring", "incident_response"],
        recommendedEvidenceNeeds: ["Pentest Report", "Vulnerability Disclosure Policy"],
      });
    }

    // 11. Compliance-Driven Risks (Product Support)
    const supported = profile.productSupportedFrameworks?.value || [];
    const trustPagesSeen = (profile as any).trustPagesSeen || 0; // Check if trust pages were seen

    if (supported.includes("HIPAA")) {
      const needsBAA = trustPagesSeen === 0;
      addRisk({
        key: "data_privacy_risk",
        reason: "Product supports HIPAA-regulated workflows, implying sensitive data handling.",
        confidence: 0.8,
        triggeringSignals: ["productSupportedFrameworks:HIPAA"],
        recommendedTopicKeys: ["privacy_data_protection", "pii_handling", "hipaa_privacy"],
        recommendedEvidenceNeeds: needsBAA ? ["HIPAA compliance statement", "Business Associate Agreement (BAA)", "PHI handling policy"] : [],
        clarificationTasks: needsBAA ? ["Confirm HIPAA compliance posture (no public trust page found)"] : [],
      });
    }
    if (supported.includes("PCI-DSS") || supported.includes("PCI")) {
      addRisk({
        key: "payment_risk",
        reason: "Product supports PCI-DSS workflows, implying payment data handling.",
        confidence: 0.8,
        triggeringSignals: ["productSupportedFrameworks:PCI"],
        recommendedTopicKeys: ["payment_security", "pci_review"],
        recommendedEvidenceNeeds: ["PCI AOC/SAQ"],
      });
    }
    if (supported.includes("GDPR") || supported.includes("CCPA")) {
      addRisk({
        key: "data_privacy_risk",
        reason: "Product supports GDPR/CCPA compliance workflows.",
        confidence: 0.8,
        triggeringSignals: ["productSupportedFrameworks:Privacy"],
        recommendedTopicKeys: ["privacy_data_protection", "data_retention_deletion"],
        recommendedEvidenceNeeds: ["Privacy Policy", "Data Processing Addendum (DPA)"],
      });
    }

    // 12. Enhanced Provisional Signals (Next Steps for Weak Signals)
    if (interaction.usesAIOnCustomerData && (profile.dataInteractionModel?.confidence || 0) < 0.85) {
      addRisk({
        key: "ai_governance_risk",
        reason: "AI processing inferred but details are unconfirmed.",
        confidence: 0.6,
        severity: "MEDIUM",
        triggeringSignals: ["usesAIOnCustomerData"],
        recommendedTopicKeys: ["ai_governance"],
        clarificationTasks: ["Confirm if customer data is used for model training"],
        recommendedEvidenceNeeds: ["AI Usage Statement"],
      });
    }

    if (interaction.storesCustomerData && (profile.dataInteractionModel?.confidence || 0) < 0.85) {
      addRisk({
        key: "data_storage_risk",
        reason: "Persistent storage inferred; retention and residency require confirmation.",
        confidence: 0.6,
        severity: "MEDIUM",
        triggeringSignals: ["storesCustomerData"],
        recommendedTopicKeys: ["data_retention_deletion"],
        clarificationTasks: ["Confirm data retention period"],
        recommendedEvidenceNeeds: ["Data Retention Policy"],
      });
    }

    if (cloudCaps.length > 0 && cloudCaps.some(c => c.evidenceStrength !== "authoritative")) {
      addRisk({
        key: "infrastructure_risk",
        reason: "Cloud connector detected; permissions and scope require verification.",
        confidence: 0.6,
        severity: "MEDIUM",
        triggeringSignals: ["cloud_connector"],
        recommendedTopicKeys: ["cloud_security"],
        recommendedEvidenceNeeds: ["Cloud connector permissions guide / IAM policy"],
      });
    }

    // Filter by confidence
    return Array.from(risks.values()).filter(r => r.confidence >= 0.4);
  }
}
