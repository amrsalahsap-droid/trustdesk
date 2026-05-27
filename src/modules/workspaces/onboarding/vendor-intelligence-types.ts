import { SignalCitation } from "./evidence";
import { SignalCategory, ConfidenceBand, NormalizationMethod } from "./website-analysis-service";

export interface EvidenceAuthorityView {
  sourceType: string;
  authorityLevel: "AUTHORITATIVE" | "HIGH" | "MEDIUM" | "LOW";
  confidenceImpact: string;
  evidenceQuality: string;
  whyTrusted: string;
}

export interface EvidenceRef {
  url: string;
  title: string;
  snippet: string;
  confidence: number;
  authority?: EvidenceAuthorityView;
}

export interface SignalValue {
  value: string;
  confidence: number;
  evidenceRefs: EvidenceRef[];
}

export interface InferredBooleanSignal {
  value: boolean;
  confidence: number;
  evidenceRefs: EvidenceRef[];
  reasoning?: string;
}

export interface ProductLine {
  name: string;
  description?: string;
  confidence: number;
  evidenceRefs: EvidenceRef[];
}

export interface ServiceLine {
  name: string;
  description?: string;
  confidence: number;
  evidenceRefs: EvidenceRef[];
}

export interface CapabilitySignal {
  key: string;
  label: string;
  confidence: number;
  evidenceRefs: EvidenceRef[];
  procurementImplications?: string[];
}

export interface UseCaseSignal {
  name: string;
  confidence: number;
  evidenceRefs: EvidenceRef[];
}

export interface ProcurementRiskArea {
  key: string;
  label: string;
  reason: string;
  confidence: number;
  evidenceStrength: "weak" | "medium" | "strong" | "authoritative";
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  triggeringSignals: string[];
  evidenceRefs: EvidenceRef[];
  recommendedTopicKeys: string[];
  recommendedEvidenceNeeds: string[];
  clarificationTasks: string[];
  status?: "needs_evidence" | "review_suggested" | "auto_ready";
}

export interface ComplianceSignal {
  framework: string;
  status: "certified" | "aligned" | "claimed";
  confidence: number;
  evidenceRefs: EvidenceRef[];
}

export interface TrustTopicRecommendation {
  id: string;
  key: string;
  title: string;
  description: string;
  priority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  topicKeys: string[];
  confidence: number;
  status: "auto_ready" | "review_suggested" | "needs_evidence";
  triggeredBy: string[];
  rationale: string;
  evidenceRefs: EvidenceRef[];
  answerScaffoldAreas: string[];
  evidenceNeeds: string[];
}

export interface EvidenceNeed {
  type: string;
  reason: string;
  suggestedSources: string[];
}

export interface ResolvedEvidenceNeed {
  canonicalKey: string;
  title: string;
  description: string;
  relatedRisks: string[];
  relatedPillars: string[];
  relatedTopics: string[];
  procurementImpact: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  rationaleSummary: string;
}


export interface AnswerScaffoldArea {
  topicKey: string;
  title: string;
  placeholderQuestions: string[];
  evidenceNeeded: string[];
  status: "needs_evidence" | "ready_for_review";
  source: "onboarding";
  generatedFromSignals: string[];
  confidence: number;
}

export interface OperationalWorkflowView {
  id: string;
  type: "cloud_scanning" | "sensitive_data_discovery" | "ai_enrichment" | "connector_authorization" | "export_generation" | "classification" | "monitoring" | "audit_logging";
  title: string;
  summary: string;
  steps: string[];
  dataInteraction: string;
  accessModel: string;
  persistenceBehavior: string;
  procurementConcerns: string[];
  relatedRisks: string[];
  relatedEvidenceNeeds: string[];
  confidence: number;
  evidenceStrength: "strong" | "medium" | "weak";
}

export interface ClarificationTask {
  id: string;
  canonicalKey?: string;
  title: string;
  description: string;
  priority: "HIGH" | "MEDIUM" | "LOW" | "CRITICAL";
  status: "pending" | "resolved" | "inferred_need_confirm";
  triggeringSignals: string[];
  suggestedAction: string;
  
  // Advanced Procurement Clarification V2 properties
  classification?: "blocker" | "enhancement";
  whyItMatters?: string;
  whatItUnlocks?: string;
  affectedTrustTopics?: string[];
  affectedRisks?: string[];
  confidenceDelta?: number;
  smartDefault?: string;
  impactPriority?: "high" | "medium" | "low";

  // Deduplication metadata fields
  normalizedTitle?: string;
  relatedRisks?: string[];
  relatedPillars?: string[];
  requestedEvidence?: string;
  expectedUnlock?: string;
  confidenceBoost?: number;
}

export interface SecurityPillar {
  key: string;
  title: string;
  summary: string;
  topicKeys: string[];
  status: "evidence_backed" | "review_suggested" | "needs_evidence" | "mixed_evidence" | "provisional";
  evidenceNeedsCount: number;
  clarificationTasksCount: number;
  
  // Extended properties for dynamic/provisional support
  pillarType?: "canonical" | "inferred" | "provisional" | "unresolved";
  whyExists?: string;
  mappingFailedReason?: string;
  supportingEvidence?: string[];
  supportingEvidenceCount?: number;
}

export interface WorkspaceFoundationResult {
  securityPillarsIdentifiedCount: number;
  autoReadyTopicsCount: number;
  reviewSuggestedTopicsCount: number;
  needsEvidenceTopicsCount: number;
  totalRelevantTopicsCount: number;
  totalPillarsCount: number;

  evidenceNeedsCount: number;
  resolvedEvidenceNeedsCount?: number;
  clarificationTasksCount: number;
  answerScaffoldsReadyCount: number;
  capabilityEvidenceCount: number;
  sourcePagesCount: number;
  citationsCount: number;

  generatedTopics: TrustTopicRecommendation[];
  pillars: SecurityPillar[];
  evidenceNeeds: EvidenceNeed[];
  resolvedEvidenceNeeds?: ResolvedEvidenceNeed[];
  clarificationTasks: ClarificationTask[];
  priorityActionItem?: ClarificationTask;
  remainingGovernanceTasks?: ClarificationTask[];
  operationalWorkflows?: OperationalWorkflowView[];
  answerScaffolds: AnswerScaffoldArea[];

  generatedTopicKeys: string[];
  reviewSuggestedTopicKeys: string[];
  needsEvidenceTopicKeys: string[];
  generatedEvidenceNeedKeys: string[];
  generatedClarificationTaskKeys: string[];

  sourceRiskAreaKeys: string[];
  sourceCapabilityKeys: string[];
  sourceEvidenceRefs: string[];

  warnings: string[];
}


export interface SourceCoverage {
  totalUrls: number;
  highValueUrls: number;
  sitemapCoverage: boolean;
  depth: number;
  pagesRequested?: number;
  pagesEvidenced?: number;
  recoveredRenderedPages?: number;
  failedPages?: number;
}

export interface VendorIntelligenceProfile {
  organizationSummary: {
    name?: string;
    domain: string;
    shortDescription?: string;
    confidence: number;
    evidenceRefs: EvidenceRef[];
  };

  businessModel: {
    primaryIndustry?: string;
    businessDomain?: string;
    solutionCategories: SignalValue[];
    customerSegments: SignalValue[];
    userTypes: SignalValue[];
    buyerTypes: SignalValue[];
  };

  productsAndServices: {
    productLines: ProductLine[];
    serviceLines: ServiceLine[];
    capabilities: CapabilitySignal[];
    useCases: UseCaseSignal[];
  };

  deploymentAndIntegrationModel: {
    deploymentModes: SignalValue[];
    deploymentComponents: SignalValue[];
    integrations: SignalValue[];
    connectorTypes: SignalValue[];
    apiExposure: SignalValue[];
  };

  dataInteractionModel: {
    accessesCustomerData: InferredBooleanSignal;
    processesSensitiveData: InferredBooleanSignal;
    storesCustomerData: InferredBooleanSignal;
    handlesPII: InferredBooleanSignal;
    handlesFinancialData: InferredBooleanSignal;
    handlesHealthData: InferredBooleanSignal;
    handlesCredentials: InferredBooleanSignal;
    usesAIOnCustomerData: InferredBooleanSignal;
    scansInfrastructure: InferredBooleanSignal;
    handlesPayments: InferredBooleanSignal;
  };

  securityAndTrustModel: {
    securityCapabilities: CapabilitySignal[];
    procurementRiskAreas: ProcurementRiskArea[];
    privacyPostureSignals: SignalValue[];
    vendorCertifications: ComplianceSignal[];
    productSupportedFrameworks: ComplianceSignal[];
  };

  workspacePreparation: {
    recommendedTrustTopics: TrustTopicRecommendation[];
    evidenceNeeds: EvidenceNeed[];
    clarificationTasks: ClarificationTask[];
    answerScaffoldAreas: AnswerScaffoldArea[];
    workspaceFoundation: WorkspaceFoundationResult;
  };

  diagnostics: {
    confidenceSummary: string;
    missingEvidence: string[];
    assumptions: string[];
    sourceCoverage: SourceCoverage;
    warnings: string[];
    notes: string[];
  };

  productGraph?: any;
  blastRadius?: any;
}

export interface BlastRadiusView {
  exposureScope: string;
  affectedAssets: string[];
  affectedDataClasses: string[];
  operationalDependencyLevel: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  customerImpactSummary: string;
  customerExposure: string;
  infrastructureReach: string;
  dataVisibility: string;
  operationalImpact: string;
  tenantImpact: string;
  persistenceImpact: string;
  // New fields for detailed blast radius analysis
  customerDataExposure?: string;
  persistenceExposure?: string;
  identitySupportExposure?: string;
  possibleCompromiseScenario?: string;
  assumptions?: string[];
  missingEvidence?: string[];
  mitigationEvidence?: string[];
}

export interface SecurityRiskAreaView {
  key: string;
  label: string;
  reason: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  confidence: number;
  topicCount: number;
  evidenceRefs: EvidenceRef[];
  evidenceStrength?: "weak" | "medium" | "strong" | "authoritative";
  status?: "needs_evidence" | "review_suggested" | "auto_ready";
  blastRadius?: BlastRadiusView;
  // New fields for detailed risk analysis
  triggeringCapabilities?: string[];
  triggeringWorkflows?: string[];
  relatedPillars?: string[];
  relatedGovernanceTasks?: string[];
  recommendedNextAction?: string;
}

export interface CapabilityView {
  key: string;
  label: string;
  confidence: number;
  evidenceStrength: string;
  evidenceRefs?: EvidenceRef[];
  evidenceAuthority?: string;
  confidenceReason?: string;
}

export interface OperationalSignalView {
  label: string;
  value: string;
  confidence: number;
}

export interface EvidenceExplorerView {
  trustTopicCount: number;
  sourcePageCount: number;
  riskEvidenceCount: number;
  intelligenceCoverage: number;
}

export interface OperationalProperty {
  value: string;
  status: "confirmed" | "inferred" | "unconfirmed";
  evidence: string;
}

export interface OperationalProfileView {
  businessDomain: string;
  productType: string;
  marketCategory: string;
  deployment: string;
  
  customerDataInteraction: OperationalProperty;
  connectorScope: OperationalProperty;
  infrastructureInteraction: OperationalProperty;
  aiInteractionModel: OperationalProperty;
  persistenceBehavior: OperationalProperty;
  tenantModel: OperationalProperty;
  supportVisibility: OperationalProperty;
  exportability: OperationalProperty;
  scanningBehavior: OperationalProperty;
  administrativeScope: OperationalProperty;
}

export interface BuyerQuestionView {
  id: string;
  question: string;
  concernDomain: string;
  whyBuyersAskThis: string;
  relatedRisks: string[];
  relatedEvidence: string[];
  confidenceDriver: string;
  expectedAnswerMaturity: "ADVANCED" | "STANDARD" | "DEVELOPING";
  importance: "CRITICAL" | "HIGH" | "MEDIUM";
  likelihood: "LIKELY" | "SPECULATIVE";
  // New fields for actionable expanded content
  relatedTrustTopics?: string[];
  relatedEvidenceGaps?: string[];
  answerReadiness?: "ready" | "needs_evidence" | "blocked";
  currentAnswerConfidence?: number;
  missingEvidence?: string[];
  suggestedAnswerSkeleton?: string;
}

export interface OnboardingReadinessViewModel {
  foundation: WorkspaceFoundationResult;
  riskAreas: SecurityRiskAreaView[];
  capabilities: CapabilityView[];
  operationalSignals: OperationalSignalView[];
  evidenceExplorer: EvidenceExplorerView;
  operationalProfile: OperationalProfileView;
  buyerQuestions: BuyerQuestionView[];
}
