import { logger } from "@/lib/logging/logger";
import { DeepInferredProfile, ProcurementRiskArea } from "../onboarding-core-types";
import { StructuredPageEvidence, EvidenceBlock, excerptForBlock } from "../evidence";
import { EvidenceRef } from "../evidence-scoring";
import { ProductGraph, ProductCapability, ProcurementImplication, AccessPattern, InfrastructureTouchpoint, ExternalDependencyPattern } from "./product-graph-types";
import { CAPABILITY_TAXONOMY, CapabilityKey } from "./capability-taxonomy";
import { CAPABILITY_DETECTION_PATTERNS } from "./capability-detection-patterns";
import { PROCUREMENT_IMPLICATION_REGISTRY, getImplicationsForCapability } from "./procurement-implication-registry";
import { WorkflowExtractionEngine } from "../workflow-analysis/workflow-extraction-engine";
import { EvidenceAuthorityEngine } from "../evidence-authority/evidence-authority-engine";

export class ProductGraphEngine {
  /**
   * Processes a DeepInferredProfile and its extracted pages to construct the Product Graph.
   */
  static build(params: {
    profile: DeepInferredProfile;
    extractedPages?: StructuredPageEvidence[];
    citations?: any[];
    evidenceRefs?: EvidenceRef[];
    detectedIntegrations?: string[];
    procurementRiskAreas?: ProcurementRiskArea[];
  }): ProductGraph {
    const { profile, extractedPages = [] } = params;

    logger.info("PRODUCT_GRAPH_BUILD_START", {
      companyName: profile.companyName || "Unknown",
      pagesCount: extractedPages.length,
    });

    const detectedCapabilities: ProductCapability[] = [];
    const highSignalPageTypes = new Set(["docs", "pricing", "integration", "security", "compliance", "trust", "legal"]);

    // 1. Process each capability in the taxonomy
    for (const key of Object.keys(CAPABILITY_TAXONOMY) as CapabilityKey[]) {
      const def = CAPABILITY_TAXONOMY[key];
      const patterns = CAPABILITY_DETECTION_PATTERNS[key];

      let highestConfidence = 0;
      let bestStrength: "strong" | "medium" | "weak" = "weak";
      const inferredFromSet = new Set<string>();
      const sourcePagesSet = new Set<string>();
      const capabilityEvidenceRefs: EvidenceRef[] = [];

      // Check extracted pages for matching keyword patterns
      for (const page of extractedPages) {
        const pageType = page.pageType.toLowerCase();
        const isHighSignalPage = highSignalPageTypes.has(pageType);

        // Scan all blocks on this page for keyword matches
        for (const block of page.blocks) {
          let textToScan = "";
          switch (block.kind) {
            case "meta":
              textToScan = `${block.metaDescription || ""} ${block.ogDescription || ""} ${block.ogTitle || ""}`;
              break;
            case "heading-section":
              textToScan = `${block.heading} ${block.bodyText}`;
              break;
            case "body-fallback":
              textToScan = block.text;
              break;
            case "json-ld":
              textToScan = block.raw;
              break;
          }

          const lowerText = textToScan.toLowerCase();

          // Helper to check keywords safely
          const matchKeyword = (text: string, kw: string): boolean => {
            if (kw.length <= 4) {
              const escaped = kw.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
              const regex = new RegExp(`\\b${escaped}\\b`, 'i');
              return regex.test(text);
            }
            return text.toLowerCase().includes(kw.toLowerCase());
          };

          // Strong matching
          for (const kw of patterns.strongKeywords) {
            if (matchKeyword(textToScan, kw)) {
              inferredFromSet.add(`strong_kw:${kw}`);
              sourcePagesSet.add(page.url);

              // Strong keywords on high signal pages = Strong confidence (0.95)
              // Otherwise = Medium confidence (0.75)
              const strength: "strong" | "medium" = isHighSignalPage ? "strong" : "medium";
              const confidence = strength === "strong" ? 0.95 : 0.75;

              if (confidence > highestConfidence) {
                highestConfidence = confidence;
                bestStrength = strength;
              }

              // Add unique evidence ref
              const snippet = excerptForBlock(block) || kw;
              if (!capabilityEvidenceRefs.some(ref => ref.sourceUrl === page.url && ref.snippet === snippet)) {
                capabilityEvidenceRefs.push({
                  sourceUrl: page.url,
                  pageType: page.pageType,
                  snippet,
                  signalType: "CAPABILITY_STRONG_KEYWORD_MATCH",
                  strength: strength === "strong" ? "strong" : "medium",
                });
              }
            }
          }

          // Medium matching
          for (const kw of patterns.mediumKeywords) {
            if (matchKeyword(textToScan, kw)) {
              inferredFromSet.add(`medium_kw:${kw}`);
              sourcePagesSet.add(page.url);

              // Check context keywords proximity
              const hasContext = patterns.contextKeywords.some(ctx => matchKeyword(textToScan, ctx));
              const strength = (isHighSignalPage && hasContext) ? "strong" as const : "medium" as const;
              const confidence = strength === "strong" ? 0.85 : 0.70;

              if (confidence > highestConfidence) {
                highestConfidence = confidence;
                bestStrength = strength;
              }

              const snippet = excerptForBlock(block) || kw;
              if (!capabilityEvidenceRefs.some(ref => ref.sourceUrl === page.url && ref.snippet === snippet)) {
                capabilityEvidenceRefs.push({
                  sourceUrl: page.url,
                  pageType: page.pageType,
                  snippet,
                  signalType: "CAPABILITY_MEDIUM_KEYWORD_MATCH",
                  strength: strength === "strong" ? "strong" : "medium",
                });
              }
            }
          }

          // Weak matching
          for (const kw of patterns.weakKeywords) {
            if (matchKeyword(textToScan, kw)) {
              inferredFromSet.add(`weak_kw:${kw}`);
              sourcePagesSet.add(page.url);

              const confidence = 0.40;
              if (confidence > highestConfidence) {
                highestConfidence = confidence;
                bestStrength = "weak";
              }

              const snippet = excerptForBlock(block) || kw;
              if (!capabilityEvidenceRefs.some(ref => ref.sourceUrl === page.url && ref.snippet === snippet)) {
                capabilityEvidenceRefs.push({
                  sourceUrl: page.url,
                  pageType: page.pageType,
                  snippet,
                  signalType: "CAPABILITY_WEAK_KEYWORD_MATCH",
                  strength: "weak",
                });
              }
            }
          }
        }
      }

      // 2. Fallback heuristic detection using profile data if not detected from text
      if (highestConfidence < 0.40) {
        if (key === "cloud_scanning" && profile.dataInteractionModel?.value?.scansInfrastructure) {
          highestConfidence = 0.35;
          bestStrength = "weak";
          inferredFromSet.add("profile:dataInteractionModel:scansInfrastructure");
          capabilityEvidenceRefs.push({
            sourceUrl: "profile://dataInteractionModel",
            pageType: "other",
            snippet: "Structured data interaction profile indicates scanning of cloud infrastructure.",
            signalType: "PROFILE_METADATA_SIGNAL",
            strength: "weak",
          });
        } else if (key === "data_classification" && profile.dataInteractionModel?.value?.processesSensitiveData) {
          highestConfidence = 0.35;
          bestStrength = "weak";
          inferredFromSet.add("profile:dataInteractionModel:processesSensitiveData");
          capabilityEvidenceRefs.push({
            sourceUrl: "profile://dataInteractionModel",
            pageType: "other",
            snippet: "Structured data interaction profile indicates processing of sensitive customer data.",
            signalType: "PROFILE_METADATA_SIGNAL",
            strength: "weak",
          });
        } else if (key === "ai_inference" && profile.dataInteractionModel?.value?.usesAIOnCustomerData) {
          highestConfidence = 0.35;
          bestStrength = "weak";
          inferredFromSet.add("profile:dataInteractionModel:usesAIOnCustomerData");
          capabilityEvidenceRefs.push({
            sourceUrl: "profile://dataInteractionModel",
            pageType: "other",
            snippet: "Structured data interaction profile indicates usage of AI/LLM technologies on customer data.",
            signalType: "PROFILE_METADATA_SIGNAL",
            strength: "weak",
          });
        }
      }

      // Check if capability is detected with at least speculative confidence
      if (highestConfidence >= 0.30) {
        const inferredFrom = Array.from(inferredFromSet);
        const sourcePages = Array.from(sourcePagesSet);
        const sortedRefs = capabilityEvidenceRefs
          .sort((a, b) => {
            const weights = { strong: 3, medium: 2, weak: 1, authoritative: 4 };
            return (weights[b.strength] || 0) - (weights[a.strength] || 0);
          })
          .slice(0, 5); // Max 5 evidence refs

        // Evaluate authority for all evidence refs
        const evaluatedRefs = EvidenceAuthorityEngine.evaluateRefList(sortedRefs, extractedPages);

        let maxAuthorityScore = 0;
        const webUrls = new Set<string>();

        for (const r of evaluatedRefs) {
          if (r.sourceUrl && !r.sourceUrl.startsWith("profile://")) {
            webUrls.add(r.sourceUrl);
          }
          const auth = r.authority || EvidenceAuthorityEngine.evaluate(r);
          maxAuthorityScore = Math.max(maxAuthorityScore, auth.authorityScore);
        }

        const hasWebEvidence = webUrls.size > 0;
        let confidenceLabel: "Strong" | "Medium" | "Weak" | "Speculative" = "Weak";

        if (!hasWebEvidence) {
          confidenceLabel = "Speculative";
          highestConfidence = Math.min(0.35, highestConfidence);
          bestStrength = "weak";
        } else {
          const hasHighAuthority = maxAuthorityScore >= 80;
          const hasRepeatedEvidence = webUrls.size >= 2;

          // Check if matches have strong or medium keywords (not just weak)
          const hasAtLeastMediumMatch = inferredFrom.some(inf => inf.startsWith("strong_kw:") || inf.startsWith("medium_kw:"));

          if ((hasHighAuthority || hasRepeatedEvidence) && hasAtLeastMediumMatch) {
            confidenceLabel = "Strong";
            highestConfidence = Math.max(0.90, highestConfidence);
            bestStrength = "strong";
          } else if (hasAtLeastMediumMatch) {
            confidenceLabel = "Medium";
            highestConfidence = Math.min(0.75, Math.max(0.60, highestConfidence));
            bestStrength = "medium";
          } else {
            confidenceLabel = "Weak";
            highestConfidence = Math.min(0.50, highestConfidence);
            bestStrength = "weak";
          }
        }

        const recommendedFinalLabel = confidenceLabel === "Strong"
          ? "Strong Evidence"
          : confidenceLabel === "Medium"
          ? "Detected / Medium Evidence"
          : confidenceLabel === "Weak"
          ? "Needs Review / Weak Evidence"
          : "Speculative / Review Suggested";

        const rationale = `Detected capability '${def.label}' with ${confidenceLabel} confidence (${(highestConfidence * 100).toFixed(0)}% confidence). Inferred from keywords: ${inferredFrom.map(x => x.split(":")[1] || x).join(", ")}.`;

        const capability: ProductCapability = {
          key,
          label: def.label,
          confidence: highestConfidence,
          evidenceStrength: bestStrength,
          inferredFrom,
          evidenceRefs: sortedRefs,
          sourcePages,
          procurementRiskWeight: def.procurementRiskWeight,
          likelyQuestionnaireAreas: def.likelyQuestionnaireAreas,
          requiredEvidenceTypes: def.requiredEvidenceTypes,
          rationale,
          authorityScore: maxAuthorityScore,
          confidenceLabel,
          recommendedFinalLabel,
        };

        detectedCapabilities.push(capability);

        logger.info("PRODUCT_CAPABILITY_DETECTED", {
          key,
          label: def.label,
          confidence: highestConfidence,
          evidenceRefsCount: sortedRefs.length,
          confidenceLabel,
          authorityScore: maxAuthorityScore,
        });
      }
    }

    // 3. Resolve Procurement Implications from detected capabilities
    const procurementImplications: ProcurementImplication[] = [];
    const implicationMap = new Map<string, ProcurementImplication>();

    for (const cap of detectedCapabilities) {
      const implicationKeys = getImplicationsForCapability(cap.key);

      for (const impKey of implicationKeys) {
        const registryDetails = PROCUREMENT_IMPLICATION_REGISTRY[impKey];
        if (!registryDetails) continue;

        if (!implicationMap.has(impKey)) {
          const imp: ProcurementImplication = {
            key: impKey,
            label: registryDetails.label,
            severity: registryDetails.severity,
            rationale: registryDetails.rationale,
            triggeredByCapabilities: [cap.key],
            likelyCustomerConcerns: [...registryDetails.likelyCustomerConcerns],
            suggestedTrustTopics: [...registryDetails.suggestedTrustTopics],
          };
          implicationMap.set(impKey, imp);
        } else {
          const existing = implicationMap.get(impKey)!;
          if (!existing.triggeredByCapabilities.includes(cap.key)) {
            existing.triggeredByCapabilities.push(cap.key);
          }
        }
      }
    }

    // Convert map to array and log mapped implications
    for (const imp of implicationMap.values()) {
      procurementImplications.push(imp);
      logger.info("PROCUREMENT_IMPLICATION_MAPPED", {
        key: imp.key,
        severity: imp.severity,
        triggeredBy: imp.triggeredByCapabilities,
      });
    }

    // 4. Map Access Patterns, Infrastructure Touchpoints, and External Dependencies
    const accessPatterns: AccessPattern[] = [];
    const infrastructureTouchpoints: InfrastructureTouchpoint[] = [];
    const externalDependencyPatterns: ExternalDependencyPattern[] = [];

    // Helper to find maximum confidence amongst active triggering capabilities
    const getMaxConfidence = (keys: CapabilityKey[]): number => {
      const confs = detectedCapabilities
        .filter(c => keys.includes(c.key as CapabilityKey))
        .map(c => c.confidence);
      return confs.length > 0 ? Math.max(...confs) : 0;
    };

    // Access Patterns
    if (detectedCapabilities.some(c => c.key === "cloud_scanning")) {
      const conf = getMaxConfidence(["cloud_scanning"]);
      accessPatterns.push({
        key: "cloud_credential_access",
        label: "Access to Cloud Provider API credentials",
        confidence: conf,
        rationale: "Requires API key or cross-account IAM role access to scan AWS/Azure/GCP.",
      });
    }
    if (detectedCapabilities.some(c => c.key === "email_ingestion")) {
      const conf = getMaxConfidence(["email_ingestion"]);
      accessPatterns.push({
        key: "inbox_access",
        label: "Access to corporate/customer email inbox",
        confidence: conf,
        rationale: "Requires access to scan or forward emails.",
      });
    }
    if (detectedCapabilities.some(c => c.key === "endpoint_agent")) {
      const conf = getMaxConfidence(["endpoint_agent"]);
      accessPatterns.push({
        key: "endpoint_host_access",
        label: "Host-level agent system access",
        confidence: conf,
        rationale: "Requires installation of lightweight binary on endpoint host.",
      });
    }
    if (detectedCapabilities.some(c => c.key === "sensitive_data_discovery")) {
      const conf = getMaxConfidence(["sensitive_data_discovery"]);
      accessPatterns.push({
        key: "database_level_read",
        label: "Direct database scan access",
        confidence: conf,
        rationale: "Requires read access to target data stores to run discovery scans.",
      });
    }

    // Infrastructure Touchpoints
    if (detectedCapabilities.some(c => c.key === "cloud_scanning" || c.key === "cloud_connector")) {
      const conf = getMaxConfidence(["cloud_scanning", "cloud_connector"]);
      infrastructureTouchpoints.push({
        key: "customer_cloud_account",
        label: "Customer Cloud Account",
        confidence: conf,
        rationale: "Integrates directly with AWS, Azure, or GCP infrastructure.",
      });
    }
    if (detectedCapabilities.some(c => c.key === "api_gateway")) {
      const conf = getMaxConfidence(["api_gateway"]);
      infrastructureTouchpoints.push({
        key: "network_perimeter",
        label: "Network Perimeter Gateway",
        confidence: conf,
        rationale: "Sits at the ingress path to route and inspect API traffic.",
      });
    }
    if (detectedCapabilities.some(c => c.key === "endpoint_agent")) {
      const conf = getMaxConfidence(["endpoint_agent"]);
      infrastructureTouchpoints.push({
        key: "endpoint_devices",
        label: "User Endpoint Devices",
        confidence: conf,
        rationale: "Monitors individual employee devices and hosts directly.",
      });
    }

    // External Dependency Patterns
    if (detectedCapabilities.some(c => c.key === "ai_inference" || c.key === "ai_training")) {
      const conf = getMaxConfidence(["ai_inference", "ai_training"]);
      externalDependencyPatterns.push({
        key: "llm_api_providers",
        label: "Third-Party AI Subprocessors",
        confidence: conf,
        rationale: "Relies on API-based Large Language Models (OpenAI, Anthropic, etc.).",
      });
    }
    if (detectedCapabilities.some(c => c.key === "webhook_delivery")) {
      const conf = getMaxConfidence(["webhook_delivery"]);
      externalDependencyPatterns.push({
        key: "external_http_endpoints",
        label: "External HTTP Webhook Recipients",
        confidence: conf,
        rationale: "Dispatches payload events to custom outbound HTTP destinations.",
      });
    }

    const operationalWorkflows = WorkflowExtractionEngine.extract({ profile, extractedPages });

    logger.info("PRODUCT_GRAPH_BUILD_COMPLETE", {
      capabilitiesCount: detectedCapabilities.length,
      implicationsCount: procurementImplications.length,
      workflowsCount: operationalWorkflows.length,
    });

    return {
      productCapabilities: detectedCapabilities,
      procurementImplications,
      accessPatterns,
      infrastructureTouchpoints,
      externalDependencyPatterns,
      operationalWorkflows,
    };
  }
}
