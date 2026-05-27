import { 
  CapabilityView, 
  OperationalWorkflowView, 
  ProcurementRiskArea 
} from "../vendor-intelligence-types";

export class OperationalWorkflowEngine {
  /**
   * Dynamically infer active operational workflows based on capabilities, operational signals, and risk areas.
   */
  public static infer(
    capabilities: any[],
    operationalModel: any,
    riskAreas: ProcurementRiskArea[]
  ): OperationalWorkflowView[] {
    const workflows: OperationalWorkflowView[] = [];

    // Helper to find capability by keys
    const findCap = (keys: string[]) => {
      return capabilities.find(c => keys.includes(c.key));
    };

    // 1. Cloud Asset Scanning Workflow
    const cloudCap = findCap(["cloud_scanning", "cloud_connector"]);
    const hasCloudScanningTrigger = cloudCap || operationalModel?.scansInfrastructure || operationalModel?.integratesWithCloudProviders;
    if (hasCloudScanningTrigger) {
      const capConfidence = cloudCap?.confidence ?? 0.85;
      const strength = (cloudCap?.evidenceStrength === "authoritative" || cloudCap?.evidenceStrength === "strong") ? "strong" : "medium";
      
      workflows.push({
        id: "wf_cloud_scanning",
        type: "cloud_scanning",
        title: "Cloud Asset Scanning & Posture Audit",
        summary: "Automated analysis of cloud provider configurations, resource relationships, and security controls via secure delegated connectors.",
        steps: [
          "Customer delegates cloud authorization via OAuth 2.0 or secure IAM role mapping.",
          "Platform initiates secure, API-driven crawling of cloud environment metadata.",
          "Cloud assets, access roles, and network routes are analyzed for misconfigurations.",
          "High-risk gaps and posture violation alerts are recorded inside the workspace.",
          "Formatted compliance reports and step-by-step remediation pathways are generated."
        ],
        dataInteraction: "Metadata-based scanning inferred. Infrastructure topology and configuration states are evaluated.",
        accessModel: "Read-only cloud infrastructure access inferred.",
        persistenceBehavior: "Infrastructure metadata and security findings persisted; raw code or customer production payloads are never retrieved.",
        procurementConcerns: [
          "Least privilege configuration & minimal connector scope permissions.",
          "Multi-tenant data boundary isolation during multi-cloud metadata indexing.",
          "Credential expiration, key rotation, and revocation latency."
        ],
        relatedRisks: ["infrastructure_cloud_risk", "privileged_access", "tenant_escape_risk"],
        relatedEvidenceNeeds: ["Least Privilege/Connector Permission", "Cloud Security Assessment", "Tenant Isolation Architecture"],
        confidence: capConfidence,
        evidenceStrength: strength as any
      });
    }

    // 2. Sensitive Data Discovery Workflow
    const sensitiveCap = findCap(["sensitive_data_discovery"]);
    const hasSensitiveTrigger = sensitiveCap || operationalModel?.processesSensitiveData || operationalModel?.handlesPII;
    if (hasSensitiveTrigger) {
      const capConfidence = sensitiveCap?.confidence ?? 0.9;
      const strength = (sensitiveCap?.evidenceStrength === "authoritative" || sensitiveCap?.evidenceStrength === "strong") ? "strong" : "medium";

      workflows.push({
        id: "wf_sensitive_data_discovery",
        type: "sensitive_data_discovery",
        title: "Automated Sensitive Data Discovery & Classification",
        summary: "Continuous deep-content scanning of configured data storage environments to identify, tag, and protect sensitive customer assets.",
        steps: [
          "System establishes secure database or bucket connections utilizing administrative credentials.",
          "Platform scans storage locations, parsing file formats, tables, and schemas.",
          "Content is analyzed for patterns indicating PII, credentials, financial details, or custom secrets.",
          "Discovered assets are tagged with classification levels (e.g. Restricted, Confidential).",
          "Automated protection rules and immediate notification logs are dispatched to compliance dashboards."
        ],
        dataInteraction: "Continuous, deep storage schema and file content analysis.",
        accessModel: "Administrative read access to customer databases and unstructured storage buckets.",
        persistenceBehavior: "Discovery metadata, data labels, and risk levels are persisted; exact raw data matches are strictly purged from system RAM post-classification.",
        procurementConcerns: [
          "Excessive read access permission scopes across live databases.",
          "Unauthorised exposure of PII during active scanning execution.",
          "Secure lifecycle and encryption of persistent metadata findings."
        ],
        relatedRisks: ["data_storage_risk", "data_privacy_risk", "privileged_access"],
        relatedEvidenceNeeds: ["Data Handling Policy", "Access Control Policy", "Encryption Standards"],
        confidence: capConfidence,
        evidenceStrength: strength as any
      });
    }

    // 3. AI Enrichment Workflow
    const aiCap = findCap(["ai_processing", "model_training", "model_inference"]);
    const hasAITrigger = aiCap || operationalModel?.usesAIOnCustomerData;
    if (hasAITrigger) {
      const capConfidence = aiCap?.confidence ?? 0.88;
      const strength = (aiCap?.evidenceStrength === "authoritative" || aiCap?.evidenceStrength === "strong") ? "strong" : "medium";

      workflows.push({
        id: "wf_ai_enrichment",
        type: "ai_enrichment",
        title: "AI Compliance Inference & Contextual Enrichment",
        summary: "Contextual processing of compliance data using advanced generative models to synthesize operational descriptions and draft seed recommendations.",
        steps: [
          "Onboarding crawler streams unstructured text and compliance policy documents to backend queues.",
          "Backend tokenizes text and constructs security context prompts.",
          "Prompts are routed to secure LLM endpoints for compliance and capability analysis.",
          "Models classify vendor posture, identify gaps, and draft detailed remediation steps.",
          "Completed governance objects and estimated readiness deltas are saved to workspace."
        ],
        dataInteraction: "Inference-only natural language processing on customer-provided documents.",
        accessModel: "Transient, programmatic access to workspace documents.",
        persistenceBehavior: "Outputs are persisted in database; raw inputs processed entirely in volatile RAM and never used for downstream model training.",
        procurementConcerns: [
          "Potential training leakage of customer IP into public LLMs.",
          "Absence of explicit opt-out controls for downstream vendor model refinement.",
          "Cross-border transfer or subprocessor LLM hosting compliance."
        ],
        relatedRisks: ["ai_training_risk", "data_privacy_risk"],
        relatedEvidenceNeeds: ["AI Data Usage Policy", "AI Ethics Policy", "Model Card / Datasheet"],
        confidence: capConfidence,
        evidenceStrength: strength as any
      });
    }

    // 4. Connector Authorization Workflow
    const hasConnectorTrigger = operationalModel?.integratesWithCloudProviders || operationalModel?.scansInfrastructure;
    if (hasConnectorTrigger) {
      workflows.push({
        id: "wf_connector_authorization",
        type: "connector_authorization",
        title: "Secure API Connector Authorization & Key Management",
        summary: "Secure onboarding of external cloud services and SaaS platforms via robust OAuth delegation and localized encryption key storage.",
        steps: [
          "Security administrator initiates integration configuration in dashboard.",
          "User is redirected to third-party authorization portal (OAuth) or provided an IAM policy template.",
          "On approval, cloud service returns standard access token and secure refresh token credentials.",
          "Credentials are encrypted using AES-256-GCM envelope keys locked within Cloud KMS / HSM.",
          "Onboarding engines make authenticated REST/GraphQL requests, renewing tokens automatically."
        ],
        dataInteraction: "Secure, credential-based API calls to external cloud platform endpoints.",
        accessModel: "Delegated token-based authorization (OAuth 2.0 / IAM cross-account roles).",
        persistenceBehavior: "Tokens securely saved inside envelope-encrypted DB; uninstalled connectors are purged instantly.",
        procurementConcerns: [
          "Token leakage due to credential compromise or database injection.",
          "Broad connector permission delegation extending beyond intended bounds.",
          "Auditing connector authorization activities."
        ],
        relatedRisks: ["infrastructure_cloud_risk", "privileged_access"],
        relatedEvidenceNeeds: ["Cloud Configuration Guide", "Access Control Policy"],
        confidence: 0.85,
        evidenceStrength: "medium"
      });
    }

    // 5. Export/Report Generation Workflow
    if (operationalModel?.storesCustomerData || capabilities.length > 0) {
      workflows.push({
        id: "wf_export_generation",
        type: "export_generation",
        title: "Compliance PDF & Document Export Compilation",
        summary: "Aggregating workspace compliance status to render high-fidelity, secure PDF/CSV downloadable compliance files.",
        steps: [
          "Onboarding user initiates compliance export request from review dashboard.",
          "Server queries internal schema, compiling all security capabilities and evidence matches.",
          "Templating engine builds formatted structure with custom layout elements.",
          "Finished document is stored in a private cloud storage bucket.",
          "System generates signed, time-limited download URL sent strictly to authenticated user."
        ],
        dataInteraction: "Aggregated internal database analysis to build formatted assets.",
        accessModel: "Read-only access to compiled workspace compliance metadata.",
        persistenceBehavior: "Generated documents persisted for compliance audit logs; manually deletable on demand.",
        procurementConcerns: [
          "Unauthorized download or distribution of sensitive security posture documents.",
          "Inadequate security of private cloud buckets hosting compliance downloads."
        ],
        relatedRisks: ["data_storage_risk", "data_privacy_risk"],
        relatedEvidenceNeeds: ["Data Retention Policy", "Encryption Standards"],
        confidence: 0.80,
        evidenceStrength: "medium"
      });
    }

    // 6. Monitoring Workflows
    const monitorCap = findCap(["audit_logging_monitoring", "threat_detection"]);
    if (monitorCap || operationalModel?.scansInfrastructure) {
      const capConfidence = monitorCap?.confidence ?? 0.82;
      const strength = (monitorCap?.evidenceStrength === "authoritative" || monitorCap?.evidenceStrength === "strong") ? "strong" : "medium";

      workflows.push({
        id: "wf_monitoring",
        type: "monitoring",
        title: "Continuous Threat Monitoring & Alerting",
        summary: "Real-time auditing of platform, network, and application layer events to identify anomalies and security incidents.",
        steps: [
          "Agents collect resource metrics and container event logs from platform hosts.",
          "Event telemetry is streamed into a secure, centralized SIEM dashboard.",
          "Heuristic rule-matching detects malicious activity or container privilege escapes.",
          "Administrator is instantly alerted via active webhooks and system notifications.",
          "Suspicious container processes are automatically isolated based on policy."
        ],
        dataInteraction: "Host-level server log and container stream processing.",
        accessModel: "Privileged read access to container hosts, system kernels, and security events.",
        persistenceBehavior: "Telemetry logs saved locally for 90 days; long-term archives shifted to encrypted cold storage.",
        procurementConcerns: [
          "Accidental logging of sensitive customer payloads inside threat logs.",
          "High compute resource allocation causing performance bottlenecks."
        ],
        relatedRisks: ["infrastructure_cloud_risk", "privileged_access"],
        relatedEvidenceNeeds: ["Vulnerability Disclosure Policy", "Cloud Security Assessment"],
        confidence: capConfidence,
        evidenceStrength: strength as any
      });
    }

    // 7. Audit Logging Workflows
    const auditCap = findCap(["audit_logging_monitoring"]);
    if (auditCap || operationalModel?.accessesCustomerData) {
      const capConfidence = auditCap?.confidence ?? 0.85;
      const strength = (auditCap?.evidenceStrength === "authoritative" || auditCap?.evidenceStrength === "strong") ? "strong" : "medium";

      workflows.push({
        id: "wf_audit_logging",
        type: "audit_logging",
        title: "Immutable Access & Security Event Audit Logging",
        summary: "Generating tamper-evident, chronologically ordered event logs capturing all user and system administrative activities.",
        steps: [
          "User or system process initiates administrative action (e.g. data access, token renewal).",
          "Logging service records event metadata (actor IP, identity, timestamp, outcome).",
          "Log payload is constructed and cryptographically hashed.",
          "Record is written to write-once-read-many (WORM) storage configuration.",
          "Integrity checks are run continuously to verify logs are unmodified."
        ],
        dataInteraction: "Chronological activity tracing across system boundaries.",
        accessModel: "Append-only programmatic logging access.",
        persistenceBehavior: "Audit logs are strictly permanent and cannot be modified or deleted throughout the compliance window.",
        procurementConcerns: [
          "Tampering or deleting logs by compromised administrator accounts.",
          "Logging identifiable personal details violating user privacy laws."
        ],
        relatedRisks: ["privileged_access", "data_privacy_risk"],
        relatedEvidenceNeeds: ["Access Control Policy", "Cloud Security Assessment"],
        confidence: capConfidence,
        evidenceStrength: strength as any
      });
    }

    return workflows;
  }
}
