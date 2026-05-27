import { CanonicalTaskDefinition } from "./governance-task-types";

export const GOVERNANCE_TASK_TAXONOMY: Record<string, CanonicalTaskDefinition> = {
  ai_training_confirmation: {
    key: "ai_training_confirmation",
    title: "Confirm whether customer data is used to train AI models",
    description: "Verify if customer-provided data inputs are utilized for artificial intelligence model training, fine-tune, or persistent model optimization.",
    priority: "CRITICAL",
    suggestedAction: "Confirm whether customer data is processed using zero-retention API endpoints and is excluded from training.",
    classification: "blocker",
    whyItMatters: "Enterprise security and legal reviewers strictly reject vendor data training on shared generative LLMs.",
    whatItUnlocks: "Unlocks the AI Safety and Compliance review pillar, satisfying third-party model governance criteria."
  },
  support_access_confirmation: {
    key: "support_access_confirmation",
    title: "Audit support personnel database access controls",
    description: "Confirm access management standards outlining employee credential security, single sign-on (SSO), and Just-in-Time (JIT) support staff approval tools.",
    priority: "HIGH",
    suggestedAction: "Confirm if employee impersonation relies on Just-in-Time (JIT) temporary approval tokens and requires active customer approval.",
    classification: "blocker",
    whyItMatters: "Auditors enforce strict zero-access and session approval policies for vendor support staff handling live tenant databases.",
    whatItUnlocks: "Support access auditing, single sign-on (SSO) and multi-factor authentication (MFA) validation."
  },
  tenant_isolation_confirmation: {
    key: "tenant_isolation_confirmation",
    title: "Verify logical tenant isolation controls in shared environments",
    description: "Confirm that multi-tenant database partitions, container network policies, and virtual network barriers prevent inter-tenant data leakage.",
    priority: "CRITICAL",
    suggestedAction: "Confirm logical tenant isolation controls, such as database schemas or namespaces, and network isolation policies.",
    classification: "blocker",
    whyItMatters: "Enterprise security auditors require documented architectural proof of logical tenant boundaries before approving multi-tenant SaaS software.",
    whatItUnlocks: "Infrastructure trust clearance, tenant breakout liability risk mitigation."
  },
  connector_permission_confirmation: {
    key: "connector_permission_confirmation",
    title: "Verify Cloud Connector Read-Only Permission Bounds",
    description: "Confirm if cloud integration credentials or scanning roles are strictly limited to read-only API scopes without administrative write controls.",
    priority: "HIGH",
    suggestedAction: "Confirm whether integration credentials have administrative write access or command execution authorities.",
    classification: "blocker",
    whyItMatters: "Broad cloud IAM roles present an immense write/command execution blast radius if the vendor is compromised.",
    whatItUnlocks: "Unlocks cloud infrastructure boundary verification, satisfying least-privilege security reviews."
  },
  data_retention_confirmation: {
    key: "data_retention_confirmation",
    title: "Formulate end-of-contract customer data deletion protocols",
    description: "Confirm data retention standards, secure purging protocols, and contract termination data deletion timelines.",
    priority: "HIGH",
    suggestedAction: "Confirm geographical storage locations and data retention/deletion schedules.",
    classification: "blocker",
    whyItMatters: "Enterprise customers demand rigorous legal guarantees that their data will be permanently wiped within standard windows (e.g. 30 days) post-termination.",
    whatItUnlocks: "Data disposal compliance, GDPR/CCPA post-contract deletion alignment."
  },
  privileged_access_confirmation: {
    key: "privileged_access_confirmation",
    title: "Confirm privileged and administrative access policies",
    description: "Verify operational control frameworks restricting backend server console or internal production network direct access.",
    priority: "HIGH",
    suggestedAction: "Confirm controls limiting direct server or database administrator (DBA) access to production.",
    classification: "blocker",
    whyItMatters: "Lack of administrative perimeter controls exposes client databases to external breach or rogue operator manipulation.",
    whatItUnlocks: "Production security clearance, operational infrastructure authorization."
  },
  subprocessor_confirmation: {
    key: "subprocessor_confirmation",
    title: "Clarify subprocessor transparency and downstream data sharing",
    description: "Verify subprocessor controls and ensure downstream vendors maintain equivalent security and privacy standards.",
    priority: "MEDIUM",
    suggestedAction: "Confirm if the business maintains a transparent subprocessor list and flow-down legal DPAs.",
    classification: "enhancement",
    whyItMatters: "Supply chain exposure is a primary risk vector; downstream compromises directly impact host data security.",
    whatItUnlocks: "Third-party risk management alignment, downstream security assurance."
  }
};
