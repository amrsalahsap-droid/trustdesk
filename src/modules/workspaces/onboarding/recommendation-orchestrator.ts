/**
 * TrustDesk Recommendation Orchestrator
 * 
 * Converts onboarding evidence signals into personalized, scored, and ranked recommendations.
 * 
 * Architecture:
 * 1. Define recommendation templates (triggers, metadata)
 * 2. Build scoring context from CompanyProfile + signals
 * 3. Score all recommendations using TrustRecommendationScorer
 * 4. Apply deduplication and dependency resolution
 * 5. Rank and return orchestrated result
 */

import type {
  Recommendation,
  RecommendationCategory,
  RecommendationTrigger,
  OnboardingStage,
  RecommendationOrchestrationResult,
  RecommendationSummary,
  OrchestratorConfig,
  ScoringContext,
  SupportingSignal,
} from "./recommendation-metadata";
import type { SignalCitation } from "./evidence";
import {
  DEFAULT_ORCHESTRATOR_CONFIG,
  DEFAULT_SCORING_WEIGHTS,
} from "./recommendation-metadata";
import { TrustRecommendationScorer } from "./trust-recommendation-scorer";
import type { CompanyProfile } from "@/modules/workspaces/company-profile-service";
import type { SignalCategory } from "./website-analysis-service";
import { TopicInferenceEngine } from "./topic-inference-engine";
import { FoundationBuilder } from "./foundation-builder";
import { AnswerScaffoldEngine } from "./answer-scaffold-engine";
import { ClarificationTaskEngine } from "./clarification-task-engine";
import { TrustTopicRecommendation } from "./vendor-intelligence-types";

const STAGE_RANK: Record<OnboardingStage, number> = {
  initial_setup: 1,
  profile_review: 2,
  evidence_building: 3,
  library_seeding: 4,
  questionnaire_prep: 5,
  trust_center: 6,
  ongoing_governance: 7,
};

const DEFAULT_AVAILABLE_ACTION_INTENTS = new Set<string>([
  "onboarding.documents.upload",
  "onboarding.questionnaires.import",
  "onboarding.topics.review",
  "onboarding.reviewers.invite",
  "onboarding.workspace.configure",
  "onboarding.setup.continue",
  "onboarding.profile.review",
]);

/**
 * Template for defining a recommendation
 */
interface RecommendationTemplate {
  id: string;
  category: RecommendationCategory;
  title: string;
  description: string;
  priority: Recommendation["priority"];
  triggers: RecommendationTrigger[];
  estimatedEffort: Recommendation["estimatedEffort"];
  estimatedImpact: Recommendation["estimatedImpact"];
  onboardingStage: OnboardingStage;
  metadata?: Recommendation["metadata"];
  dependsOn?: string[];
  mutuallyExclusiveWith?: string[];
  evidenceMetadata?: Recommendation["evidenceMetadata"];
}

/**
 * Build scoring context from CompanyProfile
 */
function buildScoringContext(
  profile: CompanyProfile,
  currentStage: OnboardingStage,
  groundedSignalCount: number,
  evidenceQuality: number,
): ScoringContext {
  // Convert profile fields to signals
  const signals: ScoringContext["signals"] = {};

  const addSignal = (
    field: string,
    value: any,
    source: CompanyProfile[keyof CompanyProfile],
  ) => {
    const hasValue = Array.isArray(value) ? value.length > 0 : (value !== undefined && value !== null);
    if (hasValue) {
      const profileField = source as {
        source?: string;
        confidence?: number;
        category?: SignalCategory;
        confidenceBand?: "high" | "medium" | "limited" | "conflicted" | "unknown";
        conflict?: { hasConflict?: boolean };
        citations?: SignalCitation[];
      };

      signals[field] = {
        value,
        category: (profileField.category || "DERIVED") as SignalCategory,
        confidence: profileField.confidence ?? 0.5,
        confidenceBand: profileField.confidenceBand,
        hasConflict: profileField.conflict?.hasConflict ?? false,
        citations: profileField.citations,
      };
    }
  };

  addSignal("industry", profile.industry.value, profile.industry);
  addSignal("productType", profile.productType.value, profile.productType);
  addSignal("customerSegment", profile.customerSegment.value, profile.customerSegment);
  addSignal("dataTypes", profile.dataTypes.value, profile.dataTypes);
  addSignal("complianceSignals", profile.complianceSignals.value, profile.complianceSignals);
  addSignal("namedComplianceFrameworks", profile.namedComplianceFrameworks.value, profile.namedComplianceFrameworks);
  addSignal("privacyPostureSignals", profile.privacyPostureSignals.value, profile.privacyPostureSignals);
  addSignal("vendorCertifications", profile.vendorCertifications.value, profile.vendorCertifications);
  addSignal("productSupportedFrameworks", profile.productSupportedFrameworks.value, profile.productSupportedFrameworks);
  addSignal("userTypes", profile.userTypes.value, profile.userTypes);
  addSignal("internalRoles", profile.internalRoles.value, profile.internalRoles);
  addSignal("operationalWorkflows", profile.operationalWorkflows.value, profile.operationalWorkflows);
  addSignal("trustClaims", profile.trustClaims.value, profile.trustClaims);
  addSignal("riskAreas", profile.riskAreas.value, profile.riskAreas);
  
  // New Product Intelligence fields
  if (profile.businessDomain.value) {
    addSignal("businessDomain", profile.businessDomain.value, profile.businessDomain);
  }
  addSignal("solutionCategories", profile.solutionCategories.value, profile.solutionCategories);
  addSignal("productLines", profile.productLines.value, profile.productLines);
  addSignal("useCases", profile.useCases.value, profile.useCases);
  addSignal("deploymentComponents", profile.deploymentComponents.value, profile.deploymentComponents);
  addSignal("customerRoles", profile.customerRoles.value, profile.customerRoles);
  
  if (profile.dataInteractionModel.value) {
    addSignal("dataInteractionModel", profile.dataInteractionModel.value, profile.dataInteractionModel);
  }

  if (profile.structuredCapabilities.value) {
    addSignal("structuredCapabilities", profile.structuredCapabilities.value, profile.structuredCapabilities);
  }

  if (profile.procurementRiskAreas.value) {
    addSignal("procurementRiskAreas", profile.procurementRiskAreas.value, profile.procurementRiskAreas);
  }

  return {
    profile: {
      industry: profile.industry.value,
      productType: profile.productType.value,
      customerSegment: profile.customerSegment.value,
      dataTypes: profile.dataTypes.value,
      complianceSignals: profile.complianceSignals.value,
      namedComplianceFrameworks: profile.namedComplianceFrameworks.value,
      privacyPostureSignals: profile.privacyPostureSignals.value,
      userTypes: profile.userTypes.value,
      internalRoles: profile.internalRoles.value,
      operationalWorkflows: profile.operationalWorkflows.value,
      trustClaims: profile.trustClaims.value,
      procurementRiskAreas: profile.procurementRiskAreas.value || [],
      tailoringConfidence: profile.tailoringConfidence,
      structuredCapabilities: profile.structuredCapabilities.value || [],
      businessDomain: profile.businessDomain.value || "",
      productLines: profile.productLines.value || [],
      useCases: profile.useCases.value || [],
      deploymentComponents: profile.deploymentComponents.value || [],
      dataInteractionModel: profile.dataInteractionModel.value || {
        accessesCustomerData: false,
        processesSensitiveData: false,
        storesCustomerData: false,
        scansInfrastructure: false,
        integratesWithCloudProviders: false,
        usesAIOnCustomerData: false,
        handlesPayments: false,
        handlesPII: false,
      },
    },
    signals,
    groundedSignalCount,
    evidenceQuality,
    currentStage,
    weights: DEFAULT_SCORING_WEIGHTS,
  };
}

/**
 * Core recommendation orchestrator
 */
export class RecommendationOrchestrator {
  private config: OrchestratorConfig;
  private templates: RecommendationTemplate[];

  constructor(config: Partial<OrchestratorConfig> = {}) {
    this.config = { ...DEFAULT_ORCHESTRATOR_CONFIG, ...config };
    this.templates = [
      {
        id: "seed_sensitive_data_handling",
        category: "trust_topics",
        title: "Sensitive Data Governance",
        description: "Controls for processing and protecting high-sensitivity data types like PII, PHI, or secrets.",
        priority: "CRITICAL",
        triggers: [
          {
            field: "dataInteractionModel",
            operator: "data_interaction_match",
            value: ["processesSensitiveData", "handlesPII", "handlesHealthData"],
            scoreContribution: 0.8,
            description: "Product processes sensitive customer data or PII",
          },
          {
            field: "dataTypes",
            operator: "any_of",
            value: ["PII", "PHI", "Secrets"],
            scoreContribution: 0.6,
            description: "High-sensitivity data types explicitly detected",
          },
        ],
        estimatedEffort: "high",
        estimatedImpact: "critical",
        onboardingStage: "library_seeding",
        metadata: {
          topicKeys: ["pii_handling", "data_classification", "encryption_at_rest", "data_retention_policy"],
        },
      },
      {
        id: "seed_infrastructure_governance",
        category: "trust_topics",
        title: "Infrastructure & Cloud Governance",
        description: "Security of cloud-native components, infrastructure-as-code, and shared responsibility.",
        priority: "HIGH",
        triggers: [
          {
            field: "dataInteractionModel",
            operator: "data_interaction_match",
            value: ["integratesWithCloudProviders", "scansInfrastructure"],
            scoreContribution: 0.7,
            description: "Product interacts with or manages cloud infrastructure",
          },
          {
            field: "deploymentComponents",
            operator: "not_empty",
            scoreContribution: 0.4,
            description: "Specific cloud infrastructure components detected",
          },
        ],
        estimatedEffort: "medium",
        estimatedImpact: "high",
        onboardingStage: "library_seeding",
        metadata: {
          topicKeys: ["cloud_security", "iac_scanning", "iam_governance", "secrets_management"],
        },
      },
      ...this.initializeTemplates()
    ];
  }

  /**
   * Initialize all recommendation templates
   */
  private initializeTemplates(): RecommendationTemplate[] {
    return [
      // === TRUST TOPICS ===
      {
        id: "seed_aml_kyc",
        category: "trust_topics",
        title: "Financial Compliance (AML/KYC)",
        description: "Governance for high-risk financial transactions, identity verification, and anti-money laundering controls.",
        priority: "HIGH",
        triggers: [
          {
            field: "industry",
            operator: "any_of",
            value: ["fintech", "banking", "financial_services"],
            scoreContribution: 0.4,
            description: "Financial industry profile requires standardized AML/KYC questionnaire responses",
          },
          {
            field: "complianceSignals",
            operator: "any_of",
            value: ["PCI_DSS", "SOX"],
            scoreContribution: 0.2,
            description: "Financial regulatory signals detected in public posture",
          },
          {
            field: "structuredCapabilities",
            operator: "capability_match",
            value: ["kyc_aml", "fraud_detection"],
            scoreContribution: 0.7,
            description: "Direct detection of KYC, AML, or fraud prevention capabilities",
          },
        ],
        estimatedEffort: "medium",
        estimatedImpact: "high",
        onboardingStage: "library_seeding",
        metadata: {
          topicKeys: ["aml_kyc", "transaction_monitoring", "sanctions_screening"],
        },
      },
      {
        id: "seed_hipaa_privacy",
        category: "trust_topics",
        title: "Patient Data Handling (HIPAA)",
        description: "Standardized controls for PHI protection, clinical privacy, and healthcare-specific data processing.",
        priority: "CRITICAL",
        triggers: [
          {
            field: "namedComplianceFrameworks",
            operator: "any_of",
            value: ["HIPAA"],
            scoreContribution: 0.6,
            description: "Direct HIPAA compliance indicators detected in product evidence",
          },
          {
            field: "regulatoryContextSignals",
            operator: "any_of",
            value: ["HIPAA-ready", "healthcare compliance"],
            scoreContribution: 0.4,
            description: "Healthcare regulatory context detected on product pages",
          },
          {
            field: "industry",
            operator: "any_of",
            value: ["healthtech", "healthcare", "medical"],
            requireCategory: "OBSERVED",
            scoreContribution: 0.3,
            description: "Healthcare industry profile requires specialized privacy questionnaire modules",
          },
          {
            field: "dataTypes",
            operator: "contains",
            value: "PHI",
            scoreContribution: 0.4,
            description: "Protected Health Information (PHI) processing detected as a core capability",
          },
          {
            field: "structuredCapabilities",
            operator: "capability_match",
            value: ["phi_handling"],
            scoreContribution: 0.8,
            description: "Explicit PHI handling or HIPAA-compliant processing capabilities detected",
          },
        ],
        estimatedEffort: "high",
        estimatedImpact: "critical",
        onboardingStage: "library_seeding",
        metadata: {
          topicKeys: ["hipaa_privacy", "phi_handling", "baas", "clinical_security"],
        },
      },
      {
        id: "seed_data_classification_maturity",
        category: "trust_topics",
        title: "Sensitive Data Handling",
        description: "Questionnaire area covering data discovery, classification, and lifecycle protection for sensitive assets.",
        priority: "HIGH",
        triggers: [
          {
            field: "structuredCapabilities",
            operator: "capability_match",
            value: ["data_classification", "sensitive_data_discovery"],
            scoreContribution: 0.5,
            description: "Detected product capabilities for sensitive data discovery and classification",
          },
          {
            field: "dataProtectionSignals",
            operator: "any_of",
            value: ["data classification", "data labeling"],
            scoreContribution: 0.3,
            description: "Observed data labeling and classification posture on corporate assets",
          },
        ],
        estimatedEffort: "medium",
        estimatedImpact: "high",
        onboardingStage: "library_seeding",
        metadata: {
          topicKeys: ["data_classification", "data_retention", "sensitive_data_handling"],
        },
      },
      {
        id: "seed_cloud_security_maturity",
        category: "trust_topics",
        title: "Cloud Infrastructure Security",
        description: "Core procurement concern covering cloud tenant isolation, credential management, and infrastructure hardening.",
        priority: "HIGH",
        triggers: [
          {
            field: "structuredCapabilities",
            operator: "capability_match",
            value: ["cloud_connector", "cloud_scanning"],
            scoreContribution: 0.5,
            description: "Product integrates with cloud infrastructure or scanning capabilities",
          },
          {
            field: "procurementRiskAreas",
            operator: "procurement_risk_match",
            value: ["cloud_security", "connector_security"],
            scoreContribution: 0.4,
            description: "Direct procurement risk area detected in cloud surface footprint",
          },
        ],
        estimatedEffort: "medium",
        estimatedImpact: "high",
        onboardingStage: "library_seeding",
        metadata: {
          topicKeys: ["cloud_security", "credential_management", "infrastructure_security"],
        },
      },
      {
        id: "seed_api_security_depth",
        category: "trust_topics",
        title: "API & Integration Security",
        description: "Security of external integration surfaces, API authentication, and cross-platform trust boundaries.",
        priority: "HIGH",
        triggers: [
          {
            field: "structuredCapabilities",
            operator: "capability_match",
            value: ["api_integration"],
            scoreContribution: 0.5,
            description: "API integrations detected as a core product capability",
          },
          {
            field: "procurementRiskAreas",
            operator: "procurement_risk_match",
            value: ["integration_security"],
            scoreContribution: 0.4,
            description: "High-priority procurement risk area for API-heavy products",
          },
        ],
        estimatedEffort: "medium",
        estimatedImpact: "medium",
        onboardingStage: "library_seeding",
        metadata: {
          topicKeys: ["api_security", "authentication", "authorization"],
        },
      },
      {
        id: "seed_ai_governance",
        category: "trust_topics",
        title: "AI & Data Processing",
        description: "Transparency into AI model processing, training data provenance, and automated decision-making security.",
        priority: "MEDIUM",
        triggers: [
          {
            field: "structuredCapabilities",
            operator: "capability_match",
            value: ["ai_processing"],
            scoreContribution: 0.6,
            description: "AI processing and data utilization detected as a core product capability",
          },
          {
            field: "procurementRiskAreas",
            operator: "procurement_risk_match",
            value: ["ai_governance", "model_risk"],
            scoreContribution: 0.5,
            description: "AI-specific procurement risks detected in product footprint",
          },
        ],
        estimatedEffort: "high",
        estimatedImpact: "medium",
        onboardingStage: "library_seeding",
        metadata: {
          topicKeys: ["ai_processing", "model_governance", "ai_privacy"],
        },
      },
      {
        id: "seed_payment_security",
        category: "trust_topics",
        title: "Payment & Transaction Security",
        description: "PCI-DSS compliance, fraud controls, and secure payment processing.",
        priority: "CRITICAL",
        triggers: [
          {
            field: "structuredCapabilities",
            operator: "capability_match",
            value: ["payment_processing", "transaction_processing"],
            scoreContribution: 0.6,
            description: "Payment or transaction processing detected",
          },
          {
            field: "procurementRiskAreas",
            operator: "procurement_risk_match",
            value: ["payment_security", "pci_risk", "fraud_risk"],
            scoreContribution: 0.5,
            description: "Payment-related procurement risks detected",
          },
        ],
        estimatedEffort: "high",
        estimatedImpact: "critical",
        onboardingStage: "library_seeding",
        metadata: {
          topicKeys: ["payment_security", "pci_review", "fraud_controls"],
        },
      },
      {
        id: "seed_marketplace_trust",
        category: "trust_topics",
        title: "Marketplace & Auction Trust",
        description: "Trust and security for multi-sided platforms, listing verification, and fraud prevention.",
        priority: "HIGH",
        triggers: [
          {
            field: "structuredCapabilities",
            operator: "capability_match",
            value: ["marketplace_listing", "identity_verification"],
            scoreContribution: 0.5,
            description: "Marketplace or identity verification capabilities detected",
          },
          {
            field: "procurementRiskAreas",
            operator: "procurement_risk_match",
            value: ["transaction_security", "account_verification"],
            scoreContribution: 0.4,
            description: "Marketplace-specific procurement risks detected",
          },
          {
            field: "productType",
            operator: "equals",
            value: "marketplace",
            scoreContribution: 0.3,
            description: "Marketplace product type requires specific trust controls",
          },
        ],
        estimatedEffort: "medium",
        estimatedImpact: "high",
        onboardingStage: "library_seeding",
        metadata: {
          topicKeys: ["transaction_security", "account_verification", "fraud_prevention"],
        },
      },
      {
        id: "seed_saas_b2b_fundamentals",
        category: "trust_topics",
        title: "Standard Enterprise Security",
        description: "Foundational procurement area covering tenant isolation, access control, and audit logging for SaaS.",
        priority: "CRITICAL",
        triggers: [
          {
            field: "productType",
            operator: "equals",
            value: "saas",
            scoreContribution: 0.3,
            description: "SaaS deployment model requires standardized multi-tenant isolation controls",
          },
          {
            field: "customerSegment",
            operator: "equals",
            value: "b2b",
            scoreContribution: 0.3,
            description: "B2B profile mandates enterprise-grade access control and audit logging",
          },
          {
            field: "procurementRiskAreas",
            operator: "procurement_risk_match",
            value: ["tenant_isolation", "access_control"],
            scoreContribution: 0.4,
            description: "Core procurement risks detected in multi-tenant access control",
          },
        ],
        estimatedEffort: "medium",
        estimatedImpact: "critical",
        onboardingStage: "library_seeding",
        metadata: {
          topicKeys: ["tenant_isolation", "access_control", "audit_logging"],
        },
      },
      {
        id: "seed_cloud_connector_security",
        category: "trust_topics",
        title: "Cloud & Integration Security",
        description: "Security controls for cloud storage connectors, API integrations, and shared responsibility.",
        priority: "MEDIUM",
        triggers: [
          {
            field: "structuredCapabilities",
            operator: "capability_match",
            value: ["cloud_connector", "cloud_scanning", "api_integration"],
            scoreContribution: 0.5,
            description: "Product integrates directly with cloud providers/APIs",
          },
          {
            field: "deploymentComponents",
            operator: "any_of",
            value: ["AWS", "GCP", "Azure", "Cloud Storage"],
            scoreContribution: 0.3,
            description: "Cloud deployment components detected",
          },
        ],
        estimatedEffort: "medium",
        estimatedImpact: "medium",
        onboardingStage: "library_seeding",
        metadata: {
          topicKeys: ["cloud_security", "api_security", "shared_responsibility"],
        },
      },
      {
        id: "seed_privacy_posture_readiness",
        category: "trust_topics",
        title: "Privacy Posture & Rights",
        description: "Consumer privacy rights, data processing transparency, and consent management.",
        priority: "HIGH",
        triggers: [
          {
            field: "privacyPostureSignals",
            operator: "not_empty",
            scoreContribution: 0.4,
            description: "General privacy posture signals detected",
          },
          {
            field: "privacyPostureSignals",
            operator: "any_of",
            value: ["privacy policy", "consent", "user rights", "DSAR"],
            scoreContribution: 0.3,
            description: "Specific privacy maturity signals detected",
          },
        ],
        estimatedEffort: "low",
        estimatedImpact: "high",
        onboardingStage: "library_seeding",
        metadata: {
          topicKeys: ["privacy_policy", "data_subject_rights", "consent_management"],
        },
      },
      {
        id: "seed_domain_governance",
        category: "trust_topics",
        title: "Cybersecurity Governance",
        description: "Foundational security governance for cybersecurity and risk management platforms.",
        priority: "HIGH",
        triggers: [
          {
            field: "businessDomain",
            operator: "contains",
            value: "Security",
            scoreContribution: 0.5,
            description: "Company operates in the Cybersecurity domain",
          },
          {
            field: "industry",
            operator: "any_of",
            value: ["software"],
            scoreContribution: 0.2,
          },
        ],
        estimatedEffort: "medium",
        estimatedImpact: "high",
        onboardingStage: "library_seeding",
        metadata: {
          topicKeys: ["security_governance", "vulnerability_management", "incident_response"],
        },
      },
      // === CAPABILITY-DRIVEN RECOMMENDATIONS ===
      {
        id: "seed_data_classification",
        category: "trust_topics",
        title: "Data Classification & Discovery",
        description: "Policies and controls for discovering and classifying sensitive information.",
        priority: "HIGH",
        triggers: [
          {
            field: "structuredCapabilities",
            operator: "capability_match",
            value: ["data_classification", "sensitive_data_discovery"],
            scoreContribution: 0.7,
            description: "Product capability involves discovering or classifying sensitive data",
          },
        ],
        estimatedEffort: "medium",
        estimatedImpact: "high",
        onboardingStage: "library_seeding",
        metadata: {
          topicKeys: ["data_handling", "privacy", "sensitive_data_management", "data_classification", "data_discovery"],
        },
      },
      {
        id: "seed_cloud_security",
        category: "trust_topics",
        title: "Cloud & Connector Security",
        description: "Security controls for cloud integrations and external connectors.",
        priority: "HIGH",
        triggers: [
          {
            field: "structuredCapabilities",
            operator: "capability_match",
            value: ["cloud_connector", "cloud_scanning"],
            scoreContribution: 0.6,
            description: "Product connects to or scans external cloud environments",
          },
          {
            field: "structuredCapabilities",
            operator: "capability_match",
            value: ["api_integration"],
            scoreContribution: 0.4,
            description: "Product uses API integrations with external services",
          },
        ],
        estimatedEffort: "high",
        estimatedImpact: "critical",
        onboardingStage: "library_seeding",
        metadata: {
          topicKeys: ["cloud_security", "integration_security", "api_security", "third_party_connectors"],
        },
      },
      {
        id: "seed_ai_governance",
        category: "trust_topics",
        title: "AI & Model Governance",
        description: "Controls for AI/ML classification, data processing, and model security.",
        priority: "HIGH",
        triggers: [
          {
            field: "structuredCapabilities",
            operator: "capability_match",
            value: ["ai_processing", "model_training"],
            scoreContribution: 0.8,
            description: "Product uses AI/ML for data processing or classification",
          },
        ],
        estimatedEffort: "medium",
        estimatedImpact: "high",
        onboardingStage: "library_seeding",
        metadata: {
          topicKeys: ["ai_data_processing", "model_governance", "ai_ethics", "automated_decision_making"],
        },
      },
      {
        id: "seed_infrastructure_security",
        category: "trust_topics",
        title: "Infrastructure & Data Access",
        description: "Security for databases, servers, and file-level storage access.",
        priority: "HIGH",
        triggers: [
          {
            field: "structuredCapabilities",
            operator: "capability_match",
            value: ["database_access", "cloud_connector"],
            scoreContribution: 0.7,
            description: "Product interacts directly with databases or servers",
          },
          {
            field: "structuredCapabilities",
            operator: "capability_match",
            value: ["file_scanning"],
            scoreContribution: 0.5,
            description: "Product scans local or networked file systems",
          },
        ],
        estimatedEffort: "medium",
        estimatedImpact: "high",
        onboardingStage: "library_seeding",
        metadata: {
          topicKeys: ["data_access", "infrastructure_security", "data_storage", "access_controls"],
        },
      },
      {
        id: "seed_gdpr_privacy",
        category: "trust_topics",
        title: "GDPR & Privacy Rights",
        description: "European data protection and privacy rights management.",
        priority: "HIGH",
        triggers: [
          {
            field: "namedComplianceFrameworks",
            operator: "any_of",
            value: ["GDPR", "CCPA"],
            scoreContribution: 0.6,
            description: "Named privacy frameworks (GDPR/CCPA) detected",
          },
          {
            field: "privacyPostureSignals",
            operator: "any_of",
            value: ["privacy policy", "consent management", "user data rights", "transparency"],
            scoreContribution: 0.5,
            description: "Privacy posture signals (policies, consent) detected",
          },
          {
            field: "regulatoryContextSignals",
            operator: "any_of",
            value: ["GDPR-compliant", "CCPA alignment"],
            scoreContribution: 0.4,
            description: "Privacy regulatory alignment mentioned",
          },
          {
            field: "dataTypes",
            operator: "any_of",
            value: ["PII", "personal_data"],
            scoreContribution: 0.3,
            description: "Personal data processing detected",
          },
        ],
        estimatedEffort: "high",
        estimatedImpact: "high",
        onboardingStage: "library_seeding",
        metadata: {
          topicKeys: ["gdpr_compliance", "data_subject_rights", "privacy_by_design"],
        },
      },
      {
        id: "seed_enterprise_saas",
        category: "trust_topics",
        title: "Enterprise SaaS Security",
        description: "Security topics for enterprise SaaS deployments.",
        priority: "MEDIUM",
        triggers: [
          {
            field: "productType",
            operator: "any_of",
            value: ["saas", "cloud"],
            requireCategory: "OBSERVED",
            scoreContribution: 0.3,
            description: "SaaS product type confirmed",
          },
          {
            field: "customerSegment",
            operator: "any_of",
            value: ["b2b", "enterprise"],
            scoreContribution: 0.3,
            description: "B2B enterprise customer segment",
          },
          {
            field: "namedComplianceFrameworks",
            operator: "any_of",
            value: ["SOC2", "ISO27001"],
            scoreContribution: 0.5,
            description: "Enterprise certifications (SOC2/ISO) detected",
          },
        ],
        estimatedEffort: "medium",
        estimatedImpact: "medium",
        onboardingStage: "library_seeding",
        metadata: {
          topicKeys: ["access_management", "encryption", "subprocessor_security"],
        },
      },
      {
        id: "seed_api_security",
        category: "trust_topics",
        title: "API Security & Integration Controls",
        description: "Harden API authentication, authorization, and integration trust boundaries.",
        priority: "HIGH",
        triggers: [
          {
            field: "structuredCapabilities",
            operator: "capability_match",
            value: ["API integrations", "api integration"],
            scoreContribution: 0.6,
            description: "Product exposes or consumes APIs requiring security controls",
          },
          {
            field: "operationalWorkflows",
            operator: "any_of",
            value: ["api", "integrations", "api_security", "partner_integrations"],
            scoreContribution: 0.4,
            description: "API/integration workflows detected",
          },
        ],
        estimatedEffort: "medium",
        estimatedImpact: "high",
        onboardingStage: "library_seeding",
        metadata: {
          topicKeys: ["api_security", "integration_auth", "rate_limiting"],
        },
      },
      {
        id: "seed_pci_compliance",
        category: "trust_topics",
        title: "Payment & Transaction Security",
        description: "Payment card industry data protection and transaction security controls.",
        priority: "HIGH",
        triggers: [
          {
            field: "namedComplianceFrameworks",
            operator: "any_of",
            value: ["PCI", "PCI-DSS"],
            scoreContribution: 0.7,
            description: "Direct PCI compliance evidence detected",
          },
          {
            field: "dataProtectionSignals",
            operator: "any_of",
            value: ["payment data", "cardholder data"],
            scoreContribution: 0.5,
            description: "Payment data protection signals detected",
          },
          {
            field: "structuredCapabilities",
            operator: "capability_match",
            value: ["payment processing", "marketplace transactions"],
            scoreContribution: 0.6,
            description: "Product handles financial transactions",
          },
        ],
        estimatedEffort: "high",
        estimatedImpact: "high",
        onboardingStage: "library_seeding",
        metadata: {
          topicKeys: ["payment_security", "pci_review", "transaction_security", "fraud_risk_controls"],
        },
      },
      {
        id: "seed_security_governance",
        category: "trust_topics",
        title: "Security Governance & Audits",
        description: "Internal security governance, audit procedures, and compliance management.",
        priority: "HIGH",
        triggers: [
          {
            field: "namedComplianceFrameworks",
            operator: "any_of",
            value: ["SOC2", "ISO27001", "SOC1"],
            scoreContribution: 0.5,
            description: "Enterprise certifications (SOC2/ISO) detected",
          },
          {
            field: "dataProtectionSignals",
            operator: "any_of",
            value: ["data classification", "data retention", "audit logs"],
            scoreContribution: 0.4,
            description: "Governance-relevant data protection signals detected",
          },
          {
            field: "structuredCapabilities",
            operator: "capability_match",
            value: ["audit logs", "encryption", "data retention", "data residency"],
            scoreContribution: 0.6,
            description: "Product features core security governance capabilities",
          },
        ],
        estimatedEffort: "medium",
        estimatedImpact: "high",
        onboardingStage: "library_seeding",
        metadata: {
          topicKeys: ["internal_audit", "policy_review", "compliance_management", "audit_logs", "encryption_standards", "data_residency_controls"],
        },
      },
      {
        id: "seed_identity_access",
        category: "trust_topics",
        title: "Identity & Access Management",
        description: "MFA, SSO, and Role-Based Access Control (RBAC) governance.",
        priority: "HIGH",
        triggers: [
          {
            field: "structuredCapabilities",
            operator: "capability_match",
            value: ["account verification", "access control"],
            scoreContribution: 0.7,
            description: "Product manages user accounts or access permissions",
          },
          {
            field: "operationalWorkflows",
            operator: "any_of",
            value: ["mfa", "sso", "rbac", "identity_management", "access_control"],
            scoreContribution: 0.5,
            description: "IAM-specific workflows or controls detected",
          },
        ],
        estimatedEffort: "medium",
        estimatedImpact: "high",
        onboardingStage: "library_seeding",
        metadata: {
          topicKeys: ["identity_access", "pii_handling", "mfa_enforcement", "sso_integration", "rbac_matrix", "user_provisioning"],
        },
      },
      {
        id: "seed_resilience_availability",
        category: "trust_topics",
        title: "Resilience & Business Continuity",
        description: "Backups, disaster recovery, and system uptime commitments.",
        priority: "MEDIUM",
        triggers: [
          {
            field: "structuredCapabilities",
            operator: "capability_match",
            value: ["incident response"],
            scoreContribution: 0.6,
            description: "Product supports incident response or resilience workflows",
          },
          {
            field: "operationalWorkflows",
            operator: "any_of",
            value: ["backups", "disaster_recovery", "uptime", "sla", "business_continuity"],
            scoreContribution: 0.5,
            description: "Availability and resilience signals detected",
          },
        ],
        estimatedEffort: "medium",
        estimatedImpact: "medium",
        onboardingStage: "library_seeding",
        metadata: {
          topicKeys: ["backup_policy", "disaster_recovery_plan", "uptime_sla", "incident_management"],
        },
      },

      // === EVIDENCE UPLOADS ===
      {
        id: "upload_infosec_policy",
        category: "evidence_uploads",
        title: "Information Security Policy",
        description: "Upload your information security policy document.",
        priority: "CRITICAL",
        triggers: [
          {
            field: "industry",
            operator: "not_empty",
            scoreContribution: 0.3,
            description: "Every organization needs an InfoSec policy",
          },
          {
            field: "complianceSignals",
            operator: "any_of",
            value: ["SOC2", "ISO27001", "GDPR"],
            scoreContribution: 0.2,
            description: "Compliance frameworks require documented policies",
          },
        ],
        estimatedEffort: "low",
        estimatedImpact: "critical",
        onboardingStage: "evidence_building",
        metadata: {
          documentIds: ["infosec_policy"],
        },
        evidenceMetadata: {
          enterpriseCategory: "Governance",
          maturityIndicator: "Common enterprise requirement",
          supportedWorkflows: ["Security reviews", "Vendor assessments", "Audit preparation"],
          supportedQuestionnaires: ["SOC 2", "ISO 27001", "Custom security assessments"],
          businessValue: "Sets the governance baseline buyers and auditors expect. Required for SOC2/ISO enterprise procurement.",
          readinessHint: "Uploading this document can improve export readiness for enterprise security questionnaires.",
        },
      },
      {
        id: "upload_privacy_policy",
        category: "evidence_uploads",
        title: "Privacy Policy",
        description: "Upload your privacy policy for customer data handling.",
        priority: "HIGH",
        triggers: [
          {
            field: "dataTypes",
            operator: "any_of",
            value: ["PII", "PHI", "personal_data"],
            scoreContribution: 0.4,
            description: "Data collection requires privacy policy",
          },
          {
            field: "customerSegment",
            operator: "any_of",
            value: ["b2c", "consumers"],
            scoreContribution: 0.3,
            description: "Consumer-facing services need privacy policies",
          },
        ],
        estimatedEffort: "low",
        estimatedImpact: "high",
        onboardingStage: "evidence_building",
        metadata: {
          documentIds: ["privacy_policy"],
        },
        evidenceMetadata: {
          enterpriseCategory: "Privacy",
          maturityIndicator: "Common enterprise requirement",
          supportedWorkflows: ["Data protection assessments", "Privacy questionnaires", "GDPR compliance reviews"],
          supportedQuestionnaires: ["GDPR", "CCPA", "Privacy Impact Assessments"],
          businessValue: "Required for data handling transparency. PII/PHI processing mandates this for enterprise trust.",
          readinessHint: "Essential for GDPR/privacy questionnaire responses.",
        },
      },
      {
        id: "upload_dpa",
        category: "evidence_uploads",
        title: "Data Processing Addendum (DPA)",
        description: "Upload your DPA to support GDPR/privacy and enterprise procurement requests.",
        priority: "HIGH",
        triggers: [
          {
            field: "complianceSignals",
            operator: "any_of",
            value: ["GDPR", "CCPA", "privacy_law"],
            scoreContribution: 0.4,
            description: "Privacy regulation signal requires DPA evidence",
          },
          {
            field: "customerSegment",
            operator: "any_of",
            value: ["b2b", "enterprise"],
            scoreContribution: 0.2,
            description: "Enterprise procurement often requires a DPA",
          },
        ],
        estimatedEffort: "low",
        estimatedImpact: "high",
        onboardingStage: "evidence_building",
        metadata: {
          documentIds: ["dpa"],
        },
        evidenceMetadata: {
          enterpriseCategory: "Privacy",
          maturityIndicator: "Strongly recommended",
          supportedWorkflows: ["Enterprise procurement", "Vendor onboarding", "GDPR compliance"],
          supportedQuestionnaires: ["GDPR", "Vendor privacy assessments", "Data protection addendums"],
          businessValue: "DPAs are commonly requested during enterprise vendor security reviews to establish data controller/processor relationships.",
          readinessHint: "Having a DPA ready can accelerate enterprise sales cycles by 1-2 weeks.",
        },
      },
      {
        id: "upload_access_control",
        category: "evidence_uploads",
        title: "Access Control Policy",
        description: "Document your access management and least-privilege controls.",
        priority: "HIGH",
        triggers: [
          {
            field: "complianceSignals",
            operator: "any_of",
            value: ["SOC2", "ISO27001", "PCI_DSS"],
            scoreContribution: 0.3,
            description: "Compliance frameworks require access controls",
          },
          {
            field: "internalRoles",
            operator: "not_empty",
            scoreContribution: 0.2,
            description: "Role-based access inferred from organization",
          },
          {
            field: "userTypes",
            operator: "any_of",
            value: ["employees", "contractors", "vendors"],
            scoreContribution: 0.2,
            description: "Multiple user types require access management",
          },
        ],
        estimatedEffort: "medium",
        estimatedImpact: "high",
        onboardingStage: "evidence_building",
        metadata: {
          documentIds: ["access_control"],
        },
        evidenceMetadata: {
          enterpriseCategory: "Security Operations",
          maturityIndicator: "Strongly recommended",
          supportedWorkflows: ["Security reviews", "Access audits", "Identity management verification"],
          supportedQuestionnaires: ["SOC 2 CC6", "ISO 27001 A.9", "PCI DSS Requirement 8"],
          businessValue: "SOC2 reports are commonly requested during enterprise vendor security reviews. Demonstrates least-privilege and identity lifecycle controls.",
          readinessHint: "Uploading this document can accelerate security questionnaire responses for access control sections.",
        },
      },
      {
        id: "upload_bc_dr_plan",
        category: "evidence_uploads",
        title: "Business Continuity & DR Plan",
        description: "Continuity planning for critical business operations.",
        priority: "MEDIUM",
        triggers: [
          {
            field: "productType",
            operator: "any_of",
            value: ["saas", "cloud", "mission_critical"],
            scoreContribution: 0.3,
            description: "Cloud services need BC/DR documentation",
          },
          {
            field: "customerSegment",
            operator: "any_of",
            value: ["b2b", "enterprise"],
            scoreContribution: 0.2,
            description: "Enterprise customers expect BC/DR plans",
          },
          {
            field: "complianceSignals",
            operator: "any_of",
            value: ["SOC2", "ISO27001"],
            scoreContribution: 0.2,
            description: "Compliance frameworks require BC/DR",
          },
        ],
        estimatedEffort: "high",
        estimatedImpact: "medium",
        onboardingStage: "evidence_building",
        metadata: {
          documentIds: ["bc_dr_plan"],
        },
        evidenceMetadata: {
          enterpriseCategory: "Infrastructure",
          maturityIndicator: "Recommended",
          supportedWorkflows: ["Business continuity reviews", "Disaster recovery assessments", "Vendor resilience checks"],
          supportedQuestionnaires: ["SOC 2 A1", "ISO 27001 A.17", "BC/DR specific assessments"],
          businessValue: "Enterprise customers require assurance that your services remain available during disruptions. Critical for SaaS vendors.",
          readinessHint: "Uploading this document can improve export readiness for availability-focused security reviews.",
        },
      },
      {
        id: "upload_soc2_report",
        category: "evidence_uploads",
        title: "SOC 2 Type II Report",
        description: "Upload your most recent SOC 2 audit report.",
        priority: "CRITICAL",
        triggers: [
          {
            field: "complianceSignals",
            operator: "any_of",
            value: ["SOC2", "SOC_2"],
            scoreContribution: 0.6,
            description: "SOC 2 compliance target detected",
          },
        ],
        estimatedEffort: "low",
        estimatedImpact: "critical",
        onboardingStage: "evidence_building",
        metadata: {
          documentIds: ["soc2_report"],
        },
        evidenceMetadata: {
          enterpriseCategory: "Compliance",
          maturityIndicator: "Gold standard",
          supportedWorkflows: ["Enterprise security reviews", "Vendor onboarding", "Annual audits"],
          supportedQuestionnaires: ["Standardized Information Gathering (SIG)", "VSAQ", "Custom Enterprise Questionnaires"],
          businessValue: "The single most requested document in B2B SaaS. Dramatically accelerates trust building with enterprise buyers.",
          readinessHint: "Most enterprises won't proceed without reviewing your SOC 2 report.",
        },
      },
      {
        id: "upload_iso_certificate",
        category: "evidence_uploads",
        title: "ISO 27001 Certificate",
        description: "Upload your ISO 27001 certification document.",
        priority: "CRITICAL",
        triggers: [
          {
            field: "complianceSignals",
            operator: "any_of",
            value: ["ISO27001", "ISO_27001"],
            scoreContribution: 0.6,
            description: "ISO 27001 compliance target detected",
          },
        ],
        estimatedEffort: "low",
        estimatedImpact: "critical",
        onboardingStage: "evidence_building",
        metadata: {
          documentIds: ["iso27001_cert"],
        },
        evidenceMetadata: {
          enterpriseCategory: "Compliance",
          maturityIndicator: "Global standard",
          supportedWorkflows: ["Global procurement", "Security assessments", "International audits"],
          supportedQuestionnaires: ["ISO 27001 specific assessments", "Global vendor reviews"],
          businessValue: "Essential for international enterprise sales. Demonstrates a globally recognized security management system.",
          readinessHint: "Required for many international and government contracts.",
        },
      },
      {
        id: "upload_subprocessor_list",
        category: "evidence_uploads",
        title: "Subprocessor List",
        description: "Document of third-party entities that process customer data.",
        priority: "HIGH",
        triggers: [
          {
            field: "operationalWorkflows",
            operator: "any_of",
            value: ["subprocessors", "vendors", "third_party_processing"],
            scoreContribution: 0.4,
            description: "Subprocessor usage detected",
          },
          {
            field: "complianceSignals",
            operator: "any_of",
            value: ["GDPR", "DPA"],
            scoreContribution: 0.3,
            description: "Privacy regulations require subprocessor disclosure",
          },
        ],
        estimatedEffort: "low",
        estimatedImpact: "high",
        onboardingStage: "evidence_building",
        metadata: {
          documentIds: ["subprocessor_list"],
        },
        evidenceMetadata: {
          enterpriseCategory: "Privacy",
          maturityIndicator: "Required for GDPR",
          supportedWorkflows: ["GDPR compliance", "Privacy reviews", "Vendor assessments"],
          supportedQuestionnaires: ["GDPR specific", "Vendor privacy"],
          businessValue: "Mandatory for GDPR compliance. Buyers want to know where their data goes.",
          readinessHint: "Can be extracted from your Privacy Policy or DPA.",
        },
      },

      // === WORKSPACE CONFIGURATION ===
      {
        id: "configure_review_cadence",
        category: "workspace_configuration",
        title: "Set Answer Review Cadence",
        description: "Configure how often approved answers should be reviewed.",
        priority: "MEDIUM",
        triggers: [
          {
            field: "complianceSignals",
            operator: "any_of",
            value: ["SOC2", "ISO27001", "GDPR"],
            scoreContribution: 0.3,
            description: "Compliance requires periodic review",
          },
          {
            field: "operationalWorkflows",
            operator: "any_of",
            value: ["security_reviews", "compliance_audits"],
            scoreContribution: 0.2,
            description: "Security workflows imply review needs",
          },
        ],
        estimatedEffort: "minimal",
        estimatedImpact: "medium",
        onboardingStage: "initial_setup",
        metadata: {
          configurationKeys: ["review_cadence_days", "auto_expiry"],
        },
      },
      {
        id: "configure_approval_workflow",
        category: "workspace_configuration",
        title: "Setup Answer Approval Workflow",
        description: "Define who can approve answers for export.",
        priority: "HIGH",
        triggers: [
          {
            field: "complianceSignals",
            operator: "not_empty",
            scoreContribution: 0.3,
            description: "Compliance posture requires governance",
          },
          {
            field: "internalRoles",
            operator: "any_of",
            value: ["security_team", "compliance_officer", "legal"],
            scoreContribution: 0.2,
            description: "Security/compliance roles detected",
          },
          {
            field: "customerSegment",
            operator: "any_of",
            value: ["b2b", "enterprise"],
            scoreContribution: 0.2,
            description: "Enterprise sales need approval workflows",
          },
        ],
        estimatedEffort: "low",
        estimatedImpact: "high",
        onboardingStage: "initial_setup",
        dependsOn: ["configure_review_cadence"],
        metadata: {
          configurationKeys: ["approver_roles", "approval_tiers"],
        },
      },

      // === QUESTIONNAIRE READINESS ===
      {
        id: "prep_security_questionnaire",
        category: "questionnaire_readiness",
        title: "Prepare for Security Questionnaires",
        description: "Ready your workspace for common security questionnaires.",
        priority: "HIGH",
        triggers: [
          {
            field: "customerSegment",
            operator: "any_of",
            value: ["b2b", "enterprise"],
            scoreContribution: 0.4,
            description: "B2B sales trigger security questionnaires",
          },
          {
            field: "productType",
            operator: "any_of",
            value: ["saas", "cloud"],
            scoreContribution: 0.3,
            description: "Cloud vendors face security questionnaires",
          },
        ],
        estimatedEffort: "medium",
        estimatedImpact: "high",
        onboardingStage: "questionnaire_prep",
        metadata: {
          questionnaireTypes: ["security", "vendor_assessment", "procurement"],
        },
      },
      {
        id: "prep_privacy_questionnaire",
        category: "questionnaire_readiness",
        title: "Prepare for Privacy Assessments",
        description: "Ready for GDPR, CCPA, and privacy impact assessments.",
        priority: "MEDIUM",
        triggers: [
          {
            field: "dataTypes",
            operator: "any_of",
            value: ["PII", "PHI", "personal_data"],
            scoreContribution: 0.4,
            description: "Personal data triggers privacy assessments",
          },
          {
            field: "complianceSignals",
            operator: "any_of",
            value: ["GDPR", "CCPA"],
            scoreContribution: 0.3,
            description: "Privacy laws require assessments",
          },
        ],
        estimatedEffort: "medium",
        estimatedImpact: "medium",
        onboardingStage: "questionnaire_prep",
        metadata: {
          questionnaireTypes: ["privacy", "dpia", "vendor_privacy"],
        },
      },

      // === TRUST CENTER READINESS ===
      {
        id: "publish_trust_page",
        category: "trust_center_readiness",
        title: "Publish Trust Center Page",
        description: "Create a public-facing trust and security page.",
        priority: "MEDIUM",
        triggers: [
          {
            field: "customerSegment",
            operator: "any_of",
            value: ["b2b", "enterprise"],
            scoreContribution: 0.3,
            description: "B2B buyers expect trust centers",
          },
          {
            field: "trustClaims",
            operator: "not_empty",
            scoreContribution: 0.3,
            description: "Trust claims should be public",
          },
          {
            field: "complianceSignals",
            operator: "not_empty",
            scoreContribution: 0.2,
            description: "Compliance certifications build trust",
          },
        ],
        estimatedEffort: "low",
        estimatedImpact: "medium",
        onboardingStage: "trust_center",
        metadata: {
          configurationKeys: ["trust_page_url", "public_compliance_badges"],
        },
      },
      {
        id: "setup_status_page",
        category: "trust_center_readiness",
        title: "Setup Public Status Page",
        description: "Transparent uptime and incident communication.",
        priority: "LOW",
        triggers: [
          {
            field: "productType",
            operator: "any_of",
            value: ["saas", "cloud"],
            scoreContribution: 0.3,
            description: "Cloud services need status pages",
          },
          {
            field: "customerSegment",
            operator: "any_of",
            value: ["b2b", "enterprise"],
            scoreContribution: 0.2,
            description: "Enterprise customers expect transparency",
          },
        ],
        estimatedEffort: "low",
        estimatedImpact: "low",
        onboardingStage: "trust_center",
        metadata: {
          configurationKeys: ["status_page_url"],
        },
      },

      // === GOVERNANCE MATURITY ===
      {
        id: "establish_document_ownership",
        category: "governance_maturity",
        title: "Assign Document Owners",
        description: "Define owners for each critical security document.",
        priority: "MEDIUM",
        triggers: [
          {
            field: "internalRoles",
            operator: "not_empty",
            scoreContribution: 0.3,
            description: "Roles enable document ownership",
          },
          {
            field: "complianceSignals",
            operator: "any_of",
            value: ["SOC2", "ISO27001"],
            scoreContribution: 0.2,
            description: "Compliance requires defined ownership",
          },
        ],
        estimatedEffort: "low",
        estimatedImpact: "medium",
        onboardingStage: "ongoing_governance",
        metadata: {
          workflowTypes: ["document_ownership", "version_control"],
        },
      },
      {
        id: "setup_audit_trail",
        category: "governance_maturity",
        title: "Enable Audit Trail Logging",
        description: "Track all changes to trust and compliance documents.",
        priority: "MEDIUM",
        triggers: [
          {
            field: "complianceSignals",
            operator: "any_of",
            value: ["SOC2", "ISO27001", "GDPR"],
            scoreContribution: 0.4,
            description: "Compliance frameworks require audit trails",
          },
          {
            field: "operationalWorkflows",
            operator: "any_of",
            value: ["security_reviews", "compliance_audits"],
            scoreContribution: 0.3,
            description: "Security workflows need audit trails",
          },
        ],
        estimatedEffort: "minimal",
        estimatedImpact: "medium",
        onboardingStage: "ongoing_governance",
        metadata: {
          workflowTypes: ["audit_logging", "change_tracking"],
        },
      },

      // === NEXT BEST ACTIONS ===
      {
        id: "quick_win_infosec",
        category: "next_best_actions",
        title: "Start with InfoSec Policy",
        description: "Quick win: Generate your InfoSec policy from website signals.",
        priority: "HIGH",
        triggers: [
          {
            field: "industry",
            operator: "not_empty",
            scoreContribution: 0.2,
            description: "Universal first step",
          },
        ],
        estimatedEffort: "low",
        estimatedImpact: "high",
        onboardingStage: "initial_setup",
        mutuallyExclusiveWith: ["upload_infosec_policy"],
        metadata: {
          documentIds: ["infosec_policy"],
        },
      },
      {
        id: "invite_security_team",
        category: "next_best_actions",
        title: "Invite Your Security Team",
        description: "Collaborate with security stakeholders on questionnaire responses.",
        priority: "MEDIUM",
        triggers: [
          {
            field: "internalRoles",
            operator: "any_of",
            value: ["security_team", "compliance_officer"],
            scoreContribution: 0.3,
            description: "Security roles detected - invite them",
          },
          {
            field: "customerSegment",
            operator: "any_of",
            value: ["b2b", "enterprise"],
            scoreContribution: 0.2,
            description: "B2B sales need security expertise",
          },
        ],
        estimatedEffort: "minimal",
        estimatedImpact: "medium",
        onboardingStage: "initial_setup",
      },
    ];
  }

  /**
   * Filter templates based on config
   */
  private filterTemplates(templates: RecommendationTemplate[]): RecommendationTemplate[] {
    let filtered = templates;

    // Filter by categories
    if (this.config.includeCategories.length > 0) {
      filtered = filtered.filter(t => this.config.includeCategories.includes(t.category));
    }

    // Filter by stages
    if (this.config.includeStages.length > 0) {
      filtered = filtered.filter(t => this.config.includeStages.includes(t.onboardingStage));
    }

    // Filter by priority (exclude optional if configured)
    if (!this.config.includeOptional) {
      filtered = filtered.filter(t => t.priority !== "OPTIONAL");
    }

    return filtered;
  }

  /**
   * Apply deduplication with merging of supporting signals and citations
   */
  private deduplicateAndMerge(recommendations: Recommendation[]): Recommendation[] {
    const buckets = new Map<string, Recommendation[]>();
    for (const rec of recommendations) {
      const fingerprint = this.getRecommendationFingerprint(rec);
      if (!buckets.has(fingerprint)) {
        buckets.set(fingerprint, []);
      }
      buckets.get(fingerprint)!.push(rec);
    }

    const deduplicated: Recommendation[] = [];
    for (const [_, bucket] of buckets) {
      if (bucket.length === 1) {
        deduplicated.push(bucket[0]);
      } else {
        // Merge recommendations with same fingerprint
        const merged = this.mergeRecommendations(bucket);
        deduplicated.push(merged);
      }
    }

    // Secondary pass to merge by ID if titles differ slightly but ID is identical
    const idBuckets = new Map<string, Recommendation[]>();
    for (const rec of deduplicated) {
      if (!idBuckets.has(rec.id)) {
        idBuckets.set(rec.id, []);
      }
      idBuckets.get(rec.id)!.push(rec);
    }

    const finalDeduplicated: Recommendation[] = [];
    for (const [_, bucket] of idBuckets) {
      if (bucket.length === 1) {
        finalDeduplicated.push(bucket[0]);
      } else {
        finalDeduplicated.push(this.mergeRecommendations(bucket));
      }
    }

    // Apply mutual exclusivity rules
    const excluded = new Set<string>();
    const sorted = finalDeduplicated.slice().sort((a, b) => b.score - a.score);
    return sorted.filter(rec => {
      if (excluded.has(rec.id)) return false;
      if (rec.mutuallyExclusiveWith) {
        for (const id of rec.mutuallyExclusiveWith) excluded.add(id);
      }
      return true;
    });
  }

  /**
   * Merge multiple recommendations with the same fingerprint or ID
   */
  private mergeRecommendations(recommendations: Recommendation[]): Recommendation {
    // Sort by score to find the best one
    const sorted = [...recommendations].sort((a, b) => b.score - a.score);
    const best = sorted[0];
    
    // Merge supporting signals and citations
    const allSupportingSignals: SupportingSignal[] = [];
    const allCitations: SignalCitation[] = [];
    const mergedFromIds: string[] = (best.mergedFromIds || []).slice();
    
    for (const rec of sorted) {
      allSupportingSignals.push(...rec.supportingSignals);
      allCitations.push(...rec.citations);
      if (rec.id !== best.id && !mergedFromIds.includes(rec.id)) {
        mergedFromIds.push(rec.id);
      }
    }
    
    // Deduplicate supporting signals by field and value
    const uniqueSignals = Array.from(
      new Map(allSupportingSignals.map(s => [`${s.field}::${JSON.stringify(s.value)}`, s])).values()
    );

    // Deduplicate citations by URL
    const uniqueCitations = Array.from(
      new Map(allCitations.map(c => [c.pageUrl, c])).values()
    );
    
    // Combine reasons
    const combinedReason = this.combineRecommendationReasons(sorted);
    
    // Return merged recommendation
    return {
      ...best,
      supportingSignals: uniqueSignals,
      citations: uniqueCitations,
      recommendationReason: combinedReason,
      isMerged: recommendations.length > 1 || best.isMerged,
      mergedFromIds: mergedFromIds.length > 0 ? mergedFromIds : undefined,
    };
  }

  /**
   * Combine recommendation reasons from multiple recommendations
   */
  private combineRecommendationReasons(recommendations: Recommendation[]): string {
    const reasons = recommendations
      .map(r => r.recommendationReason)
      .filter(reason => reason && reason.trim() !== "");
    
    if (reasons.length === 0) {
      return "Multiple signals indicate this recommendation is relevant.";
    }
    
    if (reasons.length === 1) {
      return reasons[0];
    }
    
    // Take the first 2-3 unique reasons
    const uniqueReasons = Array.from(new Set(reasons)).slice(0, 3);
    return uniqueReasons.join("; ");
  }

  private getRecommendationFingerprint(recommendation: Recommendation): string {
    const metadata = recommendation.metadata ?? {};
    const metadataKeys = ["topicKeys", "documentIds", "configurationKeys", "questionnaireTypes", "workflowTypes"]
      .flatMap(key => Array.isArray(metadata[key]) ? (metadata[key] as string[]) : [])
      .sort()
      .join("|");

    return [
      recommendation.category,
      recommendation.onboardingStage,
      recommendation.title.trim().toLowerCase(),
      metadataKeys,
    ].join("::");
  }

  private stableRank(recommendations: Recommendation[]): Recommendation[] {
    const priorityRank: Record<Recommendation["priority"], number> = {
      CRITICAL: 5,
      HIGH: 4,
      MEDIUM: 3,
      LOW: 2,
      OPTIONAL: 1,
    };

    return [...recommendations].sort((a, b) => {
      if (priorityRank[b.priority] !== priorityRank[a.priority]) {
        return priorityRank[b.priority] - priorityRank[a.priority];
      }
      if (b.score !== a.score) return b.score - a.score;
      if (b.confidence !== a.confidence) return b.confidence - a.confidence;
      if (b.citations.length !== a.citations.length) return b.citations.length - a.citations.length;
      if (STAGE_RANK[a.onboardingStage] !== STAGE_RANK[b.onboardingStage]) {
        return STAGE_RANK[a.onboardingStage] - STAGE_RANK[b.onboardingStage];
      }
      return a.id.localeCompare(b.id);
    });
  }

  private createActionFromRecommendation(
    recommendation: Recommendation,
    actionType: NextBestActionType,
    routeOrIntent: string,
    title: string,
    description: string,
    actionLabel: string,
  ): NextBestAction {
    return {
      id: `action_${actionType}_${recommendation.id}`,
      title,
      description,
      actionLabel,
      actionType,
      routeOrIntent,
      priority: recommendation.priority,
      reason: recommendation.recommendationReason,
      linkedRecommendationIds: [recommendation.id],
    };
  }

  private nextBestActions(
    recommendations: Recommendation[],
    options: {
      tailoringConfidence?: number;
      evidenceQuality?: number;
      hasUploadedDocuments?: boolean;
      hasQuestionnaire?: boolean;
      profileConfirmed?: boolean;
      availableActions?: string[];
      selectedTrustProfileFields?: string[];
    },
  ): NextBestAction[] {
    const available = new Set(options.availableActions ?? [...DEFAULT_AVAILABLE_ACTION_INTENTS]);
    const actions: NextBestAction[] = [];

    const addAction = (action: NextBestAction) => {
      if (!available.has(action.routeOrIntent)) return;
      const existing = actions.find(a => a.actionType === action.actionType && a.routeOrIntent === action.routeOrIntent);
      if (existing) {
        existing.linkedRecommendationIds = Array.from(new Set([...existing.linkedRecommendationIds, ...action.linkedRecommendationIds]));
        return;
      }
      actions.push(action);
    };

    if ((options.evidenceQuality ?? 0.5) < 0.45 || (options.tailoringConfidence ?? 0.5) < 0.45) {
      addAction({
        id: "action_manual_profile_review",
        title: "Review Trust Profile Signals",
        description: "Evidence is currently limited. Review and confirm key profile fields before proceeding.",
        actionLabel: "Review profile",
        actionType: "manual_profile_review",
        routeOrIntent: "onboarding.profile.review",
        priority: "HIGH",
        reason: "Weak evidence quality or confidence detected.",
        linkedRecommendationIds: recommendations.filter(r => r.needsReview).map(r => r.id),
      });
    }

    for (const rec of recommendations) {
      if (rec.category === "evidence_uploads" && rec.metadata?.documentIds?.length) {
        const doc = rec.metadata.documentIds[0];
        addAction(this.createActionFromRecommendation(
          rec,
          "upload_document",
          "onboarding.documents.upload",
          `Upload ${doc.toUpperCase().replaceAll("_", " ")}`,
          rec.description,
          `Upload ${doc.toUpperCase().replaceAll("_", " ")}`,
        ));
      } else if (rec.category === "trust_topics") {
        addAction(this.createActionFromRecommendation(
          rec,
          "review_topics",
          "onboarding.topics.review",
          "Review Recommended Trust Topics",
          "Confirm which trust topics should be prioritized in your answer library.",
          "Review topics",
        ));
      } else if (rec.id === "invite_security_team" || rec.id === "configure_approval_workflow") {
        addAction(this.createActionFromRecommendation(
          rec,
          "invite_reviewer",
          "onboarding.reviewers.invite",
          "Invite Security Reviewer",
          "Add a reviewer before exporting approved security and compliance answers.",
          "Invite reviewer",
        ));
      } else if (rec.category === "workspace_configuration") {
        addAction(this.createActionFromRecommendation(
          rec,
          "configure_workspace",
          "onboarding.workspace.configure",
          "Configure Workspace Governance",
          "Set approvals and governance controls for trusted answer workflows.",
          "Configure workspace",
        ));
      }
    }

    if (options.hasUploadedDocuments === false) {
      const linked = recommendations.filter(r => r.category === "evidence_uploads").map(r => r.id);
      addAction({
        id: "action_upload_document_priority",
        title: "Upload Your First Compliance Document",
        description: "Start by uploading core trust evidence to improve answer quality and procurement readiness.",
        actionLabel: "Upload document",
        actionType: "upload_document",
        routeOrIntent: "onboarding.documents.upload",
        priority: "CRITICAL",
        reason: "No uploaded documents detected.",
        linkedRecommendationIds: linked,
      });
    }

    if (options.profileConfirmed && options.hasQuestionnaire === false) {
      addAction({
        id: "action_import_questionnaire",
        title: "Import Your First Questionnaire",
        description: "Start generating evidence-backed answers from your confirmed Trust Profile and source documents.",
        actionLabel: "Import questionnaire",
        actionType: "import_questionnaire",
        routeOrIntent: "onboarding.questionnaires.import",
        priority: "HIGH",
        reason: "Profile is confirmed and no questionnaire has been imported yet.",
        linkedRecommendationIds: recommendations
          .filter(r => r.category === "questionnaire_readiness")
          .map(r => r.id),
      });
    }

    const prioritized = actions.sort((a, b) => {
      const rank: Record<Recommendation["priority"], number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1, OPTIONAL: 0 };
      if (rank[b.priority] !== rank[a.priority]) return rank[b.priority] - rank[a.priority];
      return a.id.localeCompare(b.id);
    });

    const fallbackActions: NextBestAction[] = [
      {
        id: "action_continue_setup_fallback",
        title: "Continue Onboarding Setup",
        description: "Complete the next setup steps to strengthen your trust readiness foundation.",
        actionLabel: "Continue setup",
        actionType: "continue_setup",
        routeOrIntent: "onboarding.setup.continue",
        priority: "MEDIUM",
        reason: "Keeps onboarding progress moving with currently available evidence.",
        linkedRecommendationIds: recommendations.slice(0, 2).map(r => r.id),
      },
      {
        id: "action_review_topics_fallback",
        title: "Review Trust Topics",
        description: "Review topic coverage to align your answer library with customer trust expectations.",
        actionLabel: "Review topics",
        actionType: "review_topics",
        routeOrIntent: "onboarding.topics.review",
        priority: "MEDIUM",
        reason: "Improves relevance of future questionnaire answers.",
        linkedRecommendationIds: recommendations.filter(r => r.category === "trust_topics").map(r => r.id),
      },
    ];
    for (const fallback of fallbackActions) {
      if (prioritized.length >= 3) break;
      if (!available.has(fallback.routeOrIntent)) continue;
      const exists = prioritized.some(a => `${a.actionType}:${a.routeOrIntent}` === `${fallback.actionType}:${fallback.routeOrIntent}`);
      if (!exists) prioritized.push(fallback);
    }

    const minimum = Math.min(3, prioritized.length);
    const target = Math.max(minimum, Math.min(5, prioritized.length));
    return prioritized.slice(0, target);
  }

  /**
   * Handle dependencies - ensure dependencies come first
   */
  private orderByDependencies(recommendations: Recommendation[]): Recommendation[] {
    const recMap = new Map(recommendations.map(r => [r.id, r]));
    const ordered: Recommendation[] = [];
    const visited = new Set<string>();

    const visit = (rec: Recommendation) => {
      if (visited.has(rec.id)) return;

      // Visit dependencies first
      if (rec.dependsOn) {
        for (const depId of rec.dependsOn) {
          const dep = recMap.get(depId);
          if (dep) visit(dep);
        }
      }

      visited.add(rec.id);
      ordered.push(rec);
    };

    for (const rec of recommendations) {
      visit(rec);
    }

    return ordered;
  }

  /**
   * Generate recommendations for a company profile
   */
  orchestrate(
    profile: CompanyProfile,
    options: {
      currentStage?: OnboardingStage;
      groundedSignalCount?: number;
      evidenceQuality?: number;
      profileConfirmed?: boolean;
      hasQuestionnaire?: boolean;
      hasUploadedDocuments?: boolean;
      selectedTrustProfileFields?: string[];
      availableActions?: string[];
      evidenceExceptions?: Record<string, {
        status: "unavailable" | "not_applicable";
        reason: string;
        note?: string;
      }>;
    } = {},
  ): RecommendationOrchestrationResult {
    const {
      currentStage = "initial_setup",
      groundedSignalCount = 0,
      evidenceQuality = 0.5,
    } = options;

    // 1. Build scoring context
    const context = buildScoringContext(
      profile,
      currentStage,
      groundedSignalCount,
      evidenceQuality,
    );

    // 2. Filter templates
    const filteredTemplates = this.filterTemplates(this.templates);

    // 3. Score all recommendations from templates
    const scored = TrustRecommendationScorer.scoreRecommendations(
      filteredTemplates,
      context,
    );

    // 3.5 Add dynamic risk-driven recommendations
    const riskRecommendations = this.generateRiskDrivenRecommendations(profile);
    
    // 4. Merge and keep only evidence-backed or high-confidence risk recommendations
    const combined = [...scored, ...riskRecommendations];
    const evidenceBackedOrRisk = combined.filter(r => 
      r.supportingSignals.length > 0 || r.id.startsWith('topic_') || r.id.startsWith('risk_topic_')
    );
    const aboveThreshold = evidenceBackedOrRisk.filter(r => r.score >= this.config.minScoreThreshold);

    // 5. Deduplicate (prioritize risk-driven ones if overlap exists)
    const deduplicated = this.deduplicateAndMerge(aboveThreshold);

    // 6. Order by dependencies
    const ordered = this.orderByDependencies(deduplicated);

    // 7. Stable ranking
    const ranked = this.stableRank(ordered);

    // 8. Take top N
    const finalRecommendations = ranked.slice(0, this.config.maxRecommendations);

    // 8. Group by category
    const byCategory: Record<RecommendationCategory, Recommendation[]> = {
      trust_topics: [],
      evidence_uploads: [],
      workspace_configuration: [],
      questionnaire_readiness: [],
      trust_center_readiness: [],
      governance_maturity: [],
      next_best_actions: [],
    };

    for (const rec of finalRecommendations) {
      byCategory[rec.category].push(rec);
    }

    // 9. Group by stage
    const byStage: Record<OnboardingStage, Recommendation[]> = {
      initial_setup: [],
      profile_review: [],
      evidence_building: [],
      library_seeding: [],
      questionnaire_prep: [],
      trust_center: [],
      ongoing_governance: [],
    };

    for (const rec of finalRecommendations) {
      byStage[rec.onboardingStage].push(rec);
    }

    // 10. Calculate metadata
    const allSignalFields = Object.keys(context.signals);
    const metadata = {
      totalGenerated: scored.length,
      afterDeduplication: deduplicated.length,
      suppressed: scored.length - deduplicated.length,
      averageConfidence: finalRecommendations.length > 0
        ? finalRecommendations.reduce((sum, r) => sum + r.confidence, 0) / finalRecommendations.length
        : 0,
      signalsUtilized: allSignalFields,
      generatedAt: new Date(),
    };

    const nextBestActions = this.nextBestActions(finalRecommendations, {
      tailoringConfidence: profile.tailoringConfidence,
      evidenceQuality,
      profileConfirmed: options.profileConfirmed ?? true,
      hasQuestionnaire: options.hasQuestionnaire ?? false,
      hasUploadedDocuments: options.hasUploadedDocuments ?? false,
      selectedTrustProfileFields: options.selectedTrustProfileFields,
      availableActions: options.availableActions,
    });
    // Map recommendations to TrustTopicRecommendation for the foundation builder
    const trustTopics: TrustTopicRecommendation[] = finalRecommendations
      .filter(r => r.category === "trust_topics")
      .map(r => ({
        id: r.id,
        key: r.metadata?.topicKeys?.[0] || r.id.replace('topic_', '').replace('risk_topic_', ''),
        title: r.title,
        description: r.description,
        priority: (r.priority === "OPTIONAL" ? "LOW" : r.priority) as any,
        topicKeys: (r.metadata?.topicKeys || []) as string[],
        confidence: r.confidence,
        status: (r.metadata?.status || (r.confidence >= 0.85 ? "auto_ready" : "review_suggested")) as any,
        triggeredBy: r.supportingSignals.map(s => s.field),
        rationale: r.recommendationReason,
        evidenceRefs: r.citations.map(c => ({
          url: c.sourceUrl,
          title: "Evidence",
          snippet: c.snippet || "",
          confidence: r.confidence,
        })),
        answerScaffoldAreas: (r.metadata?.answerScaffoldAreas || []) as string[],
        evidenceNeeds: (r.metadata?.evidenceNeeds || []) as string[],
      }));

    const scaffolds = AnswerScaffoldEngine.generateScaffolds(trustTopics);
    const evidenceNeeds = finalRecommendations
      .filter(r => r.category === "evidence_uploads")
      .map(r => ({
        type: r.title,
        reason: r.recommendationReason,
        suggestedSources: r.citations.map(c => c.sourceUrl),
      }));
    const tasks = ClarificationTaskEngine.generateTasks(profile);

    const riskAreas = profile.procurementRiskAreas?.value || [];
    const riskCount = riskAreas.length;

    console.log(`[RecommendationOrchestrator] Orchestrate Start`, {
      riskCount,
      groundedSignalCount,
      evidenceQuality
    });


    if (riskCount > 0) {
      riskAreas.forEach(r => {
        if (r && typeof r === 'object') {
          console.log(`[RecommendationOrchestrator] Found Risk: ${r.key}`, {
            label: r.label,
            topicKeys: r.recommendedTopicKeys,
            confidence: r.confidence
          });
        } else {
          console.log(`[RecommendationOrchestrator] Found Non-Object Risk:`, r);
        }
      });
    }


    const foundation = FoundationBuilder.build({
      riskAreas: riskAreas,
      capabilities: (profile.structuredCapabilities?.value || []).map(c => ({
        key: c.key,
        label: c.label,
        confidence: c.confidence,
        evidenceRefs: c.sourceUrl ? [{ url: c.sourceUrl, title: c.label, snippet: c.snippet || "", confidence: c.confidence }] : []
      })),
      operationalModel: profile.dataInteractionModel?.value || {} as any,
      evidenceRefs: [], 
      citations: finalRecommendations.flatMap(r => r.citations),
      sourcePages: profile.pagesScanned || [],
      existingGeneratedTopics: trustTopics,
      clarificationTasks: tasks,
      evidenceNeeds,
      answerScaffolds: scaffolds,
      evidenceExceptions: options.evidenceExceptions,
    });

    console.log(`[RecommendationOrchestrator] Foundation Built`, {
      topicsCount: foundation.totalRelevantTopicsCount,
      pillarsCount: foundation.securityPillarsIdentifiedCount,
      warnings: foundation.warnings
    });


    const summary = {
      total: finalRecommendations.length,
      highPriorityCount: finalRecommendations.filter(r => r.priority === "CRITICAL" || r.priority === "HIGH").length,
      evidenceBackedCount: finalRecommendations.filter(r => r.citations.length > 0).length,
      needsReviewCount: finalRecommendations.filter(r => r.needsReview).length,
      categoriesCovered: Array.from(new Set(finalRecommendations.map(r => r.category))),
      foundation,
    };

    return {
      recommendations: finalRecommendations,
      byCategory,
      byStage,
      topRecommendations: finalRecommendations.slice(0, 5),
      nextBestActions,
      summary,
      metadata,
    };
  }

  /**
   * Static helper for simple orchestration
   */
  static orchestrate(
    profile: CompanyProfile,
    options?: {
      currentStage?: OnboardingStage;
      groundedSignalCount?: number;
      evidenceQuality?: number;
      profileConfirmed?: boolean;
      hasQuestionnaire?: boolean;
      hasUploadedDocuments?: boolean;
      selectedTrustProfileFields?: string[];
      availableActions?: string[];
      config?: Partial<OrchestratorConfig>;
      evidenceExceptions?: Record<string, {
        status: "unavailable" | "not_applicable";
        reason: string;
        note?: string;
      }>;
    },
  ): RecommendationOrchestrationResult {
    const orchestrator = new RecommendationOrchestrator(options?.config);
    return orchestrator.orchestrate(profile, options);
  }

  /**
   * Universal static method to generate and return recommendations for a workspace.
   */
  static async generateRecommendations(workspaceId: string, userId: string): Promise<Recommendation[]> {
    const { prisma } = await import("@/lib/db/prisma");
    const { CompanyProfileService } = await import("@/modules/workspaces/company-profile-service");
    
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
    });

    if (!workspace) {
      throw new Error(`Workspace not found: ${workspaceId}`);
    }

    const companyProfile = CompanyProfileService.build({
      id: workspace.id,
      name: workspace.name,
      industry: workspace.industry,
      productType: workspace.productType,
      customerSegment: workspace.customerSegment,
      dataTypes: workspace.dataTypes,
      complianceTargets: workspace.complianceTargets,
      deepProfileJson: workspace.deepProfileJson,
    });

    const currentMetadata = (workspace.onboardingIntelMetaJson as any) || {};
    const evidenceExceptions = currentMetadata.evidenceExceptions || {};

    const orchestrator = new RecommendationOrchestrator();
    const orchestrationResult = orchestrator.orchestrate(companyProfile, {
      currentStage: "library_seeding",
      groundedSignalCount: companyProfile.tailoringConfidence > 0.5 ? 4 : 2,
      evidenceQuality: companyProfile.tailoringConfidence,
      evidenceExceptions,
    });

    return orchestrationResult.recommendations;
  }

  /**
   * Dynamically generate recommendations from inferred risk areas and signal ontology
   */
  private generateRiskDrivenRecommendations(profile: CompanyProfile): Recommendation[] {
    const inferredTopics = TopicInferenceEngine.inferTopics(profile as any);
    const recommendations: Recommendation[] = [];

    for (const topic of inferredTopics) {
      recommendations.push({
        id: topic.id,
        category: "trust_topics",
        title: topic.title,
        description: topic.description,
        priority: topic.priority,
        confidence: topic.confidence,
        score: topic.confidence * 100,
        onboardingStage: "library_seeding",
        recommendationReason: topic.rationale,
        supportingSignals: topic.triggeredBy.map(s => ({
          field: "procurementRiskAreas",
          value: s,
          confidence: topic.confidence,
          category: "DERIVED",
        })),
        citations: topic.evidenceRefs.map(c => ({
          sourceUrl: c.url,
          snippet: c.snippet,
        })),
        estimatedEffort: "medium",
        estimatedImpact: topic.priority === "CRITICAL" ? "critical" : (topic.priority === "HIGH" ? "high" : "medium"),
        needsReview: topic.status !== "auto_ready",
        metadata: {
          topicKeys: topic.topicKeys,
          status: topic.status,
          answerScaffoldAreas: topic.answerScaffoldAreas,
          evidenceNeeds: topic.evidenceNeeds,
        },
      });
    }

    return recommendations;
  }
}

export { buildScoringContext };
export type { RecommendationTemplate };
