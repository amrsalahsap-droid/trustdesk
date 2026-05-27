import { DeepInferredProfile } from "../onboarding-core-types";
import { ProductCapability } from "../product-graph/product-graph-types";
import { OperationalWorkflow } from "../workflow-analysis/workflow-analysis-types";
import { EvidenceGapAssessment } from "./procurement-risk-types";

export class EvidenceGapEngine {
  /**
   * Scans profile compliance data and active product characteristics to isolate evidence gaps.
   */
  static calculateGaps(params: {
    profile: DeepInferredProfile;
    capabilities: ProductCapability[];
    workflows: OperationalWorkflow[];
  }): EvidenceGapAssessment {
    const { profile, capabilities, workflows } = params;

    const missingCriticalEvidence = new Set<string>();
    const likelyDealBlockers = new Set<string>();
    const missingTrustDisclosures = new Set<string>();

    const activeCapKeys = new Set(capabilities.map(c => c.key));
    const activeFlowKeys = new Set(workflows.map(w => w.key));

    // Resolve active compliance and certifications
    const certifications = new Set(
      (profile.vendorCertifications?.value || []).map(x => x.toLowerCase())
    );
    const privacySignals = new Set(
      (profile.privacyPostureSignals?.value || []).map(x => x.toLowerCase())
    );

    // Gap 1: Basic Trust Certifications (SOC 2, ISO 27001)
    const hasSoc2 = Array.from(certifications).some(c => c.includes("soc 2") || c.includes("soc2"));
    const hasIso27001 = Array.from(certifications).some(c => c.includes("iso 27001") || c.includes("iso27001"));

    if (!hasSoc2 && !hasIso27001) {
      likelyDealBlockers.add("SOC 2 Type II or ISO 27001 Independent Audit Report");
      missingCriticalEvidence.add("SOC 2 Type II audit certificate / ISO 27001 security statement");
    }

    // Gap 2: AI Safety Policy
    const hasAiAnalysis = activeFlowKeys.has("ai_analysis") || activeCapKeys.has("ai_inference") || activeCapKeys.has("ai_training");
    const hasAiPolicy = Array.from(privacySignals).some(s => s.includes("ai safety") || s.includes("llm policy") || s.includes("model training"));
    
    if (hasAiAnalysis && !hasAiPolicy) {
      missingCriticalEvidence.add("Generative AI subprocessor policy and opt-out agreement");
      missingTrustDisclosures.add("Public disclosure regarding whether customer data trains core models");
    }

    // Gap 3: Cloud Credential Least Privilege
    const hasCloudScan = activeCapKeys.has("cloud_scanning") || activeCapKeys.has("cloud_connector") || activeFlowKeys.has("scanning");
    const hasLeastPrivilegeDoc = Array.from(privacySignals).some(s => s.includes("least privilege") || s.includes("iam role") || s.includes("read-only"));

    if (hasCloudScan && !hasLeastPrivilegeDoc) {
      missingCriticalEvidence.add("Least Privilege Cloud Access & IAM Role Configuration Policy");
      missingTrustDisclosures.add("Documentation detailing Cloud Account boundary limits and policy restrictions");
    }

    // Gap 4: Impersonation / Support Impersonation Policies
    const hasSupportAccess = activeCapKeys.has("support_access") || activeFlowKeys.has("support");
    const hasImpersonationDoc = Array.from(privacySignals).some(s => s.includes("impersonation") || s.includes("jit") || s.includes("support access"));

    if (hasSupportAccess && !hasImpersonationDoc) {
      missingCriticalEvidence.add("Support Impersonation & JIT access approval workflow definition");
      missingTrustDisclosures.add("Details on vendor support visibility and customer session log access");
    }

    // Gap 5: Continuous Ingestion Retention Policy
    const hasIngestion = activeCapKeys.has("email_ingestion") || activeCapKeys.has("communication_ingestion") || activeFlowKeys.has("ingestion") || activeFlowKeys.has("synchronization");
    const hasRetentionDoc = Array.from(privacySignals).some(s => s.includes("retention") || s.includes("purge") || s.includes("archival"));

    if (hasIngestion && !hasRetentionDoc) {
      missingCriticalEvidence.add("In ingested pipeline Data Retention and purge schedule policy");
    }

    return {
      missingCriticalEvidence: Array.from(missingCriticalEvidence),
      likelyDealBlockers: Array.from(likelyDealBlockers),
      missingTrustDisclosures: Array.from(missingTrustDisclosures),
    };
  }
}
