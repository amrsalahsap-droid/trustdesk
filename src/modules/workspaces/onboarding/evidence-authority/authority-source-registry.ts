import { PageType } from "../page-discovery";
import { AuthorityTier } from "./evidence-authority-types";

export type RegistryAuthorityConfig = {
  sourceType: string;
  tier: AuthorityTier;
  baseAuthorityScore: number;      // 0..100
  baseConfidenceModifier: number;  // Multiplier or factor to adjust confidence
};

export const AUTHORITY_SOURCE_REGISTRY: Record<string, RegistryAuthorityConfig> = {
  soc_report: {
    sourceType: "soc_report",
    tier: "very_high",
    baseAuthorityScore: 98,
    baseConfidenceModifier: 1.30,
  },
  trust_center: {
    sourceType: "trust_center",
    tier: "very_high",
    baseAuthorityScore: 95,
    baseConfidenceModifier: 1.25,
  },
  legal_docs: {
    sourceType: "legal_docs",
    tier: "very_high",
    baseAuthorityScore: 92,
    baseConfidenceModifier: 1.20,
  },
  api_schema: {
    sourceType: "api_schema",
    tier: "very_high",
    baseAuthorityScore: 95,
    baseConfidenceModifier: 1.25,
  },
  docs: {
    sourceType: "docs",
    tier: "high",
    baseAuthorityScore: 85,
    baseConfidenceModifier: 1.05,
  },
  setup_guides: {
    sourceType: "setup_guides",
    tier: "high",
    baseAuthorityScore: 85,
    baseConfidenceModifier: 1.05,
  },
  integration_docs: {
    sourceType: "integration_docs",
    tier: "high",
    baseAuthorityScore: 80,
    baseConfidenceModifier: 1.00,
  },
  product_page: {
    sourceType: "product_page",
    tier: "medium",
    baseAuthorityScore: 60,
    baseConfidenceModifier: 0.80,
  },
  blog: {
    sourceType: "blog",
    tier: "low",
    baseAuthorityScore: 40,
    baseConfidenceModifier: 0.50,
  },
  marketing: {
    sourceType: "marketing",
    tier: "low",
    baseAuthorityScore: 35,
    baseConfidenceModifier: 0.45,
  },
  other: {
    sourceType: "other",
    tier: "low",
    baseAuthorityScore: 30,
    baseConfidenceModifier: 0.40,
  },
};

/**
 * Resolves configuration from page properties or URL cues.
 */
export function getAuthorityConfig(url: string, pageType: PageType): RegistryAuthorityConfig {
  const lowerUrl = url.toLowerCase();

  // 1. SOC reports and trust center specific URL patterns
  if (lowerUrl.includes("/soc2") || lowerUrl.includes("soc-2") || lowerUrl.includes("/soc-report")) {
    return AUTHORITY_SOURCE_REGISTRY.soc_report;
  }
  if (lowerUrl.includes("/trust") || lowerUrl.includes("trust-center") || lowerUrl.includes("trust-portal") || pageType === "trust") {
    return AUTHORITY_SOURCE_REGISTRY.trust_center;
  }
  if (pageType === "security") {
    return AUTHORITY_SOURCE_REGISTRY.trust_center;
  }

  // 2. Legal pages and DPAs
  if (pageType === "legal" || pageType === "dpa" || pageType === "subprocessors" || pageType === "privacy") {
    return AUTHORITY_SOURCE_REGISTRY.legal_docs;
  }

  // 3. API schema / guides
  if (lowerUrl.includes("/api-reference") || lowerUrl.includes("/api-schema") || lowerUrl.includes("/openapi.json")) {
    return AUTHORITY_SOURCE_REGISTRY.api_schema;
  }

  // 4. Docs, setup guides, and integrations
  if (lowerUrl.includes("/setup-guide") || lowerUrl.includes("/install")) {
    return AUTHORITY_SOURCE_REGISTRY.setup_guides;
  }
  if (pageType === "docs") {
    return AUTHORITY_SOURCE_REGISTRY.docs;
  }
  if (pageType === "integrations" || pageType === "marketplace") {
    return AUTHORITY_SOURCE_REGISTRY.integration_docs;
  }

  // 5. Product Pages
  if (pageType === "product" || pageType === "platform" || pageType === "solutions") {
    return AUTHORITY_SOURCE_REGISTRY.product_page;
  }

  // 6. Blogs & general marketing pages
  if (lowerUrl.includes("/blog") || lowerUrl.includes("/news")) {
    return AUTHORITY_SOURCE_REGISTRY.blog;
  }
  if (pageType === "homepage" || lowerUrl.includes("/marketing") || lowerUrl.includes("/features")) {
    return AUTHORITY_SOURCE_REGISTRY.marketing;
  }

  return AUTHORITY_SOURCE_REGISTRY.other;
}
