import { ProcurementImplication } from "./product-graph-types";

export type RegistryImplication = Omit<ProcurementImplication, "triggeredByCapabilities">;

export const PROCUREMENT_IMPLICATION_REGISTRY: Record<string, RegistryImplication> = {
  privileged_cloud_access: {
    key: "privileged_cloud_access",
    label: "Privileged Cloud Infrastructure Access",
    severity: "high",
    rationale: "The product requires read/write or scanning access to your cloud subscriptions, presenting a significant lateral movement risk.",
    likelyCustomerConcerns: [
      "Access scope limitations",
      "IAM privilege escalation",
      "Unintended infrastructure modifications"
    ],
    suggestedTrustTopics: [
      "Infrastructure Access Controls",
      "Identity & Access Management",
      "Cloud Security Posture"
    ]
  },
  infrastructure_reach: {
    key: "infrastructure_reach",
    label: "Deep Infrastructure Reach Concerns",
    severity: "high",
    rationale: "Active host or container level interaction could impact production availability and security boundaries.",
    likelyCustomerConcerns: [
      "Noisy neighbor/resource starvation",
      "Kernel level security flaws",
      "Agent tampering or supply chain hijack"
    ],
    suggestedTrustTopics: [
      "Endpoint Security",
      "Vulnerability Management",
      "Change Management"
    ]
  },
  customer_content_exposure: {
    key: "customer_content_exposure",
    label: "Customer Communication & Content Exposure",
    severity: "high",
    rationale: "Ingesting customer communications (emails, chats, etc.) directly exposes raw business content containing PII, IP, and business secrets.",
    likelyCustomerConcerns: [
      "Broad access to customer content by vendor staff",
      "Unencrypted storage of chat histories",
      "Accidental leakage of confidential information in support tickets"
    ],
    suggestedTrustTopics: [
      "Data Handling & Privacy",
      "Encryption & Key Custody",
      "Access Control Protocols"
    ]
  },
  retention_concerns: {
    key: "retention_concerns",
    label: "Data Retention & Purging Compliance",
    severity: "medium",
    rationale: "Ingesting or syncing external files/messages triggers legal and policy retention obligations.",
    likelyCustomerConcerns: [
      "Inability to fully purge data upon contract termination",
      "Indefinite storage of transient logs",
      "Compliance with Right to Be Forgotten requests"
    ],
    suggestedTrustTopics: [
      "Data Retention Policies",
      "Customer Data Offboarding"
    ]
  },
  support_visibility: {
    key: "support_visibility",
    label: "Support Team Content Visibility Concerns",
    severity: "medium",
    rationale: "Ingested content may be viewed by support reps or vendor administrators during regular operations.",
    likelyCustomerConcerns: [
      "Customer data viewable by third-party support staff",
      "Lack of granular support role constraints",
      "No unsupervised support access blocking"
    ],
    suggestedTrustTopics: [
      "Access Control Protocols",
      "Support & Operations Security"
    ]
  },
  customer_data_usage: {
    key: "customer_data_usage",
    label: "Customer Data Usage for Model Training",
    severity: "high",
    rationale: "Using customer data to train AI models presents severe intellectual property and confidentiality leakage concerns.",
    likelyCustomerConcerns: [
      "Model inversion or prompt leakage exposing proprietary data",
      "Lack of explicit training opt-out mechanisms",
      "Co-mingling customer data in core weights"
    ],
    suggestedTrustTopics: [
      "AI Governance & Safety",
      "Intellectual Property Protection",
      "Data Usage Consent Policies"
    ]
  },
  ai_governance_requirements: {
    key: "ai_governance_requirements",
    label: "AI Governance & Data Privacy Safeguards",
    severity: "medium",
    rationale: "Using artificial intelligence tools places a compliance burden regarding third-party subprocessors and data privacy agreements.",
    likelyCustomerConcerns: [
      "Compliance with GDPR AI regulations",
      "Data transit to third-party providers (OpenAI/Anthropic)",
      "Prompt injection and input sanitization vulnerabilities"
    ],
    suggestedTrustTopics: [
      "AI Safety & Governance",
      "Third Party Vendor Risk"
    ]
  },
  data_exfiltration_risk: {
    key: "data_exfiltration_risk",
    label: "Data Exfiltration & Synchronization Vulnerabilities",
    severity: "high",
    rationale: "Continuous desktop/folder synchronization creates a massive data transit pipeline that must be tightly governed.",
    likelyCustomerConcerns: [
      "Continuous unauthorized synchronization of files",
      "Security of the desktop/endpoint agent",
      "Data leakage from end-user devices"
    ],
    suggestedTrustTopics: [
      "Data Loss Prevention (DLP)",
      "Endpoint Security"
    ]
  },
  tenant_isolation_risk: {
    key: "tenant_isolation_risk",
    label: "Cross-Tenant Data Exposure Risks",
    severity: "high",
    rationale: "Products managing multi-tenant structures must prove strong isolation layers to prevent horizontal data leaks.",
    likelyCustomerConcerns: [
      "Cross-tenant data exposure due to bad routing",
      "Shared database connection failures",
      "Bypassing logical workspace boundaries"
    ],
    suggestedTrustTopics: [
      "Multi-Tenant Isolation Architecture",
      "Logical Boundary Verification"
    ]
  },
  pii_concentration: {
    key: "pii_concentration",
    label: "PII/PHI Concentration Risk",
    severity: "high",
    rationale: "Identifying and scanning sensitive data places a high burden of trust on the storage and encryption of those discovered identifiers.",
    likelyCustomerConcerns: [
      "Concentration of SSN, PHI, or PCI data",
      "Lack of encryption in use for discovered fields",
      "Compliance with GDPR sensitive category rules"
    ],
    suggestedTrustTopics: [
      "Data Classification & Governance",
      "Encryption & Key Custody"
    ]
  },
  key_custody: {
    key: "key_custody",
    label: "Encryption Key Custody & Control",
    severity: "medium",
    rationale: "Vendor custody of decryption keys presents a potential subprocessor exposure vector.",
    likelyCustomerConcerns: [
      "Lack of BYOK (Bring Your Own Key) capabilities",
      "Weak key rotation controls",
      "Access to keys by cloud hosting providers"
    ],
    suggestedTrustTopics: [
      "Encryption & Key Custody",
      "Key Management Policies"
    ]
  },
  cross_system_integration: {
    key: "cross_system_integration",
    label: "Cross-System Integration Risks",
    severity: "medium",
    rationale: "Automated write/action triggers in integrated systems can cause unauthorized cascading configurations.",
    likelyCustomerConcerns: [
      "Broad write scopes requested in downstream systems",
      "Lack of custom granular approval gates",
      "Failure of API credentials token rotation"
    ],
    suggestedTrustTopics: [
      "Integrations Security",
      "Access Control"
    ]
  }
};

/**
 * Maps capability keys to their specific procurement implications defined in the registry.
 */
export function getImplicationsForCapability(capabilityKey: string): string[] {
  switch (capabilityKey) {
    case "cloud_scanning":
      return ["privileged_cloud_access", "infrastructure_reach"];
    case "endpoint_agent":
      return ["infrastructure_reach", "data_exfiltration_risk"];
    case "email_ingestion":
    case "communication_ingestion":
      return ["customer_content_exposure", "retention_concerns", "support_visibility"];
    case "file_sync":
      return ["data_exfiltration_risk", "retention_concerns"];
    case "ai_training":
      return ["customer_data_usage", "ai_governance_requirements"];
    case "ai_inference":
      return ["ai_governance_requirements"];
    case "tenant_management":
      return ["tenant_isolation_risk"];
    case "sensitive_data_discovery":
      return ["pii_concentration", "customer_content_exposure"];
    case "encryption_management":
      return ["key_custody"];
    case "workflow_automation":
      return ["cross_system_integration"];
    default:
      return [];
  }
}
