/**
 * Sub-control taxonomy for broad knowledge topics.
 *
 * Historically each KnowledgeTopic resolved to ONE AnswerLibraryItem, which
 * meant the matcher reused a single generic answer for every question inside
 * that control family. For example, a question about access-review cadence
 * and a question about offboarding deprovisioning would both receive the
 * same "Access Control" policy paragraph.
 *
 * The taxonomy below splits broad topics into concrete sub-controls so the
 * seeding service can create one approved answer per sub-control, the manual
 * authoring API can validate a sub-control key, and the matcher can rank
 * sub-control candidates by question cosine and either use a clear winner
 * verbatim or synthesise a question-specific response from the top-K.
 *
 * Topics NOT listed here keep the legacy single-answer behaviour. Adding new
 * topics or sub-controls is a one-file change: the matcher and seeder pick
 * them up automatically.
 */

export interface SubControl {
  /** Canonical id stored in AnswerLibraryItem.subControlKey. */
  key: string;
  /** Human label used in UI, diagnostics, and embedding augmentation. */
  label: string;
  /** Free-form keywords baked into the embedding input and stored in
   *  AnswerLibraryItem.subControlLabels for retrieval boosting. */
  keywords: string[];
  /** Short sentence passed to the evidence similarity search during seeding
   *  to find the chunks most relevant to this sub-control. */
  seedPrompt: string;
}

export const SUBCONTROLS_BY_TOPIC_KEY: Record<string, SubControl[]> = {
  access_control: [
    {
      key: "rbac",
      label: "RBAC and Least Privilege",
      keywords: ["role-based", "least privilege", "permissions"],
      seedPrompt: "role-based access control and least privilege enforcement",
    },
    {
      key: "access_request",
      label: "Access Request Process",
      keywords: ["request", "ticket", "approval"],
      seedPrompt: "how users request access to systems and data",
    },
    {
      key: "access_approval",
      label: "Access Approval Workflow",
      keywords: ["approval", "manager", "segregation of duties"],
      seedPrompt: "who approves access requests and what approvals are logged",
    },
    {
      key: "access_review",
      label: "Periodic Access Reviews",
      keywords: ["review", "recertification", "quarterly"],
      seedPrompt: "how user access is periodically reviewed and recertified",
    },
    {
      key: "offboarding",
      label: "Offboarding / Deprovisioning",
      keywords: ["offboarding", "deprovision", "termination"],
      seedPrompt: "how access is revoked when employees or contractors leave",
    },
    {
      key: "privileged_access",
      label: "Privileged / Admin Access",
      keywords: ["privileged", "admin", "root", "just-in-time"],
      seedPrompt: "controls over privileged and administrator access",
    },
    {
      key: "admin_mfa",
      label: "MFA for Admin Access",
      keywords: ["mfa", "multi-factor", "admin"],
      seedPrompt: "MFA requirement for administrative and privileged accounts",
    },
  ],
  incident_response: [
    {
      key: "triage",
      label: "Incident Triage",
      keywords: ["triage", "severity"],
      seedPrompt: "how security incidents are triaged and prioritised",
    },
    {
      key: "containment",
      label: "Containment",
      keywords: ["containment", "isolate"],
      seedPrompt: "how incidents are contained to limit blast radius",
    },
    {
      key: "communication",
      label: "Incident Communication",
      keywords: ["notify", "customer", "communication"],
      seedPrompt: "how customers and stakeholders are notified of incidents",
    },
    {
      key: "post_mortem",
      label: "Post-Incident Review",
      keywords: ["post-mortem", "lessons learned"],
      seedPrompt: "post-incident reviews and lessons learned",
    },
  ],
  retention: [
    {
      key: "retention_policy",
      label: "Retention Periods",
      keywords: ["retention period"],
      seedPrompt: "how long customer data is retained",
    },
    {
      key: "deletion_process",
      label: "Deletion Process",
      keywords: ["deletion", "erasure"],
      seedPrompt:
        "how customer data is deleted on request or at end of retention",
    },
  ],
  logging: [
    {
      key: "admin_audit_log",
      label: "Admin Action Auditing",
      keywords: ["admin", "audit log"],
      seedPrompt: "how administrative actions are logged and retained",
    },
    {
      key: "alert_monitoring",
      label: "Alert Monitoring",
      keywords: ["alert", "siem"],
      seedPrompt: "how security alerts are monitored and escalated",
    },
  ],
  subprocessors: [
    {
      key: "subprocessor_list",
      label: "Subprocessor List",
      keywords: ["subprocessor", "vendor"],
      seedPrompt:
        "the list of subprocessors used to process customer data",
    },
    {
      key: "subprocessor_review",
      label: "Subprocessor Reviews",
      keywords: ["review", "audit"],
      seedPrompt:
        "how subprocessors are reviewed for security and compliance",
    },
  ],
  encryption_at_rest: [
    {
      key: "algorithms",
      label: "Encryption Algorithms and Keys",
      keywords: ["aes-256", "kms", "key management", "hsm"],
      seedPrompt:
        "algorithms and key management used for data-at-rest encryption",
    },
    {
      key: "scope",
      label: "Scope of Data-at-Rest Encryption",
      keywords: ["customer data", "backups", "databases", "object storage"],
      seedPrompt:
        "what categories of data are encrypted at rest and where it is stored",
    },
  ],
  encryption_in_transit: [
    {
      key: "tls_policy",
      label: "TLS Policy",
      keywords: ["tls 1.2", "tls 1.3", "cipher suite", "minimum version"],
      seedPrompt:
        "TLS versions, cipher suites, and protocol enforcement for client connections",
    },
    {
      key: "inter_service",
      label: "Inter-Service Encryption",
      keywords: ["mtls", "service mesh", "internal traffic"],
      seedPrompt:
        "encryption between internal services and administrative interfaces",
    },
  ],
  business_continuity: [
    {
      key: "rto_rpo",
      label: "RTO / RPO Targets",
      keywords: ["rto", "rpo", "recovery time", "recovery point"],
      seedPrompt:
        "documented recovery time and recovery point objectives",
    },
    {
      key: "backup_frequency",
      label: "Backup Frequency and Scope",
      keywords: ["backup", "snapshot", "frequency", "retention"],
      seedPrompt:
        "how often customer data is backed up and what data is included",
    },
    {
      key: "dr_testing",
      label: "DR Testing Cadence",
      keywords: ["disaster recovery testing", "tabletop", "failover drill"],
      seedPrompt:
        "how and how often disaster recovery is tested",
    },
  ],
  vulnerability_management: [
    {
      key: "scanning",
      label: "Vulnerability Scanning",
      keywords: ["sast", "dast", "sca", "scan"],
      seedPrompt:
        "how infrastructure and application vulnerabilities are scanned",
    },
    {
      key: "remediation_sla",
      label: "Remediation SLA",
      keywords: ["sla", "critical", "high", "patch"],
      seedPrompt:
        "severity-based remediation service-level agreements for discovered vulnerabilities",
    },
    {
      key: "pentest",
      label: "Penetration Testing",
      keywords: ["pentest", "third party", "annual"],
      seedPrompt:
        "cadence, scope, and remediation of penetration testing",
    },
    {
      key: "secure_sdlc",
      label: "Secure SDLC",
      keywords: ["sdlc", "code review", "security testing", "threat modeling"],
      seedPrompt:
        "secure software development lifecycle practices and security gates",
    },
  ],
  mfa: [
    {
      key: "admin_mfa",
      label: "MFA for Administrators",
      keywords: ["admin mfa", "privileged access", "phishing resistant"],
      seedPrompt:
        "multi-factor authentication requirements for administrator accounts",
    },
    {
      key: "user_mfa",
      label: "MFA for End Users",
      keywords: ["user mfa", "optional", "required"],
      seedPrompt:
        "multi-factor authentication for standard end users",
    },
    {
      key: "mfa_methods",
      label: "Supported MFA Methods",
      keywords: ["totp", "webauthn", "sms", "authenticator app"],
      seedPrompt:
        "supported MFA methods and their relative strength",
    },
  ],
  sso: [
    {
      key: "saml_oidc",
      label: "SSO Protocols",
      keywords: ["saml", "oidc", "sso"],
      seedPrompt:
        "supported enterprise SSO protocols",
    },
    {
      key: "scim_provisioning",
      label: "SCIM Provisioning",
      keywords: ["scim", "jit provisioning", "deprovisioning"],
      seedPrompt:
        "how users are provisioned and deprovisioned via SCIM or JIT",
    },
  ],
  data_classification: [
    {
      key: "label_taxonomy",
      label: "Classification Taxonomy",
      keywords: ["public", "internal", "confidential", "restricted"],
      seedPrompt:
        "data classification levels and what each covers",
    },
    {
      key: "handling_rules",
      label: "Handling Rules per Class",
      keywords: ["handling", "storage", "sharing", "retention"],
      seedPrompt:
        "storage, sharing, and handling rules per classification level",
    },
  ],
  tenant_isolation: [
    {
      key: "logical_isolation",
      label: "Logical Isolation",
      keywords: ["tenant id", "row level security", "per-workspace"],
      seedPrompt:
        "logical isolation of customer tenants at the data layer",
    },
    {
      key: "network_isolation",
      label: "Network Isolation",
      keywords: ["vpc", "subnet", "network policy"],
      seedPrompt:
        "network-level isolation between tenants",
    },
    {
      key: "evidence_export",
      label: "Exported Evidence Isolation",
      keywords: ["export", "bucket", "tenant-scoped"],
      seedPrompt:
        "how exported customer evidence stays tenant-scoped",
    },
  ],
  purview_integration: [
    {
      key: "label_sync",
      label: "Label Synchronisation",
      keywords: ["purview", "label sync", "sensitivity"],
      seedPrompt:
        "how Microsoft Purview labels map into the product",
    },
    {
      key: "policy_enforcement",
      label: "Label-Based Policy Enforcement",
      keywords: ["policy", "dlp", "enforcement"],
      seedPrompt:
        "how label-based policies are enforced end-to-end",
    },
  ],
};

export function getSubControls(topicKey: string | null | undefined): SubControl[] {
  if (!topicKey) return [];
  return SUBCONTROLS_BY_TOPIC_KEY[topicKey] ?? [];
}

export function getSubControl(
  topicKey: string | null | undefined,
  subControlKey: string | null | undefined,
): SubControl | null {
  if (!topicKey || !subControlKey) return null;
  const list = SUBCONTROLS_BY_TOPIC_KEY[topicKey];
  if (!list) return null;
  return list.find((s) => s.key === subControlKey) ?? null;
}

/** Phrase fed into EmbeddingService when computing the embedding for a
 *  sub-control answer row. Folding the topic name, sub-control label, and
 *  keyword list into the embedding input gives the matcher enough signal to
 *  tell an access-review answer apart from an offboarding answer. */
export function subControlEmbeddingExtras(
  topicName: string | null | undefined,
  sub: Pick<SubControl, "label" | "keywords"> | null,
): { subControlLabel: string | null; subControlKeywords: string[] } {
  if (!sub) return { subControlLabel: null, subControlKeywords: [] };
  const prefix = [topicName?.trim(), sub.label].filter(Boolean).join(" / ");
  return {
    subControlLabel: prefix || sub.label,
    subControlKeywords: sub.keywords ?? [],
  };
}
