import { CapabilityKey } from "./capability-taxonomy";

export type DetectionPattern = {
  key: CapabilityKey;
  // Terms that strongly imply this capability when found in high-value contexts (e.g. docs, integration, pricing)
  strongKeywords: string[];
  // Terms that moderately imply this capability (e.g. homepage mentions, standard feature pages)
  mediumKeywords: string[];
  // Weak terms or general terms that require additional validation or lower the confidence
  weakKeywords: string[];
  // Supporting context keywords that must appear near the primary keywords to boost signal
  contextKeywords: string[];
};

export const CAPABILITY_DETECTION_PATTERNS: Record<CapabilityKey, DetectionPattern> = {
  cloud_scanning: {
    key: "cloud_scanning",
    strongKeywords: [
      "scan aws", "scan azure", "scan gcp", "scanning aws", "scanning azure", "scanning gcp",
      "scan cloud infrastructure", "cloud security posture management", "cspm",
      "cloud compliance scanning", "scan kubernetes", "vulnerability scanning for cloud"
    ],
    mediumKeywords: [
      "scan subscriptions", "scan environments", "infrastructure scanning",
      "multi-cloud scanning", "discover cloud assets"
    ],
    weakKeywords: [
      "cloud discovery", "cloud read", "cloud assets"
    ],
    contextKeywords: [
      "arn", "subscription", "iam", "credential", "role", "kubernetes", "eks", "aks", "gke"
    ]
  },
  data_classification: {
    key: "data_classification",
    strongKeywords: [
      "classify sensitive data", "data classification engine", "automatically classify",
      "classification labels", "pii classification", "phi classification", "pci classification",
      "dlp classification", "document classification"
    ],
    mediumKeywords: [
      "classify data", "auto-classification", "label sensitive information",
      "identify sensitive data", "categorize data"
    ],
    weakKeywords: [
      "tagging", "labels", "categories"
    ],
    contextKeywords: [
      "pii", "phi", "gdpr", "ccpa", "hipaa", "sensitivity", "confidential"
    ]
  },
  workflow_automation: {
    key: "workflow_automation",
    strongKeywords: [
      "automate workflows", "workflow automation", "no-code automation", "workflow builder",
      "orchestrate workflows", "automated playbook", "trigger actions", "process automation"
    ],
    mediumKeywords: [
      "automation rules", "custom triggers", "action workflows", "automate tasks",
      "business logic automation", "conditional routing"
    ],
    weakKeywords: [
      "auto-assign", "rules", "triggers"
    ],
    contextKeywords: [
      "condition", "trigger", "action", "playbook", "sequence", "integration"
    ]
  },
  email_ingestion: {
    key: "email_ingestion",
    strongKeywords: [
      "email ingestion", "ingest emails", "email integration", "inbound email processing",
      "parse incoming emails", "forward to email", "email-to-ticket", "email-to-lead"
    ],
    mediumKeywords: [
      "inbound email", "read support inbox", "email monitoring", "receive emails",
      "parse attachments"
    ],
    weakKeywords: [
      "email forwarding", "send email"
    ],
    contextKeywords: [
      "smtp", "imap", "mailbox", "inbox", "attachment", "parser"
    ]
  },
  file_sync: {
    key: "file_sync",
    strongKeywords: [
      "file sync", "file synchronization", "sync local folders", "sync desktop",
      "real-time file sync", "bi-directional sync", "cloud drive sync"
    ],
    mediumKeywords: [
      "synchronize files", "desktop client sync", "sync documents", "offline sync",
      "keep files in sync"
    ],
    weakKeywords: [
      "upload file", "download file"
    ],
    contextKeywords: [
      "conflict", "version history", "folder", "offline", "desktop app"
    ]
  },
  browser_extension: {
    key: "browser_extension",
    strongKeywords: [
      "browser extension", "chrome extension", "firefox add-on", "safari extension",
      "chrome web store", "edge extension", "install extension"
    ],
    mediumKeywords: [
      "browser addon", "extension for chrome", "browser plug-in"
    ],
    weakKeywords: [
      "plugin", "add-on"
    ],
    contextKeywords: [
      "chrome", "firefox", "safari", "extension", "browser bar"
    ]
  },
  endpoint_agent: {
    key: "endpoint_agent",
    strongKeywords: [
      "endpoint agent", "install agent", "agent installation", "lightweight agent",
      "osquery agent", "monitoring agent", "sentinelone agent", "daemon process"
    ],
    mediumKeywords: [
      "desktop agent", "server agent", "run on endpoints", "agent deployment",
      "installed collector"
    ],
    weakKeywords: [
      "endpoint", "agent", "collector"
    ],
    contextKeywords: [
      "windows", "macos", "linux", "kernel", "daemon", "service", "installation"
    ]
  },
  ai_inference: {
    key: "ai_inference",
    strongKeywords: [
      "llm inference", "ai reasoning", "generative ai insights", "openai integration",
      "gpt-4 analysis", "copilot assistant", "ai autocomplete", "semantic search query"
    ],
    mediumKeywords: [
      "ai insights", "smart suggestions", "automated summaries", "ai-powered search",
      "predictive text"
    ],
    weakKeywords: [
      "ai model", "machine learning model", "smart analysis"
    ],
    contextKeywords: [
      "openai", "gpt", "anthropic", "claude", "llm", "prompt", "model"
    ]
  },
  ai_training: {
    key: "ai_training",
    strongKeywords: [
      "train ai model", "train on your data", "fine-tune model", "fine-tuning llm",
      "model training", "custom model training", "rlhf", "weights adjustment"
    ],
    mediumKeywords: [
      "train custom models", "learn from your data", "retrain models"
    ],
    weakKeywords: [
      "training", "learning"
    ],
    contextKeywords: [
      "dataset", "epoch", "fine-tune", "weights", "proprietary data"
    ]
  },
  tenant_management: {
    key: "tenant_management",
    strongKeywords: [
      "multi-tenant", "tenant isolation", "tenant provisioning", "cross-tenant",
      "tenant management dashboard", "tenant dashboard", "tenant onboarding"
    ],
    mediumKeywords: [
      "multiple tenants", "manage customers", "reseller console", "sub-accounts"
    ],
    weakKeywords: [
      "tenant", "isolation"
    ],
    contextKeywords: [
      "isolation", "billing", "subdomain", "organization", "workspace"
    ]
  },
  webhook_delivery: {
    key: "webhook_delivery",
    strongKeywords: [
      "webhook delivery", "trigger webhooks", "webhook signature", "outgoing webhooks",
      "configure webhooks", "webhook events", "webhook payload"
    ],
    mediumKeywords: [
      "send webhooks", "webhook integration", "http post callbacks"
    ],
    weakKeywords: [
      "webhook", "callback"
    ],
    contextKeywords: [
      "endpoint", "signature", "payload", "retry", "http"
    ]
  },
  identity_federation: {
    key: "identity_federation",
    strongKeywords: [
      "identity federation", "saml single sign-on", "saml sso", "oidc sso",
      "active directory integration", "okta integration", "azure ad sso", "federated identities"
    ],
    mediumKeywords: [
      "single sign-on", "sso integration", "oauth login", "identity provider", "idp integration"
    ],
    weakKeywords: [
      "login", "sign-on"
    ],
    contextKeywords: [
      "okta", "saml", "oidc", "azure ad", "entra", "ping", "idp"
    ]
  },
  api_gateway: {
    key: "api_gateway",
    strongKeywords: [
      "api gateway", "api rate limiting", "api management", "api key management",
      "reverse proxy for apis", "gateway routing", "api throttling"
    ],
    mediumKeywords: [
      "api portal", "rate limit apis", "secure apis", "api gateway routing"
    ],
    weakKeywords: [
      "api keys", "api access"
    ],
    contextKeywords: [
      "rate limit", "throttle", "proxy", "cors", "routes", "headers"
    ]
  },
  communication_ingestion: {
    key: "communication_ingestion",
    strongKeywords: [
      "slack integration", "teams integration", "slack ingestion", "teams ingestion",
      "chat monitoring", "slack bot history", "ingest messaging logs"
    ],
    mediumKeywords: [
      "read chat channels", "slack message sync", "teams message monitoring"
    ],
    weakKeywords: [
      "slack", "teams"
    ],
    contextKeywords: [
      "channel", "workspace", "bot", "message", "chat"
    ]
  },
  document_generation: {
    key: "document_generation",
    strongKeywords: [
      "generate pdf", "generate document", "document generation engine", "docx generation",
      "automated document creation", "pdf rendering", "generate invoices"
    ],
    mediumKeywords: [
      "create pdfs", "document templates", "invoice generation", "render reports"
    ],
    weakKeywords: [
      "export", "download"
    ],
    contextKeywords: [
      "pdf", "docx", "template", "invoice", "receipt", "font"
    ]
  },
  audit_logging: {
    key: "audit_logging",
    strongKeywords: [
      "detailed audit logs", "compliance audit trail", "siem logging", "immutable logs",
      "export audit logs", "system event tracking"
    ],
    mediumKeywords: [
      "audit trail", "activity log", "track changes", "logging events"
    ],
    weakKeywords: [
      "logs", "history"
    ],
    contextKeywords: [
      "siem", "splunk", "datadog", "security", "tamper", "compliance"
    ]
  },
  cloud_connector: {
    key: "cloud_connector",
    strongKeywords: [
      "aws connector", "azure connector", "gcp connector", "cloud provider integration",
      "multi-cloud connector", "cloud sync agent"
    ],
    mediumKeywords: [
      "connect to aws", "connect to azure", "cloud integration dashboard"
    ],
    weakKeywords: [
      "connect", "integration"
    ],
    contextKeywords: [
      "iam role", "credentials", "cloud account", "tenant id"
    ]
  },
  OCR_processing: {
    key: "OCR_processing",
    strongKeywords: [
      "optical character recognition", "ocr processing", "extract text from image",
      "ocr engine", "pdf ocr", "image text extraction"
    ],
    mediumKeywords: [
      "read scanned documents", "scanned pdf search", "image parsing"
    ],
    weakKeywords: [
      "scanned documents", "image file text"
    ],
    contextKeywords: [
      "ocr", "tesseract", "vision api", "png", "jpeg", "pdf"
    ]
  },
  infrastructure_monitoring: {
    key: "infrastructure_monitoring",
    strongKeywords: [
      "infrastructure monitoring", "server monitoring", "database telemetry",
      "prometheus integration", "grafana dashboard", "apm agent", "system metrics"
    ],
    mediumKeywords: [
      "monitor servers", "track resource usage", "database monitoring"
    ],
    weakKeywords: [
      "monitor", "metrics"
    ],
    contextKeywords: [
      "cpu", "memory", "telemetry", "prometheus", "grafana", "host"
    ]
  },
  export_generation: {
    key: "export_generation",
    strongKeywords: [
      "bulk export", "export data csv", "json data export", "backup export",
      "download entire history", "data portability export"
    ],
    mediumKeywords: [
      "export to csv", "data export", "download reports"
    ],
    weakKeywords: [
      "export", "download"
    ],
    contextKeywords: [
      "csv", "xlsx", "json", "backup", "portability"
    ]
  },
  report_generation: {
    key: "report_generation",
    strongKeywords: [
      "generate compliance report", "executive report builder", "bi reporting",
      "custom analytics report", "report scheduling"
    ],
    mediumKeywords: [
      "analytics report", "summary report", "performance charts"
    ],
    weakKeywords: [
      "report", "charts"
    ],
    contextKeywords: [
      "pdf", "chart", "metrics", "schedule", "dashboard"
    ]
  },
  support_access: {
    key: "support_access",
    strongKeywords: [
      "support access control", "grant support visibility", "support impersonation",
      "just-in-time support access", "unsupervised support blocking", "customer support mode"
    ],
    mediumKeywords: [
      "support access", "allow support login", "impersonate user"
    ],
    weakKeywords: [
      "support portal access", "helpdesk JIT"
    ],
    contextKeywords: [
      "impersonate", "jit", "temporary", "log", "permission"
    ]
  },
  admin_console: {
    key: "admin_console",
    strongKeywords: [
      "administrative console", "centralized admin portal", "admin dashboard",
      "super admin dashboard", "organization settings panel"
    ],
    mediumKeywords: [
      "admin settings", "admin page", "management console"
    ],
    weakKeywords: [
      "settings", "console"
    ],
    contextKeywords: [
      "admin", "settings", "global", "provisioning", "permissions"
    ]
  },
  sensitive_data_discovery: {
    key: "sensitive_data_discovery",
    strongKeywords: [
      "sensitive data discovery", "discover pii", "discover sensitive data",
      "scan for secrets", "sensitive data scanning", "data discovery engine",
      "pii discovery scanning"
    ],
    mediumKeywords: [
      "find sensitive files", "secret detection", "sensitive data scanner"
    ],
    weakKeywords: [
      "scanner", "discovery"
    ],
    contextKeywords: [
      "pii", "secrets", "api key", "password", "ssn", "credit card", "credit-card"
    ]
  },
  encryption_management: {
    key: "encryption_management",
    strongKeywords: [
      "kms integration", "bring your own key", "byok", "customer-managed keys",
      "cmk encryption", "hsm protection", "database encryption key management"
    ],
    mediumKeywords: [
      "encryption keys", "manage keys", "key rotation", "envelope encryption"
    ],
    weakKeywords: [
      "envelope encryption", "rotate keys"
    ],
    contextKeywords: [
      "kms", "byok", "vault", "rotation", "hsm", "aes-256"
    ]
  }
};
