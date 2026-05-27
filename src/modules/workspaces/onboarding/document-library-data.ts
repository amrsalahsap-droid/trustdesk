
export type DocumentLibraryEntry = {
  id: string;
  name: string;
  description: string;
  whyItMatters: string;
  helpsSeed: string;
  checklist: string[];
  sampleText: string;
};

export const DOCUMENT_LIBRARY: Record<string, DocumentLibraryEntry> = {
  infosec_policy: {
    id: "infosec_policy",
    name: "Information Security Policy",
    description: "The primary charter defining your organization's security commitment.",
    whyItMatters: "This is the foundational document for almost every security framework (SOC2, ISO27001). It proves to customers that security is a formal business priority.",
    helpsSeed: "Governance, Risk Management, Security Awareness, and Organizational Security Topics.",
    checklist: [
      "Clearly defined roles and responsibilities",
      "Policy review and approval lifecycle",
      "Risk management framework reference",
      "Asset management principles"
    ],
    sampleText: `# Information Security Policy

## 1. Objective
To protect the confidentiality, integrity, and availability of our data and systems.

## 2. Scope
This policy applies to all employees, contractors, and third-party vendors with access to our environment.

## 3. Governance
The Security Team is responsible for the maintenance and enforcement of this policy.

## 4. Risk Management
We perform annual risk assessments to identify and mitigate threats to our platform.

## 5. Security Awareness
All personnel must undergo security training upon hire and annually thereafter.`
  },
  privacy_policy: {
    id: "privacy_policy",
    name: "Privacy / Data Handling Policy",
    description: "Rules for collecting, processing, and protecting customer PII.",
    whyItMatters: "Essential for GDPR, CCPA, and building user trust. It defines the legal and ethical boundaries of how you handle sensitive data.",
    helpsSeed: "Data Privacy, Data Retention, Subject Access Requests, and PII Protection.",
    checklist: [
      "Data classification categories (PII, Sensitive, etc.)",
      "Clear data retention and disposal timelines",
      "Procedures for Subject Access Requests (SARs)",
      "Encryption standards for data at rest and in transit"
    ],
    sampleText: `# Privacy & Data Handling Policy

## 1. Introduction
We are committed to protecting the privacy of our customers and users.

## 2. Data Collection
We only collect metadata required for service delivery. No PII is collected without explicit consent.

## 3. Data Protection
All sensitive data is encrypted using AES-256 at rest and TLS 1.3 in transit.

## 4. Data Retention
Customer data is retained for the duration of the contract and deleted within 30 days of termination.

## 5. User Rights
Users may request a copy of their data or its deletion by contacting our privacy officer.`
  },
  bc_dr_plan: {
    id: "bc_dr_plan",
    name: "Business Continuity & DR Plan",
    description: "Strategies for maintaining service availability during outages.",
    whyItMatters: "Critical for enterprise customers who need to know your service will be available when they need it most.",
    helpsSeed: "Service Reliability, Backups, Disaster Recovery, and Incident Response.",
    checklist: [
      "Recovery Time Objectives (RTO) and Recovery Point Objectives (RPO)",
      "Emergency contact lists and communication plan",
      "Backup verification and testing schedule",
      "Alternate operations location/infrastructure"
    ],
    sampleText: `# Business Continuity & DR Plan

## 1. Purpose
Ensuring operational resilience during significant disruptions.

## 2. RTO / RPO Targets
- Recovery Time Objective (RTO): 4 Hours
- Recovery Point Objective (RPO): 1 Hour

## 3. Backup Strategy
Hourly snapshots are taken and stored across multiple geographic regions.

## 4. Recovery Procedures
In the event of a region-wide outage, infrastructure will be automatically redeployed via Terraform scripts.

## 5. Testing
We perform a simulated DR failover drill twice per year.`
  },
  access_control: {
    id: "access_control",
    name: "Access Control Policy",
    description: "Least-privilege principles and user lifecycle management.",
    whyItMatters: "Access control is often the single most important control in a security audit. It prevents unauthorized access and minimizes internal threats.",
    helpsSeed: "Identity Management, MFA, Onboarding/Offboarding, and Quarterly Access Reviews.",
    checklist: [
      "Multi-Factor Authentication (MFA) requirements",
      "Password complexity and rotation standards",
      "Formal Joiner/Mover/Leaver (JML) processes",
      "Quarterly user access review requirement"
    ],
    sampleText: `# Access Control Policy

## 1. Principle of Least Privilege
Users are granted the minimum access necessary to perform their job functions.

## 2. Multi-Factor Authentication
MFA is mandatory for all access to production environments and internal tools.

## 3. User Lifecycle
Access is granted on Day 1 and revoked within 24 hours of employee departure.

## 4. Password Policy
Passwords must be at least 14 characters and managed within a sanctioned password manager.

## 5. Privilege Reviews
Administrator access is reviewed every 90 days for necessity.`
  },
  software_dev_lifecycle: {
    id: "software_dev_lifecycle",
    name: "Secure SDLC Policy",
    description: "Standards for secure code development and deployments.",
    whyItMatters: "Proves to customers that your product is built with security in mind from day one, not as an afterthought.",
    helpsSeed: "Change Management, Code Review, Vulnerability Scanning, and Production Security.",
    checklist: [
      "Mandatory peer code review requirements",
      "SAST/DAST scanning in the CI/CD pipeline",
      "Separation of duties (Dev vs Prod access)",
      "Emergency change management procedures"
    ],
    sampleText: `# Secure SDLC Policy

## 1. Security by Design
Security requirements must be considered during the planning phase of every feature.

## 2. Code Review
All code changes require approval from at least one other engineer before merge.

## 3. Automated Scanning
Every Pull Request triggers a static analysis (SAST) and dependency vulnerability scan.

## 4. Separation of Environments
Development and production environments are strictly isolated; no production data is used in dev.

## 5. Deployment
Deployments are performed via automated pipelines with rollback capabilities.`
  }
};
