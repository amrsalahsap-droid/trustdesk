import { 
  TrustTopicRecommendation, 
  AnswerScaffoldArea, 
  EvidenceNeed, 
  ClarificationTask, 
  WorkspaceFoundationResult,
  ProcurementRiskArea,
  CapabilitySignal,
  EvidenceRef,
  SecurityPillar
} from "./vendor-intelligence-types";
import { SignalCitation } from "./evidence";
import { DataInteractionModel } from "./onboarding-core-types";
import { TRUST_TOPIC_REGISTRY, TRUST_PILLAR_REGISTRY } from "./trust-topic-registry";
import { TopicResolutionEngine } from "./topic-resolution/topic-resolution-engine";
import { EvidenceNeedResolutionEngine } from "./evidence-needs/evidence-need-resolution-engine";
import { OperationalWorkflowEngine } from "./operational-workflows/operational-workflow-engine";
import { GovernanceTaskResolutionEngine } from "./governance-tasks/governance-task-resolution-engine";

export class FoundationBuilder {
  /**
   * Canonical backend function to build the workspace foundation result.
   */
  static build(params: {
    mode?: "preview" | "finalize";
    riskAreas: ProcurementRiskArea[];
    capabilities: CapabilitySignal[];
    operationalModel: DataInteractionModel;
    evidenceRefs: EvidenceRef[];
    citations: SignalCitation[];
    sourcePages: string[];
    existingGeneratedTopics?: TrustTopicRecommendation[];
    clarificationTasks?: ClarificationTask[];
    evidenceNeeds?: EvidenceNeed[];
    answerScaffolds?: AnswerScaffoldArea[];
    evidenceExceptions?: Record<string, {
      status: "unavailable" | "not_applicable";
      reason: string;
      note?: string;
    }>;
  }): WorkspaceFoundationResult {
    const { 
      riskAreas, 
      capabilities, 
      operationalModel, 
      evidenceRefs, 
      citations, 
      sourcePages,
      existingGeneratedTopics = [],
      clarificationTasks = [],
      evidenceNeeds = [],
      answerScaffolds = [],
      evidenceExceptions
    } = params;

    const topicsMap = new Map<string, TrustTopicRecommendation>();

    const hasActiveException = (topicKey: string, topicTitle: string, impliedNeeds: string[] = []): boolean => {
      if (!evidenceExceptions) return false;
      if (evidenceExceptions[topicTitle]) return true;
      if (evidenceExceptions[topicKey]) return true;
      for (const need of impliedNeeds) {
        if (evidenceExceptions[need]) return true;
      }
      const def = TRUST_TOPIC_REGISTRY.find(d => d.key === topicKey);
      if (def) {
        const registryNeeds = [
          ...(def.impliedEvidenceNeeds || []),
          ...(def.evidenceNeeded || []),
          ...(def.impliedAnswerAreas || [])
        ];
        for (const need of registryNeeds) {
          if (evidenceExceptions[need]) return true;
        }
      }
      return false;
    };
    
    // 1. Incorporate existing topics
    existingGeneratedTopics.forEach(t => {
      let finalStatus = t.status;
      if (hasActiveException(t.key, t.title, t.evidenceNeeds)) {
        if (finalStatus === "auto_ready") {
          finalStatus = "review_suggested";
        }
      }
      topicsMap.set(t.key, { ...t, status: finalStatus });
    });

    // 2. Convert riskArea.recommendedTopicKeys into real TrustTopicRecommendation objects
    riskAreas.forEach(risk => {
      const topicKeys = [...(risk.recommendedTopicKeys || [])];
      
      // Rule 5: Tenant escape risk must produce tenant_isolation topic
      if (risk.key === "tenant_escape_risk") {
        if (!topicKeys.includes("tenant_isolation")) {
          topicKeys.push("tenant_isolation");
        }
      }

      topicKeys.forEach(rawKey => {
        const resolved = TopicResolutionEngine.resolve(rawKey, risk.confidence, `Triggered by risk: ${risk.label}`);
        const topicKey = resolved.canonicalKey || rawKey;
        let status = this.determineTopicStatus(risk.confidence, risk.evidenceStrength || "medium");
        
        const existing = topicsMap.get(topicKey);
        if (existing) {
          existing.confidence = Math.max(existing.confidence, risk.confidence);
          existing.triggeredBy = Array.from(new Set([...existing.triggeredBy, risk.key]));
          if (risk.evidenceRefs) {
            const incomingRefs = risk.evidenceRefs.map(ref => {
              if (typeof ref === 'string') return { url: ref, title: risk.label, snippet: "", confidence: risk.confidence };
              return {
                url: ref.url || "",
                title: ref.title || risk.label,
                snippet: ref.snippet || "",
                confidence: ref.confidence || risk.confidence
              };
            });
            existing.evidenceRefs = Array.from(new Map([...(existing.evidenceRefs || []).map(r => [r.url || (r as any), r]), ...incomingRefs.map(r => [r.url, r])]).values());
          }
          let finalStatus = status;
          if (hasActiveException(topicKey, existing.title, existing.evidenceNeeds)) {
            if (finalStatus === "auto_ready") {
              finalStatus = "review_suggested";
            }
          }
          if (finalStatus === "auto_ready") existing.status = "auto_ready";
          else if (finalStatus === "review_suggested" && existing.status !== "auto_ready") existing.status = "review_suggested";
          return;
        }

        const def = TRUST_TOPIC_REGISTRY.find(d => d.key === topicKey);
        
        if (def) {
          let finalStatus = status;
          if (hasActiveException(topicKey, def.title, def.impliedEvidenceNeeds || [])) {
            if (finalStatus === "auto_ready") {
              finalStatus = "review_suggested";
            }
          }
          topicsMap.set(topicKey, {
            id: `topic_${topicKey}`,
            key: topicKey,
            title: def.title,
            description: def.description,
            priority: (risk.severity === "CRITICAL" ? "CRITICAL" : (risk.severity === "HIGH" ? "HIGH" : (def.defaultPriority || "MEDIUM"))) as any,
            topicKeys: [topicKey],
            confidence: risk.confidence,
            status: finalStatus,
            triggeredBy: [risk.key],
            rationale: `Triggered by risk: ${risk.label}`,
            evidenceRefs: risk.evidenceRefs || [],
            answerScaffoldAreas: def.impliedAnswerAreas || [],
            evidenceNeeds: def.impliedEvidenceNeeds || []
          });
        } else {
          // Create a provisional topic if not in registry
          const fallbackTitle = topicKey.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
          topicsMap.set(topicKey, {
            id: `topic_${topicKey}`,
            key: topicKey,
            title: fallbackTitle,
            description: `Automated trust area for ${fallbackTitle} based on ${risk.label}.`,
            priority: (risk.severity === "CRITICAL" ? "CRITICAL" : (risk.severity === "HIGH" ? "HIGH" : "MEDIUM")) as any,
            topicKeys: [topicKey],
            confidence: risk.confidence,
            status: status,
            triggeredBy: [risk.key],
            rationale: `Triggered by risk: ${risk.label} (${resolved.rationale})`,
            evidenceRefs: risk.evidenceRefs || [],
            answerScaffoldAreas: [],
            evidenceNeeds: []
          });
        }
      });
    });

    const finalTopics = Array.from(topicsMap.values());
    const autoReady = finalTopics.filter(t => t.status === 'auto_ready');
    const reviewSuggested = finalTopics.filter(t => t.status === 'review_suggested');
    const needsEvidence = finalTopics.filter(t => t.status === 'needs_evidence');

    // 3. Generate evidence needs from low-evidence topics
    const additionalEvidenceNeeds: EvidenceNeed[] = [];
    finalTopics.forEach(topic => {
      if (topic.status === "needs_evidence" || topic.confidence < 0.6) {
        const existingNeed = evidenceNeeds.find(n => n.type === topic.title);
        if (!existingNeed) {
          additionalEvidenceNeeds.push({
            type: topic.title,
            reason: `Evidence needed to validate ${topic.title} posture for ${topic.triggeredBy.join(', ')}.`,
            suggestedSources: ["Security Whitepaper", "Privacy Policy", "SOC2 Report"]
          });
        }
      }
    });

    // Rule 2: Low-evidence critical risks must produce evidence needs
    riskAreas.forEach(risk => {
      const isCritical = risk.severity === "CRITICAL";
      const isLowEvidence = risk.evidenceStrength === "weak" || risk.confidence < 0.60;
      if (isCritical && isLowEvidence) {
        const needType = `${risk.label} Verification`;
        if (!additionalEvidenceNeeds.some(n => n.type === needType) && !evidenceNeeds.some(n => n.type === needType)) {
          additionalEvidenceNeeds.push({
            type: needType,
            reason: `Critical risk '${risk.label}' was identified with low evidence and requires verification.`,
            suggestedSources: ["SOC 2 Audit Report", "Security Whitepaper"]
          });
        }
      }
    });

    // Rule 3: AI training risk must produce AI Data Usage Policy evidence need
    const hasAITrainingRisk = riskAreas.some(r => r.key === "ai_training_risk");
    if (hasAITrainingRisk) {
      const needType = "AI Data Usage Policy";
      if (!additionalEvidenceNeeds.some(n => n.type === needType) && !evidenceNeeds.some(n => n.type === needType)) {
        additionalEvidenceNeeds.push({
          type: needType,
          reason: "Required to verify AI model training and data usage policies.",
          suggestedSources: ["Privacy Policy", "AI Governance Document", "Subprocessor DPA"]
        });
      }
    }

    // Rule 4: Support visibility/support access must produce Support Access Policy evidence need
    const hasSupportRisk = riskAreas.some(r => r.key === "support_visibility" || r.key === "support_access");
    if (hasSupportRisk) {
      const needType = "Support Access Policy";
      if (!additionalEvidenceNeeds.some(n => n.type === needType) && !evidenceNeeds.some(n => n.type === needType)) {
        additionalEvidenceNeeds.push({
          type: needType,
          reason: "Required to evaluate support personnel access controls.",
          suggestedSources: ["Access Control Policy", "Support Impersonation Policy"]
        });
      }
    }

    // Rule 5: Tenant escape risk must produce Tenant Isolation Architecture evidence need
    const hasTenantEscapeRisk = riskAreas.some(r => r.key === "tenant_escape_risk");
    if (hasTenantEscapeRisk) {
      const needType = "Tenant Isolation Architecture";
      if (!additionalEvidenceNeeds.some(n => n.type === needType) && !evidenceNeeds.some(n => n.type === needType)) {
        additionalEvidenceNeeds.push({
          type: needType,
          reason: "Required to verify container or network-level tenant isolation boundaries.",
          suggestedSources: ["Architecture Diagram", "Penetration Testing Report"]
        });
      }
    }

    // Rule 6: Infrastructure/cloud risks must produce Least Privilege/Connector Permission evidence need
    const hasCloudRisk = riskAreas.some(r => r.key === "privileged_access" || r.key === "infrastructure_reach" || r.key === "tenant_escape_risk");
    if (hasCloudRisk) {
      const needType = "Least Privilege/Connector Permission";
      if (!additionalEvidenceNeeds.some(n => n.type === needType) && !evidenceNeeds.some(n => n.type === needType)) {
        additionalEvidenceNeeds.push({
          type: needType,
          reason: "Required to verify minimized access scope for cloud integrations or connector permissions.",
          suggestedSources: ["IAM Policy Document", "Cloud Configuration Guide"]
        });
      }
    }

    // 4. Generate clarification tasks from high-impact uncertain operational signals
    const additionalTasks: ClarificationTask[] = [];
    if (operationalModel.usesAIOnCustomerData && !clarificationTasks.some(t => t.title.includes("AI"))) {
      additionalTasks.push({
        id: "task_ai_clarification",
        title: "Confirm whether customer data is used to train AI models",
        description: "Verify if customer-provided data inputs are utilized for artificial intelligence model training, fine-tune, or persistent model optimization.",
        priority: "CRITICAL",
        status: "pending",
        triggeringSignals: ["usesAIOnCustomerData"],
        suggestedAction: "Update AI Ethics/DPA Policy",
        classification: "blocker",
        whyItMatters: "Enterprise procurement teams frequently block AI vendors that cannot explicitly confirm training restrictions.",
        whatItUnlocks: "AI governance readiness, procurement approval acceleration",
        affectedRisks: ["AI Training Risk", "Customer Data Exposure"],
        confidenceDelta: 18,
        impactPriority: "high"
      });
    }
    if (operationalModel.accessesCustomerData && !clarificationTasks.some(t => t.title.includes("Data Access"))) {
      additionalTasks.push({
        id: "task_data_access_clarification",
        title: "Audit support personnel database access controls",
        description: "Confirm access management standards outlining employee credential security, single sign-on (SSO), and mandatory multi-factor authentication (MFA).",
        priority: "HIGH",
        status: "pending",
        triggeringSignals: ["accessesCustomerData"],
        suggestedAction: "Update Support Access Policy",
        classification: "blocker",
        whyItMatters: "Auditors enforce strict zero-access and session approval policies for vendor support staff handling live tenant databases.",
        whatItUnlocks: "Support access auditing, single sign-on (SSO) and multi-factor authentication (MFA) validation",
        affectedRisks: ["Privileged Access Threat", "Support Personnel Exploits"],
        confidenceDelta: 15,
        impactPriority: "high"
      });
    }

    // Rule 3: AI training risk must produce model training clarification
    if (hasAITrainingRisk && !clarificationTasks.some(t => t.id === "task_ai_model_training")) {
      additionalTasks.push({
        id: "task_ai_model_training",
        title: "Confirm whether customer data is used to train AI models",
        description: "Does the vendor use customer data to train or fine-tune AI models? Confirm model restrictions.",
        priority: "CRITICAL",
        status: "pending",
        triggeringSignals: ["ai_training_risk"],
        suggestedAction: "Update AI Ethics/DPA Policy",
        classification: "blocker",
        whyItMatters: "Enterprise procurement teams frequently block AI vendors that cannot explicitly confirm training restrictions.",
        whatItUnlocks: "AI governance readiness, procurement approval acceleration",
        affectedRisks: ["AI Training Risk", "Customer Data Exposure"],
        confidenceDelta: 18,
        impactPriority: "high"
      });
    }

    // Rule 4: Support visibility/support access must produce support staff access clarification
    if (hasSupportRisk && !clarificationTasks.some(t => t.id === "task_support_staff_access")) {
      additionalTasks.push({
        id: "task_support_staff_access",
        title: "Audit support personnel database access controls",
        description: "Can support or engineering staff access customer production data without explicit customer consent?",
        priority: "HIGH",
        status: "pending",
        triggeringSignals: ["support_visibility", "support_access"],
        suggestedAction: "Update Support Access Policy",
        classification: "blocker",
        whyItMatters: "Auditors enforce strict zero-access and session approval policies for vendor support staff handling live tenant databases.",
        whatItUnlocks: "Support access auditing, single sign-on (SSO) and multi-factor authentication (MFA) validation",
        affectedRisks: ["Privileged Access Threat", "Support Personnel Exploits"],
        confidenceDelta: 15,
        impactPriority: "high"
      });
    }

    // Generate tenant isolation clarification task if tenant escape risk exists
    if (hasTenantEscapeRisk && !clarificationTasks.some(t => t.id === "task_tenant_isolation")) {
      additionalTasks.push({
        id: "task_tenant_isolation",
        title: "Verify logical tenant isolation controls in shared environments",
        description: "Confirm that multi-tenant database partitions, container network policies, and virtual network barriers prevent inter-tenant data leakage.",
        priority: "CRITICAL",
        status: "pending",
        triggeringSignals: ["tenant_escape_risk"],
        suggestedAction: "Update Tenant Isolation Diagram",
        classification: "blocker",
        whyItMatters: "Enterprise security auditors require documented architectural proof of logical tenant boundaries before approving multi-tenant SaaS software.",
        whatItUnlocks: "Infrastructure trust clearance, tenant breakout liability risk mitigation",
        affectedRisks: ["Tenant Escape Risk", "Cross-Tenant Data Exposure"],
        confidenceDelta: 22,
        impactPriority: "high"
      });
    }

    // Generate data retention clarification task if persistence/storage risks exist
    const hasDataRetentionRisk = riskAreas.some(r => r.key === "data_storage_sovereignty_risk" || r.key === "data_storage_risk" || r.key === "data_privacy_risk");
    if ((operationalModel.storesCustomerData || hasDataRetentionRisk) && !clarificationTasks.some(t => t.id === "task_data_retention")) {
      additionalTasks.push({
        id: "task_data_retention",
        title: "Formulate end-of-contract customer data deletion protocols",
        description: "Confirm data retention standards, secure purging protocols, and contract termination data deletion timelines.",
        priority: "HIGH",
        status: "pending",
        triggeringSignals: ["storesCustomerData"],
        suggestedAction: "Update Data Retention Policy",
        classification: "blocker",
        whyItMatters: "Enterprise customers demand rigorous legal guarantees that their data will be permanently wiped within standard windows (e.g. 30 days) post-termination.",
        whatItUnlocks: "Data disposal compliance, GDPR/CCPA post-contract deletion alignment",
        affectedRisks: ["Data Storage Risk", "PII Lifecycle Leakage"],
        confidenceDelta: 12,
        impactPriority: "medium"
      });
    }

    const finalEvidenceNeeds = [...evidenceNeeds, ...additionalEvidenceNeeds];

    // 5. Explicit Evidence Mapping for specific topic categories
    const topicNeedsMap: Record<string, string[]> = {
      "ai_governance": ["AI Data Processing Policy", "Model Governance Framework"],
      "privacy_data_protection": ["Privacy Policy", "Data Processing Agreement (DPA)", "Subprocessor List"],
      "data_retention_deletion": ["Data Retention Policy", "Data Deletion Procedures"],
      "infrastructure_security": ["Cloud Security Policy", "Infrastructure Diagram"],
      "cloud_security": ["Cloud Configuration Guide", "Shared Responsibility Matrix"],
      "access_control": ["Access Control Policy", "SSO/MFA Configuration Evidence"],
      "sensitive_data_management": ["Data Handling Policy", "Encryption Policy"],
    };

    finalTopics.forEach(topic => {
      const suggested = topicNeedsMap[topic.key];
      if (suggested && (topic.status === "needs_evidence" || topic.status === "review_suggested")) {
        suggested.forEach(s => {
          if (!finalEvidenceNeeds.some(n => n.type === s)) {
            finalEvidenceNeeds.push({
              type: s,
              reason: `Required evidence for ${topic.title}.`,
              suggestedSources: ["Security Portal", "Internal Wiki", "Legal Dept"]
            });
          }
        });
      }
    });

    const finalTasks = GovernanceTaskResolutionEngine.resolve([...clarificationTasks, ...additionalTasks]);

    // Rule 1: Every high or critical risk must produce at least: one topic OR one evidence need OR one clarification task
    riskAreas.forEach(risk => {
      const isHighOrCritical = risk.severity === "CRITICAL" || risk.severity === "HIGH";
      if (isHighOrCritical) {
        // Check if there is a topic generated by this risk key
        const hasTopic = finalTopics.some(t => t.triggeredBy.includes(risk.key));
        // Check if there is an evidence need with this risk's label or type
        const hasEvidenceNeed = finalEvidenceNeeds.some(n => 
          n.reason.includes(risk.label) || 
          n.reason.includes(risk.key) ||
          n.type.includes(risk.label)
        );
        // Check if there is a clarification task with this risk's key or label
        const hasTask = finalTasks.some(t => 
          t.triggeringSignals.includes(risk.key) || 
          t.description.includes(risk.label)
        );

        if (!hasTopic && !hasEvidenceNeed && !hasTask) {
          // If none exist, push a default evidence need to guarantee fulfillment
          finalEvidenceNeeds.push({
            type: `${risk.label} Evidence`,
            reason: `Required evidence to verify controls mitigating ${risk.label}.`,
            suggestedSources: ["Security Program Documentation", "Policy Manual"]
          });
        }
      }
    });

    // 6. Calculate unique source pages
    const allUrls = new Set<string>(sourcePages);
    evidenceRefs.forEach(ref => {
      if (typeof ref === 'string') allUrls.add(ref);
      else if (ref?.url) allUrls.add(ref.url);
    });
    citations.forEach(cit => {
      if (typeof cit === 'string') allUrls.add(cit);
      else if (cit?.sourceUrl) allUrls.add(cit.sourceUrl);
    });
    finalTopics.forEach(t => {
      t.evidenceRefs?.forEach(ref => {
        if (typeof ref === 'string') allUrls.add(ref);
        else if ((ref as any)?.url) allUrls.add((ref as any).url);
      });
    });
    riskAreas.forEach(r => {
      r.evidenceRefs?.forEach(ref => {
        if (typeof ref === 'string') allUrls.add(ref);
        else if ((ref as any)?.url) allUrls.add((ref as any).url);
      });
    });
    capabilities.forEach(c => {
      c.evidenceRefs?.forEach(ref => {
        if (typeof ref === 'string') allUrls.add(ref);
        else if ((ref as any)?.url) allUrls.add((ref as any).url);
      });
    });
    
    const sourcePagesCount = Array.from(allUrls).filter(url => 
      typeof url === 'string' && url.startsWith('http')
    ).length;

    // 7. Group Topics into Security Pillars
    const pillars: SecurityPillar[] = [];
    const groupedTopicKeys = new Set<string>();

    const pillarProcurementCopy: Record<string, { summary: string; whyExists: string }> = {
      privacy_handling: {
        summary: "TrustDesk detected customer data exposure risks that require review of privacy controls, data handling, and subprocessor transparency.",
        whyExists: "Ensures compliance with privacy frameworks (GDPR, CCPA) and aligns vendor data protection standards with customer expectations."
      },
      sensitive_data: {
        summary: "Detection of sensitive data processing requires review of encryption techniques, PII handling, and specialized classification controls.",
        whyExists: "Protects high-risk customer data assets and satisfies deep security questionnaires regarding PII and financial protection."
      },
      infrastructure_cloud: {
        summary: "Cloud and infrastructure signals suggest buyers may ask about hosting, isolation, access scope, and operational resilience.",
        whyExists: "Demonstrates a secure and resilient hosting environment, verifying that system-level boundaries prevent unauthorized access."
      },
      identity_access: {
        summary: "Identity and access signals require review of administrative access, authentication standards, and user permission controls.",
        whyExists: "Verifies strict access enforcement and operational controls, assuring enterprise buyers that only authorized staff access their data."
      },
      ai_model: {
        summary: "AI processing and model deployment require review of training data protection, model governance, and ethical data usage controls.",
        whyExists: "Ensures compliance with emerging AI governance frameworks and guarantees customer data is not used for model training without consent."
      },
      storage_sovereignty: {
        summary: "Data persistence and sovereignty settings require review of storage residency, secure backups, and data retention policies.",
        whyExists: "Confirms compliance with regional data sovereignty laws and verified secure storage, backup, and disposal lifecycles."
      },
      compliance_readiness: {
        summary: "Audit and compliance readiness signals require review of security certifications, frameworks, and incident response preparedness.",
        whyExists: "Validates baseline security posturing and prepares evidence needed for external audits and buyer due diligence reviews."
      }
    };

    TRUST_PILLAR_REGISTRY.forEach(pillarDef => {
      const pillarTopics = finalTopics.filter(topic => {
        const topicDef = TRUST_TOPIC_REGISTRY.find(d => d.key === topic.key);
        const resolved = TopicResolutionEngine.resolve(topic.key);
        const targetPillarKey = topicDef?.pillarKey || resolved.inferredPillarKey;
        return targetPillarKey === pillarDef.key;
      });

      if (pillarTopics.length > 0) {
        // Track grouped topics to find orphans later
        pillarTopics.forEach(t => groupedTopicKeys.add(t.key));

        // Determine pillar type
        const containsProvisional = pillarTopics.some(t => {
          const isCanonical = TRUST_TOPIC_REGISTRY.some(d => d.key === t.key);
          return !isCanonical;
        });
        const pillarType = containsProvisional ? "inferred" : "canonical";

        // Determine pillar status
        const totalTopics = pillarTopics.length;
        const autoReadyCount = pillarTopics.filter(t => t.status === "auto_ready").length;
        const reviewSuggestedCount = pillarTopics.filter(t => t.status === "review_suggested").length;
        const needsEvidenceCount = pillarTopics.filter(t => t.status === "needs_evidence").length;

        let status: SecurityPillar["status"];
        if (pillarType === "provisional" || containsProvisional) {
          status = "provisional";
        } else if (autoReadyCount === totalTopics) {
          status = "evidence_backed";
        } else if (needsEvidenceCount === totalTopics) {
          status = "needs_evidence";
        } else if (autoReadyCount > 0 && autoReadyCount < totalTopics) {
          status = "mixed_evidence";
        } else if (reviewSuggestedCount > totalTopics / 2) {
          status = "review_suggested";
        } else {
          status = reviewSuggestedCount >= needsEvidenceCount ? "review_suggested" : "needs_evidence";
        }

        // Calculate evidence needs for this pillar
        const pillarEvidenceNeedsCount = finalEvidenceNeeds.filter(need => 
          pillarTopics.some(t => need.reason.includes(t.title))
        ).length;

        // Calculate tasks for this pillar
        const pillarTasksCount = finalTasks.filter(task => 
          pillarTopics.some(t => task.triggeringSignals.some(s => t.triggeredBy.includes(s))) ||
          task.description.includes(pillarDef.title)
        ).length;

        // Aggregate unique supporting evidence references
        const uniqueEvidenceUrls = new Set<string>();
        pillarTopics.forEach(t => {
          t.evidenceRefs?.forEach(ref => {
            const url = typeof ref === "string" ? ref : ref.url;
            if (url) uniqueEvidenceUrls.add(url);
          });
        });
        const supportingEvidence = Array.from(uniqueEvidenceUrls);

        const triggers = Array.from(new Set(pillarTopics.flatMap(t => t.triggeredBy || [])));
        const copyOverride = pillarProcurementCopy[pillarDef.key];
        const summary = copyOverride?.summary || pillarDef.summary;
        const whyExists = copyOverride?.whyExists || (triggers.length > 0
          ? `Generated to verify operational controls mitigating identified risk elements: ${triggers.join(", ")}.`
          : "Ensures compliance with standard operational security controls and buyer expectations.");

        pillars.push({
          key: pillarDef.key,
          title: pillarDef.title,
          summary,
          topicKeys: pillarTopics.map(t => t.key),
          status,
          evidenceNeedsCount: pillarEvidenceNeedsCount,
          clarificationTasksCount: pillarTasksCount,
          pillarType,
          whyExists,
          supportingEvidence,
          supportingEvidenceCount: supportingEvidence.length
        });
      }
    });

    // 8. Never silently suppress inferred operational domains (Provisional / Unresolved custom pillars)
    const ungroupedTopics = finalTopics.filter(t => !groupedTopicKeys.has(t.key));
    const ungroupedGroups = new Map<string, typeof ungroupedTopics>();

    ungroupedTopics.forEach(topic => {
      const resolved = TopicResolutionEngine.resolve(topic.key);
      const pillarKey = resolved.inferredPillarKey || `provisional_${topic.key}`;
      if (!ungroupedGroups.has(pillarKey)) {
        ungroupedGroups.set(pillarKey, []);
      }
      ungroupedGroups.get(pillarKey)!.push(topic);
    });

    ungroupedGroups.forEach((groupTopics, pillarKey) => {
      const hasUnresolved = groupTopics.some(t => {
        const resolved = TopicResolutionEngine.resolve(t.key);
        return resolved.resolutionType === "unresolved";
      });
      const resolutionType = hasUnresolved ? ("unresolved" as const) : ("provisional" as const);

      const groupEvidenceNeedsCount = finalEvidenceNeeds.filter(need => 
        groupTopics.some(t => need.reason.includes(t.title))
      ).length;

      const groupTasksCount = finalTasks.filter(task => 
        groupTopics.some(t => 
          task.triggeringSignals.some(s => t.triggeredBy.includes(s))
        )
      ).length;

      const uniqueEvidenceUrls = new Set<string>();
      groupTopics.forEach(t => {
        t.evidenceRefs?.forEach(ref => {
          const url = typeof ref === "string" ? ref : ref.url;
          if (url) uniqueEvidenceUrls.add(url);
        });
      });
      const supportingEvidence = Array.from(uniqueEvidenceUrls);

      let baseTitle = "";
      if (pillarKey === "supply_chain") {
        baseTitle = "Supply Chain & Subprocessors";
      } else {
        baseTitle = groupTopics[0].title;
      }

      const displayTitle = resolutionType === "unresolved"
        ? `${baseTitle} (Needs Mapping Review)`
        : `${baseTitle} (Provisional)`;

      const triggers = Array.from(new Set(groupTopics.flatMap(t => t.triggeredBy)));
      let summary = "";
      let whyExists = "";

      if (pillarKey === "supply_chain") {
        summary = "Supply chain and subprocessor signals suggest buyers will request details on third-party security management and data sharing risk controls.";
        whyExists = "Ensures that downstream vendors and subprocessors maintain equivalent security and privacy standards to protect customer data.";
      } else {
        summary = `Detected operational signals for ${baseTitle} suggest enterprise buyers will review custom security controls and operational procedures.`;
        whyExists = triggers.length > 0
          ? `Verifies custom operational safeguards established to address specific risk profiles: ${triggers.join(", ")}.`
          : "Ensures full visibility into unique operational areas and verifies specialized security boundaries are properly documented.";
      }

      const mappingFailedReason = resolutionType === "unresolved"
        ? "This topic contains highly custom or non-standard semantics. It requires taxonomy mapping review."
        : "No matching canonical security pillar exists in the standard Trust Topic Registry.";

      pillars.push({
        key: pillarKey.startsWith("unresolved_") || pillarKey.startsWith("provisional_") ? pillarKey : `provisional_${pillarKey}`,
        title: displayTitle,
        summary,
        topicKeys: groupTopics.map(t => t.key),
        status: "provisional",
        evidenceNeedsCount: groupEvidenceNeedsCount,
        clarificationTasksCount: groupTasksCount,
        pillarType: resolutionType,
        whyExists,
        mappingFailedReason,
        supportingEvidence,
        supportingEvidenceCount: supportingEvidence.length
      });
    });

    const totalRelevantTopicsCount = finalTopics.length;
    const warnings: string[] = [];

    if (riskAreas.length > 0 && totalRelevantTopicsCount === 0) {
      warnings.push("Risk areas detected but no trust topics generated. Mapping gap detected.");
    }
    if (citations.length > 0 && sourcePagesCount === 0) {
      warnings.push("Citations detected but source pages were not linked. Evidence mapping gap detected.");
    }
    const capabilityEvidenceCount = capabilities.reduce((sum, c) => sum + (c.evidenceRefs?.length || 0), 0);
    if (capabilities.length > 0 && capabilityEvidenceCount === 0) {
      warnings.push("Capabilities detected but not linked as evidence.");
    }

    const resolvedEvidenceNeeds = EvidenceNeedResolutionEngine.resolve(finalEvidenceNeeds, {
      riskAreas,
      topics: finalTopics,
      pillars
    });

    const operationalWorkflows = OperationalWorkflowEngine.infer(
      capabilities,
      operationalModel,
      riskAreas
    );

    // Deduplicate governance tasks into priorityActionItem and remainingGovernanceTasks
    const priorityActionItem = finalTasks[0] || undefined;
    let remainingGovernanceTasks: ClarificationTask[] = [];

    console.log("[TEMP_DUPLICATE_TRACE] 1. Raw generated governance tasks pushed into resolve (total count):", [...clarificationTasks, ...additionalTasks].length);
    [...clarificationTasks, ...additionalTasks].forEach((t, i) => {
      console.log(`[TEMP_DUPLICATE_TRACE]   Raw [${i}]: id=${t.id}, title="${t.title}", canonicalKey=${(t as any).canonicalKey}, normalizedTitle=${(t as any).normalizedTitle}, priority=${t.priority}`);
    });

    console.log("[TEMP_DUPLICATE_TRACE] 2. Resolved/deduplicated governance tasks returned from resolve (total count):", finalTasks.length);
    finalTasks.forEach((t, i) => {
      console.log(`[TEMP_DUPLICATE_TRACE]   Resolved [${i}]: id=${t.id}, canonicalKey=${t.canonicalKey}, title="${t.title}", normalizedTitle=${(t as any).normalizedTitle}, priority=${t.priority}`);
    });

    if (priorityActionItem) {
      console.log(`[TEMP_DUPLICATE_TRACE] 3. Selected priorityActionItem: id=${priorityActionItem.id}, canonicalKey=${priorityActionItem.canonicalKey}, title="${priorityActionItem.title}"`);
      const priorityKey = priorityActionItem.canonicalKey;
      const priorityTitleNorm = GovernanceTaskResolutionEngine.normalizeTitle(priorityActionItem.title);

      console.log("[TEMP_DUPLICATE_TRACE] 4. Remaining tasks derivation (before filter count):", finalTasks.length);

      remainingGovernanceTasks = finalTasks.filter(task => {
        const taskKey = task.canonicalKey;
        // 1. If canonical key exists, use it first
        if (priorityKey && taskKey) {
          const keep = taskKey !== priorityKey;
          console.log(`[TEMP_DUPLICATE_TRACE]   Filtering task id=${task.id}, canonicalKey=${taskKey}: keep=${keep} (compared with priorityKey=${priorityKey})`);
          return keep;
        }

        // 2. Fallback to normalized title
        const taskTitleNorm = GovernanceTaskResolutionEngine.normalizeTitle(task.title);
        const keep = taskTitleNorm !== priorityTitleNorm;
        console.log(`[TEMP_DUPLICATE_TRACE]   Filtering task id=${task.id}, title="${task.title}": keep=${keep} (compared with priorityTitleNorm="${priorityTitleNorm}")`);
        return keep;
      });

      console.log("[TEMP_DUPLICATE_TRACE] 4. Remaining tasks derivation (after filter count):", remainingGovernanceTasks.length);
      remainingGovernanceTasks.forEach((t, i) => {
        console.log(`[TEMP_DUPLICATE_TRACE]   Remaining [${i}]: id=${t.id}, canonicalKey=${t.canonicalKey}, title="${t.title}"`);
      });

      // 6. Add development invariant check
      const isDuplicated = remainingGovernanceTasks.some(task => {
        const taskKey = task.canonicalKey;
        if (priorityKey && taskKey) {
          return taskKey === priorityKey;
        }
        const taskTitleNorm = GovernanceTaskResolutionEngine.normalizeTitle(task.title);
        return taskTitleNorm === priorityTitleNorm;
      });

      console.log("[TEMP_DUPLICATE_TRACE] 5. Duplicate check result inside FoundationBuilder.build: isDuplicated =", isDuplicated);

      if (isDuplicated) {
        console.warn("INVARIANT FAILED: Priority governance task duplicated in remaining tasks.");
      }
    }

    // 5. Confirmation count must use unique deduplicated tasks length
    const confirmationCount = finalTasks.length;

    return {
      securityPillarsIdentifiedCount: pillars.length,
      autoReadyTopicsCount: autoReady.length,
      reviewSuggestedTopicsCount: reviewSuggested.length,
      needsEvidenceTopicsCount: needsEvidence.length,
      totalRelevantTopicsCount,
      totalPillarsCount: pillars.length,

      evidenceNeedsCount: resolvedEvidenceNeeds.length,
      resolvedEvidenceNeedsCount: resolvedEvidenceNeeds.length,
      clarificationTasksCount: confirmationCount,
      answerScaffoldsReadyCount: answerScaffolds.filter(s => s.status === 'ready_for_review').length,
      capabilityEvidenceCount,
      sourcePagesCount,
      citationsCount: citations.length,

      generatedTopics: finalTopics,
      pillars,
      evidenceNeeds: finalEvidenceNeeds,
      resolvedEvidenceNeeds,
      clarificationTasks: finalTasks,
      priorityActionItem,
      remainingGovernanceTasks,
      operationalWorkflows,
      answerScaffolds: answerScaffolds,

      generatedTopicKeys: finalTopics.map(t => t.key),
      reviewSuggestedTopicKeys: reviewSuggested.map(t => t.key),
      needsEvidenceTopicKeys: needsEvidence.map(t => t.key),
      generatedEvidenceNeedKeys: finalEvidenceNeeds.map(n => n.type),
      generatedClarificationTaskKeys: finalTasks.map(c => c.id),

      sourceRiskAreaKeys: riskAreas.map(r => r.key),
      sourceCapabilityKeys: capabilities.map(c => c.key),
      sourceEvidenceRefs: Array.from(allUrls),

      warnings,
    };
  }

  private static determineTopicStatus(confidence: number, strength: string): TrustTopicRecommendation["status"] {
    const isStrong = strength === "strong" || strength === "authoritative";
    if (confidence >= 0.85 && isStrong) return "auto_ready";
    if (confidence >= 0.60) return "review_suggested";
    return "needs_evidence";
  }
}

