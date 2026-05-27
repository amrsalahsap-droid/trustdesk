export type OperationalRiskImplication = {
  riskKey: string;
  label: string;
  severity: "low" | "medium" | "high";
  rationale: string;
};

export const OPERATIONAL_RISK_REGISTRY: Record<string, OperationalRiskImplication> = {
  retention_concerns: {
    riskKey: "retention_concerns",
    label: "Data Retention & Archival Risk",
    severity: "medium",
    rationale: "Automated ingestion or synchronization of content creates long-term storage and compliance overhead."
  },
  support_visibility: {
    riskKey: "support_visibility",
    label: "Support Rep Impersonation Visibility",
    severity: "medium",
    rationale: "Uncontrolled customer portal impersonation by vendor personnel presents a risk of unauthorized content viewing."
  },
  customer_data_exposure: {
    riskKey: "customer_data_exposure",
    label: "Customer Sensitive Data Exposure",
    severity: "high",
    rationale: "Ingesting core messaging, chat histories, or raw document stores elevates customer data leakage vectors."
  },
  ai_governance_requirements: {
    riskKey: "ai_governance_requirements",
    label: "AI Governance & Ethics Controls",
    severity: "high",
    rationale: "Submitting customer context to LLM subprocessors places a high regulatory and privacy burden."
  },
  privileged_cloud_access: {
    riskKey: "privileged_cloud_access",
    label: "Privileged Host/Cloud Credentials Access",
    severity: "high",
    rationale: "Continuous vulnerability scanning requires read or write IAM execution tokens inside host systems."
  },
  tenant_isolation_risk: {
    riskKey: "tenant_isolation_risk",
    label: "Logical Tenant Separation Safeguards",
    severity: "high",
    rationale: "Multi-tenant platforms or cross-boundary scanning agents must prove strict tenant boundary isolation."
  }
};

/**
 * Resolves high-level operational risks based on active operational workflows.
 */
export function mapWorkflowRisks(workflowKey: string, keywordSignals: string[]): {
  procurementRisks: string[];
  trustImplications: string[];
  evidenceRequirements: string[];
} {
  const procurementRisks = new Set<string>();
  const trustImplications = new Set<string>();
  const evidenceRequirements = new Set<string>();

  // Determine standard mappings based on workflow key
  switch (workflowKey) {
    case "ingestion":
      procurementRisks.add("customer_content_exposure");
      procurementRisks.add("retention_concerns");
      trustImplications.add("Data Handling & Privacy");
      trustImplications.add("Encryption & Key Custody");
      evidenceRequirements.add("Data Retention Policy");
      evidenceRequirements.add("PII Redaction Process");
      break;

    case "scanning":
      procurementRisks.add("privileged_cloud_access");
      procurementRisks.add("tenant_isolation_risk");
      trustImplications.add("Infrastructure Access Controls");
      trustImplications.add("Identity & Access Management");
      evidenceRequirements.add("Least Privilege Architecture");
      evidenceRequirements.add("Read-Only IAM Role Documentation");
      break;

    case "synchronization":
      procurementRisks.add("customer_data_exposure");
      procurementRisks.add("retention_concerns");
      trustImplications.add("Data Loss Prevention (DLP)");
      trustImplications.add("Endpoint Security");
      evidenceRequirements.add("Encryption In Transit Policy");
      evidenceRequirements.add("Access Control Logs");
      break;

    case "ai_analysis":
      procurementRisks.add("ai_governance_requirements");
      procurementRisks.add("customer_data_usage");
      trustImplications.add("AI Safety & Governance");
      trustImplications.add("Third Party Vendor Risk");
      evidenceRequirements.add("Subprocessor DPA Agreements");
      evidenceRequirements.add("AI Data Security Policy");
      break;

    case "export_report":
      procurementRisks.add("support_visibility");
      trustImplications.add("Data Handling & Privacy");
      evidenceRequirements.add("Role-Based Access Control Policies");
      evidenceRequirements.add("Export Auditing Logs");
      break;

    case "support":
      procurementRisks.add("support_visibility");
      trustImplications.add("Access Control Protocols");
      trustImplications.add("Support & Operations Security");
      evidenceRequirements.add("Just-In-Time Support Access Policy");
      evidenceRequirements.add("Support Impersonation Log Audits");
      break;

    case "identity_auth":
      trustImplications.add("Identity & Access Management");
      trustImplications.add("Authentication & MFA");
      evidenceRequirements.add("SAML / OIDC Integration Guide");
      evidenceRequirements.add("MFA Enforcement Policy");
      break;

    case "browser_device":
      procurementRisks.add("customer_data_exposure");
      trustImplications.add("Endpoint Security");
      trustImplications.add("Endpoint Privacy Guardrails");
      evidenceRequirements.add("Extension Manifest V3 Security Review");
      evidenceRequirements.add("Data Collection Policy");
      break;

    case "webhook_event":
      trustImplications.add("API Security & Outbound Traffic");
      evidenceRequirements.add("Webhook Signature Verification Documentation");
      break;

    case "infra_scanning":
      procurementRisks.add("privileged_cloud_access");
      procurementRisks.add("tenant_isolation_risk");
      trustImplications.add("Vulnerability Management");
      trustImplications.add("Host & Port Security");
      evidenceRequirements.add("Least Privilege Scan Agent Documentation");
      break;
  }

  // Inject additional risks based on specific high-signal keywords detected in evidence
  for (const sig of keywordSignals) {
    const lower = sig.toLowerCase();
    if (lower.includes("secret") || lower.includes("key") || lower.includes("credentials")) {
      procurementRisks.add("privileged_cloud_access");
      evidenceRequirements.add("Secret Management Policy");
    }
    if (lower.includes("pii") || lower.includes("personal") || lower.includes("gdpr") || lower.includes("ccpa")) {
      procurementRisks.add("retention_concerns");
      evidenceRequirements.add("GDPR DPA / Compliance verification");
    }
    if (lower.includes("okta") || lower.includes("saml") || lower.includes("sso")) {
      trustImplications.add("Authentication & MFA");
    }
  }

  return {
    procurementRisks: Array.from(procurementRisks),
    trustImplications: Array.from(trustImplications),
    evidenceRequirements: Array.from(evidenceRequirements)
  };
}
