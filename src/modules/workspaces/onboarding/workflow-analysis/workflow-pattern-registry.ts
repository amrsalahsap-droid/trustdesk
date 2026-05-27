import { OperationalWorkflow } from "./workflow-analysis-types";

export type WorkflowPattern = Omit<
  OperationalWorkflow,
  "confidence" | "evidenceRefs" | "sourcePages" | "rationale"
> & {
  strongKeywords: string[];
  mediumKeywords: string[];
  contextKeywords: string[];
};

export const WORKFLOW_PATTERN_REGISTRY: Record<string, WorkflowPattern> = {
  ingestion: {
    key: "ingestion",
    label: "Data Ingestion Workflow",
    steps: [
      { stepNumber: 1, actor: "User", description: "User authorizes data source integration (OAuth or SMTP forwarder)." },
      { stepNumber: 2, actor: "System", description: "System establishes connection and obtains initial access credentials." },
      { stepNumber: 3, actor: "System", description: "System regularly polls or listens for inbound content streams." },
      { stepNumber: 4, actor: "System", description: "System parses metadata and attachments from ingested content." },
      { stepNumber: 5, actor: "System", description: "Metadata and parsed text are stored in target databases." }
    ],
    dataFlow: [
      { source: "External Mailbox/Source", destination: "TrustDesk Ingestion Layer", dataType: "Chat Messages/Emails", isEncrypted: true },
      { source: "TrustDesk Ingestion Layer", destination: "TrustDesk Database", dataType: "Parsed Metadata & Text", isEncrypted: true }
    ],
    accessFlow: [
      { subject: "TrustDesk Ingestion Service", resource: "External Mailbox/Source API", accessType: "read" },
      { subject: "TrustDesk Application", resource: "TrustDesk Database", accessType: "write" }
    ],
    persistenceBehavior: {
      doesStoreData: true,
      storageType: "Database",
      retentionDuration: "Customer-defined or default 30 days"
    },
    procurementRisks: ["customer_content_exposure", "retention_concerns"],
    trustImplications: ["Data Handling & Privacy", "Encryption & Key Custody"],
    evidenceRequirements: ["Data Retention Policy", "PII Redaction Process"],
    strongKeywords: ["email ingestion", "ingest emails", "imap poll", "mailbox integration", "incoming parsing"],
    mediumKeywords: ["inbound stream", "receive messages", "parse attachments", "ticket ingestion"],
    contextKeywords: ["smtp", "imap", "oauth", "mailbox", "inbox", "parser"]
  },

  scanning: {
    key: "scanning",
    label: "Continuous Scanning Workflow",
    steps: [
      { stepNumber: 1, actor: "System", description: "System initiates security scanning task on configured schedules." },
      { stepNumber: 2, actor: "System", description: "System connects to target cloud provider or code repository API." },
      { stepNumber: 3, actor: "System", description: "System inspects configuration metadata, roles, or repositories." },
      { stepNumber: 4, actor: "System", description: "System logs scan outputs and highlights configuration drift." }
    ],
    dataFlow: [
      { source: "Target Environment APIs", destination: "Scanning Engine", dataType: "Infrastructure Metadata", isEncrypted: true },
      { source: "Scanning Engine", destination: "TrustDesk Database", dataType: "Drift Reports & Vulnerabilities", isEncrypted: true }
    ],
    accessFlow: [
      { subject: "Scanning Engine", resource: "Target Environment APIs", accessType: "read" },
      { subject: "TrustDesk Application", resource: "TrustDesk Database", accessType: "write" }
    ],
    persistenceBehavior: {
      doesStoreData: true,
      storageType: "Database",
      retentionDuration: "Indefinite or customer-configured"
    },
    procurementRisks: ["privileged_cloud_access", "infrastructure_reach"],
    trustImplications: ["Infrastructure Access Controls", "Identity & Access Management"],
    evidenceRequirements: ["Least Privilege Architecture", "Read-Only IAM Role Documentation"],
    strongKeywords: ["scan aws", "scan azure", "cloud scanning", "cspm posture scan", "inspect infrastructure"],
    mediumKeywords: ["asset discovery", "scan credentials", "configuration scanning"],
    contextKeywords: ["aws", "azure", "gcp", "iam", "role", "drift", "audit"]
  },

  synchronization: {
    key: "synchronization",
    label: "Bi-directional File Sync Workflow",
    steps: [
      { stepNumber: 1, actor: "User", description: "User installs desktop or server client for file synchronization." },
      { stepNumber: 2, actor: "System", description: "System establishes WebSockets or polling connection to backend." },
      { stepNumber: 3, actor: "System", description: "System monitors local directories for folder changes in real-time." },
      { stepNumber: 4, actor: "System", description: "System uploads modified files and resolves conflict resolution." }
    ],
    dataFlow: [
      { source: "Local Directory", destination: "TrustDesk Cloud Store", dataType: "Files & Documents", isEncrypted: true }
    ],
    accessFlow: [
      { subject: "Sync Client Agent", resource: "Local Directory Files", accessType: "read" },
      { subject: "Sync Client Agent", resource: "TrustDesk Cloud Store API", accessType: "write" }
    ],
    persistenceBehavior: {
      doesStoreData: true,
      storageType: "Cloud Store (S3)",
      retentionDuration: "Customer-defined"
    },
    procurementRisks: ["data_exfiltration_risk", "retention_concerns"],
    trustImplications: ["Data Loss Prevention (DLP)", "Endpoint Security"],
    evidenceRequirements: ["Encryption In Transit Policy", "Access Control Logs"],
    strongKeywords: ["file sync", "real-time file sync", "bi-directional sync", "sync local folders"],
    mediumKeywords: ["desktop sync client", "keep files in sync", "offline synchronization"],
    contextKeywords: ["desktop client", "folder", "offline", "sync", "upload", "download"]
  },

  ai_analysis: {
    key: "ai_analysis",
    label: "AI Processing & Analysis Workflow",
    steps: [
      { stepNumber: 1, actor: "System", description: "System triggers AI analysis job on newly ingested customer data." },
      { stepNumber: 2, actor: "System", description: "System sanitizes and structures input data into optimized prompts." },
      { stepNumber: 3, actor: "Third-Party Subprocessor", description: "Data is submitted to a third-party LLM endpoint for inference." },
      { stepNumber: 4, actor: "System", description: "System receives LLM output, parsing categorizations and metadata." }
    ],
    dataFlow: [
      { source: "TrustDesk Database", destination: "LLM Subprocessor API", dataType: "Sanitized Customer Prompts", isEncrypted: true },
      { source: "LLM Subprocessor API", destination: "TrustDesk Database", dataType: "AI Extracted Insights", isEncrypted: true }
    ],
    accessFlow: [
      { subject: "TrustDesk Application", resource: "LLM Subprocessor API", accessType: "write" },
      { subject: "TrustDesk Application", resource: "TrustDesk Database", accessType: "write" }
    ],
    aiInteraction: {
      usesLLM: true,
      provider: "OpenAI/Anthropic APIs",
      dataUsagePolicy: "Zero Data Retention / Opt-out of Model Training"
    },
    procurementRisks: ["ai_governance_requirements", "customer_data_usage"],
    trustImplications: ["AI Safety & Governance", "Third Party Vendor Risk"],
    evidenceRequirements: ["Subprocessor DPA Agreements", "AI Data Security Policy"],
    strongKeywords: ["llm inference", "ai analysis", "gpt-4 model processing", "generative ai reasoning", "copilot insights"],
    mediumKeywords: ["ai insights", "smart classification", "automated summarize"],
    contextKeywords: ["openai", "gpt", "claude", "llm", "prompt", "model", "training"]
  },

  export_report: {
    key: "export_report",
    label: "Export and Report Generation Workflow",
    steps: [
      { stepNumber: 1, actor: "User", description: "User requests report generation or triggers data export in console." },
      { stepNumber: 2, actor: "System", description: "System queries the database, aggregating metrics or fetching files." },
      { stepNumber: 3, actor: "System", description: "System compiles data into CSV, XLSX, or PDF formats in memory." },
      { stepNumber: 4, actor: "User", description: "User downloads the generated file via secure signed link." }
    ],
    dataFlow: [
      { source: "TrustDesk Database", destination: "TrustDesk Application Memory", dataType: "Aggregated Customer Data", isEncrypted: true },
      { source: "TrustDesk Application Memory", destination: "User Browser", dataType: "PDF/CSV Generated Exports", isEncrypted: true }
    ],
    accessFlow: [
      { subject: "TrustDesk Application", resource: "TrustDesk Database", accessType: "read" },
      { subject: "User", resource: "TrustDesk Cloud Downloads", accessType: "read" }
    ],
    persistenceBehavior: {
      doesStoreData: false,
      storageType: "Transient Memory / Temporary S3 bucket",
      retentionDuration: "Immediate download; transient file purged in 24 hours"
    },
    procurementRisks: ["support_visibility"],
    trustImplications: ["Data Handling & Privacy"],
    evidenceRequirements: ["Role-Based Access Control Policies", "Export Auditing Logs"],
    strongKeywords: ["bulk export", "export data csv", "generate reports pdf", "download complete history"],
    mediumKeywords: ["download report", "csv export", "scheduled analytics reports"],
    contextKeywords: ["csv", "pdf", "xlsx", "export", "download", "reports"]
  },

  support: {
    key: "support",
    label: "Support Access and Impersonation Workflow",
    steps: [
      { stepNumber: 1, actor: "User", description: "User grants temporary support access or requests support assistance." },
      { stepNumber: 2, actor: "System", description: "System mints a temporary JIT (Just-In-Time) support token." },
      { stepNumber: 3, actor: "System", description: "Vendor support representative authenticates and begins user impersonation." },
      { stepNumber: 4, actor: "System", description: "All actions taken by the support rep are tracked under strict audit logs." }
    ],
    dataFlow: [
      { source: "Vendor Support Portal", destination: "Customer Workspace", dataType: "JIT Impersonation Token", isEncrypted: true }
    ],
    accessFlow: [
      { subject: "Vendor Support Rep", resource: "Customer Workspace Data", accessType: "read" },
      { subject: "TrustDesk IAM Portal", resource: "JIT Token Generator", accessType: "admin" }
    ],
    persistenceBehavior: {
      doesStoreData: true,
      storageType: "Audit Log Store",
      retentionDuration: "Indefinite compliance trail"
    },
    procurementRisks: ["support_visibility"],
    trustImplications: ["Access Control Protocols", "Support & Operations Security"],
    evidenceRequirements: ["Just-In-Time Support Access Policy", "Support Impersonation Log Audits"],
    strongKeywords: ["support impersonation", "grant support access", "just-in-time support", "impersonate user session"],
    mediumKeywords: ["allow support login", "support access controls", "helpdesk portal access"],
    contextKeywords: ["impersonate", "jit", "temporary token", "support", "helpdesk", "logs"]
  },

  identity_auth: {
    key: "identity_auth",
    label: "Identity and SSO Authentication Workflow",
    steps: [
      { stepNumber: 1, actor: "User", description: "User navigates to login and selects Federated Identity / Single Sign-On." },
      { stepNumber: 2, actor: "System", description: "System redirects User to configured Okta or Azure AD Identity Provider." },
      { stepNumber: 3, actor: "User", description: "User authenticates securely with IdP, verifying MFA challenge." },
      { stepNumber: 4, actor: "System", description: "System parses SAML assertion or OIDC token to establish secure session." }
    ],
    dataFlow: [
      { source: "User Browser", destination: "Identity Provider (IdP)", dataType: "User Credentials", isEncrypted: true },
      { source: "Identity Provider (IdP)", destination: "TrustDesk IAM Engine", dataType: "OIDC Token / SAML Assertion", isEncrypted: true }
    ],
    accessFlow: [
      { subject: "TrustDesk IAM Engine", resource: "Identity Provider Metadata", accessType: "read" }
    ],
    persistenceBehavior: {
      doesStoreData: false,
      storageType: "Session Memory Only",
      retentionDuration: "Duration of authenticated user session"
    },
    procurementRisks: [],
    trustImplications: ["Identity & Access Management", "Authentication & MFA"],
    evidenceRequirements: ["SAML / OIDC Integration Guide", "MFA Enforcement Policy"],
    strongKeywords: ["saml single sign-on", "saml sso", "okta integration sso", "azure ad directory sync", "oidc federation"],
    mediumKeywords: ["single sign-on login", "sso authentication", "identity federation"],
    contextKeywords: ["okta", "saml", "oidc", "azure ad", "sso", "mfa", "idp"]
  },

  browser_device: {
    key: "browser_device",
    label: "Browser Extension / Device Integration Workflow",
    steps: [
      { stepNumber: 1, actor: "User", description: "User installs native browser extension or device agent." },
      { stepNumber: 2, actor: "System", description: "Extension registers background script triggers for active tab DOM states." },
      { stepNumber: 3, actor: "System", description: "Extension parses web page text or monitors device files locally." },
      { stepNumber: 4, actor: "System", description: "System dispatches telemetry summaries back to target endpoints." }
    ],
    dataFlow: [
      { source: "User Browser Tab / DOM", destination: "Browser Extension Script", dataType: "Active Page Context", isEncrypted: false },
      { source: "Browser Extension Script", destination: "TrustDesk Cloud Store", dataType: "Tab Telemetry & Page Snippets", isEncrypted: true }
    ],
    accessFlow: [
      { subject: "Browser Extension Script", resource: "Browser Tab DOM", accessType: "read" },
      { subject: "Browser Extension Script", resource: "TrustDesk Cloud Store API", accessType: "write" }
    ],
    persistenceBehavior: {
      doesStoreData: true,
      storageType: "Database",
      retentionDuration: "30 days default"
    },
    procurementRisks: ["data_exfiltration_risk"],
    trustImplications: ["Endpoint Security", "Endpoint Privacy Guardrails"],
    evidenceRequirements: ["Extension Manifest V3 Security Review", "Data Collection Policy"],
    strongKeywords: ["browser extension", "chrome extension", "firefox add-on", "safari plug-in extension"],
    mediumKeywords: ["chrome web store", "install extension", "edge extension"],
    contextKeywords: ["chrome", "extension", "dom", "telemetry", "manifest"]
  },

  webhook_event: {
    key: "webhook_event",
    label: "Webhook Event Delivery Workflow",
    steps: [
      { stepNumber: 1, actor: "System", description: "System detects internal state change event (e.g. action created)." },
      { stepNumber: 2, actor: "System", description: "System generates webhook payload containing event metadata." },
      { stepNumber: 3, actor: "System", description: "System signs payload using configured shared secrets." },
      { stepNumber: 4, actor: "System", description: "System dispatches HTTP POST payload to user-configured URL." }
    ],
    dataFlow: [
      { source: "TrustDesk Database", destination: "Webhook Dispatcher", dataType: "Event Payload", isEncrypted: true },
      { source: "Webhook Dispatcher", destination: "User Configured HTTP Endpoint", dataType: "Signed HTTP Payload", isEncrypted: true }
    ],
    accessFlow: [
      { subject: "Webhook Dispatcher", resource: "User Webhook Endpoint", accessType: "write" }
    ],
    persistenceBehavior: {
      doesStoreData: true,
      storageType: "Log Store (Retry history)",
      retentionDuration: "7 days retry log retention"
    },
    procurementRisks: [],
    trustImplications: ["API Security & Outbound Traffic"],
    evidenceRequirements: ["Webhook Signature Verification Documentation"],
    strongKeywords: ["trigger webhooks", "webhook signature verification", "configure outbound webhooks", "webhook post payload"],
    mediumKeywords: ["send webhooks", "webhook retry rules", "http post callbacks"],
    contextKeywords: ["webhook", "callback", "post", "signature", "payload", "endpoint"]
  },

  infra_scanning: {
    key: "infra_scanning",
    label: "Infrastructure Vulnerability Scanning Workflow",
    steps: [
      { stepNumber: 1, actor: "System", description: "System schedules infrastructure scanning sweep of targets." },
      { stepNumber: 2, actor: "System", description: "System authenticates using local agent or API connector roles." },
      { stepNumber: 3, actor: "System", description: "System runs scans, checking ports, kernel modules, and packages." },
      { stepNumber: 4, actor: "System", description: "System sends vulnerability reports back to the central console." }
    ],
    dataFlow: [
      { source: "Target System Kernel / Host", destination: "Vulnerability Scanner Agent", dataType: "OS Package Lists & Port states", isEncrypted: false },
      { source: "Vulnerability Scanner Agent", destination: "TrustDesk DB", dataType: "Vulnerability Reports", isEncrypted: true }
    ],
    accessFlow: [
      { subject: "Scanner Agent", resource: "Host System Metrics", accessType: "read" },
      { subject: "Scanner Agent", resource: "TrustDesk DB API", accessType: "write" }
    ],
    persistenceBehavior: {
      doesStoreData: true,
      storageType: "Database",
      retentionDuration: "90 days audit history"
    },
    procurementRisks: ["infrastructure_reach", "tenant_isolation_risk"],
    trustImplications: ["Vulnerability Management", "Host & Port Security"],
    evidenceRequirements: ["Least Privilege Scan Agent Documentation"],
    strongKeywords: ["scan ports", "osquery server scanning", "vulnerability host scanner", "infrastructure scan sweep"],
    mediumKeywords: ["vulnerability scanning agent", "run scans on target servers"],
    contextKeywords: ["scanner", "port", "vulnerability", "host", "packages", "agent"]
  }
};
