import { EvidenceRef } from "../evidence-scoring";
import { OperationalWorkflow } from "../workflow-analysis/workflow-analysis-types";

export type ProductGraph = {
  productCapabilities: ProductCapability[];
  procurementImplications: ProcurementImplication[];
  accessPatterns: AccessPattern[];
  infrastructureTouchpoints: InfrastructureTouchpoint[];
  externalDependencyPatterns: ExternalDependencyPattern[];
  operationalWorkflows?: OperationalWorkflow[];
};

export type ProductCapability = {
  key: string;
  label: string;
  confidence: number;
  evidenceStrength: "strong" | "medium" | "weak";
  inferredFrom: string[];
  evidenceRefs: EvidenceRef[];
  sourcePages: string[];
  procurementRiskWeight: number;
  likelyQuestionnaireAreas: string[];
  requiredEvidenceTypes: string[];
  rationale: string;
  authorityScore?: number;
  confidenceLabel?: "Strong" | "Medium" | "Weak" | "Speculative";
  recommendedFinalLabel?: string;
};

export type ProcurementImplication = {
  key: string;
  label: string;
  severity: "low" | "medium" | "high";
  rationale: string;
  triggeredByCapabilities: string[];
  likelyCustomerConcerns: string[];
  suggestedTrustTopics: string[];
};

export type AccessPattern = {
  key: string;
  label: string;
  confidence: number;
  rationale: string;
};

export type InfrastructureTouchpoint = {
  key: string;
  label: string;
  confidence: number;
  rationale: string;
};

export type ExternalDependencyPattern = {
  key: string;
  label: string;
  confidence: number;
  rationale: string;
};
