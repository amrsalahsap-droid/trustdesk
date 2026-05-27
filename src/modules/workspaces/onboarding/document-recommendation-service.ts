import { DOCUMENT_LIBRARY, type DocumentLibraryEntry } from "./document-library-data";
import { type DocumentBrief } from "./document-brief-types";
import {
  CompanyProfileService,
  coerceProfileStringArray,
  effectiveArrayForRules,
  effectiveScalarForRules,
  type CompanyProfile,
} from "@/modules/workspaces/company-profile-service";

export type RecommendedDocument = {
  id: string;
  name: string;
  description: string;
  priority: "HIGH" | "MEDIUM";
  libraryMetadata?: DocumentLibraryEntry;

  // AI-enriched guidance
  tailoredDescription?: string;
  whyItMatters?: string;
  recommendedSections?: string[];
  /** Display string (joined topic hints) */
  seededTopics?: string;
  seededTopicKeys?: string[];
  importanceIndicator?: "CRITICAL" | "RECOMMENDED";
  tailoredTemplate?: string;
  brief?: DocumentBrief;

  /** Deterministic explanation for why this document was suggested */
  recommendationReason?: string;
  /** Topic template keys to hint brief seeding */
  helpsSeedTopicKeys?: string[];
  whyItMattersForBusiness?: string;
  workflowsToCover?: string[];
  rolesPersonas?: string[];
  sensitiveDataTypes?: string[];
  trustComplianceClaims?: string[];
  helpsSeedTrustDeskTopics?: string[];

  // UI Transparency Metadata
  tailoringMode?: string;
  tailoringConfidence?: number;
  /** From template API: how honest to label generated starter */
  templateQuality?: "tailored" | "limited" | "manual_required";
  /** From GET /api/onboarding/template — which profile/evidence lines shaped this template */
  templateSignalsUsed?: Array<{
    field: string;
    value: string;
    category: string;
    source?: string;
    citations: { pageUrl: string; pageType: string; evidenceKind: string; excerpt?: string }[];
  }>;
};

function mapIdsToDocuments(
  docIds: { id: string; priority: "HIGH" | "MEDIUM" }[],
  enrich?: (doc: RecommendedDocument) => RecommendedDocument,
): RecommendedDocument[] {
  return docIds.map(d => {
    const entry = DOCUMENT_LIBRARY[d.id];
    let doc: RecommendedDocument;
    if (entry) {
      doc = {
        id: entry.id,
        name: entry.name,
        description: entry.description,
        priority: d.priority,
        libraryMetadata: entry,
      };
    } else {
      doc = {
        id: d.id,
        name: d.id
          .replace(/_/g, " ")
          .replace(/\b\w/g, l => l.toUpperCase()),
        description: "Standard business document.",
        priority: d.priority,
      };
    }
    return enrich ? enrich(doc) : doc;
  });
}

const AI_GOVERNANCE_HINT = /\b(ai|ml|machine learning|generative|llm|artificial intelligence)\b/i;
const HR_HINT = /\b(hr|human resources|recruit|hiring|applicant|employee|payroll|people ops)\b/i;
const FINTECH_HINT = /\b(payment|fraud|transaction|ledger|banking|pci|money movement)\b/i;
const HEALTH_HINT = /\b(patient|phi|clinical|ehr|hipaa|medical)\b/i;

function deepTextBlob(cp: CompanyProfile): string {
  const chunks: string[] = [];
  if (cp.riskAreas.source !== "default") chunks.push(...coerceProfileStringArray(cp.riskAreas.value));
  if (cp.trustClaims.source !== "default") chunks.push(...coerceProfileStringArray(cp.trustClaims.value));
  if (cp.operationalWorkflows.source !== "default") {
    chunks.push(...coerceProfileStringArray(cp.operationalWorkflows.value));
  }
  if (cp.userTypes.source !== "default") chunks.push(...coerceProfileStringArray(cp.userTypes.value));
  return chunks.join(" ").toLowerCase();
}

function profileSuggestsAiGovernance(cp: CompanyProfile): boolean {
  const blob = deepTextBlob(cp);
  return AI_GOVERNANCE_HINT.test(blob);
}

function topicHintsForDocument(docId: string, cp: CompanyProfile): string[] {
  const industries = effectiveArrayForRules(cp.industry);
  const dataTypes = effectiveArrayForRules(cp.dataTypes);
  const compliance = effectiveArrayForRules(cp.complianceSignals);
  const blob = deepTextBlob(cp);
  const keys: string[] = [];

  if (docId === "privacy_policy" || docId === "infosec_policy") {
    if (dataTypes.some(d => ["PII", "PHI"].includes(d))) {
      keys.push("right_to_forget", "pia_process", "data_portability");
    }
    if (industries.includes("healthtech") || dataTypes.includes("PHI") || HEALTH_HINT.test(blob)) {
      keys.push("hipaa_compliance", "patient_consent", "clinical_audit");
    }
    if (HR_HINT.test(blob)) {
      keys.push("right_to_forget", "pia_process");
    }
  }
  if (docId === "access_control" || docId === "infosec_policy") {
    keys.push("iam_least_privilege", "secrets_mgmt");
    if (industries.includes("fintech") || FINTECH_HINT.test(blob)) {
      keys.push("fraud_prevention", "ledger_integrity");
    }
  }
  if (docId === "bc_dr_plan") {
    keys.push("sla_availability", "subprocessor_review");
  }
  if (docId === "software_dev_lifecycle") {
    keys.push("iac_scanning", "k8s_security");
    if (profileSuggestsAiGovernance(cp)) {
      keys.push("pia_process");
    }
  }
  return [...new Set(keys)];
}

function recommendationReasonFor(docId: string, cp: CompanyProfile): string {
  const industries = effectiveArrayForRules(cp.industry);
  const productTypes = effectiveArrayForRules(cp.productType);
  const customerSegments = effectiveArrayForRules(cp.customerSegment);
  const dataTypes = effectiveArrayForRules(cp.dataTypes);
  const compliance = effectiveArrayForRules(cp.complianceSignals);
  const blob = deepTextBlob(cp);

  const parts: string[] = [];
  if (docId === "infosec_policy") {
    parts.push("Sets the governance baseline buyers and auditors expect.");
    if (compliance.length) parts.push(`Aligns with your stated targets: ${compliance.join(", ")}.`);
    if (industries.length > 0) parts.push(`Framed for ${industries.join("/")} operating models.`);
  } else if (docId === "privacy_policy") {
    if (dataTypes.includes("PII") || dataTypes.includes("PHI")) {
      parts.push(`Your profile includes ${dataTypes.join("/")} — a clear data-handling narrative reduces procurement friction.`);
    } else {
      parts.push("Explains how customer and user data is collected and protected.");
    }
    if (HR_HINT.test(blob)) parts.push("Recruiting/employee lifecycle signals suggest stronger applicant and employee data handling language.");
  } else if (docId === "bc_dr_plan") {
    parts.push("SaaS or hybrid delivery usually requires explicit continuity expectations from enterprise customers.");
    if (productTypes.length > 0) parts.push(`Your deployment models are flagged as ${productTypes.join("/")}.`);
  } else if (docId === "access_control") {
    parts.push("Supports least-privilege and identity lifecycle expectations in SOC2/ISO-oriented reviews.");
    if (compliance.some(c => ["SOC2", "ISO27001"].includes(c))) parts.push("Directly maps to common control-family questions.");
  } else if (docId === "software_dev_lifecycle") {
    if (profileSuggestsAiGovernance(cp)) {
      parts.push("AI/ML-related risk or trust themes were detected — secure SDLC language helps cover model and change risk.");
    } else {
      parts.push("Shows how security is embedded in engineering practice.");
    }
  }
  if (customerSegments.includes("b2b")) parts.push("B2B buyers often ask for these artifacts in security reviews.");
  if (FINTECH_HINT.test(blob) && docId !== "privacy_policy") {
    parts.push("Public signals mention payments or fraud-sensitive workflows.");
  }
  if (HEALTH_HINT.test(blob) && docId === "privacy_policy") {
    parts.push("Health-adjacent language on the site increases scrutiny on PHI handling.");
  }
  return parts.join(" ") || "Recommended from your business profile and TrustDesk defaults.";
}

function enrichDoc(doc: RecommendedDocument, cp: CompanyProfile): RecommendedDocument {
  return {
    ...doc,
    recommendationReason: recommendationReasonFor(doc.id, cp),
    helpsSeedTopicKeys: topicHintsForDocument(doc.id, cp),
  };
}

/**
 * D15-EN-02: Document Recommendation Service.
 * Suggests critical documents to upload based on the business profile.
 */
export class DocumentRecommendationService {
  private static buildDocIdList(cp: CompanyProfile): { id: string; priority: "HIGH" | "MEDIUM" }[] {
    const industries = effectiveArrayForRules(cp.industry);
    const productTypes = effectiveArrayForRules(cp.productType);
    const customerSegments = effectiveArrayForRules(cp.customerSegment);
    const complianceTargets = effectiveArrayForRules(cp.complianceSignals);
    const dataTypes = effectiveArrayForRules(cp.dataTypes);
    const blob = deepTextBlob(cp);

    const docIds: { id: string; priority: "HIGH" | "MEDIUM" }[] = [
      { id: "infosec_policy", priority: "HIGH" },
      { id: "privacy_policy", priority: "HIGH" },
    ];

    if (industries.includes("fintech") || FINTECH_HINT.test(blob)) {
      if (!docIds.some(d => d.id === "access_control")) {
        docIds.push({ id: "access_control", priority: "HIGH" });
      }
    }

    if (industries.includes("healthtech") || dataTypes.includes("PHI") || HEALTH_HINT.test(blob)) {
      if (!docIds.some(d => d.id === "access_control")) {
        docIds.push({ id: "access_control", priority: "HIGH" });
      }
    }

    if (productTypes.includes("saas") || productTypes.includes("hybrid")) {
      docIds.push({ id: "bc_dr_plan", priority: "HIGH" });
    }

    if (complianceTargets.includes("SOC2") || complianceTargets.includes("ISO27001")) {
      if (!docIds.some(d => d.id === "access_control")) {
        docIds.push({ id: "access_control", priority: "HIGH" });
      }
      docIds.push({ id: "software_dev_lifecycle", priority: "MEDIUM" });
    }

    if (HR_HINT.test(blob) && (dataTypes.includes("PII") || industry === "software")) {
      /* privacy already present */
    }

    if (profileSuggestsAiGovernance(cp) && !docIds.some(d => d.id === "software_dev_lifecycle")) {
      docIds.push({ id: "software_dev_lifecycle", priority: "MEDIUM" });
    }

    const seen = new Set<string>();
    return docIds.filter(d => {
      if (seen.has(d.id)) return false;
      seen.add(d.id);
      return true;
    });
  }

  /**
   * Document recommendations from a merged {@link CompanyProfile}, including
   * bumps when deep fields surface AI / ML governance themes.
   */
  static getRecommendationsForProfile(cp: CompanyProfile): RecommendedDocument[] {
    const docIds = DocumentRecommendationService.buildDocIdList(cp);
    return mapIdsToDocuments(docIds, d => enrichDoc(d, cp));
  }

  /**
   * @deprecated Prefer {@link DocumentRecommendationService.getRecommendationsForProfile}.
   */
  static getRecommendations(profile: {
    industry?: string;
    productType?: string;
    customerSegment?: string;
    complianceTargets?: string[];
  }): RecommendedDocument[] {
    const cp = CompanyProfileService.build({
      id: "",
      name: "",
      industry: profile.industry ?? null,
      productType: profile.productType ?? null,
      customerSegment: profile.customerSegment ?? null,
      dataTypes: [],
      complianceTargets: profile.complianceTargets ?? [],
      deepProfileJson: null,
    });
    return DocumentRecommendationService.getRecommendationsForProfile(cp);
  }
}
