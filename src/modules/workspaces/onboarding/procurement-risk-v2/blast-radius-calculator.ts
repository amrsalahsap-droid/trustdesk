import { ProductCapability } from "../product-graph/product-graph-types";
import { OperationalWorkflow } from "../workflow-analysis/workflow-analysis-types";
import { BlastRadiusAssessment } from "./procurement-risk-types";

export class BlastRadiusCalculator {
  /**
   * Computes the blast radius score and rating for active capabilities and workflows.
   */
  static calculate(params: {
    capabilities: ProductCapability[];
    workflows: OperationalWorkflow[];
  }): BlastRadiusAssessment {
    const { capabilities, workflows } = params;

    let score = 0.1;
    const factors: string[] = [];

    const activeCapKeys = new Set(capabilities.map(c => c.key));
    const activeFlowKeys = new Set(workflows.map(w => w.key));

    // Factor 1: Host / Endpoint Access (High Impact)
    if (activeCapKeys.has("endpoint_agent") || activeFlowKeys.has("browser_device")) {
      score += 0.3;
      factors.push("Endpoint-level system / browser agent access");
    }

    // Factor 2: Infrastructure Reach (High Impact)
    if (activeCapKeys.has("cloud_scanning") || activeCapKeys.has("cloud_connector") || activeFlowKeys.has("scanning") || activeFlowKeys.has("infra_scanning")) {
      score += 0.3;
      factors.push("Direct Cloud API / IAM role permission authority");
    }

    // Factor 3: Support Impersonation (Medium-High Impact)
    if (activeCapKeys.has("support_access") || activeFlowKeys.has("support")) {
      score += 0.2;
      factors.push("Just-in-time (JIT) employee impersonation ability");
    }

    // Factor 4: Sensitive Data Access
    if (activeCapKeys.has("sensitive_data_discovery") || activeCapKeys.has("pii_redaction")) {
      score += 0.2;
      factors.push("Sensitive customer database discovery and scan credentials");
    }

    // Factor 5: Ingestion / Sync pipelines
    if (activeCapKeys.has("email_ingestion") || activeCapKeys.has("communication_ingestion") || activeFlowKeys.has("ingestion") || activeFlowKeys.has("synchronization")) {
      score += 0.15;
      factors.push("Continuous inbound data ingestion or background file sync");
    }

    // Cap the score at 1.0
    score = Math.min(score, 1.0);

    let rating: "low" | "medium" | "high" | "critical" = "low";
    if (score >= 0.8) {
      rating = "critical";
    } else if (score >= 0.5) {
      rating = "high";
    } else if (score >= 0.3) {
      rating = "medium";
    }

    const rationale = `Blast radius evaluated at ${rating} (${(score * 100).toFixed(0)}% severity score) driven by: ${factors.join(", ") || "no high-impact operational integrations detected"}.`;

    return {
      score,
      rating,
      factors,
      rationale,
    };
  }
}
