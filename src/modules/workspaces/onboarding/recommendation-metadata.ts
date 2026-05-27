/**
 * TrustDesk Recommendation Metadata
 * 
 * Defines the structure for all onboarding recommendations including
 * scoring, evidence traceability, and categorization.
 */

import type { SignalCitation } from "./evidence";
import type { SignalCategory } from "./website-analysis-service";
import { WorkspaceFoundationResult } from "./vendor-intelligence-types";

/**
 * Recommendation categories aligned with user journey stages
 */
export type RecommendationCategory =
  | "trust_topics"          // Knowledge library topics to seed
  | "evidence_uploads"      // Documents to upload for trust evidence
  | "workspace_configuration" // Settings, roles, permissions
  | "questionnaire_readiness" // Prep for incoming questionnaires
  | "trust_center_readiness"  // Public trust center preparation
  | "governance_maturity"     // Approval workflows, review cadence
  | "next_best_actions";     // Immediate actionable steps

/**
 * Onboarding stage for contextual recommendations
 */
export type OnboardingStage =
  | "initial_setup"     // First workspace creation
  | "profile_review"  // Confirming analyzed profile
  | "evidence_building" // Uploading documents
  | "library_seeding"   // Populating answer library
  | "questionnaire_prep" // Preparing for first questionnaire
  | "trust_center"      // Building public trust presence
  | "ongoing_governance"; // Continuous improvement

/**
 * Priority levels for recommendation ranking
 */
export type RecommendationPriority = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "OPTIONAL";

/**
 * A signal that supports (triggers) a recommendation
 */
export interface SupportingSignal {
  /** Field name from CompanyProfile (e.g., "industry", "trustClaims") */
  field: string;
  
  /** The value that triggered this recommendation */
  value: string | string[];
  
  /** Signal category indicating evidence strength */
  category: SignalCategory;
  
  /** Confidence in this signal (0-1) */
  confidence: number;
  
  /** How much this signal contributes to the score (0-1) */
  contribution: number;
  
  /** Human-readable explanation of why this signal matters */
  reason: string;
  
  /** Citations backing this signal */
  citations?: SignalCitation[];
}

/**
 * A signal that suppresses or reduces a recommendation
 */
export interface SuppressingSignal {
  /** Field name that suppresses this recommendation */
  field: string;
  
  /** The value that caused suppression */
  value: string | string[];
  
  /** Type of suppression effect */
  effect: "reduces_score" | "blocks_completely" | "deprioritizes";
  
  /** Score reduction amount (0-1), if applicable */
  reduction?: number;
  
  /** Human-readable explanation */
  reason: string;
}

/**
 * A trigger condition that activates a recommendation
 */
export interface RecommendationTrigger {
  /** Field to check (e.g., "industry", "complianceSignals") */
  field: string;
  
  /** Operator for matching */
  operator: "contains" | "equals" | "any_of" | "all_of" | "not_empty" | "regex" | "capability_match" | "procurement_risk_match" | "data_interaction_match";
  
  /** Value(s) to match against */
  value?: string | string[] | RegExp;
  
  /** Minimum confidence required for this trigger to fire (0-1) */
  minConfidence?: number;
  
  /** Category requirement (e.g., only OBSERVED signals) */
  requireCategory?: SignalCategory;
  
  /** Score contribution when this trigger fires (0-1) */
  scoreContribution: number;
  
  /** Human-readable description of this trigger */
  description: string;
}

export interface RecommendationScoreBreakdown {
  baseScore: number;
  signalScore: number;
  citationBoost: number;
  pageTypeBoost: number;
  confidenceWeight: number;
  conflictPenalty: number;
  weakEvidencePenalty: number;
  evidenceQualityMultiplier: number;
  complianceBoost: number;
  enterpriseBoost: number;
  sensitiveDataBoost: number;
  finalScore: number;
}

export type RecommendationConfidenceBand = "high" | "medium" | "limited" | "low";
export type RecommendationEvidenceStrength = "strong" | "medium" | "limited" | "missing";
export type CapabilityStrength = "weak" | "medium" | "strong" | "authoritative";

export interface RecommendationCitation {
  sourceUrl: string;
  pageType: string;
  snippet?: string;
  signalType: string;
}

export type NextBestActionType =
  | "upload_document"
  | "import_questionnaire"
  | "review_topics"
  | "invite_reviewer"
  | "configure_workspace"
  | "continue_setup"
  | "manual_profile_review";

export interface NextBestAction {
  id: string;
  title: string;
  description: string;
  actionLabel: string;
  actionType: NextBestActionType;
  routeOrIntent: string;
  priority: RecommendationPriority;
  reason: string;
  linkedRecommendationIds: string[];
}

export type EvidenceEnterpriseCategory =
  | "Compliance"
  | "Security Operations"
  | "Governance"
  | "Privacy"
  | "Infrastructure";

export type EvidenceMaturityIndicator =
  | "Recommended"
  | "Strongly recommended"
  | "Common enterprise requirement"
  | "Optional";

export interface EvidenceMetadata {
  enterpriseCategory: EvidenceEnterpriseCategory;
  maturityIndicator: EvidenceMaturityIndicator;
  readinessHint?: string;
  supportedWorkflows: string[];
  supportedQuestionnaires: string[];
  businessValue: string;
  isUploaded?: boolean;
  verifiedAt?: string;
}

/**
 * Core recommendation structure
 */
export interface Recommendation {
  /** Unique identifier for this recommendation type */
  id: string;
  
  /** Recommendation category */
  category: RecommendationCategory;
  
  /** Display title */
  title: string;
  
  /** Display description */
  description: string;
  
  /** Priority level (used for initial bucketing) */
  priority: RecommendationPriority;
  
  /** Computed score (0-100) - higher is more relevant */
  score: number;

  /** Deterministic trace of score construction */
  scoreBreakdown: RecommendationScoreBreakdown;
  
  /** Confidence in this recommendation (0-1) */
  confidence: number;

  /** User-facing confidence band derived from score and evidence strength */
  confidenceBand: RecommendationConfidenceBand;

  /** Marks weak or conflicting evidence that should be reviewed by user */
  needsReview: boolean;

  /** Qualitative evidence strength based on supporting evidence quality */
  evidenceStrength: RecommendationEvidenceStrength;

  /** Missing evidence hints for recommended follow-up */
  missingEvidence: string[];
  
  /** Triggers that activated this recommendation */
  triggers: RecommendationTrigger[];
  
  /** Triggers that actually fired (with matched values) */
  firedTriggers: Array<{
    trigger: RecommendationTrigger;
    matchedValue: string | string[];
    actualConfidence: number;
  }>;
  
  /** Signals that suppress or reduce this recommendation */
  suppressors: SuppressingSignal[];
  
  /** Signals that support this recommendation */
  supportingSignals: SupportingSignal[];
  
  /** All citations backing this recommendation */
  citations: RecommendationCitation[];
  
  /** Primary reason for this recommendation (user-facing) */
  recommendationReason: string;
  
  /** Why this recommendation is relevant now (contextual) */
  whyNow: string;
  
  /** Which onboarding stage this belongs to */
  onboardingStage: OnboardingStage;
  
  /** Estimated effort to complete (for ranking) */
  estimatedEffort: "minimal" | "low" | "medium" | "high";
  
  /** Estimated impact on trust readiness (for ranking) */
  estimatedImpact: "low" | "medium" | "high" | "critical";
  
  /** Dependencies - other recommendations that should come first */
  dependsOn?: string[];
  
  /** Mutually exclusive with these recommendation IDs */
  mutuallyExclusiveWith?: string[];
  
  /** Enterprise-grade evidence metadata (only for evidence_uploads) */
  evidenceMetadata?: EvidenceMetadata;
  
  /** Optional metadata for specific recommendation types */
  metadata?: {
    /** For trust_topics: topic keys to seed */
    topicKeys?: string[];
    
    /** For evidence_uploads: document IDs */
    documentIds?: string[];
    
    /** For workspace_configuration: settings to configure */
    configurationKeys?: string[];
    
    /** For questionnaire_readiness: questionnaire types */
    questionnaireTypes?: string[];
    
    /** For governance_maturity: workflow types */
    workflowTypes?: string[];
    
    /** Generic key-value for extensibility */
    [key: string]: unknown;
  };
}

/**
 * Scoring weights for different signal categories
 */
export interface ScoringWeights {
  /** Base score weight */
  baseWeight: number;
  
  /** OBSERVED signals get this multiplier */
  observedMultiplier: number;
  
  /** DERIVED signals get this multiplier */
  derivedMultiplier: number;
  
  /** HYPOTHESIZED signals get this multiplier */
  hypothesizedMultiplier: number;
  
  /** Each grounded signal adds this bonus */
  groundedSignalBonus: number;
  
  /** Each citation adds this bonus (up to max) */
  citationBonus: number;
  
  /** Max citation bonus */
  maxCitationBonus: number;
  
  /** Confidence curve steepness */
  confidenceExponent: number;
  
  /** Penalty for missing critical fields */
  missingFieldPenalty: number;
}

/**
 * Default scoring weights
 */
export const DEFAULT_SCORING_WEIGHTS: ScoringWeights = {
  baseWeight: 0.3,
  observedMultiplier: 1.0,
  derivedMultiplier: 0.7,
  hypothesizedMultiplier: 0.4,
  groundedSignalBonus: 0.05,
  citationBonus: 0.02,
  maxCitationBonus: 0.1,
  confidenceExponent: 2.0,
  missingFieldPenalty: 0.1,
};

/**
 * Scoring context passed to scoring functions
 */
export interface ScoringContext {
  /** The company profile being scored against */
  profile: {
    industry: string[];
    productType: string[];
    customerSegment: string[];
    dataTypes: string[];
    complianceSignals: string[];
    namedComplianceFrameworks: string[];
    privacyPostureSignals: string[];
    dataProtectionSignals: string[];
    regulatoryContextSignals: string[];
    userTypes: string[];
    internalRoles: string[];
    operationalWorkflows: string[];
    trustClaims: string[];
    procurementRiskAreas: Array<{
      key: string;
      reason: string;
      triggeringCapabilities: string[];
      evidenceRefs: string[];
      confidence: number;
    }>;
    tailoringConfidence: number;
    businessDomain: string;
    productLines: string[];
    useCases: string[];
    deploymentComponents: string[];
    dataInteractionModel: {
      accessesCustomerData: boolean;
      processesSensitiveData: boolean;
      storesCustomerData: boolean;
      scansInfrastructure: boolean;
      integratesWithCloudProviders: boolean;
      usesAIOnCustomerData: boolean;
      handlesPayments: boolean;
      handlesPII: boolean;
    };
    structuredCapabilities: Array<{
      key: string;
      label: string;
      confidence: number;
      evidenceStrength: "weak" | "medium" | "strong" | "authoritative";
      sourceUrl: string;
      pageType: string;
      snippet: string;
      relatedProductLine?: string;
      procurementImplications: string[];
    }>;
  };
  
  /** Raw signal data with confidence and citations */
  signals: {
    [field: string]: {
      value: any;
      category: SignalCategory;
      confidence: number;
      confidenceBand?: "high" | "medium" | "limited" | "conflicted" | "unknown";
      hasConflict?: boolean;
      citations?: SignalCitation[];
    };
  };
  
  /** Number of grounded signals */
  groundedSignalCount: number;
  
  /** Overall evidence quality score (0-1) */
  evidenceQuality: number;
  
  /** Current onboarding stage */
  currentStage: OnboardingStage;
  
  /** Scoring weights to use */
  weights: ScoringWeights;
}

/**
 * Result of the recommendation orchestration
 */
export interface RecommendationOrchestrationResult {
  /** All generated recommendations, ranked by score */
  recommendations: Recommendation[];
  
  /** Recommendations grouped by category */
  byCategory: Record<RecommendationCategory, Recommendation[]>;
  
  /** Recommendations grouped by stage */
  byStage: Record<OnboardingStage, Recommendation[]>;
  
  /** Top N recommendations for immediate action */
  topRecommendations: Recommendation[];

  /** Practical next actions (top 3-5) derived from ranked recommendations */
  nextBestActions: NextBestAction[];

  summary: {
    total: number;
    highPriorityCount: number;
    evidenceBackedCount: number;
    needsReviewCount: number;
    categoriesCovered: RecommendationCategory[];
    foundation: WorkspaceFoundationResult;
  };
  
  /** Metadata about the orchestration process */
  metadata: {
    /** Total recommendations generated */
    totalGenerated: number;
    
    /** Number of recommendations after deduplication */
    afterDeduplication: number;
    
    /** Number suppressed by rules */
    suppressed: number;
    
    /** Average confidence score */
    averageConfidence: number;
    
    /** Evidence signals utilized */
    signalsUtilized: string[];
    
    /** Processing timestamp */
    generatedAt: Date;
  };
}

/**
 * Configuration for the orchestrator
 */
export interface OrchestratorConfig {
  /** Maximum recommendations to return */
  maxRecommendations: number;
  
  /** Minimum score threshold (0-100) */
  minScoreThreshold: number;
  
  /** Whether to include optional recommendations */
  includeOptional: boolean;
  
  /** Categories to include (empty = all) */
  includeCategories: RecommendationCategory[];
  
  /** Stages to consider (empty = all) */
  includeStages: OnboardingStage[];
  
  /** Scoring weights */
  weights: ScoringWeights;
}

/**
 * Default orchestrator configuration
 */
export const DEFAULT_ORCHESTRATOR_CONFIG: OrchestratorConfig = {
  maxRecommendations: 15,
  minScoreThreshold: 40,
  includeOptional: false,
  includeCategories: [],
  includeStages: [],
  weights: DEFAULT_SCORING_WEIGHTS,
};
