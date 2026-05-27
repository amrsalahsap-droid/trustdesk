import { DeepInferredProfile, ProcurementRiskArea, Capability, DataInteractionModel } from "./website-analysis-service";
import { ClarificationTask } from "./vendor-intelligence-types";

export class ClarificationTaskEngine {
  
  /**
   * Safely unwrap a field that might be a Signal<T>, ProfileField<T>, or raw T.
   */
  private static unwrap<T>(field: any): { value: T; confidence: number; category?: string; source?: string } {
    if (!field) return { value: undefined as any, confidence: 0 };
    
    // Check if it is a wrapped object with a 'value' property
    if (typeof field === "object" && "value" in field) {
      return { 
        value: field.value, 
        confidence: field.confidence !== undefined ? field.confidence : 1.0,
        source: field.source,
        category: field.category
      };
    }
    
    // Raw value
    return { value: field, confidence: 1.0 };
  }

  /**
   * Generates procurement-impact-aware clarification tasks.
   */
  static generateTasks(profile: DeepInferredProfile | any): ClarificationTask[] {
    const tasks: ClarificationTask[] = [];
    if (!profile) return tasks;

    const interactionData = this.unwrap<DataInteractionModel>(profile.dataInteractionModel);
    const interaction = interactionData.value;
    const interactionConfidence = interactionData.confidence;
    const interactionCategory = interactionData.category || (interactionData.source === 'ai-inferred' ? 'DERIVED' : 'OBSERVED');

    const isHypothetical = interactionCategory === "HYPOTHESIZED" || interactionConfidence < 0.85;

    // Retrieve capabilities
    const capsData = this.unwrap<Capability[]>(profile.structuredCapabilities);
    const caps = capsData.value || [];

    // --- Task 1: AI Governance (Blocker) ---
    const hasAiUsage = interaction?.usesAIOnCustomerData || caps.some(c => c.key === "ai_inference" || c.key === "ai_training");
    if (hasAiUsage && isHypothetical) {
      // Confidence-aware question crafting
      const question = interactionConfidence >= 0.70
        ? "Do your generative AI systems train on customer data?"
        : "Can you confirm whether the product utilizes AI on customer logs, and if so, what model boundary is defined?";

      tasks.push({
        id: "task_confirm_ai_usage",
        title: "Confirm AI Data Usage & Model Training Posture",
        description: `${question} Inferred AI processes require explicit training boundaries verification.`,
        priority: "HIGH",
        status: "inferred_need_confirm",
        triggeringSignals: ["usesAIOnCustomerData"],
        suggestedAction: "Confirm whether customer data is processed using zero-retention API endpoints and is excluded from training.",
        classification: "blocker",
        whyItMatters: "Enterprise security and legal reviewers strictly reject vendor data training on shared generative LLMs.",
        whatItUnlocks: "Unlocks the AI Safety and Compliance review pillar, satisfying third-party model governance criteria.",
        affectedTrustTopics: ["AI Safety", "Subprocessors"],
        affectedRisks: ["ai_training_risk", "supply_chain_risk"],
        confidenceDelta: 0.45,
        smartDefault: "No, our generative AI features process queries using zero-retention API endpoints and do not use customer data to train any core models.",
        impactPriority: "high",
      });
    }

    // --- Task 2: Cloud Connector Permission Scope (Blocker) ---
    const cloudConnector = caps.find(c => c.key === "cloud_connector" || c.key === "api_integration" || c.key === "cloud_scanning");
    if (cloudConnector && (cloudConnector.evidenceStrength !== "authoritative" || cloudConnector.confidence < 0.85)) {
      tasks.push({
        id: "task_confirm_connector_perms",
        title: "Verify Cloud Connector Read-Only Permission Bounds",
        description: `Are cloud connector integrations strictly limited to read-only API scopes? Inferred cloud scanning requires permission boundaries verification.`,
        priority: "HIGH",
        status: "inferred_need_confirm",
        triggeringSignals: [cloudConnector.key],
        suggestedAction: "Confirm whether integration credentials have administrative write access or command execution authorities.",
        classification: "blocker",
        whyItMatters: "Broad cloud IAM roles present an immense write/command execution blast radius if the vendor is compromised.",
        whatItUnlocks: "Unlocks the cloud infrastructure boundary verification, satisfying least-privilege security reviews.",
        affectedTrustTopics: ["Cloud Infrastructure", "Least Privilege"],
        affectedRisks: ["privileged_access", "infrastructure_reach"],
        confidenceDelta: 0.50,
        smartDefault: "Yes, our default connector integration uses a restricted, read-only IAM security template that has no write or command execution authority.",
        impactPriority: "high",
      });
    }

    // --- Task 3: Support Session Impersonation Controls (Blocker) ---
    const supportCap = caps.find(c => c.key === "support_access");
    if (supportCap && supportCap.confidence < 0.85) {
      tasks.push({
        id: "task_confirm_support_impersonation",
        title: "Confirm Support JIT Session Impersonation Control",
        description: "Do support team members require active customer approval to launch session impersonation?",
        priority: "HIGH",
        status: "inferred_need_confirm",
        triggeringSignals: ["support_access"],
        suggestedAction: "Confirm if employee impersonation relies on Just-in-Time (JIT) temporary approval tokens.",
        classification: "blocker",
        whyItMatters: "Reviewers demand clear audit trails and customer-authorized gates to prevent arbitrary database inspection.",
        whatItUnlocks: "Unlocks support session integrity, resolving access control deal blockers.",
        affectedTrustTopics: ["Access Control", "Session Impersonation"],
        affectedRisks: ["support_visibility", "identity_impersonation"],
        confidenceDelta: 0.40,
        smartDefault: "Yes, support representatives cannot masquerade without a temporary, time-bound JIT authorization token requested and approved by the customer admin.",
        impactPriority: "high",
      });
    }

    // --- Task 4: Storage Residency and Retention (Blocker) ---
    if (interaction?.storesCustomerData && isHypothetical) {
      tasks.push({
        id: "task_confirm_storage_residency",
        title: "Clarify Data Residency Boundaries & Retention",
        description: "Inferred database persistence detected. Confirm precise storage residency regions and purge schedules.",
        priority: "HIGH",
        status: "inferred_need_confirm",
        triggeringSignals: ["storesCustomerData"],
        suggestedAction: "Confirm geographical storage locations and data retention/deletion schedules.",
        classification: "blocker",
        whyItMatters: "Enterprise compliance departments require geographic data containment and active purge compliance.",
        whatItUnlocks: "Unlocks data privacy review checklists and legal compliance parameters.",
        affectedTrustTopics: ["Data Privacy", "Data Retention"],
        affectedRisks: ["persistence_risk", "regulated_data_risk"],
        confidenceDelta: 0.35,
        smartDefault: "Yes, all production customer data is persisted in AWS us-east-1 and is deleted within 30 days of contract termination.",
        impactPriority: "high",
      });
    }

    // --- Task 5: Compliance claims (Enhancement) ---
    const supportedData = this.unwrap<string[]>(profile.productSupportedFrameworks);
    const supportedFrameworks = supportedData.value || [];
    const vendorCertData = this.unwrap<string[]>(profile.vendorCertifications);
    const vendorCerts = vendorCertData.value || [];

    if (supportedFrameworks.length > 0 && vendorCerts.length === 0) {
      tasks.push({
        id: "task_confirm_compliance_claims",
        title: "Clarify Compliance Audit Reports (SOC 2 / ISO)",
        description: "Verify if self-aligned framework support claims are backed by formal third-party audit certificates.",
        priority: "MEDIUM",
        status: "inferred_need_confirm",
        triggeringSignals: ["productSupportedFrameworks"],
        suggestedAction: "Confirm if the business maintains an active SOC 2 Type II or ISO 27001 audit report.",
        classification: "enhancement",
        whyItMatters: "Enterprise compliance reviewers require external validation audits rather than internal self-assessments.",
        whatItUnlocks: "Unlocks baseline vendor trust, speeding up supply chain compliance approvals.",
        affectedTrustTopics: ["Compliance Audits"],
        affectedRisks: ["supply_chain_risk"],
        confidenceDelta: 0.30,
        smartDefault: "Yes, we are audited annually and maintain active SOC 2 Type II and ISO 27001 certifications with reports available under NDA.",
        impactPriority: "medium",
      });
    }

    // --- Task 6: Risk-Driven Dynamic Batching ---
    const risksData = this.unwrap<ProcurementRiskArea[]>(profile.procurementRiskAreas);
    const risks = risksData.value || [];
    
    for (const risk of risks) {
      if (risk.clarificationTasks && risk.clarificationTasks.length > 0) {
        for (const taskDesc of risk.clarificationTasks) {
          const taskId = `task_risk_${risk.key}_${taskDesc.toLowerCase().replace(/[^a-z0-9]/g, '_')}`.slice(0, 64);
          if (!tasks.some(t => t.id === taskId)) {
            // Group and map dynamically
            const isHighRisk = risk.severity === "CRITICAL" || risk.severity === "HIGH";
            tasks.push({
              id: taskId,
              title: taskDesc,
              description: `Clarification needed for detected risk: ${risk.label}. ${risk.reason}`,
              priority: isHighRisk ? "HIGH" : "MEDIUM",
              status: "inferred_need_confirm",
              triggeringSignals: risk.triggeringSignals,
              suggestedAction: `Verify ${risk.label} details: ${taskDesc}`,
              classification: isHighRisk ? "blocker" : "enhancement",
              whyItMatters: `Mitigates identified procurement risk: ${risk.label}`,
              whatItUnlocks: `Provides audited verification for ${risk.label}`,
              affectedTrustTopics: risk.recommendedTopicKeys || [],
              affectedRisks: [risk.key],
              confidenceDelta: 0.30,
              smartDefault: "Yes, we fully implement industry best practices to mitigate this risk area.",
              impactPriority: isHighRisk ? "high" : "medium",
            });
          }
        }
      }
    }

    // --- Dynamic Batching & Grouping ---
    // Deduplicate and prioritize blockers first, sorting by confidence delta
    return tasks
      .sort((a, b) => {
        // Blocker > Enhancement
        if (a.classification === "blocker" && b.classification !== "blocker") return -1;
        if (a.classification !== "blocker" && b.classification === "blocker") return 1;
        
        // High > Medium > Low priority
        const priorityWeights = { HIGH: 3, MEDIUM: 2, LOW: 1 };
        const weightA = priorityWeights[a.priority] || 0;
        const weightB = priorityWeights[b.priority] || 0;
        if (weightB !== weightA) return weightB - weightA;

        // Confidence Delta desc
        return (b.confidenceDelta || 0) - (a.confidenceDelta || 0);
      });
  }
}
