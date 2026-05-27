import { logger } from "@/lib/logging/logger";
import { DeepInferredProfile } from "../onboarding-core-types";
import { ProductGraph } from "../product-graph/product-graph-types";
import { ProcurementRisk } from "./procurement-risk-types";
import { BlastRadiusCalculator } from "./blast-radius-calculator";
import { EvidenceGapEngine } from "./evidence-gap-engine";

export class ProcurementRiskEngineV2 {
  /**
   * Orchestrates full procurement-grade risk evaluation based on the Product Graph and profile metadata.
   */
  static evaluate(params: {
    profile: DeepInferredProfile;
    graph: ProductGraph;
  }): ProcurementRisk[] {
    const { profile, graph } = params;

    logger.info("PROCUREMENT_RISK_EVALUATION_START", {
      companyName: profile.companyName || "Unknown",
      capabilitiesCount: graph.productCapabilities.length,
      workflowsCount: (graph.operationalWorkflows || []).length,
    });

    const activeCapabilities = graph.productCapabilities;
    const activeWorkflows = graph.operationalWorkflows || [];

    const capKeys = new Set(activeCapabilities.map(c => c.key));
    const flowKeys = new Set(activeWorkflows.map(w => w.key));

    // 1. Calculate Blast Radius and Evidence Gaps
    const blastRadius = BlastRadiusCalculator.calculate({
      capabilities: activeCapabilities,
      workflows: activeWorkflows,
    });

    const gaps = EvidenceGapEngine.calculateGaps({
      profile,
      capabilities: activeCapabilities,
      workflows: activeWorkflows,
    });

    // 2. Identify Workspace Mitigation Signals
    const globalMitigations: string[] = [];
    const certs = (profile.vendorCertifications?.value || []).map(x => x.toLowerCase());
    const privacy = (profile.privacyPostureSignals?.value || []).map(x => x.toLowerCase());

    if (certs.some(c => c.includes("soc 2") || c.includes("soc2"))) {
      globalMitigations.push("SOC 2 Type II Certified independent audit");
    }
    if (certs.some(c => c.includes("iso 27001") || c.includes("iso27001"))) {
      globalMitigations.push("ISO 27001 Security Management system verified");
    }
    if (privacy.some(p => p.includes("encryption") || p.includes("aes-256") || p.includes("tls"))) {
      globalMitigations.push("Encryption at rest (AES-256) & in transit (TLS 1.3)");
    }

    const detectedRisks: ProcurementRisk[] = [];

    // Helper to register risk if triggered
    // Helper to register risk if triggered
    const addRisk = (risk: Omit<ProcurementRisk, "mitigationSignals" | "missingCriticalEvidence">) => {
      const riskMitigations = [...globalMitigations];
      const riskGaps = [...gaps.missingCriticalEvidence];

      // Context-aware risk adjustments
      let finalSeverity = risk.severity;

      // Rule A: Mitigate severity if independent audits exist
      if (globalMitigations.length > 0) {
        if (finalSeverity === "critical") finalSeverity = "high";
        else if (finalSeverity === "high") finalSeverity = "medium";
        else if (finalSeverity === "medium") finalSeverity = "low";
      }

      // Calculate dynamic confidence and evidence strength from triggering capabilities
      const triggeringCaps = activeCapabilities.filter(c => (risk.relatedCapabilities || []).includes(c.key));
      const maxCapConfidence = triggeringCaps.length > 0 ? Math.max(...triggeringCaps.map(c => c.confidence)) : 0.40;
      const maxCapStrength = triggeringCaps.length > 0 ? triggeringCaps.reduce((best, c) => {
        const weights = { weak: 1, medium: 2, strong: 3, authoritative: 4 };
        const currentBestWeight = weights[best] || 1;
        const currentCapWeight = weights[c.evidenceStrength] || 1;
        return currentCapWeight > currentBestWeight ? c.evidenceStrength : best;
      }, "weak" as "weak" | "medium" | "strong" | "authoritative") : "weak";

      const finalConfidence = maxCapConfidence;
      const finalEvidenceStrength = maxCapStrength;

      let status: ProcurementRisk["status"] = "needs_evidence";
      if (finalConfidence >= 0.85 && (finalEvidenceStrength === "strong" || finalEvidenceStrength === "authoritative")) {
        status = "auto_ready";
      } else if (finalConfidence >= 0.55 && (finalEvidenceStrength === "strong" || finalEvidenceStrength === "medium")) {
        status = "review_suggested";
      } else {
        status = "needs_evidence";
      }

      // Adjust risk-specific gaps and mitigations
      if (risk.key === "ai_training_risk") {
        if (privacy.some(p => p.includes("opt-out") || p.includes("zero retention"))) {
          riskMitigations.push("Zero Data Retention LLM policy verified");
          if (finalSeverity === "high") finalSeverity = "medium";
        }
      }

      // Format rationale to clearly state certainty vs. impact
      const certaintyLabel = status === "auto_ready" ? "Confirmed" : (status === "review_suggested" ? "Speculative (Review Suggested)" : "Speculative (Needs Evidence)");
      const certaintyExplanation = `[Certainty: ${certaintyLabel} - ${finalEvidenceStrength.toUpperCase()} evidence (${(finalConfidence * 100).toFixed(0)}% confidence) | Impact: ${finalSeverity.toUpperCase()} severity]`;
      const finalizedRationale = `${certaintyExplanation} ${risk.rationale}`;

      const finalizedRisk: ProcurementRisk = {
        ...risk,
        severity: finalSeverity,
        confidence: finalConfidence,
        evidenceStrength: finalEvidenceStrength,
        status,
        rationale: finalizedRationale,
        mitigationSignals: riskMitigations,
        missingCriticalEvidence: riskGaps,
      };

      detectedRisks.push(finalizedRisk);

      logger.info("PROCUREMENT_RISK_DETECTED", {
        key: finalizedRisk.key,
        severity: finalizedRisk.severity,
        confidence: finalizedRisk.confidence,
        missingEvidenceCount: finalizedRisk.missingCriticalEvidence.length,
      });
    };

    // --- Risk 1: customer_data_exposure ---
    if (capKeys.has("email_ingestion") || capKeys.has("communication_ingestion") || capKeys.has("sensitive_data_discovery")) {
      addRisk({
        key: "customer_data_exposure",
        severity: "critical",
        confidence: 0.95,
        rationale: "Ingesting raw mailbox threads or customer slack logs directly exposes sensitive enterprise content.",
        customerImpact: "Potential customer data leakage and compliance violations (GDPR/CCPA).",
        likelyBuyerConcern: "High exposure of proprietary database/chat systems to third-party endpoints.",
        requiredEvidence: ["Data Loss Prevention policy", "PII sanitization controls"],
        relatedCapabilities: ["email_ingestion", "communication_ingestion", "sensitive_data_discovery"].filter(k => capKeys.has(k)),
        relatedWorkflows: ["ingestion", "synchronization"].filter(k => flowKeys.has(k)),
      });
    }

    // --- Risk 2: privileged_access ---
    if (capKeys.has("cloud_scanning") || capKeys.has("cloud_connector") || capKeys.has("endpoint_agent")) {
      addRisk({
        key: "privileged_access",
        severity: "critical",
        confidence: 0.95,
        rationale: "Scanning cloud instances or deploying system agents requires administrative-level cloud credentials or host-root permissions.",
        customerImpact: "Unauthorized system command execution or host compromise.",
        likelyBuyerConcern: "Broad IAM permissions given to external vendor service accounts.",
        requiredEvidence: ["Read-Only IAM Policy documentation", "Root-bypass agent verification"],
        relatedCapabilities: ["cloud_scanning", "cloud_connector", "endpoint_agent"].filter(k => capKeys.has(k)),
        relatedWorkflows: ["scanning", "infra_scanning"].filter(k => flowKeys.has(k)),
      });
    }

    // --- Risk 3: support_visibility ---
    const hasGenuineSupportAccess = activeCapabilities.some(c => c.key === "support_access" && c.evidenceStrength !== "weak");
    if (hasGenuineSupportAccess || flowKeys.has("support")) {
      addRisk({
        key: "support_visibility",
        severity: "high",
        confidence: 0.90,
        rationale: "Temporary session login impersonation controls allow vendor support personnel to view production customer dashboards.",
        customerImpact: "Unauthorized dashboard exposure or administrative state changes.",
        likelyBuyerConcern: "Support reps viewing production data without active customer consent.",
        requiredEvidence: ["Just-In-Time support access approval policy", "Support impersonation logs"],
        relatedCapabilities: ["support_access"].filter(k => capKeys.has(k)),
        relatedWorkflows: ["support"].filter(k => flowKeys.has(k)),
      });
    }

    // --- Risk 4: ai_training_risk ---
    const hasAITrainingSignal = capKeys.has("ai_training") || 
      (capKeys.has("ai_inference") && activeCapabilities.find(c => c.key === "ai_inference")?.evidenceStrength === "strong") || 
      flowKeys.has("ai_analysis");
    if (hasAITrainingSignal) {
      addRisk({
        key: "ai_training_risk",
        severity: "high",
        confidence: 0.95,
        rationale: "Submitting customer context to LLM models risks the leakage of proprietary corporate text to train central subprocessor engines.",
        customerImpact: "Intellectual property leakage and vendor lock-in.",
        likelyBuyerConcern: "Proprietary code or legal files ingested by public AI engines.",
        requiredEvidence: ["Subprocessor DPA opt-out of model training agreements"],
        relatedCapabilities: ["ai_inference", "ai_training"].filter(k => capKeys.has(k)),
        relatedWorkflows: ["ai_analysis"].filter(k => flowKeys.has(k)),
      });
    }

    // --- Risk 5: tenant_escape_risk ---
    if (capKeys.has("cloud_scanning") || capKeys.has("endpoint_agent") || flowKeys.has("infra_scanning")) {
      addRisk({
        key: "tenant_escape_risk",
        severity: "high",
        confidence: 0.85,
        rationale: "Active scanning agents running alongside shared multi-tenant backends present container escapes or logic breach vectors.",
        customerImpact: "Cross-tenant boundary data exposure or infrastructure compromise.",
        likelyBuyerConcern: "A breach in another tenant's workload spreading to our infrastructure.",
        requiredEvidence: ["Third-party penetration testing report", "Logical isolation policy"],
        relatedCapabilities: ["cloud_scanning", "endpoint_agent"].filter(k => capKeys.has(k)),
        relatedWorkflows: ["infra_scanning", "scanning"].filter(k => flowKeys.has(k)),
      });
    }

    // --- Risk 6: infrastructure_reach ---
    if (capKeys.has("cloud_scanning") && capKeys.has("cloud_connector")) {
      addRisk({
        key: "infrastructure_reach",
        severity: "critical",
        confidence: 0.95,
        rationale: "Combined AWS/Azure scanning and persistent infrastructure connectors allow extensive system-wide reach.",
        customerImpact: "Accidental broad-scale service disruption or credential leakage.",
        likelyBuyerConcern: "Single configuration mistake compromising the full cloud perimeter.",
        requiredEvidence: ["IAM boundary limits and secure architecture map"],
        relatedCapabilities: ["cloud_scanning", "cloud_connector"],
        relatedWorkflows: ["scanning"].filter(k => flowKeys.has(k)),
      });
    }

    // --- Risk 7: identity_impersonation ---
    const hasImpersonationSignal = activeCapabilities.some(c => c.key === "support_access" && c.evidenceStrength !== "weak") || flowKeys.has("support");
    if (hasImpersonationSignal) {
      addRisk({
        key: "identity_impersonation",
        severity: "high",
        confidence: 0.90,
        rationale: "Vendor administrators can masquerade as tenant users for debugging, creating authorization audit gaps.",
        customerImpact: "Audit logs showing changes made by support representatives as if they were customer admins.",
        likelyBuyerConcern: "Lack of non-repudiation in admin action logs.",
        requiredEvidence: ["Support JIT approval logs", "Audit log integrity policy"],
        relatedCapabilities: ["support_access"],
        relatedWorkflows: ["support"].filter(k => flowKeys.has(k)),
      });
    }

    // --- Risk 8: integration_blast_radius ---
    if (blastRadius.score >= 0.5) {
      addRisk({
        key: "integration_blast_radius",
        severity: "high",
        confidence: 0.95,
        rationale: `Broad operational connection surface evaluated at score ${blastRadius.score.toFixed(2)}, combining multiple agents or API keys.`,
        customerImpact: "Compounded target surface for supply chain breach.",
        likelyBuyerConcern: "Highly connected vendor service becoming a pivot point into secure interior zones.",
        requiredEvidence: ["Vulnerability assessment logs", "Data flow network map"],
        relatedCapabilities: Array.from(capKeys),
        relatedWorkflows: Array.from(flowKeys),
      });
    }

    // --- Risk 9: persistence_risk ---
    if (capKeys.has("data_classification") || capKeys.has("sensitive_data_discovery") || flowKeys.has("synchronization")) {
      addRisk({
        key: "persistence_risk",
        severity: "medium",
        confidence: 0.80,
        rationale: "Locally indexing and persisting metadata of scanned documents creates a database backup exposure vector.",
        customerImpact: "Historical exposure of parsed file text in vendor's storage systems.",
        likelyBuyerConcern: "Files deleted locally remaining indexed or cached in vendor databases.",
        requiredEvidence: ["Database backup encryption standards", "Data purge SLAs"],
        relatedCapabilities: ["data_classification", "sensitive_data_discovery"].filter(k => capKeys.has(k)),
        relatedWorkflows: ["synchronization"].filter(k => flowKeys.has(k)),
      });
    }

    // --- Risk 10: exportability_risk ---
    if (flowKeys.has("export_report") || capKeys.has("api_gateway")) {
      addRisk({
        key: "exportability_risk",
        severity: "medium",
        confidence: 0.85,
        rationale: "Providing bulk CSV/PDF download capabilities bypasses standard endpoint data loss prevention tools.",
        customerImpact: "Insider threat data exfiltration through raw reports.",
        likelyBuyerConcern: "Malicious employees downloading bulk customer reports with a single click.",
        requiredEvidence: ["Audit tracking for data export actions"],
        relatedCapabilities: ["api_gateway"].filter(k => capKeys.has(k)),
        relatedWorkflows: ["export_report"],
      });
    }

    // --- Risk 11: telemetry_risk ---
    if (capKeys.has("endpoint_agent") || flowKeys.has("browser_device")) {
      addRisk({
        key: "telemetry_risk",
        severity: "low",
        confidence: 0.75,
        rationale: "Background client telemetry dispatch could broadcast interior environment metrics or browser attributes.",
        customerImpact: "Minor metadata tracking leakage.",
        likelyBuyerConcern: "Corporate usage habits or interior IP details shared with vendor analytical endpoints.",
        requiredEvidence: ["Telemetry data fields documentation"],
        relatedCapabilities: ["endpoint_agent"].filter(k => capKeys.has(k)),
        relatedWorkflows: ["browser_device"],
      });
    }

    // --- Risk 12: browser_access_risk ---
    if (flowKeys.has("browser_device")) {
      addRisk({
        key: "browser_access_risk",
        severity: "high",
        confidence: 0.90,
        rationale: "Browser extension installation intercepts and monitors browser tab DOM nodes and inputs.",
        customerImpact: "Active browser session credentials or form values leaked to background scripts.",
        likelyBuyerConcern: "Extensions monitoring banking, email, or credential fields.",
        requiredEvidence: ["Extension Manifest V3 strict security analysis"],
        relatedCapabilities: [],
        relatedWorkflows: ["browser_device"],
      });
    }

    // --- Risk 13: endpoint_visibility_risk ---
    if (capKeys.has("endpoint_agent")) {
      addRisk({
        key: "endpoint_visibility_risk",
        severity: "high",
        confidence: 0.90,
        rationale: "Endpoint agents maintain direct kernel or system system-level execution authority.",
        customerImpact: "Host-level process scanning and background execution tracking.",
        likelyBuyerConcern: "Employee privacy friction and potential host crash vectors from unoptimized binaries.",
        requiredEvidence: ["Endpoint performance impact tests", "Agent security controls review"],
        relatedCapabilities: ["endpoint_agent"],
        relatedWorkflows: [],
      });
    }

    // --- Risk 14: supply_chain_risk ---
    if (capKeys.has("ai_inference") || capKeys.has("email_ingestion") || flowKeys.has("ai_analysis")) {
      addRisk({
        key: "supply_chain_risk",
        severity: "medium",
        confidence: 0.85,
        rationale: "Integrating third-party LLM subprocessors or SaaS mail relays introduces critical downstream dependency vectors.",
        customerImpact: "Service interruption or secondary breach from downstream subprocessors.",
        likelyBuyerConcern: "Vendor's vendors lacking basic compliance certification or security controls.",
        requiredEvidence: ["Subprocessor listing and vendor DPA verification"],
        relatedCapabilities: ["ai_inference", "email_ingestion"].filter(k => capKeys.has(k)),
        relatedWorkflows: ["ai_analysis"].filter(k => flowKeys.has(k)),
      });
    }

    // --- Risk 15: customer_action_execution ---
    if (capKeys.has("cloud_scanning") && capKeys.has("privileged_access")) {
      addRisk({
        key: "customer_action_execution",
        severity: "medium",
        confidence: 0.80,
        rationale: "Automated scan actions that maintain write permissions can mutate backend system configurations.",
        customerImpact: "Accidental configuration deletion or drift from automated remediations.",
        likelyBuyerConcern: "Vendor service modifying active configurations without separate approval.",
        requiredEvidence: ["Configuration change log audit", "Manual override setup guides"],
        relatedCapabilities: ["cloud_scanning"],
        relatedWorkflows: ["scanning"].filter(k => flowKeys.has(k)),
      });
    }

    // --- Risk 16: regulated_data_risk ---
    if (profile.dataTypes?.value?.some(d => ["hipaa", "pci", "phi", "gdpr", "regulated"].some(k => d.toLowerCase().includes(k)))) {
      addRisk({
        key: "regulated_data_risk",
        severity: "high",
        confidence: 0.95,
        rationale: "Processing regulatory compliance data (PII/PHI/PCI) triggers extensive statutory audit demands.",
        customerImpact: "Large regulatory fines and breach disclosure obligations.",
        likelyBuyerConcern: "Downstream HIPAA BAA or PCI-DSS attestation of compliance absence.",
        requiredEvidence: ["HIPAA Business Associate Agreement (BAA)", "PCI Attestation of Compliance (AoC)"],
        relatedCapabilities: Array.from(capKeys),
        relatedWorkflows: Array.from(flowKeys),
      });
    }

    logger.info("PROCUREMENT_RISK_EVALUATION_COMPLETE", {
      detectedRisksCount: detectedRisks.length,
      blastRadiusScore: blastRadius.score,
    });

    return detectedRisks;
  }
}
