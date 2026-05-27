import { logger } from "@/lib/logging/logger";
import { ProductGraph } from "../product-graph/product-graph-types";
import { BlastRadiusProfile, CompromiseScenario } from "./blast-radius-types";
import { BLAST_RADIUS_TAXONOMY } from "./blast-radius-taxonomy";

export class BlastRadiusEngine {
  /**
   * Evaluates the Product Graph properties to construct the Customer Blast Radius Profile.
   */
  static evaluate(params: { graph: ProductGraph }): BlastRadiusProfile {
    const { graph } = params;

    logger.info("BLAST_RADIUS_EVALUATION_START", {
      capabilitiesCount: graph.productCapabilities.length,
      workflowsCount: (graph.operationalWorkflows || []).length,
    });

    const activeCapabilities = graph.productCapabilities;
    const activeWorkflows = graph.operationalWorkflows || [];

    const capKeys = new Set(activeCapabilities.map(c => c.key));
    const flowKeys = new Set(activeWorkflows.map(w => w.key));

    // 1. Calculate Levels (Scale of 1.0 to 5.0)
    let customerDataExposureLevel = 1.0;
    if (capKeys.has("sensitive_data_discovery")) customerDataExposureLevel += 2.0;
    if (capKeys.has("email_ingestion") || capKeys.has("communication_ingestion")) customerDataExposureLevel += 1.5;
    if (activeWorkflows.some(w => w.key === "ingestion" && w.persistenceBehavior?.doesStoreData)) customerDataExposureLevel += 0.5;
    customerDataExposureLevel = Math.min(customerDataExposureLevel, 5.0);

    let infrastructureReachLevel = 1.0;
    if (capKeys.has("cloud_scanning")) infrastructureReachLevel += 2.0;
    if (capKeys.has("cloud_connector")) infrastructureReachLevel += 1.5;
    if (capKeys.has("endpoint_agent")) infrastructureReachLevel += 1.5;
    infrastructureReachLevel = Math.min(infrastructureReachLevel, 5.0);

    let actionExecutionRisk = 1.0;
    if (capKeys.has("privileged_access") || capKeys.has("cloud_scanning")) actionExecutionRisk += 2.0;
    if (capKeys.has("endpoint_agent")) actionExecutionRisk += 1.5;
    if (capKeys.has("webhook_delivery")) actionExecutionRisk += 0.5;
    actionExecutionRisk = Math.min(actionExecutionRisk, 5.0);

    let identityExposureLevel = 1.0;
    if (capKeys.has("support_access")) identityExposureLevel += 2.0;
    if (flowKeys.has("identity_auth") || flowKeys.has("support")) identityExposureLevel += 1.5;
    identityExposureLevel = Math.min(identityExposureLevel, 5.0);

    let operationalDependencyLevel = 1.0;
    if (capKeys.has("ai_inference") || capKeys.has("ai_training") || flowKeys.has("ai_analysis")) operationalDependencyLevel += 1.5;
    if (capKeys.has("webhook_delivery")) operationalDependencyLevel += 1.0;
    if (flowKeys.has("synchronization")) operationalDependencyLevel += 1.0;
    operationalDependencyLevel = Math.min(operationalDependencyLevel, 5.0);

    // 2. Generate Evidence-Backed Scenarios
    const compromiseScenarios: CompromiseScenario[] = [];

    for (const key of Object.keys(BLAST_RADIUS_TAXONOMY)) {
      const template = BLAST_RADIUS_TAXONOMY[key];

      const matchingCaps = template.triggerCapabilities.filter(c => capKeys.has(c));
      const matchingFlows = template.triggerWorkflows.filter(f => flowKeys.has(f));

      // Trigger if any trigger capability or workflow is active
      if (matchingCaps.length > 0 || matchingFlows.length > 0) {
        const inferredFrom = [
          ...matchingCaps.map(c => `capability:${c}`),
          ...matchingFlows.map(f => `workflow:${f}`)
        ];

        // Scenario-specific adjustments
        let finalProbability = template.probability;
        let finalImpact = template.impact;

        if (key === "infra_scan_abuse") {
          if (infrastructureReachLevel >= 4.0) {
            finalProbability = "medium";
            finalImpact = "critical";
          }
        }
        if (key === "customer_metadata_exposure") {
          if (customerDataExposureLevel >= 4.0) {
            finalProbability = "high";
          }
        }

        const scenario: CompromiseScenario = {
          key: template.key,
          name: template.name,
          probability: finalProbability,
          impact: finalImpact,
          description: template.description,
          compromiseVector: template.compromiseVector,
          businessImpact: template.businessImpact,
          inferredFrom,
          suggestedMitigations: [...template.suggestedMitigations]
        };

        compromiseScenarios.push(scenario);

        logger.info("BLAST_RADIUS_SCENARIO_GENERATED", {
          key: scenario.key,
          probability: scenario.probability,
          impact: scenario.impact,
          inferredFromCount: inferredFrom.length,
        });
      }
    }

    logger.info("BLAST_RADIUS_EVALUATION_COMPLETE", {
      scenariosCount: compromiseScenarios.length,
      levels: {
        customerDataExposureLevel,
        infrastructureReachLevel,
        actionExecutionRisk,
        identityExposureLevel,
        operationalDependencyLevel,
      }
    });

    return {
      customerDataExposureLevel,
      infrastructureReachLevel,
      actionExecutionRisk,
      identityExposureLevel,
      operationalDependencyLevel,
      compromiseScenarios,
    };
  }
}
