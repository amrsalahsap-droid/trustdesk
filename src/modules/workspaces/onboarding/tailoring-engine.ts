import { type DeepInferredProfile } from "./website-analysis-service";
import { type RecommendedDocument } from "./document-recommendation-service";
import { CompanyProfileService } from "../company-profile-service";

export type TailoringMode = "HIGH_PRECISION" | "STANDARD_GUIDANCE" | "LIMITED_FALLBACK";

export type TailoredProfile = {
  companyName: string;
  industry: string[];
  productType: string[];
  customerSegment: string[];
  dataTypes: string[];
  complianceSignals: string[];

  // Deep Intelligence
  userTypes: string[];
  internalRoles: string[];
  operationalWorkflows: string[];
  trustClaims: string[];
  riskAreas: string[];

  mode: TailoringMode;
  confidence: number;
  signalsUsed: {
    field: string;
    category: import("./website-analysis-service").SignalCategory;
    source?: string;
    citations?: import("./evidence").SignalCitation[];
  }[];
};

/**
 * @deprecated Prefer {@link CompanyProfileService.build} +
 *   {@link CompanyProfileService.toTailoredProfile} for merged workspace intelligence.
 */
export class TailoringEngine {
  /**
   * Merges user-confirmed Workspace data with AI-inferred signals.
   * Confirmed data (manual edits) always overrides inference.
   */
  static merge(
    workspace: {
      id?: string;
      name: string;
      industry?: string[] | null;
      productType?: string[] | null;
      customerSegment?: string[] | null;
      dataTypes: string[];
      complianceTargets: string[];
    },
    inference: DeepInferredProfile | null,
  ): TailoredProfile {
    return CompanyProfileService.toTailoredProfile(
      CompanyProfileService.build({
        id: workspace.id,
        name: workspace.name,
        industry: workspace.industry,
        productType: workspace.productType,
        customerSegment: workspace.customerSegment,
        dataTypes: workspace.dataTypes,
        complianceTargets: workspace.complianceTargets,
        deepProfileJson: inference ?? null,
      }),
    );
  }
}
