import { CompromiseScenario } from "./blast-radius-types";

export type TaxonomyScenarioTemplate = Omit<CompromiseScenario, "inferredFrom"> & {
  triggerCapabilities: string[];
  triggerWorkflows: string[];
};

export const BLAST_RADIUS_TAXONOMY: Record<string, TaxonomyScenarioTemplate> = {
  customer_metadata_exposure: {
    key: "customer_metadata_exposure",
    name: "Customer Metadata & Content Exposure",
    probability: "medium",
    impact: "high",
    description: "Compromise of the vendor's ingestion pipeline database allows unauthorized viewing of customer communication logs and message metadata.",
    compromiseVector: "Access keys or connection tokens compromised in the vendor's backup databases.",
    businessImpact: "Leaking of business operations metadata or PII, triggering notification compliance schedules.",
    suggestedMitigations: [
      "Implement client-side data anonymization or email attachment filtering.",
      "Strict data lifecycle and automatic purging schedules for ingested communication data."
    ],
    triggerCapabilities: ["email_ingestion", "communication_ingestion"],
    triggerWorkflows: ["ingestion"]
  },
  infra_scan_abuse: {
    key: "infra_scan_abuse",
    name: "Infrastructure Scanning Abuse",
    probability: "low",
    impact: "critical",
    description: "An attacker hijacking the cross-account scanning role or API keys executes arbitrary enumeration queries inside customer cloud accounts.",
    compromiseVector: "Insecure storage of API keys or cross-account IAM role session delegation tokens.",
    businessImpact: "Broad perimeter network configuration details leaked, exposing target endpoints to external mapping.",
    suggestedMitigations: [
      "Strictly enforce read-only IAM policies without write or active mutation permissions.",
      "Incorporate strict IP source pinning inside the cloud provider API trust relationship config."
    ],
    triggerCapabilities: ["cloud_scanning"],
    triggerWorkflows: ["scanning", "infra_scanning"]
  },
  export_leakage: {
    key: "export_leakage",
    name: "Report Data Export Leakage",
    probability: "medium",
    impact: "medium",
    description: "Bypassing endpoint DLP controls through unmonitored mass-export of customer data in PDF/CSV structures.",
    compromiseVector: "Compromised admin dashboard sessions triggering bulk analytical downloads.",
    businessImpact: "Direct loss of business intelligence metrics or customer telemetry data.",
    suggestedMitigations: [
      "Enforce audit logs and real-time slack alerts for export downloads.",
      "Incorporate multi-factor approval steps for large-scale data downloads."
    ],
    triggerCapabilities: ["api_gateway"],
    triggerWorkflows: ["export_report"]
  },
  cross_tenant_access: {
    key: "cross_tenant_access",
    name: "Logical Cross-Tenant Separation Failure",
    probability: "low",
    impact: "high",
    description: "Logical software boundary failure or container escape within multi-tenant servers exposes internal caches to another tenant's session.",
    compromiseVector: "SQL injection or container privilege escalation vulnerabilities inside the central web handler.",
    businessImpact: "Exposure of active transaction tokens or cache datasets belonging to unrelated customer entities.",
    suggestedMitigations: [
      "Mandatory regular independent third-party container penetration testing.",
      "Rigid logical boundary assertions at both database query and session layer."
    ],
    triggerCapabilities: ["cloud_connector", "endpoint_agent"],
    triggerWorkflows: ["infra_scanning", "scanning"]
  },
  support_impersonation: {
    key: "support_impersonation",
    name: "Support Session Impersonation Compromise",
    probability: "medium",
    impact: "high",
    description: "Compromised internal support rep credentials allow malicious actors to session-impersonate customer accounts without audit markers.",
    compromiseVector: "Credential stuffing or hijacking of vendor internal support engineer admin consoles.",
    businessImpact: "Unauthorized modifications to tenant settings or viewing of active dashboards under the guise of an active user.",
    suggestedMitigations: [
      "Enforce mandatory customer-in-the-loop approvals for JIT support sessions.",
      "Enforce immutable audit logs of support actions separated from user logs."
    ],
    triggerCapabilities: ["support_access"],
    triggerWorkflows: ["support"]
  },
  ai_training_exposure: {
    key: "ai_training_exposure",
    name: "AI Prompt Context subprocessor Leakage",
    probability: "medium",
    impact: "high",
    description: "Submitting proprietary corporate documents or prompts to third-party LLM APIs where context is cached or used for core training.",
    compromiseVector: "Absence of model training opt-out configurations in third-party API payloads.",
    businessImpact: "Intellectual property or trade secret leakage incorporated into public model weights.",
    suggestedMitigations: [
      "Establish strict subprocessor DPA containing explicit zero-retention model opt-out agreements.",
      "Incorporate heuristic client-side filtering to block PII or source code before LLM submission."
    ],
    triggerCapabilities: ["ai_inference", "ai_training"],
    triggerWorkflows: ["ai_analysis"]
  }
};
