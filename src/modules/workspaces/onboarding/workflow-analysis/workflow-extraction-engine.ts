import { logger } from "@/lib/logging/logger";
import { DeepInferredProfile } from "../onboarding-core-types";
import { StructuredPageEvidence, excerptForBlock } from "../evidence";
import { EvidenceRef } from "../evidence-scoring";
import { OperationalWorkflow } from "./workflow-analysis-types";
import { WORKFLOW_PATTERN_REGISTRY, WorkflowPattern } from "./workflow-pattern-registry";
import { mapWorkflowRisks } from "./workflow-risk-mapper";

export class WorkflowExtractionEngine {
  /**
   * Performs deterministic evidence-backed operational workflow extraction.
   */
  static extract(params: {
    profile: DeepInferredProfile;
    extractedPages?: StructuredPageEvidence[];
  }): OperationalWorkflow[] {
    const { profile, extractedPages = [] } = params;

    logger.info("WORKFLOW_EXTRACTION_START", {
      companyName: profile.companyName || "Unknown",
      pagesScannedCount: extractedPages.length,
    });

    const extractedWorkflows: OperationalWorkflow[] = [];
    const highSignalPageTypes = new Set(["docs", "pricing", "integration", "security", "compliance", "trust", "legal"]);

    // Iterate through supported patterns
    for (const key of Object.keys(WORKFLOW_PATTERN_REGISTRY)) {
      const pattern = WORKFLOW_PATTERN_REGISTRY[key];

      let highestConfidence = 0;
      let bestStrength: "strong" | "medium" | "weak" = "weak";
      const inferredFromSet = new Set<string>();
      const sourcePagesSet = new Set<string>();
      const workflowEvidenceRefs: EvidenceRef[] = [];

      // 1. Deterministic Page Scanning
      for (const page of extractedPages) {
        const pageType = page.pageType.toLowerCase();
        const isHighSignalPage = highSignalPageTypes.has(pageType);

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

          // Check strong keywords
          for (const kw of pattern.strongKeywords) {
            if (lowerText.includes(kw)) {
              inferredFromSet.add(`strong_kw:${kw}`);
              sourcePagesSet.add(page.url);

              // Setup guides/docs/integration pages are highest confidence
              const strength = isHighSignalPage ? ("strong" as const) : ("medium" as const);
              const confidence = strength === "strong" ? 0.95 : 0.75;

              if (confidence > highestConfidence) {
                highestConfidence = confidence;
                bestStrength = strength;
              }

              const snippet = excerptForBlock(block) || kw;
              if (!workflowEvidenceRefs.some(ref => ref.sourceUrl === page.url && ref.snippet === snippet)) {
                workflowEvidenceRefs.push({
                  sourceUrl: page.url,
                  pageType: page.pageType,
                  snippet,
                  signalType: "WORKFLOW_STRONG_KEYWORD_MATCH",
                  strength: strength === "strong" ? "strong" : "medium",
                });
              }
            }
          }

          // Check medium keywords
          for (const kw of pattern.mediumKeywords) {
            if (lowerText.includes(kw)) {
              inferredFromSet.add(`medium_kw:${kw}`);
              sourcePagesSet.add(page.url);

              const hasContext = pattern.contextKeywords.some(ctx => lowerText.includes(ctx));
              const strength = (isHighSignalPage && hasContext) ? ("strong" as const) : ("medium" as const);
              const confidence = strength === "strong" ? 0.85 : 0.70;

              if (confidence > highestConfidence) {
                highestConfidence = confidence;
                bestStrength = strength;
              }

              const snippet = excerptForBlock(block) || kw;
              if (!workflowEvidenceRefs.some(ref => ref.sourceUrl === page.url && ref.snippet === snippet)) {
                workflowEvidenceRefs.push({
                  sourceUrl: page.url,
                  pageType: page.pageType,
                  snippet,
                  signalType: "WORKFLOW_MEDIUM_KEYWORD_MATCH",
                  strength: strength === "strong" ? "strong" : "medium",
                });
              }
            }
          }
        }
      }

      // 2. Metadata Fallback Heuristics
      if (highestConfidence < 0.40) {
        if (key === "scanning" && profile.dataInteractionModel?.value?.scansInfrastructure) {
          highestConfidence = 0.75;
          bestStrength = "medium";
          inferredFromSet.add("profile:dataInteractionModel:scansInfrastructure");
          workflowEvidenceRefs.push({
            sourceUrl: "profile://dataInteractionModel",
            pageType: "other",
            snippet: "Profile metadata triggers infrastructure scanning behavior.",
            signalType: "PROFILE_METADATA_SIGNAL",
            strength: "medium",
          });
        } else if (key === "ai_analysis" && profile.dataInteractionModel?.value?.usesAIOnCustomerData) {
          highestConfidence = 0.75;
          bestStrength = "medium";
          inferredFromSet.add("profile:dataInteractionModel:usesAIOnCustomerData");
          workflowEvidenceRefs.push({
            sourceUrl: "profile://dataInteractionModel",
            pageType: "other",
            snippet: "Profile metadata triggers usage of AI subprocessor engines.",
            signalType: "PROFILE_METADATA_SIGNAL",
            strength: "medium",
          });
        }
      }

      // If workflow detected, assemble and finalize
      if (highestConfidence >= 0.40) {
        const inferredFrom = Array.from(inferredFromSet);
        const sourcePages = Array.from(sourcePagesSet);
        const sortedRefs = workflowEvidenceRefs
          .sort((a, b) => {
            const weights = { strong: 3, medium: 2, weak: 1, authoritative: 4 };
            return (weights[b.strength] || 0) - (weights[a.strength] || 0);
          })
          .slice(0, 5); // Max 5 evidence refs

        // Resolve risk mappings
        const risks = mapWorkflowRisks(key, inferredFrom);

        const rationale = `Inferred operational workflow '${pattern.label}' with ${bestStrength} evidence strength (${(highestConfidence * 100).toFixed(0)}% confidence). Traced to documentation pages highlighting: ${inferredFrom.map(x => x.split(":")[1] || x).join(", ")}.`;

        const workflow: OperationalWorkflow = {
          key: pattern.key,
          label: pattern.label,
          confidence: highestConfidence,
          evidenceRefs: sortedRefs,
          sourcePages,
          steps: [...pattern.steps],
          dataFlow: [...pattern.dataFlow],
          accessFlow: [...pattern.accessFlow],
          persistenceBehavior: pattern.persistenceBehavior ? { ...pattern.persistenceBehavior } : undefined,
          aiInteraction: pattern.aiInteraction ? { ...pattern.aiInteraction } : undefined,
          procurementRisks: risks.procurementRisks,
          trustImplications: risks.trustImplications,
          evidenceRequirements: risks.evidenceRequirements,
          rationale,
        };

        extractedWorkflows.push(workflow);

        logger.info("WORKFLOW_EXTRACTED", {
          key: workflow.key,
          label: workflow.label,
          confidence: highestConfidence,
          evidenceRefsCount: sortedRefs.length,
          risksCount: risks.procurementRisks.length,
        });
      }
    }

    logger.info("WORKFLOW_EXTRACTION_COMPLETE", {
      extractedWorkflowsCount: extractedWorkflows.length,
    });

    return extractedWorkflows;
  }
}
