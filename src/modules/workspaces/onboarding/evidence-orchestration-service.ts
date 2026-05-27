/**
 * TrustDesk Evidence Orchestration Service
 * 
 * Automatically connects uploaded documents to trust topics, evidence categories, and readiness state.
 * Implements "Just give us your domain and any documents you already have" principle.
 * 
 * Key principles:
 * - Auto-detect document types from filename, metadata, and content
 * - Auto-categorize evidence into enterprise categories
 * - Auto-link evidence to relevant trust topics
 * - Update readiness state automatically
 * - Preserve user control and overrides
 * - Avoid duplicate linkage on reruns
 */

import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logging/logger";
import { AUDIT_EVENT_TYPES, AUDIT_OBJECT_TYPES, recordAuditEventSafe } from "@/lib/audit";
import type { SourceDocument } from "@prisma/client";
import { resolveUploadTypeHint } from "@/lib/onboarding/evidence-upload-mapping";

export interface DocumentTypeDetection {
  documentType: DocumentType;
  confidence: number;
  evidence: string[];
  method: "filename" | "metadata" | "content" | "context";
}

export interface EvidenceCategorization {
  category: EvidenceCategory;
  subcategories: string[];
  confidence: number;
  evidence: string[];
}

export interface TopicLinkage {
  topicKey: string;
  relevanceScore: number;
  evidence: string[];
  linkageType: "primary" | "secondary" | "supporting";
}

export interface EvidenceOrchestrationResult {
  documentId: string;
  documentType: DocumentType;
  category: EvidenceCategory;
  linkedTopics: TopicLinkage[];
  readinessImpact: ReadinessImpact;
  enrichmentMetadata: EvidenceEnrichmentMetadata;
  errors: string[];
  warnings: string[];
}

export interface EvidenceEnrichmentMetadata {
  inferredDocumentType: DocumentType;
  linkedTopics: string[];
  linkedCategories: string[];
  readinessImpact: ReadinessImpact;
  onboardingGenerated: boolean;
  confidence: number;
  orchestrationVersion: string;
  orchestratedAt: Date;
  orchestrationSessionId: string;
}

export interface ReadinessImpact {
  evidenceMaturityImprovement: number;
  missingEvidenceReduced: string[];
  recommendationsSatisfied: string[];
  readinessScoreDelta: number;
}

export type DocumentType = 
  | "soc2_report"
  | "iso27001_certificate"
  | "dpa"
  | "privacy_policy"
  | "security_policy"
  | "incident_response_policy"
  | "bc_dr_plan"
  | "penetration_test"
  | "architecture_diagram"
  | "vendor_security_assessment"
  | "compliance_attestation"
  | "risk_assessment"
  | "internal_audit"
  | "external_audit"
  | "unknown";

export type EvidenceCategory = 
  | "Compliance"
  | "Privacy"
  | "Security Operations"
  | "Governance"
  | "Infrastructure"
  | "Vendor Security"
  | "Risk Management"
  | "Business Continuity";

const ORCHESTRATION_VERSION = "1.0.0";

/**
 * Document type detection patterns and rules
 */
const DOCUMENT_TYPE_PATTERNS: Record<DocumentType, {
  patterns: RegExp[];
  keywords: string[];
  categories: EvidenceCategory[];
  topics: string[];
  confidence: number;
}> = {
  soc2_report: {
    patterns: [/soc\s*2/i, /service\s*organization\s*control/i, /soc\s*type\s*[12]/i],
    keywords: ["soc2", "service organization control", "type 2", "type 1", "attestation"],
    categories: ["Compliance", "Governance"],
    topics: ["enterprise_saas_security", "governance", "vendor_security"],
    confidence: 0.9,
  },
  iso27001_certificate: {
    patterns: [/iso\s*27001/i, /iso\/iec\s*27001/i, /information\s*security\s*management/i],
    keywords: ["iso27001", "iso 27001", "information security management", "isms"],
    categories: ["Compliance", "Security Operations"],
    topics: ["enterprise_saas_security", "security_operations", "governance"],
    confidence: 0.9,
  },
  dpa: {
    patterns: [/data\s*processing\s*agreement/i, /dpa/i, /processor\s*agreement/i],
    keywords: ["data processing agreement", "dpa", "processor", "data controller"],
    categories: ["Privacy", "Compliance"],
    topics: ["privacy_gdpr", "data_processing", "vendor_security"],
    confidence: 0.85,
  },
  privacy_policy: {
    patterns: [/privacy\s*policy/i, /data\s*privacy/i, /privacy\s*statement/i],
    keywords: ["privacy policy", "data privacy", "privacy statement", "personal information"],
    categories: ["Privacy"],
    topics: ["privacy_gdpr", "data_processing", "data_classification"],
    confidence: 0.8,
  },
  security_policy: {
    patterns: [/security\s*policy/i, /information\s*security\s*policy/i],
    keywords: ["security policy", "information security policy", "security procedures"],
    categories: ["Security Operations", "Governance"],
    topics: ["access_control", "security_operations", "governance"],
    confidence: 0.8,
  },
  incident_response_policy: {
    patterns: [/incident\s*response/i, /security\s*incident/i, /irp/i],
    keywords: ["incident response", "security incident", "irp", "incident handling"],
    categories: ["Security Operations", "Business Continuity"],
    topics: ["incident_response", "security_operations", "business_continuity"],
    confidence: 0.85,
  },
  bc_dr_plan: {
    patterns: [/business\s*continuity/i, /disaster\s*recovery/i, /bcdr/i, /bcp/i],
    keywords: ["business continuity", "disaster recovery", "bcdr", "bcp", "dr plan"],
    categories: ["Business Continuity", "Infrastructure"],
    topics: ["business_continuity", "infrastructure", "incident_response"],
    confidence: 0.85,
  },
  penetration_test: {
    patterns: [/penetration\s*test/i, /pen\s*test/i, /security\s*assessment/i],
    keywords: ["penetration test", "pen test", "security assessment", "vulnerability assessment"],
    categories: ["Security Operations", "Risk Management"],
    topics: ["vulnerability_management", "security_operations", "risk_assessment"],
    confidence: 0.8,
  },
  architecture_diagram: {
    patterns: [/architecture/i, /network\s*diagram/i, /system\s*design/i],
    keywords: ["architecture", "network diagram", "system design", "infrastructure"],
    categories: ["Infrastructure", "Security Operations"],
    topics: ["infrastructure", "access_control", "encryption_at_rest"],
    confidence: 0.7,
  },
  vendor_security_assessment: {
    patterns: [/vendor\s*security/i, /third\s*party/i, /subprocessor/i],
    keywords: ["vendor security", "third party", "subprocessor", "supplier assessment"],
    categories: ["Vendor Security", "Risk Management"],
    topics: ["vendor_security", "risk_assessment", "governance"],
    confidence: 0.8,
  },
  compliance_attestation: {
    patterns: [/attestation/i, /compliance\s*certificate/i, /audit\s*report/i],
    keywords: ["attestation", "compliance certificate", "audit report"],
    categories: ["Compliance", "Governance"],
    topics: ["governance", "compliance_monitoring", "risk_assessment"],
    confidence: 0.75,
  },
  risk_assessment: {
    patterns: [/risk\s*assessment/i, /risk\s*analysis/i, /threat\s*assessment/i],
    keywords: ["risk assessment", "risk analysis", "threat assessment", "risk register"],
    categories: ["Risk Management", "Governance"],
    topics: ["risk_assessment", "governance", "business_continuity"],
    confidence: 0.75,
  },
  internal_audit: {
    patterns: [/internal\s*audit/i, /audit\s*report/i, /compliance\s*review/i],
    keywords: ["internal audit", "audit report", "compliance review"],
    categories: ["Governance", "Compliance"],
    topics: ["governance", "compliance_monitoring", "risk_assessment"],
    confidence: 0.7,
  },
  external_audit: {
    patterns: [/external\s*audit/i, /independent\s*audit/i, /third\s*party\s*audit/i],
    keywords: ["external audit", "independent audit", "third party audit"],
    categories: ["Compliance", "Governance"],
    topics: ["governance", "vendor_security", "compliance_monitoring"],
    confidence: 0.7,
  },
  unknown: {
    patterns: [],
    keywords: [],
    categories: [],
    topics: [],
    confidence: 0.0,
  },
};

/**
 * Topic linkage mapping based on document types
 */
const TOPIC_LINKAGE_MAPPING: Record<DocumentType, Array<{
  topicKey: string;
  relevanceScore: number;
  linkageType: "primary" | "secondary" | "supporting";
  evidence: string[];
}>> = {
  soc2_report: [
    { topicKey: "enterprise_saas_security", relevanceScore: 0.9, linkageType: "primary", evidence: ["SOC2 covers enterprise SaaS controls"] },
    { topicKey: "governance", relevanceScore: 0.8, linkageType: "primary", evidence: ["SOC2 requires governance processes"] },
    { topicKey: "vendor_security", relevanceScore: 0.7, linkageType: "secondary", evidence: ["SOC2 includes vendor management"] },
    { topicKey: "access_control", relevanceScore: 0.6, linkageType: "supporting", evidence: ["SOC2 tests access controls"] },
    { topicKey: "encryption_at_rest", relevanceScore: 0.6, linkageType: "supporting", evidence: ["SOC2 verifies encryption"] },
  ],
  iso27001_certificate: [
    { topicKey: "enterprise_saas_security", relevanceScore: 0.9, linkageType: "primary", evidence: ["ISO27001 is enterprise security framework"] },
    { topicKey: "security_operations", relevanceScore: 0.8, linkageType: "primary", evidence: ["ISO27001 requires security operations"] },
    { topicKey: "governance", relevanceScore: 0.8, linkageType: "primary", evidence: ["ISO27001 mandates governance"] },
    { topicKey: "risk_assessment", relevanceScore: 0.7, linkageType: "secondary", evidence: ["ISO27001 includes risk management"] },
  ],
  dpa: [
    { topicKey: "privacy_gdpr", relevanceScore: 0.9, linkageType: "primary", evidence: ["DPA is core to GDPR compliance"] },
    { topicKey: "data_processing", relevanceScore: 0.8, linkageType: "primary", evidence: ["DPA governs data processing"] },
    { topicKey: "vendor_security", relevanceScore: 0.7, linkageType: "secondary", evidence: ["DPA covers subprocessor relationships"] },
    { topicKey: "data_classification", relevanceScore: 0.6, linkageType: "supporting", evidence: ["DPA requires data classification"] },
  ],
  privacy_policy: [
    { topicKey: "privacy_gdpr", relevanceScore: 0.8, linkageType: "primary", evidence: ["Privacy policy implements GDPR"] },
    { topicKey: "data_processing", relevanceScore: 0.7, linkageType: "primary", evidence: ["Privacy policy covers data processing"] },
    { topicKey: "data_classification", relevanceScore: 0.6, linkageType: "secondary", evidence: ["Privacy policy includes classification"] },
  ],
  security_policy: [
    { topicKey: "access_control", relevanceScore: 0.8, linkageType: "primary", evidence: ["Security policy defines access controls"] },
    { topicKey: "security_operations", relevanceScore: 0.7, linkageType: "primary", evidence: ["Security policy guides operations"] },
    { topicKey: "governance", relevanceScore: 0.7, linkageType: "secondary", evidence: ["Security policy is governance document"] },
    { topicKey: "encryption_at_rest", relevanceScore: 0.6, linkageType: "supporting", evidence: ["Security policy covers encryption"] },
  ],
  incident_response_policy: [
    { topicKey: "incident_response", relevanceScore: 0.9, linkageType: "primary", evidence: ["Incident response policy is the core"] },
    { topicKey: "security_operations", relevanceScore: 0.8, linkageType: "primary", evidence: ["IRP is part of security operations"] },
    { topicKey: "business_continuity", relevanceScore: 0.7, linkageType: "secondary", evidence: ["IRP supports business continuity"] },
  ],
  bc_dr_plan: [
    { topicKey: "business_continuity", relevanceScore: 0.9, linkageType: "primary", evidence: ["BC/DR plan is core to continuity"] },
    { topicKey: "infrastructure", relevanceScore: 0.8, linkageType: "primary", evidence: ["BC/DR covers infrastructure"] },
    { topicKey: "incident_response", relevanceScore: 0.7, linkageType: "secondary", evidence: ["BC/DR includes incident response"] },
    { topicKey: "availability", relevanceScore: 0.6, linkageType: "supporting", evidence: ["BC/DR ensures availability"] },
  ],
  penetration_test: [
    { topicKey: "vulnerability_management", relevanceScore: 0.9, linkageType: "primary", evidence: ["Pen test validates vulnerability management"] },
    { topicKey: "security_operations", relevanceScore: 0.7, linkageType: "primary", evidence: ["Pen test is security operation"] },
    { topicKey: "risk_assessment", relevanceScore: 0.6, linkageType: "secondary", evidence: ["Pen test informs risk assessment"] },
  ],
  architecture_diagram: [
    { topicKey: "infrastructure", relevanceScore: 0.8, linkageType: "primary", evidence: ["Architecture shows infrastructure"] },
    { topicKey: "access_control", relevanceScore: 0.7, linkageType: "secondary", evidence: ["Architecture includes access controls"] },
    { topicKey: "encryption_at_rest", relevanceScore: 0.6, linkageType: "supporting", evidence: ["Architecture shows encryption"] },
  ],
  vendor_security_assessment: [
    { topicKey: "vendor_security", relevanceScore: 0.9, linkageType: "primary", evidence: ["Vendor assessment is vendor security"] },
    { topicKey: "risk_assessment", relevanceScore: 0.7, linkageType: "primary", evidence: ["Vendor assessment is risk management"] },
    { topicKey: "governance", relevanceScore: 0.6, linkageType: "secondary", evidence: ["Vendor assessment supports governance"] },
  ],
  compliance_attestation: [
    { topicKey: "governance", relevanceScore: 0.8, linkageType: "primary", evidence: ["Attestation supports governance"] },
    { topicKey: "compliance_monitoring", relevanceScore: 0.7, linkageType: "primary", evidence: ["Attestation is compliance evidence"] },
    { topicKey: "risk_assessment", relevanceScore: 0.6, linkageType: "secondary", evidence: ["Attestation reduces risk"] },
  ],
  risk_assessment: [
    { topicKey: "risk_assessment", relevanceScore: 0.9, linkageType: "primary", evidence: ["Risk assessment is the core"] },
    { topicKey: "governance", relevanceScore: 0.8, linkageType: "primary", evidence: ["Risk assessment supports governance"] },
    { topicKey: "business_continuity", relevanceScore: 0.7, linkageType: "secondary", evidence: ["Risk assessment includes continuity"] },
  ],
  internal_audit: [
    { topicKey: "governance", relevanceScore: 0.8, linkageType: "primary", evidence: ["Internal audit supports governance"] },
    { topicKey: "compliance_monitoring", relevanceScore: 0.7, linkageType: "primary", evidence: ["Internal audit monitors compliance"] },
    { topicKey: "risk_assessment", relevanceScore: 0.6, linkageType: "secondary", evidence: ["Internal audit assesses risk"] },
  ],
  external_audit: [
    { topicKey: "governance", relevanceScore: 0.8, linkageType: "primary", evidence: ["External audit validates governance"] },
    { topicKey: "vendor_security", relevanceScore: 0.7, linkageType: "primary", evidence: ["External audit covers vendors"] },
    { topicKey: "compliance_monitoring", relevanceScore: 0.7, linkageType: "primary", evidence: ["External audit monitors compliance"] },
  ],
  unknown: [],
};

/**
 * Core evidence orchestration service
 */
export class EvidenceOrchestrationService {
  /**
   * Main orchestration entry point
   * Called after document upload to automatically categorize and link evidence
   */
  static async orchestrateEvidence(
    documentId: string,
    workspaceId: string,
    userId: string,
    options: {
      filename?: string;
      extractedText?: string;
      uploadContext?: string;
      orchestrationSessionId?: string;
      linkedTopicKeys?: string[];
    } = {}
  ): Promise<EvidenceOrchestrationResult> {
    const orchestrationSessionId = options.orchestrationSessionId || `orchestration-${Date.now()}`;
    const orchestrationStartMs = performance.now();
    
    logger.info("evidence:orchestration:start", {
      documentId,
      workspaceId,
      userId,
      orchestrationSessionId,
    });

    const initialReadinessImpact: ReadinessImpact = {
      evidenceMaturityImprovement: 0,
      missingEvidenceReduced: [],
      recommendationsSatisfied: [],
      readinessScoreDelta: 0,
    };

    const result: EvidenceOrchestrationResult = {
      documentId,
      documentType: "unknown",
      category: "Compliance",
      linkedTopics: [],
      readinessImpact: initialReadinessImpact,
      enrichmentMetadata: {
        inferredDocumentType: "unknown",
        linkedTopics: [],
        linkedCategories: [],
        readinessImpact: initialReadinessImpact,
        onboardingGenerated: true,
        confidence: 0,
        orchestrationVersion: ORCHESTRATION_VERSION,
        orchestratedAt: new Date(),
        orchestrationSessionId,
      },
      errors: [],
      warnings: [],
    };

    try {
      // 1. Get document information
      const document = await prisma.sourceDocument.findUnique({
        where: { id: documentId },
      });

      if (!document) {
        throw new Error(`Document ${documentId} not found`);
      }

      // 2. Detect document type
      const documentTypeDetection = await this.detectDocumentType(
        document,
        options.filename,
        options.extractedText,
        options.uploadContext,
      );
      result.documentType = documentTypeDetection.documentType;
      result.enrichmentMetadata.inferredDocumentType = documentTypeDetection.documentType;
      result.enrichmentMetadata.confidence = documentTypeDetection.confidence;

      // 3. Categorize evidence
      const categorization = await this.categorizeEvidence(
        documentTypeDetection.documentType,
        document,
        options.extractedText
      );
      result.category = categorization.category;
      result.enrichmentMetadata.linkedCategories = [categorization.category, ...categorization.subcategories];

      // 4. Link to topics
      const topicLinkage = await this.linkToTopics(
        documentTypeDetection.documentType,
        workspaceId,
        document,
        options.linkedTopicKeys,
      );
      result.linkedTopics = topicLinkage;
      result.enrichmentMetadata.linkedTopics = topicLinkage.map(t => t.topicKey);

      // 5. Update readiness state
      const readinessImpact = await this.updateReadinessState(
        workspaceId,
        documentId,
        documentTypeDetection.documentType,
        topicLinkage
      );
      result.readinessImpact = readinessImpact;
      result.enrichmentMetadata.readinessImpact = readinessImpact;

      // 6. Link to Answer Library scaffolding
      await this.linkToAnswerLibrary(
        workspaceId,
        documentId,
        topicLinkage
      );

      // 7. Update recommendations
      await this.updateRecommendations(
        workspaceId,
        documentId,
        documentTypeDetection.documentType
      );

      // 8. Store enrichment metadata
      await this.storeEnrichmentMetadata(workspaceId, documentId, result.enrichmentMetadata);

      // 9. Record audit event
      await recordAuditEventSafe({
        workspaceId,
        actorUserId: userId,
        eventType: AUDIT_EVENT_TYPES.DOCUMENT_UPLOADED,
        objectType: AUDIT_OBJECT_TYPES.DOCUMENT,
        objectId: documentId,
        metadata: {
          action: "evidence_orchestrated",
          documentType: documentTypeDetection.documentType,
          category: categorization.category,
          linkedTopics: topicLinkage.map(t => t.topicKey),
          readinessImpact: readinessImpact.readinessScoreDelta,
          orchestrationSessionId,
        },
      });

      logger.info("evidence:orchestration:complete", {
        documentId,
        documentType: result.documentType,
        linkedTopics: result.linkedTopics.length,
        durationMs: Math.round(performance.now() - orchestrationStartMs),
      });

      return result;

    } catch (error) {
      logger.error("evidence:orchestration:error", {
        documentId,
        workspaceId,
        error: error instanceof Error ? error.message : String(error),
      });
      
      result.errors.push(error instanceof Error ? error.message : String(error));
      return result;
    }
  }

  /**
   * Detect document type from filename, metadata, and content
   */
  private static async detectDocumentType(
    document: SourceDocument,
    filename?: string,
    extractedText?: string,
    uploadContextHint?: string
  ): Promise<DocumentTypeDetection> {
    const evidence: string[] = [];
    let bestMatch: DocumentType = "unknown";
    let bestConfidence = 0;
    let bestMethod: "filename" | "metadata" | "content" | "context" = "filename";

    const searchText = [
      filename || document.originalName || "",
      extractedText || "",
    ].join(" ").toLowerCase();

    // Check each document type
    for (const [docType, config] of Object.entries(DOCUMENT_TYPE_PATTERNS)) {
      if (docType === "unknown") continue;

      let confidence = 0;
      const typeEvidence: string[] = [];

      // Check filename patterns
      for (const pattern of config.patterns) {
        if (pattern.test(filename || document.originalName || "")) {
          confidence += 0.4;
          typeEvidence.push(`Filename pattern matched: ${pattern.source}`);
        }
      }

      // Check keywords in text
      for (const keyword of config.keywords) {
        if (searchText.includes(keyword.toLowerCase())) {
          confidence += 0.3;
          typeEvidence.push(`Keyword found: ${keyword}`);
        }
      }

      // Apply base confidence
      confidence *= config.confidence;

      if (confidence > bestConfidence) {
        bestMatch = docType as DocumentType;
        bestConfidence = confidence;
        bestMethod = "filename";
        evidence.length = 0;
        evidence.push(...typeEvidence);
      }
    }

    const hinted = resolveUploadTypeHint(uploadContextHint);
    if (
      hinted &&
      hinted in DOCUMENT_TYPE_PATTERNS &&
      hinted !== "unknown"
    ) {
      const asType = hinted as DocumentType;
      return {
        documentType: asType,
        confidence: Math.max(bestConfidence, 0.72),
        evidence:
          bestConfidence > 0
            ? [...evidence, `Reinforced by onboarding expected type (${uploadContextHint})`]
            : [`Classified from onboarding expected type (${uploadContextHint})`],
        method: "context",
      };
    }

    return {
      documentType: bestMatch,
      confidence: bestConfidence,
      evidence,
      method: bestMethod,
    };
  }

  /**
   * Categorize evidence based on document type
   */
  private static async categorizeEvidence(
    documentType: DocumentType,
    document: SourceDocument,
    extractedText?: string
  ): Promise<EvidenceCategorization> {
    const config = DOCUMENT_TYPE_PATTERNS[documentType];
    
    if (!config || documentType === "unknown") {
      return {
        category: "Compliance",
        subcategories: [],
        confidence: 0.1,
        evidence: ["Unknown document type, defaulting to Compliance"],
      };
    }

    return {
      category: config.categories[0] || "Compliance",
      subcategories: config.categories.slice(1),
      confidence: config.confidence,
      evidence: [`Document type ${documentType} maps to ${config.categories.join(", ")}`],
    };
  }

  /**
   * Link evidence to relevant topics
   */
  private static async linkToTopics(
    documentType: DocumentType,
    workspaceId: string,
    document: SourceDocument,
    recommendationTopicKeys?: string[]
  ): Promise<TopicLinkage[]> {
    const linkages = TOPIC_LINKAGE_MAPPING[documentType] || [];
    
    // Filter to only topics that exist in the workspace
    const workspaceTopics = await prisma.knowledgeTopic.findMany({
      where: { 
        workspaceId,
        status: "ACTIVE",
        key: { in: linkages.map(l => l.topicKey) },
      },
      select: { key: true },
    });
    
    const existingTopicKeys = new Set(workspaceTopics.map(t => t.key));

    const primary = linkages
      .filter(linkage => existingTopicKeys.has(linkage.topicKey))
      .map(linkage => ({
        ...linkage,
        evidence: linkage.evidence,
      }));

    const keys = new Set(primary.map((p) => p.topicKey));
    if (recommendationTopicKeys?.length) {
      const extraTopics = await prisma.knowledgeTopic.findMany({
        where: {
          workspaceId,
          status: "ACTIVE",
          key: { in: recommendationTopicKeys },
        },
        select: { key: true },
      });
      const extra: TopicLinkage[] = [];
      for (const row of extraTopics) {
        if (!keys.has(row.key)) {
          keys.add(row.key);
          extra.push({
            topicKey: row.key,
            relevanceScore: 0.78,
            evidence: ["Linked from onboarding recommendation context"],
            linkageType: "primary",
          });
        }
      }
      return [...primary, ...extra];
    }

    return primary;
  }

  /**
   * Update readiness state based on uploaded evidence
   */
  private static async updateReadinessState(
    workspaceId: string,
    documentId: string,
    documentType: DocumentType,
    topicLinkage: TopicLinkage[]
  ): Promise<ReadinessImpact> {
    const impact: ReadinessImpact = {
      evidenceMaturityImprovement: 0.1,
      missingEvidenceReduced: [],
      recommendationsSatisfied: [],
      readinessScoreDelta: 0.05,
    };

    // Update workspace metadata with readiness improvements
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
    });

    if (workspace?.onboardingIntelMetaJson) {
      const metadata = workspace.onboardingIntelMetaJson as any;
      const readinessState = metadata.readinessState || {};

      // Add evidence to missing evidence tracking
      const missingEvidence = readinessState.missingEvidence || [];
      const satisfiedEvidence = [];

      for (const linkage of topicLinkage) {
        // Remove from missing evidence if present
        const missingIndex = missingEvidence.findIndex(
          (item: any) => item.topicKey === linkage.topicKey
        );
        if (missingIndex >= 0) {
          missingEvidence.splice(missingIndex, 1);
          impact.missingEvidenceReduced.push(linkage.topicKey);
        }

        // Add to satisfied evidence
        satisfiedEvidence.push({
          topicKey: linkage.topicKey,
          documentId,
          documentType,
          satisfiedAt: new Date().toISOString(),
        });
      }

      // Update metadata
      await prisma.workspace.update({
        where: { id: workspaceId },
        data: {
          onboardingIntelMetaJson: {
            ...metadata,
            readinessState: {
              ...readinessState,
              missingEvidence,
              satisfiedEvidence: [
                ...(readinessState.satisfiedEvidence || []),
                ...satisfiedEvidence,
              ],
              lastUpdated: new Date().toISOString(),
              evidenceMaturityScore: Math.min(
                1.0,
                (readinessState.evidenceMaturityScore || 0) + impact.evidenceMaturityImprovement
              ),
            },
          },
        },
      });
    }

    return impact;
  }

  /**
   * Link evidence to Answer Library scaffolding
   */
  private static async linkToAnswerLibrary(
    workspaceId: string,
    documentId: string,
    topicLinkage: TopicLinkage[]
  ): Promise<void> {
    const linkStart = performance.now();
    let linkCount = 0;
    for (const linkage of topicLinkage) {
      // Find Answer Library items for this topic
      const answerItems = await prisma.answerLibraryItem.findMany({
        where: {
          workspaceId,
          generationScope: "SEEDED",
        },
        include: {
          topic: true,
        },
      });

      // Link document to relevant answer items
      for (const item of answerItems) {
        if (item.topic?.key === linkage.topicKey) {
          // Create evidence link
          await prisma.answerEvidence.create({
            data: {
              workspaceId,
              answerId: item.id,
              documentId,
              source: "auto_orchestration",
              confidence: linkage.relevanceScore,
              extractedAt: new Date(),
              chunkIndex: 0,
              content: `Document linked to ${linkage.topicKey} topic with relevance ${linkage.relevanceScore}`,
            },
          });
          linkCount++;
        }
      }
    }

    logger.info("evidence:link_to_answer_library:complete", {
      workspaceId,
      documentId,
      topicsLinked: topicLinkage.length,
      evidenceLinksCreated: linkCount,
      durationMs: Math.round(performance.now() - linkStart),
    });
  }

  /**
   * Update recommendations after evidence upload
   */
  private static async updateRecommendations(
    workspaceId: string,
    documentId: string,
    documentType: DocumentType
  ): Promise<void> {
    // This would integrate with the recommendation system
    // For now, we'll log the action
    logger.info("evidence:recommendations:updated", {
      workspaceId,
      documentId,
      documentType,
      action: "Would remove satisfied upload recommendations",
    });
  }

  /**
   * Store enrichment metadata on workspace JSON (SourceDocument has no metadata column).
   */
  private static async storeEnrichmentMetadata(
    workspaceId: string,
    documentId: string,
    metadata: EvidenceEnrichmentMetadata
  ): Promise<void> {
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { onboardingIntelMetaJson: true },
    });
    const base = (workspace?.onboardingIntelMetaJson as Record<string, unknown>) || {};
    const prev =
      (base.evidenceOrchestrationByDocumentId as Record<string, EvidenceEnrichmentMetadata>) || {};
    await prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        onboardingIntelMetaJson: {
          ...base,
          evidenceOrchestrationByDocumentId: {
            ...prev,
            [documentId]: metadata,
          },
        },
      },
    });
  }

  /**
   * Get orchestration results for a document
   */
  static async getOrchestrationResult(
    documentId: string,
    workspaceId?: string
  ): Promise<EvidenceOrchestrationResult | null> {
    const wsId =
      workspaceId ??
      (
        await prisma.sourceDocument.findUnique({
          where: { id: documentId },
          select: { workspaceId: true },
        })
      )?.workspaceId;
    if (!wsId) return null;

    const workspace = await prisma.workspace.findUnique({
      where: { id: wsId },
      select: { onboardingIntelMetaJson: true },
    });
    const metaRoot = workspace?.onboardingIntelMetaJson as Record<string, unknown> | null;
    const byDoc = metaRoot?.evidenceOrchestrationByDocumentId as
      | Record<string, EvidenceEnrichmentMetadata>
      | undefined;
    const metadata = byDoc?.[documentId];
    if (!metadata) return null;

    return {
      documentId,
      documentType: metadata.inferredDocumentType,
      category: (metadata.linkedCategories[0] as EvidenceCategory) || "Compliance",
      linkedTopics: metadata.linkedTopics.map((topicKey) => ({
        topicKey,
        relevanceScore: 0.8,
        evidence: [],
        linkageType: "primary" as const,
      })),
      readinessImpact: metadata.readinessImpact,
      enrichmentMetadata: metadata,
      errors: [],
      warnings: [],
    };
  }

  /**
   * Remove orchestration for a document (user override)
   */
  static async removeOrchestration(
    documentId: string,
    workspaceId: string,
    userId: string
  ): Promise<{ deleted: number; errors: string[] }> {
    const errors: string[] = [];
    let deleted = 0;

    try {
      // Remove evidence links
      const deletedEvidence = await prisma.answerEvidence.deleteMany({
        where: { documentId },
      });
      deleted += deletedEvidence.count;

      // Remove orchestration metadata snapshot from workspace JSON
      const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { onboardingIntelMetaJson: true },
      });
      const base = (workspace?.onboardingIntelMetaJson as Record<string, unknown>) || {};
      const prev =
        (base.evidenceOrchestrationByDocumentId as Record<string, EvidenceEnrichmentMetadata>) || {};
      const { [documentId]: _removed, ...restByDoc } = prev;
      await prisma.workspace.update({
        where: { id: workspaceId },
        data: {
          onboardingIntelMetaJson: {
            ...base,
            evidenceOrchestrationByDocumentId: restByDoc,
          },
        },
      });
      deleted++;

      // Record audit event
      await recordAuditEventSafe({
        workspaceId,
        actorUserId: userId,
        eventType: AUDIT_EVENT_TYPES.DOCUMENT_UPDATED,
        objectType: AUDIT_OBJECT_TYPES.DOCUMENT,
        objectId: documentId,
        metadata: {
          action: "orchestration_removed",
          deleted,
        },
      });

      logger.info("evidence:orchestration:removed", {
        documentId,
        workspaceId,
        deleted,
      });

    } catch (error) {
      errors.push(`Removal failed: ${error instanceof Error ? error.message : String(error)}`);
      logger.error("evidence:orchestration:removal:error", {
        documentId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return { deleted, errors };
  }
}
