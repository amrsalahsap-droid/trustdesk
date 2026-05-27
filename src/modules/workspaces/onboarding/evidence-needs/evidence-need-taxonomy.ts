export interface TaxonomyEvidenceNeed {
  canonicalKey: string;
  title: string;
  description: string;
  defaultPillar: string;
  procurementImpact: string;
  defaultSeverity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  patterns: string[];
}

export const EVIDENCE_NEED_TAXONOMY: TaxonomyEvidenceNeed[] = [
  {
    canonicalKey: "ai_data_usage_policy",
    title: "AI Data Usage Policy",
    description: "Official company policy regarding customer data usage for artificial intelligence training, fine-tuning, and inference security boundaries.",
    defaultPillar: "AI & Model Security",
    procurementImpact: "Enterprise buyers frequently block vendors using AI until policies guarantee customer data is not used for model training without consent.",
    defaultSeverity: "CRITICAL",
    patterns: ["ai data", "ai governance", "model governance", "ai ethics", "model card", "model security", "ethics policy"]
  },
  {
    canonicalKey: "tenant_isolation_architecture",
    title: "Tenant Isolation Architecture",
    description: "Architectural specifications, network diagrams, and logical design confirming that multi-tenant customer data cannot leak between tenants.",
    defaultPillar: "Infrastructure & Cloud Security",
    procurementImpact: "Crucial for multi-tenant SaaS. Lack of tenant isolation architecture diagrams is a major security red flag for enterprise procurement.",
    defaultSeverity: "CRITICAL",
    patterns: ["tenant isolation", "container", "network-level tenant", "isolation architecture"]
  },
  {
    canonicalKey: "connector_permission_guide",
    title: "Connector Permission Guide",
    description: "Integration documentation detailing minimal permission requirements, API scopes, and least-privilege configurations for third-party cloud connections.",
    defaultPillar: "Identity & Access Enforcement",
    procurementImpact: "Enterprise compliance dictates that third-party cloud integrations must follow strict principle of least privilege.",
    defaultSeverity: "HIGH",
    patterns: ["connector permission", "least privilege", "iam policy", "privilege guide"]
  },
  {
    canonicalKey: "subprocessor_list",
    title: "Subprocessor List",
    description: "Complete directory of third-party vendors and subprocessors, including hosting locations, security controls, and DPA agreements.",
    defaultPillar: "Data Privacy & Handling",
    procurementImpact: "GDPR/CCPA compliance requires strict subprocessor transparency before signing any DPA with enterprise customers.",
    defaultSeverity: "HIGH",
    patterns: ["subprocessor", "third-party", "vendor management", "subprocessor list"]
  },
  {
    canonicalKey: "data_retention_policy",
    title: "Data Retention Policy",
    description: "Formal protocol outlining customer data retention periods, end-of-contract deletion guarantees, and secure data destruction methods.",
    defaultPillar: "Storage & Sovereignty",
    procurementImpact: "Required to satisfy corporate compliance policies regarding the timely deletion of customer data upon contract termination.",
    defaultSeverity: "HIGH",
    patterns: ["data retention", "deletion", "data disposal", "retention policy"]
  },
  {
    canonicalKey: "soc2_report",
    title: "SOC 2 Type II Report",
    description: "Third-party independent audit report confirming security, confidentiality, availability, processing integrity, and privacy controls.",
    defaultPillar: "Compliance & Audit Readiness",
    procurementImpact: "The baseline trust standard. Most enterprise buyers will not proceed without a current SOC 2 Type II audit report.",
    defaultSeverity: "HIGH",
    patterns: ["soc 2", "soc2", "audit report", "compliance audit"]
  },
  {
    canonicalKey: "privacy_policy",
    title: "Privacy Policy",
    description: "Company privacy statement outlining customer data gathering, processing, legal compliance, and customer privacy rights.",
    defaultPillar: "Data Privacy & Handling",
    procurementImpact: "A mandatory public compliance disclosure required to confirm legal data processing frameworks.",
    defaultSeverity: "HIGH",
    patterns: ["privacy policy", "dpa", "privacy policy statement"]
  },
  {
    canonicalKey: "access_control_policy",
    title: "Access Control Policy",
    description: "Access management standards outlining employee credential security, single sign-on (SSO), and mandatory multi-factor authentication (MFA).",
    defaultPillar: "Identity & Access Enforcement",
    procurementImpact: "Demonstrates access controls, SSO, and MFA policies are enforced for all administrative and user roles.",
    defaultSeverity: "MEDIUM",
    patterns: ["access control", "sso", "mfa", "access policy"]
  },
  {
    canonicalKey: "encryption_policy",
    title: "Encryption Policy",
    description: "Technical protocol specifying data encryption standards at rest, in transit, key management, and secrets safeguarding.",
    defaultPillar: "Sensitive Data Protection",
    procurementImpact: "Confirms encryption in transit and at rest standards to protect proprietary and sensitive business records.",
    defaultSeverity: "MEDIUM",
    patterns: ["encryption", "key management", "sensitive data", "encryption policy"]
  },
  {
    canonicalKey: "support_access_policy",
    title: "Support Access Policy",
    description: "Policy detailing access controls, impersonation guidelines, and session auditing for support personnel accessing production databases.",
    defaultPillar: "Identity & Access Enforcement",
    procurementImpact: "Enterprise buyers require assurance that vendor support staff cannot access sensitive client data without explicit session approval.",
    defaultSeverity: "HIGH",
    patterns: ["support access", "support access policy", "support personnel"]
  }
];
