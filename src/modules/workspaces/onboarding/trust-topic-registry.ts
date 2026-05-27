/**
 * Universal Trust Topic Registry
 * 
 * Defines canonical topics used across all domains.
 */
export interface TrustPillarDefinition {
  key: string;
  title: string;
  summary: string;
}

export const TRUST_PILLAR_REGISTRY: TrustPillarDefinition[] = [
  {
    key: "privacy_handling",
    title: "Data Privacy & Handling",
    summary: "Governance of customer data privacy, processing agreements, and regulatory alignment."
  },
  {
    key: "sensitive_data",
    title: "Sensitive Data Management",
    summary: "Advanced protection for PII, financial data, and sensitive business assets."
  },
  {
    key: "infrastructure_cloud",
    title: "Infrastructure & Cloud Governance",
    summary: "Security of cloud platforms, network isolation, and infrastructure hardening."
  },
  {
    key: "identity_access",
    title: "Identity & Access Governance",
    summary: "Management of user identities, administrative access, and authentication standards."
  },
  {
    key: "ai_model",
    title: "AI & Model Governance",
    summary: "Security, ethics, and transparency of AI models and automated data processing."
  },
  {
    key: "storage_sovereignty",
    title: "Data Storage & Sovereignty",
    summary: "Compliance with data residency laws, secure backups, and disposal procedures."
  },
  {
    key: "compliance_readiness",
    title: "Compliance & Evidence Readiness",
    summary: "Preparation for external audits, vulnerability management, and incident response."
  }
];

export interface TrustTopicDefinition {
  key: string;
  pillarKey: string;
  title: string;
  description: string;
  defaultPriority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  impliedEvidenceNeeds: string[];
  impliedAnswerAreas: string[];
  placeholderQuestions: string[];
  evidenceNeeded: string[];
}


export const TRUST_TOPIC_REGISTRY: TrustTopicDefinition[] = [
  {
    key: "data_handling",
    pillarKey: "privacy_handling",
    title: "Data Handling & Privacy",
    description: "Controls for how customer data is accessed, processed, and protected throughout its lifecycle.",
    defaultPriority: "CRITICAL",
    impliedEvidenceNeeds: ["Data Processing Agreement", "Privacy Policy"],
    impliedAnswerAreas: ["Data Lifecycle", "Privacy by Design"],
    placeholderQuestions: [
      "What customer data is accessed?",
      "Is sensitive data processed?",
      "Is data stored or only scanned?",
      "What is the retention policy?"
    ],
    evidenceNeeded: ["Data Retention Policy", "DPA"]
  },
  {
    key: "privacy_data_protection",
    pillarKey: "privacy_handling",
    title: "Privacy & Data Protection",
    description: "Alignment with privacy regulations (GDPR, CCPA) and specialized data protection controls.",
    defaultPriority: "CRITICAL",
    impliedEvidenceNeeds: ["Privacy Impact Assessment", "DSAR Process"],
    impliedAnswerAreas: ["Regulatory Compliance", "Data Subject Rights"],
    placeholderQuestions: [
      "Is a DPA available?",
      "Are subprocessors listed?",
      "How are deletion requests handled?"
    ],
    evidenceNeeded: ["Privacy Policy", "Subprocessor List"]
  },
  {
    key: "access_control",
    pillarKey: "identity_access",
    title: "Access Control & Identity",
    description: "Management of user identities, role-based access, and authentication security.",
    defaultPriority: "HIGH",
    impliedEvidenceNeeds: ["Access Control Policy", "IAM Audit"],
    impliedAnswerAreas: ["User Provisioning", "Authentication Standards"],
    placeholderQuestions: [
      "Is SSO supported?",
      "Is MFA required?",
      "How is RBAC implemented?",
      "How are users provisioned/deprovisioned?"
    ],
    evidenceNeeded: ["Access Control Policy", "IAM Documentation"]
  },
  {
    key: "tenant_isolation",
    pillarKey: "infrastructure_cloud",
    title: "Multi-Tenant Isolation",
    description: "Logical and physical separation of customer data within a shared infrastructure.",
    defaultPriority: "CRITICAL",
    impliedEvidenceNeeds: ["Architecture Diagram", "Isolation Test Results"],
    impliedAnswerAreas: ["Cloud Architecture", "Data Segregation"],
    placeholderQuestions: [
      "How is logical isolation enforced between customers?",
      "Are separate database schemas or encryption keys used?",
      "Is isolation verified by external penetration testing?"
    ],
    evidenceNeeded: ["Architecture Diagram", "Multi-tenancy Whitepaper"]
  },
  {
    key: "encryption_key_management",
    pillarKey: "sensitive_data",
    title: "Encryption & Key Management",
    description: "Standards for encrypting data at rest and in transit, and managing cryptographic keys.",
    defaultPriority: "HIGH",
    impliedEvidenceNeeds: ["Encryption Policy", "KMS Documentation"],
    impliedAnswerAreas: ["Cryptographic Controls", "Key Rotation"],
    placeholderQuestions: [
      "What encryption algorithms are used for data at rest?",
      "How are cryptographic keys managed and rotated?",
      "Is customer-managed encryption (BYOK) supported?"
    ],
    evidenceNeeded: ["Encryption Policy", "KMS Architecture"]
  },
  {
    key: "audit_logging_monitoring",
    pillarKey: "compliance_readiness",
    title: "Audit Logging & Monitoring",
    description: "Recording of system activities and proactive monitoring for security events.",
    defaultPriority: "MEDIUM",
    impliedEvidenceNeeds: ["Logging Standards", "SIEM Documentation"],
    impliedAnswerAreas: ["Security Observability", "Incident Detection"],
    placeholderQuestions: [
      "What audit logs are maintained for customer data access?",
      "How long are security logs retained?",
      "Are logs protected against unauthorized modification?"
    ],
    evidenceNeeded: ["Logging Policy"]
  },
  {
    key: "cloud_security",
    pillarKey: "infrastructure_cloud",
    title: "Cloud Infrastructure Security",
    description: "Security of the underlying cloud platform, configurations, and shared responsibility.",
    defaultPriority: "HIGH",
    impliedEvidenceNeeds: ["Cloud Security Assessment", "CSPM Reports"],
    impliedAnswerAreas: ["Infrastructure Hardening", "Cloud Governance"],
    placeholderQuestions: [
      "Which cloud providers are accessed?",
      "What permissions are required?",
      "Are connectors read-only?",
      "Is access logged?"
    ],
    evidenceNeeded: ["Cloud Security Review", "IAM Policy"]
  },
  {
    key: "connector_credential_security",
    pillarKey: "identity_access",
    title: "Connector & Credential Security",
    description: "Protection of service accounts, API keys, and external integration credentials.",
    defaultPriority: "HIGH",
    impliedEvidenceNeeds: ["Secrets Management Policy"],
    impliedAnswerAreas: ["Third-party Access", "Credential Governance"],
    placeholderQuestions: [
      "How are external credentials (e.g. cloud keys) stored?",
      "How frequently are service account credentials rotated?",
      "Is credential usage monitored for anomalies?"
    ],
    evidenceNeeded: ["Secrets Management Policy"]
  },
  {
    key: "api_security",
    pillarKey: "infrastructure_cloud",
    title: "API & Integration Security",
    description: "Protection of external-facing API surfaces against common vulnerabilities and abuse.",
    defaultPriority: "MEDIUM",
    impliedEvidenceNeeds: ["API Security Standards", "Owasp API Top 10 Review"],
    impliedAnswerAreas: ["Interface Security", "Rate Limiting"],
    placeholderQuestions: [
      "How are API requests authenticated and authorized?",
      "Are API rate limits enforced to prevent abuse?",
      "Is there a public API documentation/security policy?"
    ],
    evidenceNeeded: ["API Security Policy"]
  },
  {
    key: "ai_data_processing",
    pillarKey: "ai_model",
    title: "AI Data Processing",
    description: "Transparency into how data is used for AI model training, fine-tuning, and inference.",
    defaultPriority: "HIGH",
    impliedEvidenceNeeds: ["AI Ethics Policy", "Model Card"],
    impliedAnswerAreas: ["AI Governance", "Data Provenance"],
    placeholderQuestions: [
      "Is customer data processed by AI?",
      "Is customer data used for training?",
      "Is human review involved?",
      "Can customers opt out?"
    ],
    evidenceNeeded: ["AI Ethics Policy", "Model Card"]
  },
  {
    key: "model_governance",
    pillarKey: "ai_model",
    title: "AI Model Governance",
    description: "Security and reliability of AI models, including protection against prompt injection and drift.",
    defaultPriority: "MEDIUM",
    impliedEvidenceNeeds: ["Model Security Review"],
    impliedAnswerAreas: ["Model Integrity", "Algorithmic Fairness"],
    placeholderQuestions: [
      "How are AI models protected against prompt injection?",
      "What monitoring is in place for model drift or bias?",
      "Are AI models subject to regular security testing?"
    ],
    evidenceNeeded: ["Model Security Policy"]
  },
  {
    key: "payment_security",
    pillarKey: "sensitive_data",
    title: "Payment & Financial Security",
    description: "PCI-DSS compliance and secure handling of payment card information and transactions.",
    defaultPriority: "CRITICAL",
    impliedEvidenceNeeds: ["PCI AOC", "PCI SAQ"],
    impliedAnswerAreas: ["PCI Controls", "Transaction Integrity"],
    placeholderQuestions: [
      "Is card data processed or tokenized?",
      "Which payment processor is used?",
      "Is PCI scope direct or outsourced?"
    ],
    evidenceNeeded: ["PCI AOC", "PCI SAQ"]
  },
  {
    key: "transaction_security",
    pillarKey: "sensitive_data",
    title: "Transaction Integrity",
    description: "Prevention of fraudulent transactions and ensuring the non-repudiation of financial actions.",
    defaultPriority: "HIGH",
    impliedEvidenceNeeds: ["Fraud Prevention Policy"],
    impliedAnswerAreas: ["Financial Controls", "Anti-Fraud Monitoring"],
    placeholderQuestions: [
      "How are fraudulent transactions detected and blocked?",
      "Are there limits on transaction volume or frequency?",
      "Is multi-factor authentication required for high-value actions?"
    ],
    evidenceNeeded: ["Anti-fraud Policy"]
  },
  {
    key: "vulnerability_management",
    pillarKey: "compliance_readiness",
    title: "Vulnerability Management",
    description: "Continuous scanning, evaluation, and remediation of software and infrastructure vulnerabilities.",
    defaultPriority: "HIGH",
    impliedEvidenceNeeds: ["Vulnerability Scan Reports", "Patch Management Policy"],
    impliedAnswerAreas: ["Remediation Lifecycles", "CVE Tracking"],
    placeholderQuestions: [
      "How frequently are vulnerability scans performed?",
      "What is the SLA for patching critical vulnerabilities?",
      "Is there a public bug bounty or vulnerability disclosure program?"
    ],
    evidenceNeeded: ["Vulnerability Management Policy", "VDP"]
  },
  {
    key: "incident_response",
    pillarKey: "compliance_readiness",
    title: "Incident Response",
    description: "Procedures for detecting, responding to, and recovering from security incidents.",
    defaultPriority: "HIGH",
    impliedEvidenceNeeds: ["Incident Response Plan", "Tabletop Exercise Results"],
    impliedAnswerAreas: ["Crisis Management", "Communication Protocols"],
    placeholderQuestions: [
      "What is the timeline for customer notification after a breach?",
      "Is there a 24/7 security incident response team?",
      "How often is the incident response plan tested?"
    ],
    evidenceNeeded: ["Incident Response Plan"]
  },
  {
    key: "data_retention_deletion",
    pillarKey: "storage_sovereignty",
    title: "Data Retention & Deletion",
    description: "Policies for data lifecycle management and secure disposal of customer information.",
    defaultPriority: "MEDIUM",
    impliedEvidenceNeeds: ["Data Retention Policy"],
    impliedAnswerAreas: ["Lifecycle Governance", "Secure Disposal"],
    placeholderQuestions: [
      "How long is customer data retained after contract termination?",
      "Is data securely deleted using industry-standard methods?",
      "Can customers request early deletion of their data?"
    ],
    evidenceNeeded: ["Data Retention Policy"]
  },
  {
    key: "subprocessor_management",
    pillarKey: "supply_chain",
    title: "Subprocessor & Vendor Risk",
    description: "Governance of third-party vendors and subprocessors who handle customer data.",
    defaultPriority: "MEDIUM",
    impliedEvidenceNeeds: ["Subprocessor List", "Vendor Security Assessment"],
    impliedAnswerAreas: ["Supply Chain Trust", "Third-party Monitoring"],
    placeholderQuestions: [
      "Is there a maintained list of all third-party subprocessors?",
      "How are security standards enforced on subprocessors?",
      "Are customers notified before new subprocessors are added?"
    ],
    evidenceNeeded: ["Subprocessor List", "Vendor Risk Policy"]
  },
  {
    key: "sensitive_data_management",
    pillarKey: "sensitive_data",
    title: "Sensitive Data Management",
    description: "Advanced controls for discovering, classifying, and protecting sensitive data assets.",
    defaultPriority: "CRITICAL",
    impliedEvidenceNeeds: ["Data Classification Policy", "DLP Reports"],
    impliedAnswerAreas: ["Data Governance", "Asset Protection"],
    placeholderQuestions: [
      "How is sensitive data discovered within the environment?",
      "What classification levels are applied to customer data?",
      "Are automated DLP controls in place to prevent leakage?"
    ],
    evidenceNeeded: ["Data Classification Policy"]
  },
  {
    key: "infrastructure_security",
    pillarKey: "infrastructure_cloud",
    title: "Infrastructure Security",
    description: "Security of physical and virtual infrastructure, including network segmentation and hardening.",
    defaultPriority: "HIGH",
    impliedEvidenceNeeds: ["Network Diagram", "Hardening Standards"],
    impliedAnswerAreas: ["Network Security", "Systems Integrity"],
    placeholderQuestions: [
      "Is the network segmented to protect sensitive data?",
      "Are systems hardened according to industry standards (e.g. CIS)?",
      "Is physical access to data centers restricted?"
    ],
    evidenceNeeded: ["Infrastructure Security Policy"]
  },
  {
    key: "training_data_policy",
    pillarKey: "ai_model",
    title: "AI Training Data Policy",
    description: "Policies governing the collection and use of data for AI/ML model training.",
    defaultPriority: "MEDIUM",
    impliedEvidenceNeeds: ["AI Data Usage Policy"],
    impliedAnswerAreas: ["Model Ethics", "Data Privacy"],
    placeholderQuestions: [
      "Is customer data used for model training or fine-tuning?",
      "Is training data anonymized or de-identified?",
      "Can customers opt-out of their data being used for training?"
    ],
    evidenceNeeded: ["AI Data Usage Policy"]
  },
  {
    key: "mfa_sso",
    pillarKey: "identity_access",
    title: "MFA & SSO Integration",
    description: "Requirements and support for Multi-Factor Authentication and Single Sign-On.",
    defaultPriority: "HIGH",
    impliedEvidenceNeeds: ["Authentication Policy"],
    impliedAnswerAreas: ["Identity Security", "Access Management"],
    placeholderQuestions: [
      "Is MFA mandatory for all administrative access?",
      "Does the product support enterprise SSO (SAML/OIDC)?",
      "Are authentication events logged and monitored?"
    ],
    evidenceNeeded: ["Authentication Policy"]
  },
  {
    key: "user_provisioning",
    pillarKey: "identity_access",
    title: "User Provisioning & Lifecycle",
    description: "Processes for managing user accounts from creation through termination.",
    defaultPriority: "MEDIUM",
    impliedEvidenceNeeds: ["User Lifecycle Policy"],
    impliedAnswerAreas: ["Account Governance", "Onboarding/Offboarding"],
    placeholderQuestions: [
      "How are user accounts provisioned and deprovisioned?",
      "Are access reviews performed regularly?",
      "Is there an automated process for account termination?"
    ],
    evidenceNeeded: ["User Lifecycle Policy"]
  },
  {
    key: "privileged_access",
    pillarKey: "identity_access",
    title: "Privileged Access Management",
    description: "Controls for managing and monitoring administrative and high-risk access.",
    defaultPriority: "CRITICAL",
    impliedEvidenceNeeds: ["PAM Policy", "Admin Access Logs"],
    impliedAnswerAreas: ["Administrative Security", "Least Privilege"],
    placeholderQuestions: [
      "How is privileged access requested and approved?",
      "Are administrative actions performed through jump hosts or PIM/PAM tools?",
      "Are privileged sessions recorded or audited?"
    ],
    evidenceNeeded: ["PAM Policy"]
  },
  {
    key: "least_privilege",
    pillarKey: "identity_access",
    title: "Principle of Least Privilege",
    description: "Ensuring users and systems only have the minimum access required for their functions.",
    defaultPriority: "HIGH",
    impliedEvidenceNeeds: ["IAM Roles Review"],
    impliedAnswerAreas: ["Access Architecture", "Permission Governance"],
    placeholderQuestions: [
      "How are permissions assigned to users and services?",
      "Is access granted based on roles or individual requests?",
      "Are overly permissive accounts regularly identified and corrected?"
    ],
    evidenceNeeded: ["Access Control Policy"]
  },
  {
    key: "pci_review",
    pillarKey: "compliance_readiness",
    title: "PCI Compliance Review",
    description: "Specific evaluation of PCI-DSS controls and cardholder data environment security.",
    defaultPriority: "CRITICAL",
    impliedEvidenceNeeds: ["PCI AOC", "ASV Scan Reports"],
    impliedAnswerAreas: ["Payment Security", "Compliance Governance"],
    placeholderQuestions: [
      "Is the product's PCI AOC current?",
      "What is the PCI level of the organization?",
      "Are ASV scans performed quarterly?"
    ],
    evidenceNeeded: ["PCI AOC"]
  },
  {
    key: "fraud_controls",
    pillarKey: "sensitive_data",
    title: "Fraud Prevention & Detection",
    description: "Mechanisms to identify and mitigate fraudulent activities and transactions.",
    defaultPriority: "HIGH",
    impliedEvidenceNeeds: ["Fraud Monitoring Policy"],
    impliedAnswerAreas: ["Operational Integrity", "Financial Security"],
    placeholderQuestions: [
      "How are suspicious activities detected in real-time?",
      "What is the process for investigating potential fraud?",
      "Are there limits on high-risk transaction types?"
    ],
    evidenceNeeded: ["Fraud Monitoring Policy"]
  },
  {
    key: "identity_verification",
    pillarKey: "identity_access",
    title: "Identity Verification Trust",
    description: "Trust in the methods used to verify user identities and document authenticity.",
    defaultPriority: "MEDIUM",
    impliedEvidenceNeeds: ["Identity Verification Policy"],
    impliedAnswerAreas: ["Identity Assurance", "KYC Controls"],
    placeholderQuestions: [
      "What methods are used to verify user identity?",
      "Is identity data stored securely and de-identified?",
      "Are third-party verification services used?"
    ],
    evidenceNeeded: ["Identity Verification Policy"]
  },
  {
    key: "pii_handling",
    pillarKey: "sensitive_data",
    title: "PII Handling & Localization",
    description: "Specific controls for Personally Identifiable Information and data residency requirements.",
    defaultPriority: "HIGH",
    impliedEvidenceNeeds: ["Privacy Policy", "Data Residency Map"],
    impliedAnswerAreas: ["Privacy Operations", "Sovereignty"],
    placeholderQuestions: [
      "Where is PII stored geographically?",
      "Are data residency requirements for specific regions (e.g. EU) met?",
      "Is PII encrypted separately from other data?"
    ],
    evidenceNeeded: ["Privacy Policy"]
  },
  {
    key: "data_storage",
    pillarKey: "storage_sovereignty",
    title: "Data Storage & Localization",
    description: "Policies and controls for where customer data is physically and logically stored.",
    defaultPriority: "HIGH",
    impliedEvidenceNeeds: ["Data Residency Map"],
    impliedAnswerAreas: ["Storage Architecture"],
    placeholderQuestions: ["Where is data stored?", "Is data localized?"],
    evidenceNeeded: ["Data Residency Policy"]
  },
  {
    key: "data_residency",
    pillarKey: "storage_sovereignty",
    title: "Data Residency & Sovereignty",
    description: "Compliance with local data residency laws and sovereignty requirements.",
    defaultPriority: "CRITICAL",
    impliedEvidenceNeeds: ["Regional Compliance Certs"],
    impliedAnswerAreas: ["Sovereignty Controls"],
    placeholderQuestions: ["Is EU data kept in EU?", "How is sovereignty handled?"],
    evidenceNeeded: ["Data Residency Commitment"]
  },
  {
    key: "backups_recovery",
    pillarKey: "storage_sovereignty",
    title: "Backups & Disaster Recovery",
    description: "Procedures for ensuring data availability and business continuity after a disaster.",
    defaultPriority: "HIGH",
    impliedEvidenceNeeds: ["DR Plan", "Backup Logs"],
    impliedAnswerAreas: ["Business Continuity", "Data Availability"],
    placeholderQuestions: ["How often are backups taken?", "What is the RTO/RPO?"],
    evidenceNeeded: ["Disaster Recovery Plan"]
  },
  {
    key: "data_deletion",
    pillarKey: "storage_sovereignty",
    title: "Data Deletion & Disposal",
    description: "Secure and verified deletion of customer data upon request or contract termination.",
    defaultPriority: "MEDIUM",
    impliedEvidenceNeeds: ["Deletion Certificate Sample"],
    impliedAnswerAreas: ["Data Lifecycle", "Secure Disposal"],
    placeholderQuestions: ["How is data deleted?", "Is there a certificate of deletion?"],
    evidenceNeeded: ["Data Deletion Policy"]
  }
];

