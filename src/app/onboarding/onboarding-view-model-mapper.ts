
import { 
  VendorIntelligenceProfile, 
  WorkspaceFoundationResult, 
  OnboardingReadinessViewModel,
  SecurityRiskAreaView,
  CapabilityView,
  OperationalSignalView,
  EvidenceExplorerView,
  OperationalProfileView
} from "@/modules/workspaces/onboarding/vendor-intelligence-types";

export function mapToReadinessViewModel(
  intelligenceProfile: VendorIntelligenceProfile | null,
  currentFoundation: WorkspaceFoundationResult | null,
  aggregateConfidence: number,
  analyzedSignals: any
): OnboardingReadinessViewModel | null {
  if (!currentFoundation) return null;

  return {
    foundation: currentFoundation,
    riskAreas: (intelligenceProfile?.securityAndTrustModel?.procurementRiskAreas || []).map(r => {
      // Build related governance tasks from clarification tasks
      const relatedGovernanceTasks = (r.clarificationTasks || []).map((taskId: string) => {
        const task = currentFoundation?.clarificationTasks?.find(t => t.id === taskId || t.canonicalKey === taskId);
        return task?.title || taskId;
      }).filter(Boolean);

      // Build triggering capabilities from triggering signals
      const triggeringCapabilities = (r.triggeringSignals || []).filter((s: string) => 
        !s.includes("_risk") && !s.includes("_workflow")
      );

      // Build triggering workflows from triggering signals
      const triggeringWorkflows = (r.triggeringSignals || []).filter((s: string) => 
        s.includes("_workflow") || s.includes("scan") || s.includes("export") || s.includes("ingest")
      );

      // Determine recommended next action based on status and evidence
      let recommendedNextAction = "Review available evidence and confirm risk applicability";
      if (r.status === "needs_evidence") {
        recommendedNextAction = `Gather additional evidence: ${(r.recommendedEvidenceNeeds || []).slice(0, 2).join("; ") || "documentation from vendor security portal"}`;
      } else if (r.status === "review_suggested") {
        recommendedNextAction = "Review technical details with security team and document risk acceptance or mitigation";
      } else if (r.status === "auto_ready") {
        recommendedNextAction = "Risk is well-documented; proceed with standard procurement workflow";
      }

      return {
        key: r.key,
        label: r.label,
        reason: r.reason.replace(/^\[Certainty:.*?\]\s*/, ""),
        severity: r.severity,
        confidence: r.confidence,
        topicCount: r.recommendedTopicKeys?.length || 0,
        evidenceRefs: (r.evidenceRefs || []).map(ref => ({
          url: ref.url,
          title: ref.title,
          snippet: ref.snippet,
          confidence: ref.confidence,
          authority: calculateEvidenceAuthority(ref.url, ref.title, ref.snippet)
        })),
        evidenceStrength: (r as any).evidenceStrength || "weak",
        status: (r as any).status || "needs_evidence",
        blastRadius: calculateBlastRadius(r.key || "", r.label || "", r.severity || "MEDIUM", r, currentFoundation, intelligenceProfile),
        // New fields for detailed risk analysis
        triggeringCapabilities,
        triggeringWorkflows,
        relatedPillars: r.relatedPillars || [],
        relatedGovernanceTasks,
        recommendedNextAction
      };
    }),
    capabilities: (intelligenceProfile?.productsAndServices?.capabilities || []).map(c => {
      const refs = c.evidenceRefs || [];
      const hasHighAuthority = refs.some(ref => {
        const lowerUrl = (ref.url || "").toLowerCase();
        return lowerUrl.includes("docs.") || 
               lowerUrl.includes("security.") || 
               lowerUrl.includes("trust.") || 
               lowerUrl.includes("privacy.") || 
               lowerUrl.includes("legal.") || 
               lowerUrl.includes("support.") || 
               lowerUrl.includes("help.") || 
               lowerUrl.includes("/security") || 
               lowerUrl.includes("/privacy") || 
               lowerUrl.includes("/legal") || 
               lowerUrl.includes("/trust") || 
               lowerUrl.includes("/docs");
      });

      const isDefensible = hasHighAuthority || refs.length > 1;

      let strengthLabel = "Needs Review";
      let authorityLabel = "Marketing Source (Weak)";
      let reason = "Identified in marketing descriptions only; requires technical policy verification.";

      if (isDefensible) {
        strengthLabel = refs.length > 1 ? "Authoritative" : "Strong";
        authorityLabel = refs.length > 1 ? "Multi-Source Verification" : "High-Authority Documentation";
        reason = "Directly verified via high-authority domain pages or repeated consistent evidence trail.";
      } else if (refs.length > 0) {
        strengthLabel = "Detected";
        authorityLabel = "Standard Product Page";
        reason = "Inferred from standard product pages; requires official technical policy verification.";
      }

      return {
        key: c.key,
        label: c.label,
        confidence: c.confidence,
        evidenceStrength: strengthLabel,
        evidenceRefs: refs.map(ref => ({
          url: ref.url,
          title: ref.title,
          snippet: ref.snippet,
          confidence: ref.confidence,
          authority: calculateEvidenceAuthority(ref.url, ref.title, ref.snippet)
        })),
        evidenceAuthority: authorityLabel,
        confidenceReason: reason
      };
    }),
    operationalSignals: [
      { label: "Data Access", value: intelligenceProfile?.dataInteractionModel?.accessesCustomerData?.value ? "Active" : "None", confidence: intelligenceProfile?.dataInteractionModel?.accessesCustomerData?.confidence || 0 },
      { label: "Sensitive Processing", value: intelligenceProfile?.dataInteractionModel?.processesSensitiveData?.value ? "Identified" : "None", confidence: intelligenceProfile?.dataInteractionModel?.processesSensitiveData?.confidence || 0 },
      { label: "Data Storage", value: intelligenceProfile?.dataInteractionModel?.storesCustomerData?.value ? "Cloud" : "None", confidence: intelligenceProfile?.dataInteractionModel?.storesCustomerData?.confidence || 0 },
      { label: "Infra Scanning", value: intelligenceProfile?.dataInteractionModel?.scansInfrastructure?.value ? "Active" : "None", confidence: intelligenceProfile?.dataInteractionModel?.scansInfrastructure?.confidence || 0 },
      { label: "AI Usage", value: intelligenceProfile?.dataInteractionModel?.usesAIOnCustomerData?.value ? "Confirming" : "None", confidence: intelligenceProfile?.dataInteractionModel?.usesAIOnCustomerData?.confidence || 0 },
      { label: "Integrations", value: (intelligenceProfile?.deploymentAndIntegrationModel?.integrations?.length || 0) > 0 ? `${intelligenceProfile?.deploymentAndIntegrationModel?.integrations?.length} Detected` : "None", confidence: 0.9 }
    ],
    evidenceExplorer: {
      trustTopicCount: currentFoundation.totalRelevantTopicsCount,
      sourcePageCount: currentFoundation.sourcePagesCount,
      riskEvidenceCount: currentFoundation.sourceRiskAreaKeys.length,
      intelligenceCoverage: calculateIntelligenceCoverage(currentFoundation, intelligenceProfile)
    },
    operationalProfile: {
      businessDomain: analyzedSignals.businessDomain?.value || (intelligenceProfile?.businessModel?.businessDomain) || "Enterprise Infrastructure",
      productType: (Array.isArray(analyzedSignals.productType?.value) ? analyzedSignals.productType?.value.join(", ") : analyzedSignals.productType?.value) || (intelligenceProfile?.businessModel?.primaryIndustry) || "B2B SaaS",
      marketCategory: (intelligenceProfile?.businessModel?.primaryIndustry) || "Enterprise Software",
      deployment: (intelligenceProfile?.deploymentAndIntegrationModel?.deploymentModes?.[0]?.value) || "Cloud / SaaS",

      customerDataInteraction: {
        value: intelligenceProfile?.dataInteractionModel?.accessesCustomerData?.value 
          ? "Indirect / Metadata-based" 
          : "No direct data access observed",
        status: intelligenceProfile?.dataInteractionModel?.accessesCustomerData?.value 
          ? (intelligenceProfile.dataInteractionModel.accessesCustomerData.confidence >= 0.85 ? "confirmed" : "inferred")
          : "unconfirmed",
        evidence: intelligenceProfile?.dataInteractionModel?.accessesCustomerData?.value
          ? "Platform connects to cloud environments via read-only APIs and processes metadata only."
          : "No explicit customer database access mechanisms identified from public product documentation."
      },

      connectorScope: {
        value: (intelligenceProfile?.dataInteractionModel?.scansInfrastructure?.value || 
                (intelligenceProfile?.deploymentAndIntegrationModel?.integrations?.length || 0) > 0)
          ? "Read-only infrastructure scanning" 
          : "Standard application integrations only",
        status: (intelligenceProfile?.dataInteractionModel?.scansInfrastructure?.value || 
                 (intelligenceProfile?.deploymentAndIntegrationModel?.integrations?.length || 0) > 0)
          ? "inferred"
          : "unconfirmed",
        evidence: (intelligenceProfile?.dataInteractionModel?.scansInfrastructure?.value || 
                   (intelligenceProfile?.deploymentAndIntegrationModel?.integrations?.length || 0) > 0)
          ? "Connector request permissions indicate read-only access to infrastructure configuration metadata."
          : "No deep cloud provider infrastructure connectors identified."
      },

      infrastructureInteraction: {
        value: intelligenceProfile?.dataInteractionModel?.scansInfrastructure?.value 
          ? "External API query-based" 
          : "Standard hosting boundary",
        status: intelligenceProfile?.dataInteractionModel?.scansInfrastructure?.value 
          ? (intelligenceProfile.dataInteractionModel.scansInfrastructure.confidence >= 0.85 ? "confirmed" : "inferred")
          : "inferred",
        evidence: intelligenceProfile?.dataInteractionModel?.scansInfrastructure?.value
          ? "Platform communicates solely via official cloud provider APIs; no inline network agents required."
          : "Standard multi-tenant hosting boundary; no direct host or VM-level interaction observed."
      },

      aiInteractionModel: {
        value: (intelligenceProfile?.dataInteractionModel?.usesAIOnCustomerData?.value)
          ? "Inference observed, training unconfirmed" 
          : "No AI interaction identified",
        status: (intelligenceProfile?.dataInteractionModel?.usesAIOnCustomerData?.value)
          ? "inferred"
          : "confirmed",
        evidence: (intelligenceProfile?.dataInteractionModel?.usesAIOnCustomerData?.value)
          ? "AI capabilities are present for intelligence tailoring. No public evidence suggests customer data is used for model training."
          : "No generative AI or large language model features identified within core workflow streams."
      },

      persistenceBehavior: {
        value: intelligenceProfile?.dataInteractionModel?.storesCustomerData?.value 
          ? "Findings and metadata persisted" 
          : "Transient memory execution",
        status: intelligenceProfile?.dataInteractionModel?.storesCustomerData?.value 
          ? (intelligenceProfile.dataInteractionModel.storesCustomerData.confidence >= 0.85 ? "confirmed" : "inferred")
          : "inferred",
        evidence: intelligenceProfile?.dataInteractionModel?.storesCustomerData?.value
          ? "Analysis results, compliance states, and system metadata are stored in standard encrypted databases."
          : "No permanent storage identified; execution metadata is processed transiently."
      },

      tenantModel: {
        value: "Multi-tenant inferred",
        status: "inferred",
        evidence: "Standard cloud-delivered SaaS architecture utilizing logical tenant isolation."
      },

      supportVisibility: {
        value: "Not confirmed",
        status: "unconfirmed",
        evidence: "Explicit support staff access controls or access grant protocols are not publicly detailed."
      },

      exportability: {
        value: "Standard reports (PDF / XLSX)",
        status: "confirmed",
        evidence: "Technical compliance findings and executive summaries can be fully exported by workspace administrators."
      },

      scanningBehavior: {
        value: intelligenceProfile?.dataInteractionModel?.scansInfrastructure?.value 
          ? "Active API-driven scanning" 
          : "Passive telemetry collection",
        status: intelligenceProfile?.dataInteractionModel?.scansInfrastructure?.value 
          ? (intelligenceProfile.dataInteractionModel.scansInfrastructure.confidence >= 0.85 ? "confirmed" : "inferred")
          : "inferred",
        evidence: intelligenceProfile?.dataInteractionModel?.scansInfrastructure?.value
          ? "System schedules regular configuration scans via cloud service connectors to discover compliance gaps."
          : "Information relies on periodic self-reporting or manual document reviews rather than automated scanning."
      },

      administrativeScope: {
        value: ((intelligenceProfile?.deploymentAndIntegrationModel?.integrations?.length || 0) > 0)
          ? "Read-only auditor visibility" 
          : "Tenant-level workspace administrator",
        status: ((intelligenceProfile?.deploymentAndIntegrationModel?.integrations?.length || 0) > 0)
          ? "inferred"
          : "confirmed",
        evidence: ((intelligenceProfile?.deploymentAndIntegrationModel?.integrations?.length || 0) > 0)
          ? "Permissions requested are restricted to auditing configuration metadata, preventing any write actions."
          : "Configured workspace settings are restricted to the tenant workspace with zero cross-tenant access."
      }
    },
    buyerQuestions: generateBuyerQuestions(intelligenceProfile, analyzedSignals, currentFoundation)
  };
}

function generateBuyerQuestions(profile: any, analyzedSignals: any, foundation: any): any[] {
  const isCloudScanning = !!(profile?.dataInteractionModel?.scansInfrastructure?.value || analyzedSignals?.scansInfrastructure?.value);
  const isAIActive = !!(profile?.dataInteractionModel?.usesAIOnCustomerData?.value || analyzedSignals?.usesAIOnCustomerData?.value);
  const isExportActive = !!(profile?.dataInteractionModel?.accessesCustomerData?.value || analyzedSignals?.accessesCustomerData?.value);

  // Helper to determine actionable fields based on foundation data
  const buildActionableFields = (riskKeys: string[], evidenceGaps: string[], baseConfidence: number) => {
    const relatedTopics = foundation?.generatedTopics?.filter((t: any) => 
      t.triggeredBy?.some((trigger: string) => riskKeys.includes(trigger))
    ).map((t: any) => t.title) || [];
    
    const missing = evidenceGaps.filter(gap => 
      foundation?.evidenceNeeds?.some((n: any) => n.type === gap || n.reason.includes(gap))
    );
    
    const isReady = missing.length === 0;
    const answerReadiness = isReady ? "ready" : "blocked";
    const currentAnswerConfidence = isReady ? Math.max(0.8, baseConfidence) : Math.max(0.2, baseConfidence - 0.3);
    
    let suggestedAnswerSkeleton = undefined;
    if (isReady) {
      suggestedAnswerSkeleton = "Our platform implements strict controls to address this concern. Specifically, we utilize standard encryption, access logging, and regular audits as documented in our trust center.";
    }
    
    return {
      relatedTrustTopics: relatedTopics,
      answerReadiness,
      currentAnswerConfidence,
      missingEvidence: missing.length > 0 ? missing : undefined,
      suggestedAnswerSkeleton
    };
  };

  const questions = [
    {
      id: "q_cloud_connectors",
      question: "Are cloud service connectors restricted to read-only access?",
      concernDomain: "Cloud Security & Integrations",
      whyBuyersAskThis: "To verify that compromised platform credentials cannot be used to modify or delete live cloud infrastructure resources.",
      relatedRisks: ["cloud_security", "connector_security"],
      relatedEvidence: ["IAM Assumed Role Policy definition", "Connector Permission Guide"],
      confidenceDriver: "Direct IAM assumed role trust policy matching read-only API calls.",
      expectedAnswerMaturity: "ADVANCED" as const,
      importance: "CRITICAL" as const,
      likelihood: (isCloudScanning ? "LIKELY" : "SPECULATIVE") as const,
      ...buildActionableFields(["cloud_security", "connector_security"], ["IAM Assumed Role Policy definition"], 0.85)
    },
    {
      id: "q_ai_training",
      question: "Are customer-submitted data or search logs used to train or fine-tune AI models?",
      concernDomain: "AI Governance & Data Privacy",
      whyBuyersAskThis: "To ensure proprietary findings or sensitive tenant metadata are never ingested into shared LLM models.",
      relatedRisks: ["ai_governance", "model_risk"],
      relatedEvidence: ["AI Data Usage Policy", "Model Privacy Whitepaper"],
      confidenceDriver: "Enterprise licensing agreements confirming zero customer data persistence for fine-tuning.",
      expectedAnswerMaturity: "STANDARD" as const,
      importance: "CRITICAL" as const,
      likelihood: (isAIActive ? "LIKELY" : "SPECULATIVE") as const,
      ...buildActionableFields(["ai_governance", "model_risk"], ["AI Data Usage Policy"], 0.90)
    },
    {
      id: "q_support_access",
      question: "Under what conditions can your support personnel access our compliance findings?",
      concernDomain: "Access Control & Auditing",
      whyBuyersAskThis: "To confirm that operational access is restricted via temporary, audited session approvals.",
      relatedRisks: ["access_control", "tenant_isolation"],
      relatedEvidence: ["Support Impersonation & Access Control Policy", "Admin Session Auditing Log sample"],
      confidenceDriver: "Just-in-time (JIT) access logs verified and emailed to workspace administrators.",
      expectedAnswerMaturity: "STANDARD" as const,
      importance: "HIGH" as const,
      likelihood: "LIKELY" as const,
      ...buildActionableFields(["access_control", "tenant_isolation"], ["Support Impersonation & Access Control Policy"], 0.75)
    },
    {
      id: "q_tenant_isolation",
      question: "How is our tenant metadata isolated from other customers' data within your storage layers?",
      concernDomain: "Tenant Isolation",
      whyBuyersAskThis: "To prevent cross-tenant metadata exposure during routine indexing or query executions.",
      relatedRisks: ["tenant_isolation", "data_handling"],
      relatedEvidence: ["Tenant Isolation Architecture Specification", "Database Encryption Key Management schema"],
      confidenceDriver: "Logical database query isolation enforced via strict tenant foreign keys.",
      expectedAnswerMaturity: "ADVANCED" as const,
      importance: "CRITICAL" as const,
      likelihood: "LIKELY" as const,
      ...buildActionableFields(["tenant_isolation", "data_handling"], ["Tenant Isolation Architecture Specification"], 0.88)
    },
    {
      id: "q_data_persistence",
      question: "What customer-specific data fields are permanently persisted on your servers?",
      concernDomain: "Data Lifecycle & Persistence",
      whyBuyersAskThis: "To minimize the vendor data storage footprint and ensure that only structural metadata is retained.",
      relatedRisks: ["data_handling", "data_retention"],
      relatedEvidence: ["Data Retention and Disposal Policy", "Product Data Catalog"],
      confidenceDriver: "Database schemas showing persistent storage is restricted to structural metadata; raw uploads are ephemeral.",
      expectedAnswerMaturity: "STANDARD" as const,
      importance: "HIGH" as const,
      likelihood: "LIKELY" as const,
      ...buildActionableFields(["data_handling", "data_retention"], ["Data Retention and Disposal Policy"], 0.82)
    },
    {
      id: "q_export_encryption",
      question: "Are exported compliance reports and action item lists encrypted both in transit and at rest?",
      concernDomain: "Data Export & Sharing",
      whyBuyersAskThis: "To guarantee that structural findings stored in temporary S3 export buckets are protected from public exposure.",
      relatedRisks: ["integration_security", "data_handling"],
      relatedEvidence: ["Storage Encryption Policy", "TLS Transit Verification log"],
      confidenceDriver: "S3 static export buckets enforce KMS encryption and transient 24-hour pre-signed URL expiry.",
      expectedAnswerMaturity: "ADVANCED" as const,
      importance: "MEDIUM" as const,
      likelihood: (isExportActive ? "LIKELY" : "SPECULATIVE") as const,
      ...buildActionableFields(["integration_security", "data_handling"], ["Storage Encryption Policy"], 0.92)
    },
    {
      id: "q_audit_logging",
      question: "For how long are administrator audit logs retained, and how are they protected from modification?",
      concernDomain: "Compliance & Security Monitoring",
      whyBuyersAskThis: "To ensure security incidents or setting modifications can be forensic-audited up to one year post-event.",
      relatedRisks: ["compliance_risk", "access_control"],
      relatedEvidence: ["Audit Logging and Monitoring Standard", "Immutable Log Configuration policy"],
      confidenceDriver: "Audit logs streamed directly to write-once storage or central SIEM systems.",
      expectedAnswerMaturity: "STANDARD" as const,
      importance: "HIGH" as const,
      likelihood: "SPECULATIVE" as const,
      ...buildActionableFields(["compliance_risk", "access_control"], ["Audit Logging and Monitoring Standard"], 0.60)
    }
  ];

  return questions;
}

function calculateBlastRadius(key: string, label: string, severity: string, r?: any, foundation?: any, profile?: any): any {
  const normKey = key.toLowerCase();
  const normLabel = label.toLowerCase();
  
  // Baseline generic missing/mitigating evidence calculation
  const missingEvidence = r?.recommendedEvidenceNeeds?.map((needId: string) => {
    const need = foundation?.evidenceNeeds?.find((n: any) => n.type === needId);
    return need?.reason || needId;
  }).slice(0, 2) || ["Detailed technical architecture documentation"];
  
  const mitigationEvidence = r?.evidenceRefs?.map((ref: any) => ref.title).filter(Boolean).slice(0, 2) || [];
  if (mitigationEvidence.length === 0) {
    mitigationEvidence.push("No explicit mitigating controls identified in public documentation");
  }

  // 1. Cloud Infrastructure Scanner / Cloud Connector / Cloud Security
  if (normKey.includes("cloud") || normKey.includes("connector") || normLabel.includes("cloud") || normLabel.includes("infrastructure")) {
    return {
      exposureScope: "Infrastructure read-only configuration scope",
      affectedAssets: ["Cloud API Scanners", "Infrastructure Connectors", "IAM Assumed Roles"],
      affectedDataClasses: ["Cloud Asset Metadata", "Tenant Structure", "Network Topology"],
      operationalDependencyLevel: "HIGH",
      customerImpactSummary: "If compromised, read-only configuration credentials could expose cloud topology and resource configuration states to unauthorized parties.",
      customerExposure: "Metadata-level visibility of active cloud services and configuration baselines.",
      infrastructureReach: "Restricted to target public cloud accounts mapped via read-only IAM assumed roles.",
      dataVisibility: "Cloud provider resource lists, security group configurations, and IAM policy definitions.",
      operationalImpact: "Passive observation of infrastructure configuration changes; zero write action authority.",
      tenantImpact: "Restricted to the specific connected tenant's infrastructure boundary; no cross-tenant exposure.",
      persistenceImpact: "Analysis findings and scanning history are persisted in secure backend data stores.",
      // New detailed fields
      customerDataExposure: "No direct access to customer databases or PII; restricted to infrastructure resource tags and identifiers.",
      persistenceExposure: "Cloud configuration snapshots are persisted; actual customer traffic or data payloads are not stored.",
      identitySupportExposure: "Support personnel could potentially view the cloud topology graph but cannot access underlying cloud instances.",
      possibleCompromiseScenario: "A leaked API connector key could allow an attacker to map out your internal cloud network defenses.",
      assumptions: ["Assume IAM roles are strictly scoped to read-only permissions", "Assume cross-account access requires explicit customer approval"],
      missingEvidence,
      mitigationEvidence
    };
  }

  // 2. AI Systems / AI Governance / Model Risk / AI Processing
  if (normKey.includes("ai") || normKey.includes("model") || normLabel.includes("ai") || normLabel.includes("intelligence") || normLabel.includes("enrichment")) {
    return {
      exposureScope: "AI model tailoring context and prompt-level parameters",
      affectedAssets: ["Inference Engines", "Vector Embeddings Store", "Prompt Orchestration Pipeline"],
      affectedDataClasses: ["Structured Metadata", "Tailoring Context", "User Prompts"],
      operationalDependencyLevel: "MEDIUM",
      customerImpactSummary: "If compromised, temporary tailored context or prompt strings might be observed; model training data is entirely segmented and unexposed.",
      customerExposure: "Inference-only context variables and ephemeral prompt logs mapped to current workflows.",
      infrastructureReach: "Confined to secure regional inference endpoint API boundaries.",
      dataVisibility: "Ephermal analysis metadata passed as context to inference models.",
      operationalImpact: "Inference latency anomalies or contextual tailoring disruptions; core platform operational state unaffected.",
      tenantImpact: "Logical database separation ensures active prompt context remains isolated to the current tenant workspace.",
      persistenceImpact: "Model prompt logs are transient and deleted post-inference; final tailoring metrics are persisted.",
      // New detailed fields
      customerDataExposure: "Contextual metadata included in prompts may contain sensitive business terms but is not used for model training.",
      persistenceExposure: "Vector embeddings of uploaded documentation are stored persistently for retrieval augmented generation.",
      identitySupportExposure: "AI engineering teams may have access to anonymized prompt logs for quality assurance.",
      possibleCompromiseScenario: "Unauthorized access to the vector database could reveal chunks of proprietary documentation used for context.",
      assumptions: ["Assume zero-data-retention agreements are in place with third-party LLM providers", "Assume prompts do not contain raw PII"],
      missingEvidence,
      mitigationEvidence
    };
  }

  // 3. Export / Report Systems / Data Handling / Sensitive Data Handling
  if (normKey.includes("export") || normKey.includes("handling") || normKey.includes("data") || normLabel.includes("export") || normLabel.includes("report") || normLabel.includes("handling")) {
    return {
      exposureScope: "Workspace-specific report packages and export artifacts",
      affectedAssets: ["PDF/CSV Generation workers", "S3 Export Storage Buckets", "Secure Link Generators"],
      affectedDataClasses: ["Compliance Assessment Findings", "Workspace Summary Metrics", "Action Item Priorities"],
      operationalDependencyLevel: "HIGH",
      customerImpactSummary: "If compromised, compiled PDF compliance reports could be exposed via leaked pre-signed URLs; no database write or system control threat.",
      customerExposure: "Executive trust summaries and compliance status documents exported by workspace administrators.",
      infrastructureReach: "Restricted to the storage bucket hosting generated static compliance files.",
      dataVisibility: "Specific exported files; no access is granted to active live database records.",
      operationalImpact: "Unauthorized viewing of current compliance scores; no disruption to active monitoring workflows.",
      tenantImpact: "Pre-signed URLs are tenant-bound, ensuring direct links are restricted to authorized workspace auditors.",
      persistenceImpact: "Generated reports are retained in secure, time-expiring storage buckets.",
      // New detailed fields
      customerDataExposure: "Consolidated assessment data, potential compliance gaps, and internal notes are exposed in generated files.",
      persistenceExposure: "Generated reports sit in object storage until their pre-signed URL expiry window concludes.",
      identitySupportExposure: "Support agents might generate debug reports that mirror customer export capabilities.",
      possibleCompromiseScenario: "A leaked, unexpired report URL could allow a third party to download your security posture summary.",
      assumptions: ["Assume exported files automatically expire after a short window (e.g., 24 hours)", "Assume TLS is enforced for all downloads"],
      missingEvidence,
      mitigationEvidence
    };
  }

  // 4. Multi-Tenant SaaS systems / Access Control / Tenant Isolation
  if (normKey.includes("tenant") || normKey.includes("access") || normLabel.includes("tenant") || normLabel.includes("access") || normLabel.includes("isolation") || normLabel.includes("saas")) {
    return {
      exposureScope: "Workspace authorization profile and user membership limits",
      affectedAssets: ["Identity Provider Mappings", "Session Cookies", "RBAC Policy Engine"],
      affectedDataClasses: ["User Emails", "Assigned Workspaces", "Active Session Metadata"],
      operationalDependencyLevel: "CRITICAL",
      customerImpactSummary: "If compromised, temporary session hijack could expose a single user's workspace settings; multi-tenant database rules prevent any cross-tenant data visibility.",
      customerExposure: "Role-based access levels, invitation workflows, and user session identities.",
      infrastructureReach: "Application layer authentication boundaries; zero server or operating system control reach.",
      dataVisibility: "Assigned workspace metadata and tenant configurations.",
      operationalImpact: "Unauthorized dashboard setting modifications; database boundaries block cross-tenant modifications.",
      tenantImpact: "Tenant isolation rules enforced at database query-level completely block cross-tenant exposure.",
      persistenceImpact: "Session records and audit logs are recorded and immutable.",
      // New detailed fields
      customerDataExposure: "Direct access to the primary workspace database records for the compromised tenant.",
      persistenceExposure: "All workspace configurations, imported policies, and assessment answers are permanently stored.",
      identitySupportExposure: "Vendor administrators might have 'impersonation' tools to view the dashboard as the customer.",
      possibleCompromiseScenario: "Session hijacking or credential theft could allow a malicious actor to alter security assessments or invite rogue users.",
      assumptions: ["Assume strict logical separation at the database row level using tenant IDs", "Assume MFA is enforced for all administrative access"],
      missingEvidence,
      mitigationEvidence
    };
  }

  // 5. Default General Security Risk Area
  return {
    exposureScope: "Workspace compliance and control verification settings",
    affectedAssets: ["Compliance Registry", "Control Scoring Models"],
    affectedDataClasses: ["Security Questionnaire Answers", "Evidence Compliance Metadata"],
    operationalDependencyLevel: severity === "CRITICAL" ? "CRITICAL" : severity === "HIGH" ? "HIGH" : "MEDIUM",
    customerImpactSummary: "If compromised, target workspace compliance assessment scoring or documentation posture could be passively reviewed.",
    customerExposure: "Target assessment questionnaires, self-attestations, and compliance answers.",
    infrastructureReach: "Limited to compliance portal configurations and target workspace databases.",
    dataVisibility: "Answers, notes, and compliance metrics entered by the workspace contributors.",
    operationalImpact: "Read-only access to trust center details; zero capability to write to production hosting infrastructure.",
    tenantImpact: "Logically isolated within the active tenant schema.",
    persistenceImpact: "All answers and questionnaire progress are stored in persistent databases.",
    // New detailed fields
    customerDataExposure: "Varies based on specific platform usage; typically limited to metadata.",
    persistenceExposure: "Standard database persistence for application state.",
    identitySupportExposure: "Standard vendor support access protocols apply.",
    possibleCompromiseScenario: "A misconfiguration could lead to unauthorized visibility of non-public platform data.",
    assumptions: ["Assume standard SaaS security controls (encryption at rest, TLS in transit) are active"],
    missingEvidence,
    mitigationEvidence
  };
}

function calculateEvidenceAuthority(url: string, title: string, snippet: string): any {
  const normUrl = (url || "").toLowerCase();
  const normTitle = (title || "").toLowerCase();
  const normSnippet = (snippet || "").toLowerCase();

  // 1. Conflicting Evidence
  if (
    normTitle.includes("conflict") || normSnippet.includes("conflict") ||
    normTitle.includes("contradict") || normSnippet.includes("contradict") ||
    normTitle.includes("unconfirmed") || normSnippet.includes("unconfirmed")
  ) {
    return {
      sourceType: "Conflicting Signals",
      authorityLevel: "LOW",
      confidenceImpact: "-15%",
      evidenceQuality: "Conflicting Technical Claim",
      whyTrusted: "Direct conflicts or unconfirmed security details detected across public channels."
    };
  }

  // 2. Trust Center / Security Portal
  if (
    normUrl.includes("trust.") || normUrl.includes("security.") || 
    normUrl.includes("/security") || normUrl.includes("/trust") ||
    normTitle.includes("trust center") || normTitle.includes("security portal")
  ) {
    return {
      sourceType: "Trust Center Details",
      authorityLevel: "AUTHORITATIVE",
      confidenceImpact: "+25%",
      evidenceQuality: "Authoritative Documentation",
      whyTrusted: "Direct operational security disclosures verified under the vendor trust portal."
    };
  }

  // 3. API / Developer Docs
  if (
    normUrl.includes("docs.") || normUrl.includes("api.") || 
    normUrl.includes("developer.") || normUrl.includes("/docs") || 
    normUrl.includes("/api") || normTitle.includes("developer guide")
  ) {
    return {
      sourceType: "API Documentation",
      authorityLevel: "HIGH",
      confidenceImpact: "+18%",
      evidenceQuality: "Direct Technical Doc",
      whyTrusted: "Grounded technical reference detailing exact system endpoint integration parameters."
    };
  }

  // 4. Legal / Privacy Agreements
  if (
    normUrl.includes("legal.") || normUrl.includes("privacy.") || 
    normUrl.includes("terms.") || normUrl.includes("/privacy") || 
    normUrl.includes("/legal") || normTitle.includes("privacy policy") ||
    normTitle.includes("terms of service")
  ) {
    return {
      sourceType: "Legal & Privacy Policy",
      authorityLevel: "HIGH",
      confidenceImpact: "+20%",
      evidenceQuality: "Binding Corporate Agreement",
      whyTrusted: "Contractually binding data usage commitments under public legal policy."
    };
  }

  // 5. Blog Announcements
  if (
    normUrl.includes("blog.") || normUrl.includes("/blog") || 
    normUrl.includes("news.") || normTitle.includes("announcement")
  ) {
    return {
      sourceType: "Product Blog Announcement",
      authorityLevel: "MEDIUM",
      confidenceImpact: "+8%",
      evidenceQuality: "Corporate Press Release",
      whyTrusted: "Informational product feature release context with moderate validation weight."
    };
  }

  // 6. Default Homepage / Marketing Copy
  return {
    sourceType: "Homepage Marketing Copy",
    authorityLevel: "LOW",
    confidenceImpact: "+3%",
    evidenceQuality: "Marketing Assertion",
    whyTrusted: "Marketing statements without granular operational evidence or binding guarantees."
  };
}

function calculateIntelligenceCoverage(
  currentFoundation: WorkspaceFoundationResult,
  intelligenceProfile: any
): number {
  const pagesCount = currentFoundation.sourcePagesCount || 0;
  const citationsCount = currentFoundation.citationsCount || 0;
  const topicsCount = currentFoundation.totalRelevantTopicsCount || 0;
  
  // 1. Crawl completeness (capped at 35%)
  const crawlScore = Math.min(35, pagesCount * 3.5);

  // 2. Extraction richness (capped at 25%)
  const extractionScore = Math.min(25, citationsCount * 2.5);

  // 3. Semantic coverage (capped at 20%)
  const semanticScore = Math.min(20, topicsCount * 3.0);

  // 4. Evidence quality boost (based on the presence of authoritative/high-authority sources)
  let qualityBoost = 5;
  const capabilities = intelligenceProfile?.productsAndServices?.capabilities || [];
  const hasAuthoritativeSource = capabilities.some((c: any) => 
    (c.evidenceRefs || []).some((ref: any) => {
      const lowerUrl = (ref.url || "").toLowerCase();
      return lowerUrl.includes("docs.") || lowerUrl.includes("security.") || lowerUrl.includes("trust.");
    })
  );
  if (hasAuthoritativeSource) {
    qualityBoost = 20; // High-quality authoritative documents scanned increases discovery quality significantly!
  }

  // Base starting coverage is 40% for any indexed domain
  const finalScore = Math.round(40 + crawlScore + extractionScore + semanticScore + qualityBoost);
  return Math.min(99, Math.max(45, finalScore));
}
