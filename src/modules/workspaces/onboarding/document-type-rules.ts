import { DOCUMENT_LIBRARY } from "./document-library-data";

export type DocumentTypeRule = {
  id: string;
  name: string;
  requiredSections: string[];
  emphasis: string;
  bannedBoilerplate: string[];
};

const BASE_BANNED = [
  "committed to protecting the privacy",
  "we are committed to security",
  "annual risk assessment",
  "annual security training",
  "confidentiality, integrity, and availability",
  "industry best practices",
];

const RULES: Record<string, DocumentTypeRule> = {
  infosec_policy: {
    id: "infosec_policy",
    name: DOCUMENT_LIBRARY.infosec_policy?.name ?? "Information Security Policy",
    requiredSections: [
      "Governance",
      "Control framework",
      "Risk ownership",
      "Platform security",
      "Operational security expectations",
    ],
    emphasis:
      "This is an INFORMATION SECURITY POLICY. Anchor every section to the product architecture, named roles, and platform-specific controls from the brief. Do not substitute a generic CIA triad essay or SOC2 buzzword salad.",
    bannedBoilerplate: [...BASE_BANNED, "cia triad", "employees, contractors, and third-party vendors"],
  },
  privacy_policy: {
    id: "privacy_policy",
    name: DOCUMENT_LIBRARY.privacy_policy?.name ?? "Privacy / Data Handling Policy",
    requiredSections: [
      "Personal data lifecycle",
      "Collection and use",
      "Retention and deletion",
      "Subprocessors",
      "Transfer and residency",
      "Subject rights",
    ],
    emphasis:
      "This is a PRIVACY / DATA HANDLING POLICY. Every substantive paragraph must tie to concrete data types, purposes, subprocessors, retention, residency, or data-subject rights from the brief or cited evidence. Do not mirror an information-security policy.",
    bannedBoilerplate: [...BASE_BANNED, "reasonable measures to protect"],
  },
  access_control: {
    id: "access_control",
    name: DOCUMENT_LIBRARY.access_control?.name ?? "Access Control Policy",
    requiredSections: [
      "Role separation",
      "Approval workflow",
      "Privileged access",
      "Offboarding",
      "Access reviews",
    ],
    emphasis:
      "Focus on who may grant access, how privileged access is approved, periodic reviews, and offboarding — grounded in the brief’s roles and workflows.",
    bannedBoilerplate: BASE_BANNED,
  },
  bc_dr_plan: {
    id: "bc_dr_plan",
    name: DOCUMENT_LIBRARY.bc_dr_plan?.name ?? "Business Continuity / DR",
    requiredSections: [
      "Availability strategy",
      "RTO and RPO",
      "Backup and restore",
      "Outage response",
    ],
    emphasis:
      "Emphasize availability objectives, recovery targets, backup/restore expectations, and incident escalation — tied to the product/deployment model in the brief.",
    bannedBoilerplate: BASE_BANNED,
  },
  software_dev_lifecycle: {
    id: "software_dev_lifecycle",
    name: DOCUMENT_LIBRARY.software_dev_lifecycle?.name ?? "Secure SDLC Policy",
    requiredSections: [
      "Code review",
      "Testing",
      "Release controls",
      "Dependency and security scanning",
    ],
    emphasis:
      "Cover engineering controls: reviews, testing gates, release management, dependency/supply-chain scanning — aligned to how this organization ships software per the brief.",
    bannedBoilerplate: BASE_BANNED,
  },
};

export function getDocumentTypeRule(docId: string): DocumentTypeRule | undefined {
  return RULES[docId];
}

export function allTailoredDocumentIds(): string[] {
  return Object.keys(RULES);
}
