export type DocumentBriefStatus = "READY" | "MANUAL_REVIEW_REQUIRED" | "GENERIC_FALLBACK";

export type DocumentBrief = {
  id: string;
  tailoringStrategy: string;
  criticalWorkflowLink: string;
  specificSectionsNeeded: string[];
  sectionRationales?: string[];
  suggestedControls: string[];
  seededTopics: string[];
  businessReason: string;
  whyItMattersForBusiness?: string;
  workflowsToCover?: string[];
  rolesPersonas?: string[];
  sensitiveDataTypes?: string[];
  trustComplianceClaims?: string[];
  helpsSeedTrustDeskTopics?: string[];
  evidenceUsed: string[];
  status: DocumentBriefStatus;
};

export type TailoredDocumentGuidance = {
  id: string;
  tailoredDescription: string;
  whyItMatters: string;
  recommendedSections: string[];
  seededTopics: string[];
  importanceIndicator: "CRITICAL" | "RECOMMENDED";
  mode: "HIGH_PRECISION" | "STANDARD" | "LIMITED";
  brief?: DocumentBrief;
  whyItMattersForBusiness?: string;
  workflowsToCover?: string[];
  rolesPersonas?: string[];
  sensitiveDataTypes?: string[];
  trustComplianceClaims?: string[];
  helpsSeedTrustDeskTopics?: string[];
};
