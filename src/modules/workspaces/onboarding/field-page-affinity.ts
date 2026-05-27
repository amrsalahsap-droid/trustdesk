import { HIGH_SIGNAL_TYPES, type PageType } from "./page-discovery";

/** Fields inferred primarily from marketing / product / company pages. */
export const BUSINESS_FIELDS = new Set([
  "industry",
  "productType",
  "customerSegment",
  "userTypes",
  "internalRoles",
  "operationalWorkflows",
  "businessDomain",
  "solutionCategories",
  "productLines",
  "useCases",
  "deploymentComponents",
  "customerRoles",
  "dataInteractionModel",
]);

/** Fields that should be grounded on trust, privacy, or compliance pages when OBSERVED. */
export const COMPLIANCE_FIELDS = new Set([
  "complianceSignals",
  "dataTypes",
  "trustClaims",
  "riskAreas",
  "vendorCertifications",
  "productSupportedFrameworks",
  "privacyPostureSignals",
]);

const BUSINESS_PAGE_TYPES: ReadonlySet<PageType> = new Set([
  "homepage",
  "product",
  "industries",
  "docs",
  "about",
  /** Bonus: posture pages can still support business claims when cited. */
  "security",
  "trust",
  "privacy",
  "compliance",
  "other",
]);

export const COMPLIANCE_PAGE_TYPES: ReadonlySet<PageType> = new Set([
  "security",
  "trust",
  "privacy",
  "compliance",
]);

export type SignalFieldKey =
  | "industry"
  | "productType"
  | "customerSegment"
  | "dataTypes"
  | "complianceSignals"
  | "userTypes"
  | "internalRoles"
  | "operationalWorkflows"
  | "trustClaims"
  | "riskAreas"
  | "businessDomain"
  | "solutionCategories"
  | "productLines"
  | "useCases"
  | "deploymentComponents"
  | "customerRoles"
  | "dataInteractionModel"
  | "vendorCertifications"
  | "productSupportedFrameworks"
  | "privacyPostureSignals";

/**
 * Page types that can legitimately support an OBServed citation for this field
 * when applying evidence-based confidence caps (business vs compliance).
 */
export function allowedPageTypesForField(field: SignalFieldKey): ReadonlySet<PageType> {
  if (field === "productSupportedFrameworks") return BUSINESS_PAGE_TYPES; // Broader sourcing allowed
  if (COMPLIANCE_FIELDS.has(field)) return COMPLIANCE_PAGE_TYPES; // Strict sourcing for vendor claims
  if (BUSINESS_FIELDS.has(field)) return BUSINESS_PAGE_TYPES;
  return HIGH_SIGNAL_TYPES;
}

export function isCitationOnAllowedPageForField(
  field: SignalFieldKey,
  pageType: PageType | undefined,
): boolean {
  if (!pageType) return false;
  return allowedPageTypesForField(field).has(pageType);
}
