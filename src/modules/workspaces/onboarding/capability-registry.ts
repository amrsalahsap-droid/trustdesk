/**
 * TrustDesk Canonical Capability Registry
 * 
 * Provides a universal ontology for product capabilities across all domains.
 * Used by the analyzer to normalize extraction and by the orchestrator for triggers.
 */

export interface CapabilityDefinition {
  key: string;
  label: string;
  aliases: string[];
  description: string;
  domain: "data_security" | "cloud_integration" | "ai" | "payments" | "healthcare" | "fintech" | "security_tooling" | "general";
  impliedDataTypes: string[];
  impliedRiskAreas: string[];
  impliedTrustTopics: string[];
  evidencePatterns: string[];
  confidenceRules: {
    criticalTerms: string[];
    supportingTerms: string[];
    negativeTerms: string[];
  };
}

export const CAPABILITY_REGISTRY: CapabilityDefinition[] = [
  // === DATA / SECURITY ===
  {
    key: "sensitive_data_discovery",
    label: "Sensitive Data Discovery",
    aliases: ["data discovery", "pii discovery", "sensitive data detection", "finding sensitive data"],
    description: "Automatic identification of PII, PHI, or other sensitive data within data stores.",
    domain: "data_security",
    impliedDataTypes: ["PII", "PHI", "Sensitive Data"],
    impliedRiskAreas: ["data_leakage", "privacy_non_compliance"],
    impliedTrustTopics: ["data_classification", "pii_handling"],
    evidencePatterns: ["scan for PII", "automatic discovery", "identify sensitive data"],
    confidenceRules: {
      criticalTerms: ["automatic discovery", "scan for sensitive data", "PII discovery"],
      supportingTerms: ["visibility", "scanning", "reporting"],
      negativeTerms: ["manual classification only", "user-defined tags only"]
    }
  },
  {
    key: "data_classification",
    label: "Data Classification",
    aliases: ["labeling", "tagging data", "data taxonomy"],
    description: "Assigning labels or categories to data based on its sensitivity or importance.",
    domain: "data_security",
    impliedDataTypes: [],
    impliedRiskAreas: ["improper_data_handling"],
    impliedTrustTopics: ["data_governance", "classification_policy"],
    evidencePatterns: ["automated labeling", "classification engine", "sensitivity tiers"],
    confidenceRules: {
      criticalTerms: ["automated classification", "labeling engine", "data tiers"],
      supportingTerms: ["taxonomy", "policy", "tags"],
      negativeTerms: ["static folders"]
    }
  },
  {
    key: "data_retention",
    label: "Data Retention & Disposal",
    aliases: ["retention policy", "data purging", "lifecycle management"],
    description: "Controls for how long data is kept and how it is securely deleted.",
    domain: "data_security",
    impliedDataTypes: [],
    impliedRiskAreas: ["over_retention"],
    impliedTrustTopics: ["retention_policy", "secure_deletion"],
    evidencePatterns: ["automated purging", "retention rules", "secure shredding"],
    confidenceRules: {
      criticalTerms: ["automated retention", "secure deletion", "lifecycle policy"],
      supportingTerms: ["purging", "cleanup", "expiration"],
      negativeTerms: ["permanent storage", "no deletion policy"]
    }
  },
  {
    key: "data_deletion",
    label: "Right to Erasure / Deletion",
    aliases: ["data erasure", "delete my data", "right to be forgotten"],
    description: "Functional ability to permanently delete customer data upon request or policy.",
    domain: "data_security",
    impliedDataTypes: [],
    impliedRiskAreas: ["privacy_violation"],
    impliedTrustTopics: ["data_subject_rights", "secure_deletion"],
    evidencePatterns: ["delete your data", "permanent erasure", "right to be forgotten"],
    confidenceRules: {
      criticalTerms: ["data deletion", "erasure request", "right to be forgotten"],
      supportingTerms: ["GDPR", "privacy rights"],
      negativeTerms: []
    }
  },
  {
    key: "data_residency",
    label: "Data Residency & Sovereignty",
    aliases: ["geographic pinning", "regional storage", "local data hosting"],
    description: "Ability to restrict data storage to specific geographic regions.",
    domain: "data_security",
    impliedDataTypes: [],
    impliedRiskAreas: ["cross_border_transfer_risk"],
    impliedTrustTopics: ["regional_compliance", "data_sovereignty"],
    evidencePatterns: ["regional pinning", "EU-only hosting", "sovereign cloud"],
    confidenceRules: {
      criticalTerms: ["regional storage", "geographic pinning", "data residency"],
      supportingTerms: ["AWS regions", "local hosting", "sovereignty"],
      negativeTerms: ["global replication only"]
    }
  },
  {
    key: "encryption",
    label: "Advanced Encryption",
    aliases: ["at-rest encryption", "in-transit encryption", "kms", "key management"],
    description: "Protection of data using cryptographic methods at rest and in transit.",
    domain: "data_security",
    impliedDataTypes: [],
    impliedRiskAreas: ["unauthorized_access"],
    impliedTrustTopics: ["encryption_standards", "key_management"],
    evidencePatterns: ["AES-256", "TLS 1.3", "BYOK", "KMS"],
    confidenceRules: {
      criticalTerms: ["AES-256", "Bring Your Own Key", "FIPS 140-2"],
      supportingTerms: ["encryption", "HTTPS", "SSL"],
      negativeTerms: ["plain text"]
    }
  },
  {
    key: "access_control",
    label: "Identity & Access Control",
    aliases: ["rbac", "abac", "iam", "sso", "mfa"],
    description: "Managing user identities and restricting access based on roles or attributes.",
    domain: "data_security",
    impliedDataTypes: [],
    impliedRiskAreas: ["unauthorized_access", "privilege_escalation"],
    impliedTrustTopics: ["iam_governance", "mfa_requirement"],
    evidencePatterns: ["RBAC", "SAML SSO", "Multi-factor authentication"],
    confidenceRules: {
      criticalTerms: ["SAML", "OIDC", "RBAC", "MFA"],
      supportingTerms: ["permissions", "login", "groups"],
      negativeTerms: ["shared accounts"]
    }
  },
  {
    key: "audit_logging",
    label: "Audit Logging & Monitoring",
    aliases: ["activity logs", "trail", "siem integration", "telemetry"],
    description: "Recording and monitoring system and user activities for security analysis.",
    domain: "data_security",
    impliedDataTypes: [],
    impliedRiskAreas: ["lack_of_visibility"],
    impliedTrustTopics: ["audit_policy", "security_monitoring"],
    evidencePatterns: ["CloudTrail", "SIEM export", "immutable logs"],
    confidenceRules: {
      criticalTerms: ["immutable logs", "audit trail", "SIEM integration"],
      supportingTerms: ["logs", "activity", "monitoring"],
      negativeTerms: ["no logging"]
    }
  },
  {
    key: "tenant_isolation",
    label: "Multi-Tenant Isolation",
    aliases: ["logical isolation", "sandboxing", "tenant separation"],
    description: "Ensuring that data and processes for different customers are strictly separated.",
    domain: "data_security",
    impliedDataTypes: [],
    impliedRiskAreas: ["cross_tenant_access"],
    impliedTrustTopics: ["tenant_separation", "logical_isolation"],
    evidencePatterns: ["logical isolation", "per-tenant encryption", "VPC separation"],
    confidenceRules: {
      criticalTerms: ["logical isolation", "tenant separation", "multi-tenant security"],
      supportingTerms: ["sandboxed", "isolated"],
      negativeTerms: ["shared database with no isolation"]
    }
  },

  // === CLOUD / INTEGRATION ===
  {
    key: "database_access",
    label: "Direct Database Access",
    aliases: ["database scanning", "db connector", "sql access", "nosql connector"],
    description: "Ability to connect directly to and scan or process data from databases.",
    domain: "cloud_integration",
    impliedDataTypes: [],
    impliedRiskAreas: ["database_vulnerability", "data_exposure"],
    impliedTrustTopics: ["database_security", "access_control"],
    evidencePatterns: ["database connector", "RDS scanning", "SQL access"],
    confidenceRules: {
      criticalTerms: ["database connector", "SQL scanning", "direct DB access"],
      supportingTerms: ["PostgreSQL", "MySQL", "MongoDB", "RDS"],
      negativeTerms: []
    }
  },
  {
    key: "cloud_scanning",
    label: "Cloud Resource Scanning",
    aliases: ["cspm", "cloud security posture", "misconfiguration detection"],
    description: "Automated scanning of cloud infrastructure for security risks and misconfigurations.",
    domain: "cloud_integration",
    impliedDataTypes: [],
    impliedRiskAreas: ["cloud_misconfiguration"],
    impliedTrustTopics: ["cloud_security", "infrastructure_governance"],
    evidencePatterns: ["CSPM", "scan AWS", "cloud compliance"],
    confidenceRules: {
      criticalTerms: ["CSPM", "cloud posture", "scanning infrastructure"],
      supportingTerms: ["AWS", "Azure", "GCP"],
      negativeTerms: []
    }
  },
  {
    key: "cloud_connector",
    label: "Managed Cloud Connectors",
    aliases: ["cloud adapter", "infrastructure bridge"],
    description: "Managed connections to cloud provider APIs and services.",
    domain: "cloud_integration",
    impliedDataTypes: [],
    impliedRiskAreas: ["third_party_access"],
    impliedTrustTopics: ["connector_security", "api_governance"],
    evidencePatterns: ["cloud connector", "direct connect", "managed integration"],
    confidenceRules: {
      criticalTerms: ["cloud connector", "native integration"],
      supportingTerms: ["AWS", "Azure", "GCP"],
      negativeTerms: []
    }
  },
  {
    key: "api_integration",
    label: "API-First Integration",
    aliases: ["rest api", "graphql", "webhooks", "sdk"],
    description: "Robust API surfaces for data exchange and functional integration.",
    domain: "cloud_integration",
    impliedDataTypes: [],
    impliedRiskAreas: ["api_vulnerability"],
    impliedTrustTopics: ["api_security", "integration_trust"],
    evidencePatterns: ["RESTful API", "GraphQL", "Webhooks"],
    confidenceRules: {
      criticalTerms: ["REST API", "API documentation", "Webhooks"],
      supportingTerms: ["SDK", "integration"],
      negativeTerms: []
    }
  },

  {
    key: "file_scanning",
    label: "File & Object Scanning",
    aliases: ["s3 scanning", "blob storage scan", "file system analysis"],
    description: "Automated scanning of files in cloud storage or local file systems.",
    domain: "cloud_integration",
    impliedDataTypes: [],
    impliedRiskAreas: ["malware_exposure", "data_leakage"],
    impliedTrustTopics: ["storage_security", "malware_protection"],
    evidencePatterns: ["scan S3 buckets", "file analysis", "storage scanning"],
    confidenceRules: {
      criticalTerms: ["file scanning", "S3 scanning", "storage analysis"],
      supportingTerms: ["blobs", "buckets", "files"],
      negativeTerms: []
    }
  },
  {
    key: "credential_access",
    label: "Credential & Key Access",
    aliases: ["secrets access", "key vault integration", "iam role assumption"],
    description: "Ability to access or manage service credentials, API keys, or cloud IAM roles.",
    domain: "cloud_integration",
    impliedDataTypes: ["Credentials", "Secrets"],
    impliedRiskAreas: ["credential_exposure", "privilege_escalation"],
    impliedTrustTopics: ["secrets_management", "iam_governance"],
    evidencePatterns: ["access keys", "secret manager", "IAM role"],
    confidenceRules: {
      criticalTerms: ["secrets management", "access keys", "IAM role assumption"],
      supportingTerms: ["vault", "KMS", "credentials"],
      negativeTerms: []
    }
  },
  {
    key: "infrastructure_scanning",
    label: "Infrastructure Scanning",
    aliases: ["vulnerability scanning", "asm", "attack surface management", "network scanning"],
    description: "External or internal scanning of network infrastructure and assets.",
    domain: "cloud_integration",
    impliedDataTypes: [],
    impliedRiskAreas: ["vulnerability_exposure"],
    impliedTrustTopics: ["vulnerability_management", "network_security"],
    evidencePatterns: ["network scan", "ASM", "attack surface"],
    confidenceRules: {
      criticalTerms: ["infrastructure scanning", "network scanning", "attack surface management"],
      supportingTerms: ["ports", "ip addresses", "scanning"],
      negativeTerms: []
    }
  },
  // === AI ===
  {
    key: "ai_processing",
    label: "AI & ML Processing",
    aliases: ["artificial intelligence", "machine learning", "nlp", "computer vision"],
    description: "Use of AI or ML models to process data or perform tasks.",
    domain: "ai",
    impliedDataTypes: ["AI Training Data"],
    impliedRiskAreas: ["model_bias", "ai_privacy"],
    impliedTrustTopics: ["ai_governance", "model_transparency"],
    evidencePatterns: ["LLM", "machine learning", "generative AI"],
    confidenceRules: {
      criticalTerms: ["LLM", "Generative AI", "Machine Learning models"],
      supportingTerms: ["AI powered", "automated insights"],
      negativeTerms: []
    }
  },
  {
    key: "model_inference",
    label: "AI Model Inference",
    aliases: ["prediction engine", "real-time inference", "llm hosting"],
    description: "Running AI/ML models to generate predictions or content in real-time.",
    domain: "ai",
    impliedDataTypes: [],
    impliedRiskAreas: ["hallucination", "model_drift"],
    impliedTrustTopics: ["ai_reliability", "inference_security"],
    evidencePatterns: ["real-time predictions", "hosted models", "inference API"],
    confidenceRules: {
      criticalTerms: ["model inference", "real-time prediction", "hosted LLM"],
      supportingTerms: ["API", "predictions"],
      negativeTerms: []
    }
  },
  {
    key: "model_training",
    label: "AI Model Training & Tuning",
    aliases: ["model optimization", "fine-tuning", "training pipeline"],
    description: "Processes for training or refining AI models using datasets.",
    domain: "ai",
    impliedDataTypes: ["Training Sets"],
    impliedRiskAreas: ["data_provenance", "ip_leakage"],
    impliedTrustTopics: ["training_data_governance"],
    evidencePatterns: ["fine-tuned on", "training dataset", "model weights"],
    confidenceRules: {
      criticalTerms: ["model training", "fine-tuning", "training pipeline"],
      supportingTerms: ["dataset", "weights"],
      negativeTerms: []
    }
  },

  // === PAYMENTS / MARKETPLACES ===
  {
    key: "payment_processing",
    label: "Secure Payment Processing",
    aliases: ["billing", "checkout", "credit card handling", "pci"],
    description: "Facilitating financial transactions and handling payment instrument data.",
    domain: "payments",
    impliedDataTypes: ["Financial Data", "PCI Data"],
    impliedRiskAreas: ["pci_non_compliance", "fraud"],
    impliedTrustTopics: ["pci_dss", "payment_security"],
    evidencePatterns: ["Stripe integration", "PCI-DSS compliant", "accept credit cards"],
    confidenceRules: {
      criticalTerms: ["PCI-DSS", "payment gateway", "secure checkout"],
      supportingTerms: ["credit card", "billing", "invoice"],
      negativeTerms: []
    }
  },
  {
    key: "fraud_detection",
    label: "Fraud & Risk Detection",
    aliases: ["anti-fraud", "anomaly detection", "risk scoring"],
    description: "Monitoring transactions or activities to identify and prevent fraudulent behavior.",
    domain: "payments",
    impliedDataTypes: [],
    impliedRiskAreas: ["financial_loss"],
    impliedTrustTopics: ["fraud_prevention", "transaction_monitoring"],
    evidencePatterns: ["fraud score", "anomaly detection", "risk engine"],
    confidenceRules: {
      criticalTerms: ["anti-fraud", "fraud detection", "anomaly detection engine"],
      supportingTerms: ["verification", "risk"],
      negativeTerms: []
    }
  },

  // === HEALTHCARE ===
  {
    key: "phi_handling",
    label: "PHI & HIPAA Compliance",
    aliases: ["patient records", "health data", "clinical data"],
    description: "Processing or storing Protected Health Information (PHI) under HIPAA regulations.",
    domain: "healthcare",
    impliedDataTypes: ["PHI"],
    impliedRiskAreas: ["hipaa_violation"],
    impliedTrustTopics: ["phi_security", "hipaa_controls"],
    evidencePatterns: ["HIPAA compliant", "PHI handling", "electronic health records"],
    confidenceRules: {
      criticalTerms: ["HIPAA", "PHI", "BAA", "Patient Data"],
      supportingTerms: ["clinical", "healthcare"],
      negativeTerms: []
    }
  },

  // === FINTECH ===
  {
    key: "kyc_aml",
    label: "KYC & AML Compliance",
    aliases: ["know your customer", "anti-money laundering", "identity check"],
    description: "Verifying customer identity and monitoring for money laundering risks.",
    domain: "fintech",
    impliedDataTypes: ["ID Documents"],
    impliedRiskAreas: ["regulatory_fines", "money_laundering"],
    impliedTrustTopics: ["aml_policy", "identity_verification"],
    evidencePatterns: ["KYC/AML", "identity verification", "sanctions screening"],
    confidenceRules: {
      criticalTerms: ["KYC", "AML", "identity verification"],
      supportingTerms: ["onboarding", "verification"],
      negativeTerms: []
    }
  },

  // === SECURITY TOOLING ===
  {
    key: "vulnerability_management",
    label: "Vulnerability Management",
    aliases: ["scanning", "cve detection", "patching"],
    description: "Identifying, evaluating, and remediating software vulnerabilities.",
    domain: "security_tooling",
    impliedDataTypes: [],
    impliedRiskAreas: ["exploitation"],
    impliedTrustTopics: ["vulnerability_disclosure", "patch_management"],
    evidencePatterns: ["CVE scanning", "vulnerability assessment", "remediation"],
    confidenceRules: {
      criticalTerms: ["vulnerability management", "CVE scanning"],
      supportingTerms: ["security scans", "patching"],
      negativeTerms: []
    }
  },
  {
    key: "threat_detection",
    label: "Threat Detection & Response",
    aliases: ["edr", "xdr", "mdr", "intrusion detection"],
    description: "Monitoring for and responding to active security threats and intrusions.",
    domain: "security_tooling",
    impliedDataTypes: [],
    impliedRiskAreas: ["breach"],
    impliedTrustTopics: ["incident_response", "threat_hunting"],
    evidencePatterns: ["EDR", "intrusion detection", "threat hunting"],
    confidenceRules: {
      criticalTerms: ["EDR", "XDR", "Intrusion Detection", "Threat Hunting"],
      supportingTerms: ["detection", "response"],
      negativeTerms: []
    }
  }
];

/**
 * Utility to find a canonical key for a raw capability string
 */
export function findCanonicalCapability(raw: string): CapabilityDefinition | undefined {
  const normalized = raw.toLowerCase().trim();
  
  // 1. Direct key match
  let found = CAPABILITY_REGISTRY.find(c => c.key === normalized);
  if (found) return found;
  
  // 2. Alias match
  found = CAPABILITY_REGISTRY.find(c => 
    c.aliases.some(a => a.toLowerCase() === normalized)
  );
  if (found) return found;
  
  // 3. Partial alias/label match (more aggressive)
  found = CAPABILITY_REGISTRY.find(c => 
    c.label.toLowerCase().includes(normalized) ||
    c.aliases.some(a => a.toLowerCase().includes(normalized)) ||
    normalized.includes(c.label.toLowerCase())
  );
  
  return found;
}

export function isCanonicalKey(key: string): boolean {
  return CAPABILITY_REGISTRY.some(c => c.key === key);
}
