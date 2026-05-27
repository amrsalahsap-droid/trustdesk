export type ProcurementRisk = {
  key: string;
  severity: "low" | "medium" | "high" | "critical";
  confidence: number;
  rationale: string;
  customerImpact: string;
  likelyBuyerConcern: string;
  requiredEvidence: string[];
  relatedCapabilities: string[];
  relatedWorkflows: string[];
  mitigationSignals: string[];
  missingCriticalEvidence: string[];
  evidenceStrength?: "weak" | "medium" | "strong" | "authoritative";
  status?: "needs_evidence" | "review_suggested" | "auto_ready";
};

export type BlastRadiusAssessment = {
  score: number; // 0.0 to 1.0
  rating: "low" | "medium" | "high" | "critical";
  factors: string[];
  rationale: string;
};

export type EvidenceGapAssessment = {
  missingCriticalEvidence: string[];
  likelyDealBlockers: string[];
  missingTrustDisclosures: string[];
};
