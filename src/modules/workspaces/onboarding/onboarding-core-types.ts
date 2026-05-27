
import { SignalCitation } from "./evidence";

export type SignalCategory = "OBSERVED" | "DERIVED" | "HYPOTHESIZED";

export type EvidenceStrength = "weak" | "medium" | "strong" | "authoritative";

export type ConfidenceBand = "high" | "medium" | "limited" | "conflicted" | "unknown";

export type NormalizationMethod = "exact" | "synonym_map" | "fallback" | "fuzzy_match";

export type SignalCandidate<T> = {
  value: T;
  confidence: number;
  sources: SignalCitation[];
  sourcePages?: string[];
};

export type SignalConflict<T> = {
  hasConflict: boolean;
  rival?: {
    value: T;
    confidence: number;
    sources: SignalCitation[];
  };
};

export type Signal<T> = {
  value: T;
  category: SignalCategory;
  confidence: number; 
  confidenceBand: ConfidenceBand;
  evidenceCoverage: "strong" | "medium" | "limited" | "weak" | "none";
  supportScore: number;
  aiConfidence?: number;
  source?: string;
  reasons?: string[];
  citations?: SignalCitation[];
  candidates?: SignalCandidate<T>[];
  conflict?: SignalConflict<T>;
  rawValue?: string;
  normalizationMethod?: NormalizationMethod;
  normalizationWarning?: string;
};

export type DataInteractionModel = {
  accessesCustomerData: boolean;
  processesSensitiveData: boolean;
  storesCustomerData: boolean;
  scansInfrastructure: boolean;
  integratesWithCloudProviders: boolean;
  usesAIOnCustomerData: boolean;
  handlesPayments: boolean;
  handlesPII: boolean;
};

export type Capability = {
  key: string;
  label: string;
  confidence: number;
  evidenceStrength: "weak" | "medium" | "strong" | "authoritative";
  sourceUrl: string;
  pageType: string;
  snippet: string;
  relatedProductLine?: string;
  procurementImplications: string[];
  authorityScore?: number;
  confidenceLabel?: "Strong" | "Medium" | "Weak" | "Speculative";
  recommendedFinalLabel?: string;
};

export type ProcurementRiskArea = {
  key: string;
  label: string;
  reason: string;
  confidence: number;
  evidenceStrength: "weak" | "medium" | "strong" | "authoritative";
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  triggeringSignals: string[];
  evidenceRefs: string[];
  recommendedTopicKeys: string[];
  recommendedEvidenceNeeds: string[];
  clarificationTasks: string[];
  status?: "needs_evidence" | "review_suggested" | "auto_ready";
};

export type IndustryEnum = "software" | "fintech" | "healthtech" | "ecommerce" | "other";
export type ProductTypeEnum = "saas" | "on-premise" | "hybrid" | "mobile" | "marketplace" | "other";
export type CustomerSegmentEnum = "b2b" | "b2c";

export type DeepInferredProfile = {
  companyName?: string;
  industry?: Signal<IndustryEnum>;
  productType?: Signal<ProductTypeEnum>;
  customerSegment?: Signal<CustomerSegmentEnum>;
  dataTypes?: Signal<string[]>;
  vendorCertifications?: Signal<string[]>;
  productSupportedFrameworks?: Signal<string[]>;
  privacyPostureSignals?: Signal<string[]>;
  customerIndustries?: Signal<string[]>;
  businessModel?: Signal<string>;
  businessDomain?: Signal<string>;
  solutionCategories?: Signal<string[]>;
  productLines?: Signal<string[]>;
  structuredCapabilities?: Signal<Capability[]>;
  useCases?: Signal<string[]>;
  deploymentComponents?: Signal<string[]>;
  customerRoles?: Signal<string[]>;
  dataInteractionModel?: Signal<DataInteractionModel>;
  userTypes?: Signal<string[]>;
  internalRoles?: Signal<string[]>;
  operationalWorkflows?: Signal<string[]>;
  trustClaims?: Signal<string[]>;
  procurementRiskAreas?: Signal<ProcurementRiskArea[]>;
  tailoringConfidence: number;
  suggestedDocuments: string[];
  pagesScanned: string[];
};
