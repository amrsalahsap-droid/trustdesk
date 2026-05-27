import { 
  VendorIntelligenceProfile, 
  EvidenceRef, 
  SignalValue, 
  InferredBooleanSignal, 
  ProductLine, 
  ServiceLine, 
  CapabilitySignal, 
  UseCaseSignal, 
  ProcurementRiskArea, 
  ComplianceSignal,
  TrustTopicRecommendation,
  EvidenceNeed,
  ClarificationTask,
  AnswerScaffoldArea,
  SourceCoverage,
  WorkspaceFoundationResult
} from "./vendor-intelligence-types";
import { DeepInferredProfile, Signal, Capability, ProcurementRiskArea as InternalProcurementRiskArea } from "./onboarding-core-types";
import { SignalCitation } from "./evidence";
import { CAPABILITY_REGISTRY } from "./capability-registry";

export function mapToVendorIntelligenceProfile(
  profile: DeepInferredProfile,
  domain: string,
  sourceCoverage: SourceCoverage,
  foundation?: WorkspaceFoundationResult,
  productGraph?: any,
  blastRadius?: any
): VendorIntelligenceProfile {
  
  const mapCitationsToEvidenceRefs = (citations?: SignalCitation[]): EvidenceRef[] => {
    return (citations || []).map(c => ({
      url: c.pageUrl,
      title: c.pageTitle || "Evidence Page",
      snippet: c.excerpt || "",
      confidence: 0.8, // Default if not provided
    }));
  };

  const mapSignalToValue = (signal?: Signal<string | string[]>): SignalValue[] => {
    if (!signal) return [];
    const values = Array.isArray(signal.value) ? signal.value : [signal.value];
    return values.filter(v => !!v).map(v => ({
      value: v,
      confidence: signal.confidence,
      evidenceRefs: mapCitationsToEvidenceRefs(signal.citations),
    }));
  };

  const mapToInferredBoolean = (val: boolean, confidence: number, citations?: SignalCitation[]): InferredBooleanSignal => ({
    value: val,
    confidence,
    evidenceRefs: mapCitationsToEvidenceRefs(citations),
  });

  const dataInteraction = profile.dataInteractionModel?.value || {
    accessesCustomerData: false,
    processesSensitiveData: false,
    storesCustomerData: false,
    scansInfrastructure: false,
    integratesWithCloudProviders: false,
    usesAIOnCustomerData: false,
    handlesPayments: false,
    handlesPII: false,
  };

  return {
    organizationSummary: {
      name: profile.companyName,
      domain: domain,
      shortDescription: profile.businessModel?.value,
      confidence: profile.tailoringConfidence,
      evidenceRefs: mapCitationsToEvidenceRefs(profile.businessModel?.citations),
    },

    businessModel: {
      primaryIndustry: profile.industry?.value,
      businessDomain: profile.businessDomain?.value,
      solutionCategories: mapSignalToValue(profile.solutionCategories),
      customerSegments: mapSignalToValue(profile.customerSegment as any),
      userTypes: mapSignalToValue(profile.userTypes),
      buyerTypes: mapSignalToValue(profile.customerRoles as any),
    },

    productsAndServices: {
      productLines: (profile.productLines?.value || []).map(p => ({
        name: p,
        confidence: profile.productLines?.confidence || 0.5,
        evidenceRefs: mapCitationsToEvidenceRefs(profile.productLines?.citations),
      })),
      serviceLines: [], // Currently not explicitly tracked
      capabilities: (profile.structuredCapabilities?.value || []).map(c => ({
        key: c.key,
        label: c.label,
        confidence: c.confidence,
        evidenceRefs: [{
          url: c.sourceUrl,
          title: "Product Evidence",
          snippet: c.snippet,
          confidence: c.confidence,
        }],
        procurementImplications: c.procurementImplications,
      })),
      useCases: (profile.useCases?.value || []).map(u => ({
        name: u,
        confidence: profile.useCases?.confidence || 0.5,
        evidenceRefs: mapCitationsToEvidenceRefs(profile.useCases?.citations),
      })),
    },

    deploymentAndIntegrationModel: {
      deploymentModes: mapSignalToValue(profile.productType as any),
      deploymentComponents: mapSignalToValue(profile.deploymentComponents),
      integrations: (profile.structuredCapabilities?.value || [])
        .filter(c => c.key === "api_integration" || c.key === "cloud_connector")
        .map(c => ({
          value: c.label,
          confidence: c.confidence,
          evidenceRefs: [{
            url: c.sourceUrl,
            title: "Integration Evidence",
            snippet: c.snippet,
            confidence: c.confidence,
          }],
        })),
      connectorTypes: (profile.structuredCapabilities?.value || [])
        .filter(c => c.key === "cloud_connector" || c.key === "database_access")
        .map(c => ({
          value: c.label,
          confidence: c.confidence,
          evidenceRefs: [{
            url: c.sourceUrl,
            title: "Connector Evidence",
            snippet: c.snippet,
            confidence: c.confidence,
          }],
        })),
      apiExposure: (profile.structuredCapabilities?.value || [])
        .filter(c => c.key === "api_integration")
        .map(c => ({
          value: "External API Surface",
          confidence: c.confidence,
          evidenceRefs: [{
            url: c.sourceUrl,
            title: "API Evidence",
            snippet: c.snippet,
            confidence: c.confidence,
          }],
        })),
    },

    dataInteractionModel: {
      accessesCustomerData: mapToInferredBoolean(dataInteraction.accessesCustomerData, profile.dataInteractionModel?.confidence || 0.5, profile.dataInteractionModel?.citations),
      processesSensitiveData: mapToInferredBoolean(dataInteraction.processesSensitiveData, profile.dataInteractionModel?.confidence || 0.5, profile.dataInteractionModel?.citations),
      storesCustomerData: mapToInferredBoolean(dataInteraction.storesCustomerData, profile.dataInteractionModel?.confidence || 0.5, profile.dataInteractionModel?.citations),
      handlesPII: mapToInferredBoolean(dataInteraction.handlesPII, profile.dataInteractionModel?.confidence || 0.5, profile.dataInteractionModel?.citations),
      handlesFinancialData: mapToInferredBoolean(dataInteraction.handlesPayments, profile.dataInteractionModel?.confidence || 0.5, profile.dataInteractionModel?.citations),
      handlesHealthData: mapToInferredBoolean(false, 0, []), // Infer from PHI if needed
      handlesCredentials: mapToInferredBoolean(false, 0, []),
      usesAIOnCustomerData: mapToInferredBoolean(dataInteraction.usesAIOnCustomerData, profile.dataInteractionModel?.confidence || 0.5, profile.dataInteractionModel?.citations),
      scansInfrastructure: mapToInferredBoolean(dataInteraction.scansInfrastructure, profile.dataInteractionModel?.confidence || 0.5, profile.dataInteractionModel?.citations),
      handlesPayments: mapToInferredBoolean(dataInteraction.handlesPayments, profile.dataInteractionModel?.confidence || 0.5, profile.dataInteractionModel?.citations),
    },

    securityAndTrustModel: {
      securityCapabilities: (profile.structuredCapabilities?.value || [])
        .filter(c => {
          const def = CAPABILITY_REGISTRY.find(d => d.key === c.key);
          return def?.domain === "data_security" || def?.domain === "security_tooling";
        })
        .map(c => ({
          key: c.key,
          label: c.label,
          confidence: c.confidence,
          evidenceRefs: [{
            url: c.sourceUrl,
            title: "Security Evidence",
            snippet: c.snippet,
            confidence: c.confidence,
          }],
          procurementImplications: c.procurementImplications,
        })),
      procurementRiskAreas: (profile.procurementRiskAreas?.value || []).map(r => ({
        key: r.key,
        label: r.label,
        reason: r.reason,
        confidence: r.confidence,
        severity: r.severity,
        triggeringSignals: r.triggeringSignals,
        evidenceRefs: r.evidenceRefs.map(url => ({ url, title: "Evidence", snippet: "", confidence: r.confidence })),
        recommendedTopicKeys: r.recommendedTopicKeys,
        recommendedEvidenceNeeds: r.recommendedEvidenceNeeds,
        clarificationTasks: r.clarificationTasks,
        evidenceStrength: r.evidenceStrength,
        status: r.status,
      })),
      privacyPostureSignals: mapSignalToValue(profile.privacyPostureSignals),
      vendorCertifications: (profile.vendorCertifications?.value || []).map(f => ({
        framework: f,
        status: "claimed", 
        confidence: profile.vendorCertifications?.confidence || 0.5,
        evidenceRefs: mapCitationsToEvidenceRefs(profile.vendorCertifications?.citations),
      })),
      productSupportedFrameworks: (profile.productSupportedFrameworks?.value || []).map(f => ({
        framework: f,
        status: "aligned", 
        confidence: profile.productSupportedFrameworks?.confidence || 0.5,
        evidenceRefs: mapCitationsToEvidenceRefs(profile.productSupportedFrameworks?.citations),
      })),
    },

    workspacePreparation: {
      recommendedTrustTopics: foundation?.generatedTopics ?? [],
      evidenceNeeds: foundation?.evidenceNeeds ?? [],
      clarificationTasks: foundation?.clarificationTasks ?? [],
      answerScaffoldAreas: foundation?.answerScaffolds ?? [],
      workspaceFoundation: foundation ?? createEmptyWorkspaceFoundationResult("Workspace foundation was not generated during analysis."),
    },

    diagnostics: {
      confidenceSummary: `Confidence: ${(profile.tailoringConfidence * 100).toFixed(0)}%`,
      missingEvidence: [],
      assumptions: [],
      sourceCoverage: sourceCoverage,
      warnings: [],
      notes: [],
    },
    productGraph,
    blastRadius,
  };
}

export function createEmptyWorkspaceFoundationResult(reason: string): WorkspaceFoundationResult {
  return {
    securityPillarsIdentifiedCount: 0,
    autoReadyTopicsCount: 0,
    reviewSuggestedTopicsCount: 0,
    needsEvidenceTopicsCount: 0,
    totalRelevantTopicsCount: 0,
    totalPillarsCount: 0,
    evidenceNeedsCount: 0,
    clarificationTasksCount: 0,
    answerScaffoldsReadyCount: 0,
    capabilityEvidenceCount: 0,
    sourcePagesCount: 0,
    citationsCount: 0,
    generatedTopics: [],
    pillars: [],
    evidenceNeeds: [],
    resolvedEvidenceNeeds: [],
    resolvedEvidenceNeedsCount: 0,
    clarificationTasks: [],
    operationalWorkflows: [],
    answerScaffolds: [],
    generatedTopicKeys: [],
    reviewSuggestedTopicKeys: [],
    needsEvidenceTopicKeys: [],
    generatedEvidenceNeedKeys: [],
    generatedClarificationTaskKeys: [],
    sourceRiskAreaKeys: [],
    sourceCapabilityKeys: [],
    sourceEvidenceRefs: [],
    warnings: [reason]
  };
}
