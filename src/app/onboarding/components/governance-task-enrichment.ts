export interface PremiumRemediationTask {
  id: string;
  title: string;
  description: string;
  priority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  whyItMatters: string;
  relatedPillar: string;
  relatedRisks: string[];
  whatItUnlocks: string;
  procurementBlockerImpact: string;
  requestedEvidence: string[];
  confidenceDelta: number;
  sourceRationale?: string;
}

export function enrichGovernanceTask(rawTask: Record<string, unknown>): PremiumRemediationTask {
  const titleText = String(rawTask.title || rawTask.task || "Security Governance Task");
  const descText = String(
    rawTask.description || rawTask.reason || "Remediation action required to align security controls.",
  );
  const priorityVal = String(rawTask.priority || "HIGH").toUpperCase() as
    | "CRITICAL"
    | "HIGH"
    | "MEDIUM"
    | "LOW";

  const titleLower = titleText.toLowerCase();
  const descLower = descText.toLowerCase();

  if (titleLower.includes("ai") || descLower.includes("ai")) {
    return {
      id: String(rawTask.id || "task_ai_governance"),
      title: "Confirm whether customer data is used to train AI models",
      description:
        "Verify if customer-provided data inputs are utilized for artificial intelligence model training, fine-tuning, or persistent model optimization.",
      priority: priorityVal === "CRITICAL" ? "CRITICAL" : "HIGH",
      whyItMatters:
        "Enterprise procurement teams frequently block AI vendors that cannot explicitly confirm training restrictions.",
      relatedPillar: "AI & Model Governance",
      relatedRisks: ["AI Training Risk", "Customer Data Exposure"],
      whatItUnlocks: "AI governance readiness, procurement approval acceleration",
      procurementBlockerImpact:
        "CRITICAL BLOCKER. Most Fortune 500 buyers enforce an absolute zero-training policy for customer data unless explicit consent is provided.",
      requestedEvidence: ["AI data handling policy", "Model training restriction documentation"],
      confidenceDelta: 18,
      sourceRationale: descText,
    };
  }

  if (
    titleLower.includes("tenant") ||
    descLower.includes("tenant") ||
    titleLower.includes("isolation")
  ) {
    return {
      id: String(rawTask.id || "task_tenant_isolation"),
      title: "Verify logical tenant isolation controls in shared environments",
      description:
        "Confirm that multi-tenant database partitions, container network policies, and virtual network barriers prevent inter-tenant data leakage.",
      priority: "CRITICAL",
      whyItMatters:
        "Enterprise security auditors require documented architectural proof of logical tenant boundaries before approving multi-tenant SaaS software.",
      relatedPillar: "Infrastructure & Cloud Security",
      relatedRisks: ["Tenant Escape Risk", "Cross-Tenant Data Exposure"],
      whatItUnlocks: "Infrastructure trust clearance, tenant breakout liability risk mitigation",
      procurementBlockerImpact:
        "CRITICAL BLOCKER. Security reviews always request proof of network-level tenant boundaries to satisfy strict privacy standards.",
      requestedEvidence: [
        "Tenant isolation architecture diagram",
        "Container logical separation guidelines",
      ],
      confidenceDelta: 22,
      sourceRationale: descText,
    };
  }

  if (
    titleLower.includes("access") ||
    descLower.includes("access") ||
    titleLower.includes("support") ||
    titleLower.includes("mfa") ||
    titleLower.includes("sso")
  ) {
    return {
      id: String(rawTask.id || "task_access_control"),
      title: "Audit support personnel database access controls",
      description:
        "Confirm access management standards outlining employee credential security, single sign-on (SSO), and mandatory multi-factor authentication (MFA).",
      priority: "HIGH",
      whyItMatters:
        "Auditors enforce strict zero-access and session approval policies for vendor support staff handling live tenant databases.",
      relatedPillar: "Identity & Access Enforcement",
      relatedRisks: ["Privileged Access Threat", "Support Personnel Exploits"],
      whatItUnlocks: "Support access auditing, single sign-on (SSO) and multi-factor authentication (MFA) validation",
      procurementBlockerImpact:
        "HIGH BLOCKER. Unmonitored or unconfirmed support access to customer data is a common reason for security audit failure.",
      requestedEvidence: ["Support access policy", "Administrative MFA enforcement logs"],
      confidenceDelta: 15,
      sourceRationale: descText,
    };
  }

  if (
    titleLower.includes("retention") ||
    descLower.includes("retention") ||
    titleLower.includes("delete") ||
    titleLower.includes("purge") ||
    titleLower.includes("storage")
  ) {
    return {
      id: String(rawTask.id || "task_data_retention"),
      title: "Formulate end-of-contract customer data deletion protocols",
      description:
        "Confirm data retention standards, secure purging protocols, and contract termination data deletion timelines.",
      priority: "HIGH",
      whyItMatters:
        "Enterprise customers demand rigorous legal guarantees that their data will be permanently wiped within standard windows (e.g. 30 days) post-termination.",
      relatedPillar: "Storage & Sovereignty",
      relatedRisks: ["Data Storage Risk", "PII Lifecycle Leakage"],
      whatItUnlocks: "Data disposal compliance, GDPR/CCPA post-contract deletion alignment",
      procurementBlockerImpact:
        "HIGH BLOCKER. Contracts frequently stall in legal review if data retention policies lack explicit deletion deadlines and methods.",
      requestedEvidence: ["Data retention policy", "Database purging validation records"],
      confidenceDelta: 12,
      sourceRationale: descText,
    };
  }

  const requestedEvidence = Array.isArray(rawTask.requestedEvidence)
    ? (rawTask.requestedEvidence as string[])
    : typeof rawTask.requestedEvidence === "string"
      ? [rawTask.requestedEvidence]
      : ["Corporate security policies", "Operational procedural evidence"];

  return {
    id: String(rawTask.id || "task_generic_remediation"),
    title: titleText,
    description: descText,
    priority: priorityVal,
    whyItMatters:
      String(rawTask.whyItMatters) ||
      "Required to satisfy baseline enterprise compliance parameters and accelerate vendor risk verification.",
    relatedPillar: String(rawTask.relatedPillar || "Compliance & Audit Readiness"),
    relatedRisks: Array.isArray(rawTask.affectedRisks)
      ? (rawTask.affectedRisks as string[])
      : ["General Operational Compliance"],
    whatItUnlocks:
      String(rawTask.whatItUnlocks || rawTask.expectedUnlock) ||
      "Strategic posture alignment, compliance verification acceleration",
    procurementBlockerImpact:
      String(rawTask.procurementBlockerImpact) ||
      `${priorityVal === "CRITICAL" ? "CRITICAL BLOCKER. " : "HIGH BLOCKER. "}Missing compliance evidence delays procurement sign-off during late-stage reviews.`,
    requestedEvidence,
    confidenceDelta: Number(rawTask.confidenceDelta ?? rawTask.confidenceBoost ?? 8),
    sourceRationale: descText,
  };
}
