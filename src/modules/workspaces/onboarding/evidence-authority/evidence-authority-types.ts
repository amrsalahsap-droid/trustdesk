import { EvidenceRef } from "../evidence-scoring";

export type AuthorityTier = "very_high" | "high" | "medium" | "low";

export type EvidenceAuthorityProfile = {
  authorityScore: number;       // 0..100 based on source authority and blocks
  freshnessScore: number;       // 0..100 based on metadata/dates or fallback
  contradictionRisk: number;    // 0..100 based on presence of conflicting statements
  confidenceModifier: number;   // Multiplier/offset to apply to raw confidence
  sourceType: string;           // e.g. "soc_report", "trust_center", "legal_docs", "api_schema", "docs", "product_page", "blog", "marketing"
  extractionQuality: number;    // 0..100 based on structure, density
  rationale: string;
};

export type AuthorityAwareEvidenceRef = EvidenceRef & {
  authority?: EvidenceAuthorityProfile;
};
