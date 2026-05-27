/**
 * Enhanced Domain Crawler for Trust Profile Discovery
 *
 * Discovers high-value pages from company domains to support Trust Profile decisions.
 * Features:
 * - Sitemap.xml parsing
 * - robots.txt inspection
 * - Navigation/footer link extraction
 * - URL pattern prioritization
 * - Bounded crawling (max pages, max depth, same-domain)
 * - Blog/news archive avoidance
 * - Detailed crawl diagnostics
 */

import { AiHttpClient, HttpFetchError } from "@/lib/ai/ai-http-client";
import { 
  generateCorrelationId, 
  logCrawlStart, 
  logUrlAttempt, 
  logUrlSuccess, 
  logUrlFailure, 
  logSitemapDiscovery,
  logPageClassification,
  logCrawlComplete,
  logPipelineError
} from "./domain-intelligence-logger";
import { logger } from "@/lib/logging/logger";
import { 
  CrawlStage, 
  getURLStage, 
  classifyPageType as classifyType,
  getEvidenceIntent,
  EvidenceIntent,
  TYPE_WEIGHT,
  type PageType
} from "./page-discovery";

export type CrawlConfig = {
  maxEvidencePages: number; // useful successful pages
  maxAttempts: number;      // total HTTP attempts (failed/skipped included)
  evidenceBuckets: {
    trustCompliance: number;
    productServices: number;
    privacyLegal: number;
    integrationsDocs: number;
    homepageCore: number;
  };
  maxDepth: number;
  timeoutMs: number;
  maxRetries: number;
  respectRobotsTxt: boolean;
  allowBlogPaths: boolean;
};

export const DEFAULT_CRAWL_CONFIG: CrawlConfig = {
  maxEvidencePages: 15,
  maxAttempts: 25,
  evidenceBuckets: {
    trustCompliance: 4,
    productServices: 5,
    privacyLegal: 2,
    integrationsDocs: 2,
    homepageCore: 1,
  },
  maxDepth: 3,
  timeoutMs: 10000,
  maxRetries: 2,
  respectRobotsTxt: true,
  allowBlogPaths: false,
};

/**
 * Evidence snippet extracted from a page for structured evidence collection.
 */
export type EvidenceSnippet = {
  /** Type of evidence snippet */
  type: "heading" | "paragraph" | "list" | "table" | "meta";
  /** Content of the snippet */
  content: string;
  /** Context or selector for the snippet */
  context?: string;
  /** Relevance score for this snippet (0-100) */
  relevanceScore: number;
};

/**
 * Structured evidence page with comprehensive extracted information.
 */
export type EvidencePage = {
  /** Original URL attempted */
  url: string;
  /** Final URL after redirects */
  finalUrl?: string;
  /** Page title */
  title?: string;
  /** Classified page type */
  pageType: PageType;
  /** HTTP status code */
  statusCode?: number;
  /** Extraction status */
  extractionStatus: "success" | "timeout" | "error" | "blocked" | "skipped" | "unreadable_content" | "decode_failed";
  /** Total text length */
  textLength?: number;
  /** Useful text length (excluding boilerplate) */
  usefulTextLength?: number;
  /** Extracted headings (h1, h2, h3) */
  headings: string[];
  /** Meta description */
  metaDescription?: string;
  /** Evidence snippets for structured analysis */
  evidenceSnippets: EvidenceSnippet[];
  /** Usefulness score for business value (0-100) */
  usefulnessScore: number;
  /** Indicates this page is a PDF or other document candidate */
  documentEvidenceCandidate?: boolean;
};

/**
 * Crawl issue or warning for diagnostics.
 */
export type CrawlIssue = {
  /** Issue type */
  type: "error" | "warning" | "info";
  /** Issue message */
  message: string;
  /** URL related to the issue */
  url?: string;
  /** Timestamp when issue occurred */
  timestamp: Date;
};

/**
 * Structured Domain Evidence Pack containing all extracted evidence and metadata.
 */
export type EvidencePack = {
  /** Unique identifier for this crawl run */
  crawlRunId?: string;
  /** Base domain being analyzed */
  domain: string;
  /** Canonical base URL used for crawling */
  canonicalBaseUrl: string;
  /** Total pages attempted */
  pagesAttempted: number;
  /** Total pages successfully fetched */
  pagesFetched: number;
  /** Number of high-value pages found */
  highValuePagesFound: number;
  /** Number of security/legal pages found */
  securityLegalPagesFound: number;
  /** Total useful characters extracted */
  totalUsefulChars: number;
  /** Issues encountered during crawling */
  issues: CrawlIssue[];
  /** Structured evidence pages */
  pages: EvidencePage[];
  /** Crawl duration in milliseconds */
  durationMs: number;
  /** Timestamp when crawl completed */
  completedAt: Date;
  /** Product-specific diagnostics */
  productPagesAttempted?: number;
  productPagesFetched?: number;
  productPagesWithEvidence?: number;
  namedProductPagesDetected?: number;
  productBudgetUsed?: number;
  productBudgetSkipped?: number;
};

/**
 * Usefulness tiers for business value ranking.
 */
export type UsefulnessTier = "critical" | "high" | "medium" | "low" | "minimal";

export type CrawlAttempt = {
  attemptedUrl: string;
  fetchedUrl?: string;
  statusCode?: number;
  /** @deprecated Use requestSucceeded / extractionSucceeded / evidenceSucceeded instead */
  success: boolean;
  /**
   * Layer 1 — HTTP transport: response received (any 2xx/3xx that resolved, correct content-type).
   * True even if the page body is thin / unreadable.
   */
  requestSucceeded: boolean;
  /**
   * Layer 2 — Static extraction: body passed readability + threshold gates AND HTML was stored.
   * Requires requestSucceeded = true.
   */
  extractionSucceeded: boolean;
  /**
   * Layer 3 — Evidence: at least one structured block with usable text was extracted,
   * OR a render pass succeeded and produced usable text.
   * This is what the inference layer should use.
   */
  evidenceSucceeded: boolean;
  title?: string;
  textLength?: number;
  /** HTML content of the page (stored to avoid double-fetching) */
  html?: string;
  /** Detailed backend status for accurate failure classification */
  backendStatus: "success" | "forbidden_403" | "blocked_by_site" | "rate_limited_429" | "server_error_5xx" | "timeout" | "dns_error" | "robots_disallowed" | "unsupported_content_type" | "no_useful_content" | "network_error" | "unreadable_content" | "decode_failed";
  /** Legacy extraction status for backward compatibility */
  extractionStatus: "success" | "timeout" | "error" | "blocked" | "skipped" | "unreadable_content" | "decode_failed";
  errorMessage?: string;
  contentType?: string;
  contentEncoding?: string;
  readableRatio?: number;
  readabilityDiagnostics?: {
    printableRatio: number;
    letterOrNumberRatio: number;
    replacementCharRatio: number;
    controlCharRatio: number;
    detectedScript?: string;
  };
  finalUrl?: string;
  duration?: number;
  usefulTextLength?: number;
  depth: number;
  discoveredLinks: Array<{ url: string; anchorText?: string }>;
  timestamp: Date;
  /** Classified page type based on URL, title, and content */
  pageType: PageType;
  /** Usefulness score for business value (0-100) */
  usefulnessScore: number;
  /** Usefulness tier for filtering */
  usefulnessTier: UsefulnessTier;
  /** Indicates this page is a PDF or other document candidate */
  documentEvidenceCandidate?: boolean;
  /** Diagnostic fields for fallback and recovery */
  renderEligible?: boolean;
  renderAttempted?: boolean;
  renderSucceeded?: boolean;
  staticFailureReason?: string;
  renderedUsefulChars?: number;
  thresholdUsed?: number;
  thresholdReason?: string;
  /** Classification signals that contributed to pageType */
  classificationSignals: {
    urlPattern?: string;
    titlePattern?: string;
    headingMatches?: string[];
  };
};

export type CrawlResult = {
  baseDomain: string;
  startUrl: string;
  pages: CrawlAttempt[];
  totalAttempted: number;
  /** Layer 1: pages that returned HTTP 200 + valid content-type (= requestSucceeded). */
  totalRequested: number;
  /** Layer 2: pages that passed readability + threshold gates (= extractionSucceeded). */
  totalExtracted: number;
  /** Layer 3: pages that produced at least one usable structured block (= evidenceSucceeded). */
  totalEvidenced: number;
  /** @deprecated Use totalRequested. Kept for backward compat with legacy callers. */
  totalFetched: number;
  /** @deprecated Use totalExtracted. Kept for backward compat with legacy callers. */
  totalSuccessful: number;
  durationMs: number;
  robotsTxt?: {
    sitemaps: string[];
    disallowPrefixes: string[];
    crawlDelay?: number;
  };
  sitemapUrls: string[];
  highValueUrls: string[];
  /** Classification summary by page type */
  classificationSummary: Record<PageType, number>;
  /** Pages grouped by usefulness tier */
  pagesByTier: Record<UsefulnessTier, CrawlAttempt[]>;
  /** Critical/high usefulness pages for quick access */
  highValuePages: CrawlAttempt[];
  /** Discovered PDF URLs for later processing */
  pdfCandidates: string[];
  /** Subdomains attempted during discovery */
  subdomainsAttempted: string[];
  /** Subdomains successfully found and crawled */
  subdomainsFound: string[];
  /** Staged crawl diagnostics */
  stagedDiagnostics?: {
    stageAllocation: Record<string, number>;
    bucketAllocation: Record<string, number>;
    bucketUsage: Record<string, number>;
    unusedReserves: Record<string, number>;
    overflowBorrowing: number;
    skippedHighValuePagesByBucket: Record<string, number>;
    candidateDiagnostics?: Array<{
      url: string;
      source: string;
      intent: string;
      score: number;
      selectedForFetch: boolean;
      skippedReason?: string;
      pageType: string;
      matchedPattern?: string;
    }>;
  };
  /** Budget usage tracking */
  budgetUsage?: {
    attemptsUsed: number;
    evidencePagesFound: number;
    remainingAttempts: number;
    remainingEvidenceSlots: number;
    bucketUsage: Record<string, number>;
    productDiagnostics?: {
      attempted: number;
      fetched: number;
      evidenced: number;
      namedDetected: number;
      budgetUsed: number;
      budgetSkipped: number;
    };
  };
};

/**
 * Get pages filtered by usefulness tier.
 */
export function getPagesByTier(
  result: CrawlResult,
  tier: UsefulnessTier,
): CrawlAttempt[] {
  return result.pagesByTier[tier] || [];
}

/**
 * Get critical and high-value pages sorted by usefulness score.
 */
export function getHighValuePages(result: CrawlResult): CrawlAttempt[] {
  return [...result.pagesByTier.critical, ...result.pagesByTier.high].sort(
    (a, b) => b.usefulnessScore - a.usefulnessScore,
  );
}

/**
 * Get pages by specific type.
 */
export function getPagesByType(
  result: CrawlResult,
  pageType: PageType,
): CrawlAttempt[] {
  return result.pages.filter((p) => p.pageType === pageType);
}

export type URLScore = {
  url: string;
  score: number;
  patterns: string[];
  source: "sitemap" | "html_nav" | "html_footer" | "html_body" | "subdomain_probe" | "prioritized_guess" | "homepage-nav" | "homepage-footer" | "page-links";
};

// High-value URL patterns for Trust Profile decisions
const HIGH_VALUE_PATTERNS: Array<{ pattern: RegExp; weight: number; name: string }> = [
  { pattern: /\/security(-policy|-center|-portal)?(\/|$)/i, weight: 100, name: "security" },
  { pattern: /\/trust(-center|-portal)?(\/|$)/i, weight: 100, name: "trust" },
  { pattern: /\/compliance(-reports)?(\/|$)/i, weight: 95, name: "compliance" },
  { pattern: /\/privacy(-policy|-notice|-center)?(\/|$)/i, weight: 90, name: "privacy" },
  { pattern: /\/(dpa|data-processing-agreement|data-processing-addendum|data-processing)(\/|$)/i, weight: 90, name: "dpa" },
  { pattern: /\/subprocessors(\/|$)/i, weight: 85, name: "subprocessors" },
  { pattern: /\/(gdpr|hipaa|soc-?2|iso-?27001|iso27001)(\/|$)/i, weight: 90, name: "compliance-standard" },
  { pattern: /\/(legal|terms|terms-of-service|tos)(\/|$)/i, weight: 80, name: "legal" },
  { pattern: /\/security-and-compliance(\/|$)/i, weight: 90, name: "security-and-compliance" },
  { pattern: /\/docs\/security(\/|$)/i, weight: 80, name: "docs-security" },
  { pattern: /\/help\/security(\/|$)/i, weight: 80, name: "help-security" },
  
  // Product & Solution patterns (Specific keywords for Cybral and similar platforms)
  { pattern: /\/(cybral-guard|guard|storm|cybral-storm|storm-analyzer|storm-attacker|storm-xasm)(\/|$)/i, weight: 85, name: "product-specific" },
  { pattern: /\/(product(s)?|platform|solutions?|features|use-cases|services)(\/|$)/i, weight: 80, name: "product-generic" },
  { pattern: /\/(data-classification|data-discovery|dspm|ctem|asm|attack-surface|cloud-security|data-security|marketplace|auctions?|payment|connector|api)(\/|$)/i, weight: 85, name: "product-capability" },
  
  { pattern: /\/about(-us)?(\/|$)/i, weight: 65, name: "about" },
  { pattern: /\/company(\/|$)/i, weight: 65, name: "company" },
  { pattern: /\/docs(\/|$)/i, weight: 60, name: "docs" },
  { pattern: /\/help(\/|$)/i, weight: 60, name: "help" },
  { pattern: /\/pricing(\/|$)/i, weight: 55, name: "pricing" },
  { pattern: /\/customers(\/|$)/i, weight: 50, name: "customers" },
  { pattern: /\/case-studies(\/|$)/i, weight: 50, name: "case-studies" },
  { pattern: /\/integrations(\/|$)/i, weight: 45, name: "integrations" },
];

/**
 * Page classification patterns map URL patterns to page types.
 * Each pattern includes a confidence weight for classification scoring.
 */
const PAGE_TYPE_PATTERNS: Array<{
  pattern: RegExp;
  pageType: PageType;
  weight: number;
  source: "url";
}> = [
  // Critical Trust Profile pages (security, trust, compliance)
  { pattern: /\/security(\/|$|\?)/i, pageType: "security", weight: 100, source: "url" },
  { pattern: /\/trust(\/|center|portal|-center|-portal)?(\/|$|\?)/i, pageType: "trust", weight: 100, source: "url" },
  { pattern: /\/compliance(\/|$|\?)/i, pageType: "compliance", weight: 95, source: "url" },
  { pattern: /\/privacy(-policy|-notice|-center)?(\/|$|\?)/i, pageType: "privacy", weight: 90, source: "url" },
  { pattern: /\/(dpa|data-processing-addendum)(\/|$|\?)/i, pageType: "dpa", weight: 90, source: "url" },
  { pattern: /\/subprocessors(\/|$|\?)/i, pageType: "subprocessors", weight: 85, source: "url" },
  { pattern: /\/(legal|terms|terms-of-service|tos)(\/|$|\?)/i, pageType: "legal", weight: 85, source: "url" },
  { pattern: /\b(status)\b(\/|$|\?)/i, pageType: "status", weight: 70, source: "url" },

  // Product/Company pages
  { pattern: /\/product(s)?(\/|$|\?)/i, pageType: "product", weight: 80, source: "url" },
  { pattern: /\/platform(\/|$|\?)/i, pageType: "product", weight: 80, source: "url" },
  { pattern: /\/solutions?(\/|$|\?)/i, pageType: "solutions", weight: 75, source: "url" },
  { pattern: /\/services(\/|$|\?)/i, pageType: "product", weight: 75, source: "url" },
  { pattern: /\/use-cases?(\/|$|\?)/i, pageType: "product", weight: 75, source: "url" },
  { pattern: /\/marketplace(\/|$|\?)/i, pageType: "product", weight: 85, source: "url" },
  { pattern: /\/auctions?(\/|$|\?)/i, pageType: "product", weight: 85, source: "url" },
  { pattern: /\/about(-us)?(\/|$|\?)/i, pageType: "about", weight: 70, source: "url" },
  { pattern: /\/company(\/|$|\?)/i, pageType: "about", weight: 70, source: "url" },

  // Documentation/Support
  { pattern: /\/(docs|documentation|developers?|dev)(\/|$|\?)/i, pageType: "docs", weight: 60, source: "url" },
  { pattern: /\/(help|support|kb|knowledge)(\/|$|\?)/i, pageType: "docs", weight: 55, source: "url" },
  { pattern: /\/api(\/|$|\?)/i, pageType: "docs", weight: 60, source: "url" },

  // Sales/Customer pages
  { pattern: /\/pricing(\/|$|\?)/i, pageType: "pricing", weight: 50, source: "url" },
  { pattern: /\/customers?(\/|$|\?)/i, pageType: "customers", weight: 50, source: "url" },
  { pattern: /\/case-stud(y|ies)(\/|$|\?)/i, pageType: "case_study", weight: 50, source: "url" },
  { pattern: /\/integrations?(\/|$|\?)/i, pageType: "integrations", weight: 45, source: "url" },
  { pattern: /\/partners?(\/|$|\?)/i, pageType: "integrations", weight: 40, source: "url" },
];

/**
 * Title-based classification patterns.
 */
const TITLE_TYPE_PATTERNS: Array<{
  pattern: RegExp;
  pageType: PageType;
  weight: number;
}> = [
  // Security/Trust
  { pattern: /\bsecurity\b/i, pageType: "security", weight: 90 },
  { pattern: /\btrust\s+(center|portal|page|program)/i, pageType: "trust", weight: 90 },
  { pattern: /\bcompliance\b/i, pageType: "compliance", weight: 85 },
  { pattern: /\bprivacy\s+(policy|notice|statement)/i, pageType: "privacy", weight: 85 },
  { pattern: /\bdpa\b|\bdata\s+processing\b/i, pageType: "dpa", weight: 85 },
  { pattern: /\bterms\s+(of\s+service|of\s+use)?\b/i, pageType: "legal", weight: 80 },
  { pattern: /\blegal\b/i, pageType: "legal", weight: 75 },

  // Product
  { pattern: /\bproduct(s|\s+page)?\b/i, pageType: "product", weight: 75 },
  { pattern: /\bplatform\b/i, pageType: "product", weight: 70 },
  { pattern: /\bsolutions?\b/i, pageType: "solutions", weight: 70 },
  { pattern: /\bfeatures?\b/i, pageType: "product", weight: 65 },

  // Company
  { pattern: /\babout\s+(us|our\s+company)\b/i, pageType: "about", weight: 70 },
  { pattern: /\bwho\s+we\s+are\b/i, pageType: "about", weight: 70 },
  { pattern: /\bcompany\b/i, pageType: "about", weight: 65 },

  // Docs
  { pattern: /\bdocumentation\b/i, pageType: "docs", weight: 65 },
  { pattern: /\bapi\s+(docs|reference|guide)\b/i, pageType: "docs", weight: 65 },
  { pattern: /\bdevelopers?\b/i, pageType: "docs", weight: 60 },
  { pattern: /\bhelp\s+(center|docs)?\b/i, pageType: "docs", weight: 55 },

  // Customers
  { pattern: /\bpricing\b/i, pageType: "pricing", weight: 60 },
  { pattern: /\bcustomers?\b|\bclients?\b/i, pageType: "customers", weight: 55 },
  { pattern: /\bcase\s+stud(y|ies)\b/i, pageType: "case_study", weight: 55 },
  { pattern: /\bintegrations?\b/i, pageType: "integrations", weight: 50 },
];

/**
 * Usefulness scores by page type for business value ranking.
 */
const USEFULNESS_SCORES: Record<PageType, number> = {
  security: 100,
  trust: 95,
  compliance: 90,
  privacy: 85,
  dpa: 85,
  legal: 80,
  product: 75,
  platform: 75,
  solutions: 70,
  about: 65,
  company: 65,
  docs: 60,
  pricing: 55,
  customers: 50,
  case_study: 50,
  integrations: 45,
  homepage: 40,
  other: 10,
};

/**
 * Usefulness tiers for filtering and prioritization.
 */
export function getUsefulnessTier(score: number): UsefulnessTier {
  if (score >= 85) return "critical";
  if (score >= 70) return "high";
  if (score >= 50) return "medium";
  if (score >= 30) return "low";
  return "minimal";
}

/**
 * Adjust usefulness score based on content quality.
 */
export function adjustForContentQuality(
  baseScore: number,
  textLength: number,
  title?: string,
): number {
  let adjusted = baseScore;

  // Penalize thin pages
  if (textLength < 100) {
    adjusted -= 30;
  } else if (textLength < 500) {
    adjusted -= 15;
  } else if (textLength > 3000) {
    // Bonus for substantial content
    adjusted += 5;
  }

  // Penalize generic/error titles
  if (title) {
    const lowerTitle = title.toLowerCase();
    if (lowerTitle.includes("404") || lowerTitle.includes("error")) {
      adjusted -= 40;
    }
    if (lowerTitle === "home" || lowerTitle === "index") {
      adjusted -= 10;
    }
  }

  return Math.max(0, Math.min(100, adjusted));
}

/**
 * Classify a page based on URL, title, and optionally headings/content.
 */
export function classifyPage(
  url: string,
  title?: string,
  headings?: string[],
): {
  pageType: PageType;
  usefulnessScore: number;
  usefulnessTier: UsefulnessTier;
  signals: {
    urlPattern?: string;
    titlePattern?: string;
    headingMatches?: string[];
  };
} {
  const scores: Partial<Record<PageType, number>> = {};
  const signals: {
    urlPattern?: string;
    titlePattern?: string;
    headingMatches?: string[];
  } = {};

  // Score based on URL patterns
  for (const { pattern, pageType, weight } of PAGE_TYPE_PATTERNS) {
    if (pattern.test(url)) {
      scores[pageType] = (scores[pageType] || 0) + weight;
      if (!signals.urlPattern) {
        signals.urlPattern = pattern.source;
      }
    }
  }

  // Score based on title patterns
  if (title) {
    const lowerTitle = title.toLowerCase();
    for (const { pattern, pageType, weight } of TITLE_TYPE_PATTERNS) {
      if (pattern.test(title)) {
        scores[pageType] = (scores[pageType] || 0) + weight * 0.8; // Slightly less weight than URL
        if (!signals.titlePattern) {
          signals.titlePattern = pattern.source;
        }
      }
    }

    // Homepage detection
    if (new URL(url).pathname === "/" || lowerTitle.includes("home")) {
      scores.homepage = (scores.homepage || 0) + 100;
    }
  }

  // Score based on headings (if provided)
  if (headings && headings.length > 0) {
    const headingMatches: string[] = [];
    for (const heading of headings) {
      for (const { pattern, pageType, weight } of TITLE_TYPE_PATTERNS) {
        if (pattern.test(heading)) {
          scores[pageType] = (scores[pageType] || 0) + weight * 0.5; // Half weight for headings
          headingMatches.push(`${heading} → ${pageType}`);
        }
      }
    }
    if (headingMatches.length > 0) {
      signals.headingMatches = headingMatches.slice(0, 3); // Top 3 matches
    }
  }

  // Determine best page type
  let bestType: PageType = "other";
  let bestScore = 0;

  for (const [type, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score;
      bestType = type as PageType;
    }
  }

  // Get base usefulness score
  const baseUsefulness = USEFULNESS_SCORES[bestType];

  // Adjust for content quality (use estimated text length)
  // In actual crawl, we pass real textLength
  const usefulnessScore = baseUsefulness;

  return {
    pageType: bestType,
    usefulnessScore,
    usefulnessTier: getUsefulnessTier(usefulnessScore),
    signals,
  };
}

// Patterns to skip (blogs, news, archives)
const SKIP_PATTERNS: RegExp[] = [
  /\/blog\//i,
  /\/news\//i,
  /\/press\//i,
  /\/articles\//i,
  /\/category\//i,
  /\/tag\//i,
  /\/archive\//i,
  /\/events\//i,
  /\/webinars\//i,
  /\/(19|20)\d{4}\//, // year-based archives like /2024/
  /\/page\/\d+/i, // pagination like /page/2/
  /\?page=\d+/i, // query pagination
  /\.jpg$/i,
  /\.png$/i,
  /\.gif$/i,
  /\.css$/i,
  /\.js$/i,
  /\/login/i,
  /\/signin/i,
  /\/signup/i,
  /\/register/i,
  /\/cart/i,
  /\/checkout/i,
  /mailto:/i,
  /tel:/i,
];

function sameDomain(url1: string, url2: string): boolean {
  try {
    const u1 = new URL(url1);
    const u2 = new URL(url2);
    const d1 = u1.hostname.replace(/^www\./, "");
    const d2 = u2.hostname.replace(/^www\./, "");
    return d1 === d2;
  } catch {
    return false;
  }
}

function normalizeUrl(url: string, baseUrl: string): string | null {
  try {
    const resolved = new URL(url, baseUrl);
    // Keep only http/https
    if (resolved.protocol !== "http:" && resolved.protocol !== "https:") {
      return null;
    }
    // Normalize hostname: lowercase and remove www. for comparison (but we keep it in the URL)
    resolved.hostname = resolved.hostname.toLowerCase();
    
    // Remove hash
    resolved.hash = "";
    
    // Normalize query params: remove common tracking params
    const trackingParams = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "fbclid", "gclid"];
    for (const p of trackingParams) {
      resolved.searchParams.delete(p);
    }
    
    // Remove trailing slash for consistency (except root)
    let pathname = resolved.pathname;
    if (pathname.length > 1 && pathname.endsWith("/")) {
      pathname = pathname.slice(0, -1);
    }
    resolved.pathname = pathname;
    
    return resolved.toString();
  } catch {
    return null;
  }
}


function shouldSkipUrl(url: string, config: CrawlConfig): boolean {
  for (const pattern of SKIP_PATTERNS) {
    if (pattern.test(url)) return true;
  }

  if (!config.allowBlogPaths) {
    if (/\/blog(\/|$)/i.test(url)) return true;
    if (/\/news(\/|$)/i.test(url)) return true;
  }

  return false;
}

const SOURCE_CREDIBILITY: Record<string, number> = {
  "sitemap": 40,
  "html_nav": 35,
  "html_footer": 25,
  "html_body": 20,
  "subdomain_probe": 30,
  "prioritized_guess": 0,
  // Backwards compatibility
  "homepage-nav": 35,
  "homepage-footer": 25,
  "page-links": 20
};

function scoreUrl(url: string, source: URLScore["source"]): URLScore {
  let score = 0;
  const patterns: string[] = [];

  for (const { pattern, weight, name } of HIGH_VALUE_PATTERNS) {
    if (pattern.test(url)) {
      score += weight;
      patterns.push(name);
    }
  }

  // Add source credibility bonus
  const credibilityBonus = SOURCE_CREDIBILITY[source] || 0;
  score += credibilityBonus;

  // Penalty for depth (shorter paths preferred)
  try {
    const u = new URL(url);
    const depth = u.pathname.split("/").filter(Boolean).length;
    score -= depth * 5;
  } catch {
    // ignore
  }

  return { url, score: Math.max(0, score), patterns, source };
}

/**
 * Assembles a unified priority queue sorted by evidence score.
 */
function assembleScoredQueue(
  discovered: Map<string, { url: string; score: number; intent: EvidenceIntent; reasons: string[]; source: string }>,
  config: CrawlConfig,
  homepageUrl: string
): { queue: { url: string; depth: number }[]; diagnostics: NonNullable<CrawlResult["stagedDiagnostics"]> } {
  const queue: { url: string; depth: number }[] = [];
  const candidateDiagnostics: NonNullable<CrawlResult["stagedDiagnostics"]>["candidateDiagnostics"] = [];
  
  // Sort ALL discovered candidates by their unified score
  const allCandidates = Array.from(discovered.values())
    .filter(c => c.url !== homepageUrl)
    .sort((a, b) => b.score - a.score);

  const buckets = {
    trustCompliance: config.evidenceBuckets.trustCompliance,
    productServices: config.evidenceBuckets.productServices,
    privacyLegal: config.evidenceBuckets.privacyLegal,
    integrationsDocs: config.evidenceBuckets.integrationsDocs,
    homepageCore: config.evidenceBuckets.homepageCore,
  };

  const bucketUsage = {
    trustCompliance: 0,
    productServices: 0,
    privacyLegal: 0,
    integrationsDocs: 0,
    homepageCore: 0,
  };

  const bucketAllocation = { ...buckets };
  
  const skippedHighValuePagesByBucket: Record<string, number> = {
    trustCompliance: 0,
    productServices: 0,
    privacyLegal: 0,
    integrationsDocs: 0,
    homepageCore: 0,
  };

  // Map EvidenceIntent to buckets
  const intentToBucket = (intent: EvidenceIntent) => {
    if (intent === "trust" || intent === "compliance" || intent === "security") return "trustCompliance";
    if (intent === "product") return "productServices";
    if (intent === "privacy") return "privacyLegal";
    if (intent === "integration") return "integrationsDocs";
    if (intent === "marketing") return "homepageCore";
    return null;
  };

  const selected = new Set<string>();

  // 1. Fill reserved buckets first
  // We iterate through all candidates and pick the top N for each bucket
  for (const candidate of allCandidates) {
    const bucket = intentToBucket(candidate.intent);
    if (bucket && bucketUsage[bucket] < buckets[bucket]) {
      bucketUsage[bucket]++;
      selected.add(candidate.url);
      queue.push({ url: candidate.url, depth: 1 });
    }
  }

  // 2. Calculate remaining global budget
  // Note: config.maxEvidencePages is the total limit including homepage
  const maxPages = config.maxEvidencePages - 1; // reserve 1 for homepage
  let remainingBudget = Math.max(0, maxPages - queue.length);

  let overflowBorrowing = 0;

  // 3. Fill generic pool with top remaining scorers
  // This is the "Generic Fallback" bucket
  for (const candidate of allCandidates) {
    if (remainingBudget <= 0) break;
    if (!selected.has(candidate.url)) {
      selected.add(candidate.url);
      queue.push({ url: candidate.url, depth: 1 });
      remainingBudget--;
      overflowBorrowing++;
    }
  }

  // 4. Generate diagnostics
  const intentAllocation: Record<string, number> = {};
  
  for (const candidate of allCandidates) {
    const isSelected = selected.has(candidate.url);
    const bucket = intentToBucket(candidate.intent);
    
    if (isSelected) {
      intentAllocation[candidate.intent] = (intentAllocation[candidate.intent] || 0) + 1;
    } else if (bucket && candidate.score > 60) {
      skippedHighValuePagesByBucket[bucket]++;
    }

    candidateDiagnostics.push({
      url: candidate.url,
      source: candidate.source,
      intent: candidate.intent,
      score: candidate.score,
      selectedForFetch: isSelected,
      skippedReason: isSelected ? undefined : "budget_limit_reached",
      pageType: classifyType(candidate.url),
      matchedPattern: candidate.reasons?.join(", ") || ""
    });
  }

  const unusedReserves = {
    trustCompliance: Math.max(0, buckets.trustCompliance - bucketUsage.trustCompliance),
    productServices: Math.max(0, buckets.productServices - bucketUsage.productServices),
    privacyLegal: Math.max(0, buckets.privacyLegal - bucketUsage.privacyLegal),
    integrationsDocs: Math.max(0, buckets.integrationsDocs - bucketUsage.integrationsDocs),
    homepageCore: Math.max(0, buckets.homepageCore - bucketUsage.homepageCore),
  };

  return {
    queue,
    diagnostics: {
      stageAllocation: intentAllocation,
      bucketAllocation,
      bucketUsage,
      unusedReserves,
      overflowBorrowing,
      skippedHighValuePagesByBucket,
      candidateDiagnostics
    }
  };
}

export async function fetchRobotsTxt(
  domain: string,
  timeoutMs: number,
): Promise<CrawlResult["robotsTxt"] | undefined> {
  const robotsUrl = `https://${domain}/robots.txt`;
  try {
    const body = await AiHttpClient.get(
      robotsUrl,
      { "User-Agent": "TrustDesk-Crawler/1.0" },
      { timeoutMs },
    );

    const sitemaps: string[] = [];
    const disallowPrefixes: string[] = [];
    let crawlDelay: number | undefined;
    let inStarBlock = false;

    for (const raw of body.split(/\r?\n/)) {
      const line = raw.replace(/#.*$/, "").trim();
      if (!line) continue;

      const colonIdx = line.indexOf(":");
      if (colonIdx === -1) continue;

      const field = line.slice(0, colonIdx).trim().toLowerCase();
      const value = line.slice(colonIdx + 1).trim();

      if (field === "sitemap") {
        if (value) sitemaps.push(value);
      } else if (field === "user-agent") {
        inStarBlock = value === "*" || value.toLowerCase().includes("trustdesk");
      } else if (field === "disallow" && inStarBlock && value) {
        disallowPrefixes.push(value.startsWith("/") ? value : `/${value}`);
      } else if (field === "crawl-delay" && inStarBlock && value) {
        const delay = parseInt(value, 10);
        if (!isNaN(delay) && delay > 0) {
          crawlDelay = delay;
        }
      }
    }

    logger.info("domain-crawler:robots-parsed", {
      domain,
      sitemaps: sitemaps.length,
      disallows: disallowPrefixes.length,
      crawlDelay,
    });

    return { sitemaps, disallowPrefixes, crawlDelay };
  } catch (err) {
    logger.info("domain-crawler:robots-miss", {
      domain,
      error: err instanceof Error ? err.message : String(err),
    });
    return undefined;
  }
}

export async function fetchSitemap(
  sitemapUrl: string,
  timeoutMs: number,
): Promise<string[]> {
  const urls: string[] = [];
  try {
    const body = await AiHttpClient.get(
      sitemapUrl,
      { "User-Agent": "TrustDesk-Crawler/1.0" },
      { timeoutMs },
    );

    // Parse both <url><loc>...</loc></url> and <sitemap><loc>...</loc></sitemap> patterns
    const locMatches = body.matchAll(/<loc>([^<]+)<\/loc>/gi);
    for (const match of locMatches) {
      const url = match[1].trim();
      if (url && !url.endsWith(".xml")) {
        // Regular URL
        urls.push(url);
      } else if (url && url.endsWith(".xml")) {
        // Nested sitemap - fetch recursively
        try {
          const nestedUrls = await fetchSitemap(url, timeoutMs);
          urls.push(...nestedUrls);
        } catch {
          // Skip nested sitemap errors
        }
      }
    }

    logger.info("domain-crawler:sitemap-parsed", {
      sitemapUrl,
      urlsFound: urls.length,
    });
  } catch (err) {
    logger.warn("domain-crawler:sitemap-error", {
      sitemapUrl,
      error: err instanceof Error ? err.message : String(err),
    });
  }
  return urls;
}

function extractLinks(html: string, baseUrl: string): Array<{ url: string; anchorText?: string }> {
  const links = new Map<string, { url: string; anchorText?: string }>();

  // Extract href attributes and anchor text from anchor tags
  const anchorRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(anchorRegex)) {
    const href = match[1];
    const rawAnchor = match[2] || "";
    if (!href) continue;

    const normalized = normalizeUrl(href, baseUrl);
    if (normalized && sameDomain(normalized, baseUrl)) {
      // Clean up anchor text: remove HTML, normalize whitespace
      const anchorText = rawAnchor.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      
      // If we already have this URL, keep the longest anchor text as it's usually more descriptive
      const existing = links.get(normalized);
      if (!existing || (anchorText.length > (existing.anchorText?.length || 0))) {
        links.set(normalized, { url: normalized, anchorText: anchorText || undefined });
      }
    }
  }

  return Array.from(links.values());
}

function extractTitle(html: string): string {
  const match = html.match(/<title>([^<]*)<\/title>/i);
  return match?.[1]?.trim() ?? "";
}

function extractTextLength(html: string): number {
  // Remove script and style tags
  const cleaned = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");

  // Extract text content length (rough approximation)
  const textContent = cleaned
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return textContent.length;
}

/**
 * Extract headings (h1, h2, h3) from HTML for page classification.
 */
function extractHeadings(html: string): string[] {
  const headings: string[] = [];
  const headingRegex = /<h[123][^>]*>([^<]*)<\/h[123]>/gi;

  for (const match of html.matchAll(headingRegex)) {
    const text = match[1].replace(/<[^>]+>/g, "").trim();
    if (text) {
      headings.push(text);
    }
  }
  return headings;
}

/**
 * Extract meta description from HTML.
 */
function extractMetaDescription(html: string): string | undefined {
  const metaRegex = /<meta[^>]+name=["\']description["\'][^>]*content=["\']([^"\']+)["\'][^>]*>/i;
  const match = html.match(metaRegex);
  return match?.[1]?.trim();
}

/**
 * Calculate useful text length (excluding boilerplate and navigation).
 */
function calculateUsefulTextLength(html: string): number {
  // Remove common boilerplate elements
  let cleaned = html;
  
  // Remove scripts, styles, nav, header, footer
  cleaned = cleaned.replace(/<(script|style|nav|header|footer|aside)[^>]*>[\s\S]*?<\/\1>/gi, '');
  
  // Remove common navigation patterns
  cleaned = cleaned.replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '');
  cleaned = cleaned.replace(/<div[^>]*class="[^"]*(?:nav|menu|sidebar)[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '');
  
  // Remove HTML tags and normalize whitespace
  const textContent = cleaned
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  
  return textContent.length;
}

/**
 * Extract evidence snippets from HTML for structured evidence collection.
 */
function extractEvidenceSnippets(html: string, pageType: PageType): EvidenceSnippet[] {
  const snippets: EvidenceSnippet[] = [];
  
  // Extract headings
  const headingRegex = /<h[123][^>]*>([^<]*)<\/h[123]>/gi;
  for (const match of html.matchAll(headingRegex)) {
    const content = match[1].replace(/<[^>]+>/g, '').trim();
    if (content.length > 10) {
      snippets.push({
        type: "heading",
        content,
        relevanceScore: calculateSnippetRelevance(content, pageType),
      });
    }
  }
  
  // Extract meaningful paragraphs (skip navigation and short content)
  const paragraphRegex = /<p[^>]*>([^<]*)<\/p>/gi;
  for (const match of html.matchAll(paragraphRegex)) {
    const content = match[1].replace(/<[^>]+>/g, '').trim();
    if (content.length > 50 && !isBoilerplateContent(content)) {
      snippets.push({
        type: "paragraph",
        content,
        relevanceScore: calculateSnippetRelevance(content, pageType),
      });
    }
  }
  
  // Extract list items for structured content
  const listRegex = /<(?:ul|ol)[^>]*>([\s\S]*?)<\/(?:ul|ol)>/gi;
  for (const match of html.matchAll(listRegex)) {
    const listContent = match[1];
    const itemRegex = /<li[^>]*>([^<]*)<\/li>/gi;
    for (const itemMatch of listContent.matchAll(itemRegex)) {
      const content = itemMatch[1].replace(/<[^>]+>/g, '').trim();
      if (content.length > 20) {
        snippets.push({
          type: "list",
          content,
          relevanceScore: calculateSnippetRelevance(content, pageType),
        });
      }
    }
  }
  
  // Add meta description as snippet
  const metaDescription = extractMetaDescription(html);
  if (metaDescription) {
    snippets.push({
      type: "meta",
      content: metaDescription,
      relevanceScore: calculateSnippetRelevance(metaDescription, pageType),
    });
  }
  
  // Sort by relevance and return top snippets
  return snippets
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, 10); // Limit to top 10 snippets
}

/**
 * Check if content is likely boilerplate (navigation, footer, etc.).
 */
function isBoilerplateContent(content: string): boolean {
  const lowerContent = content.toLowerCase();
  const boilerplatePatterns = [
    'skip to content',
    'navigation',
    'menu',
    'footer',
    'copyright',
    'all rights reserved',
    'privacy policy',
    'terms of service',
    'contact us',
    'sign in',
    'log in',
    'register',
    'subscribe',
    'follow us',
    'social media',
  ];
  
  return boilerplatePatterns.some(pattern => lowerContent.includes(pattern)) ||
         content.length < 30;
}

/**
 * Calculate relevance score for a snippet based on page type and content.
 */
function calculateSnippetRelevance(content: string, pageType: PageType): number {
  let score = 50; // Base score
  
  const lowerContent = content.toLowerCase();
  
  // Boost score based on page type keywords
  const pageTypeKeywords: Record<PageType, string[]> = {
    homepage: ['home', 'welcome', 'about', 'mission', 'vision'],
    about: ['about', 'company', 'team', 'mission', 'vision', 'history', 'values'],
    company: ['company', 'corporate', 'business', 'enterprise', 'organization'],
    product: ['product', 'feature', 'solution', 'service', 'capability'],
    platform: ['platform', 'infrastructure', 'system', 'architecture'],
    solutions: ['solution', 'use case', 'industry', 'vertical', 'application'],
    security: ['security', 'protection', 'threat', 'vulnerability', 'encryption', 'authentication'],
    trust: ['trust', 'reliability', 'assurance', 'certification', 'compliance'],
    compliance: ['compliance', 'regulation', 'standard', 'certification', 'audit'],
    privacy: ['privacy', 'data protection', 'personal information', 'gdpr', 'consent'],
    legal: ['legal', 'terms', 'conditions', 'agreement', 'liability'],
    dpa: ['dpa', 'data processing', 'data processor', 'controller', 'gdpr'],
    subprocessors: ['subprocessor', 'third party', 'vendor', 'data processing'],
    docs: ['documentation', 'guide', 'tutorial', 'reference', 'api'],
    status: ['status', 'uptime', 'availability', 'incident', 'sla'],
    pricing: ['price', 'cost', 'pricing', 'plan', 'subscription'],
    customers: ['customer', 'client', 'success story', 'testimonial'],
    case_study: ['case study', 'success story', 'implementation', 'results'],
    integrations: ['integration', 'api', 'connect', 'partner', 'ecosystem'],
    other: [],
  };

  const keywords = pageTypeKeywords[pageType] || [];
  for (const keyword of keywords) {
    if (lowerContent.includes(keyword)) {
      score += 15;
    }
  }

  // GLOBAL COMPLIANCE BOOSTERS
  const complianceBoosters = [
    'soc 2', 'soc2', 'iso 27001', 'iso27001', 'gdpr', 'hipaa', 'ccpa', 'pci-dss', 'pci',
    'dpa', 'subprocessor', 'encryption', 'mfa', 'sso', 'rbac', 'audit log', 'incident response',
    'vulnerability management', 'data retention', 'data residency', 'backup', 'disaster recovery',
    'uptime', 'sla'
  ];

  for (const booster of complianceBoosters) {
    if (lowerContent.includes(booster)) {
      score += 25; // Significant boost for compliance-first keywords
    }
  }
  
  // Boost for longer, more detailed content
  if (content.length > 100) score += 10;
  if (content.length > 200) score += 10;
  
  // Boost for content with numbers, data, or specific details
  if (/\d+/.test(content)) score += 5;
  
  return Math.min(100, score);
}

/**
 * Heuristic readability check to prevent binary/garbage content from being used as evidence.
 */
/**
 * Heuristic readability check to prevent binary/garbage content from being used as evidence.
 * Supports multilingual content (Arabic, Cyrillic, Latin) using Unicode-aware detection.
 */
export function checkReadability(text: string): { 
  isReadable: boolean; 
  ratio: number; 
  reason?: string;
  diagnostics: {
    printableRatio: number;
    letterOrNumberRatio: number;
    replacementCharRatio: number;
    controlCharRatio: number;
    detectedScript?: string;
  }
} {
  const diagnostics = {
    printableRatio: 0,
    letterOrNumberRatio: 0,
    replacementCharRatio: 0,
    controlCharRatio: 0,
    detectedScript: undefined as string | undefined,
  };

  if (!text || text.length === 0) {
    return { isReadable: false, ratio: 0, reason: "empty", diagnostics };
  }

  const len = text.length;

  // 1. Replacement character check (mojibake indicator)
  const replacementChars = (text.match(/\uFFFD/g) || []).length;
  diagnostics.replacementCharRatio = replacementChars / len;
  
  if (diagnostics.replacementCharRatio > 0.02) { // Slightly relaxed from 0.01
    return { isReadable: false, ratio: 1 - diagnostics.replacementCharRatio, reason: "too many replacement characters", diagnostics };
  }

  // 2. Control character check (binary indicator)
  // We exclude common whitespace controls like \n, \r, \t
  const controlChars = (text.match(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g) || []).length;
  diagnostics.controlCharRatio = controlChars / len;
  
  if (diagnostics.controlCharRatio > 0.01) {
    return { isReadable: false, ratio: 0, reason: "excessive control characters", diagnostics };
  }

  // 3. Unicode-aware printable character ratio
  // Includes Letters (L), Numbers (N), Separators (Z), Punctuation (P), and Marks (M)
  // Marks are critical for combining characters in scripts like Arabic.
  const printableMatch = text.match(/[\p{L}\p{N}\p{Z}\p{P}\p{M}]/gu);
  const printableCount = printableMatch ? printableMatch.length : 0;
  diagnostics.printableRatio = printableCount / len;

  // 4. Letter or Number ratio (core content indicator)
  const letterOrNumberMatch = text.match(/[\p{L}\p{N}]/gu);
  const letterOrNumberCount = letterOrNumberMatch ? letterOrNumberMatch.length : 0;
  diagnostics.letterOrNumberRatio = letterOrNumberCount / len;

  // Simple script detection for diagnostics
  if (text.match(/\p{Script=Arabic}/u)) diagnostics.detectedScript = "Arabic";
  else if (text.match(/\p{Script=Cyrillic}/u)) diagnostics.detectedScript = "Cyrillic";
  else if (text.match(/\p{Script=Latin}/u)) diagnostics.detectedScript = "Latin";

  // HEURISTIC GATES
  
  // A. Extremely low printable ratio is almost always binary/garbage
  if (diagnostics.printableRatio < 0.65) {
    return { isReadable: false, ratio: diagnostics.printableRatio, reason: "low printable character ratio", diagnostics };
  }

  // B. Low core content ratio (letters/numbers)
  // Most pages (including those with lots of HTML/JS) should have at least 15% core text if they are readable.
  if (diagnostics.letterOrNumberRatio < 0.15 && len > 500) {
    return { isReadable: false, ratio: diagnostics.letterOrNumberRatio, reason: "low core content ratio", diagnostics };
  }

  return { isReadable: true, ratio: diagnostics.printableRatio, diagnostics };
}

async function fetchPage(url: string, depth: number, config: CrawlConfig): Promise<CrawlAttempt> {
  const attempt: CrawlAttempt = {
    attemptedUrl: url,
    success: false,
    requestSucceeded: false,
    extractionSucceeded: false,
    evidenceSucceeded: false,
    extractionStatus: "error",
    backendStatus: "network_error",
    depth: 0,
    discoveredLinks: [],
    timestamp: new Date(),
    pageType: "unknown",
    usefulnessScore: 0,
    usefulnessTier: "minimal",
    classificationSignals: {},
  };

  // Consistent safe headers for TrustDesk crawler
  const headers = {
    "User-Agent": "TrustDesk-Crawler/1.0 (Trust-Profile-Discovery; +https://trustdesk.ai/crawler)",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
  };

  let retryCount = 0;
  const maxRetries = config.maxRetries;

  while (retryCount <= maxRetries) {
    try {
      const response = await AiHttpClient.getFull(url, headers, {
        timeoutMs: config.timeoutMs,
      });

      const body = response.body;
      attempt.statusCode = response.statusCode;
      attempt.contentType = response.contentType;
      attempt.contentEncoding = response.contentEncoding;
      attempt.fetchedUrl = url; // Set early so we know where we actually landed

      // 1. Content-Type guard
      const isAllowedType = 
        response.contentType.includes('text/html') || 
        response.contentType.includes('application/xhtml+xml') || 
        response.contentType.includes('text/plain');

      if (!isAllowedType) {
        // PDF Discovery logic
        if (response.contentType.includes('application/pdf') || url.toLowerCase().endsWith('.pdf')) {
          attempt.documentEvidenceCandidate = true;
          attempt.backendStatus = "success";
          attempt.extractionStatus = "success";
          attempt.success = true;
          attempt.requestSucceeded = true;    // HTTP OK
          attempt.extractionSucceeded = false; // No body extraction — it's a binary PDF
          attempt.evidenceSucceeded = false;   // No structured blocks yet (needs PDF parser)
          attempt.pageType = "unknown"; // Will be refined by caller if possible
          return attempt;
        }

        attempt.backendStatus = "unsupported_content_type";
        attempt.extractionStatus = "error";
        attempt.errorMessage = `Unsupported content type: ${response.contentType}`;
        break;
      }

      // 2. Readability quality gate
      const readability = checkReadability(body);
      attempt.readableRatio = readability.ratio;
      attempt.readabilityDiagnostics = readability.diagnostics;
      
      if (!readability.isReadable) {
        attempt.backendStatus = "unreadable_content";
        attempt.extractionStatus = "unreadable_content";
        attempt.requestSucceeded = true;     // HTTP succeeded
        attempt.extractionSucceeded = false;  // Readability gate failed
        attempt.evidenceSucceeded = false;
        attempt.errorMessage = `Content unreadable: ${readability.reason} (printable=${readability.diagnostics.printableRatio.toFixed(2)}, alphaNum=${readability.diagnostics.letterOrNumberRatio.toFixed(2)})`;
        break;
      }      // 3. Adaptive useful-text threshold
      const isHighSignal = ["security", "trust", "compliance", "privacy", "dpa", "subprocessors", "legal"].includes(attempt.pageType);
      const hasTerms = hasSignalTerms(body);
      
      let minThreshold = 100; // Default
      let thresholdReason = "generic content";
      
      if (isHighSignal && hasTerms) {
        minThreshold = 40; // Lower threshold for high-value signal-dense pages
        thresholdReason = "high-signal type with keyword hits";
      } else if (attempt.pageType === "homepage" || attempt.pageType === "product") {
        minThreshold = 150; // Stricter for entry points
        thresholdReason = "core entry page";
      }
      
      attempt.thresholdUsed = minThreshold;
      attempt.thresholdReason = thresholdReason;

      // Check for useful content
      const title = extractTitle(body);
      const textLength = extractTextLength(body);
      const usefulTextLength = calculateUsefulTextLength(body);
      const headings = extractHeadings(body);
      attempt.usefulTextLength = usefulTextLength;

      // Fail if no useful content (either too short or no title)
      if (textLength < 100 && !title) {
        attempt.backendStatus = "no_useful_content";
        attempt.extractionStatus = "error";
        attempt.requestSucceeded = true;     // HTTP succeeded
        attempt.extractionSucceeded = false;  // Threshold gate failed
        attempt.evidenceSucceeded = false;
        attempt.errorMessage = "No useful content found (empty text/no title)";
        attempt.staticFailureReason = "no_useful_content";
        break;
      }

      // Fail if useful text is too short after boilerplate removal, applying adaptive threshold
      if (usefulTextLength < minThreshold) {
        attempt.backendStatus = "no_useful_content";
        attempt.extractionStatus = "error";
        attempt.requestSucceeded = true;     // HTTP succeeded
        attempt.extractionSucceeded = false;  // Threshold gate failed
        attempt.evidenceSucceeded = false;
        attempt.errorMessage = `Content too short after boilerplate removal (${usefulTextLength} chars, threshold=${minThreshold})`;
        attempt.staticFailureReason = "thin_static_shell";
        break;
      }

      // Classify the page
      const classification = classifyPage(url, title, headings);

      // Adjust usefulness score based on content quality
      const adjustedUsefulness = adjustForContentQuality(
        classification.usefulnessScore,
        usefulTextLength, // Use useful text length for quality adjustment
        title,
      );

      attempt.success = true;
      attempt.requestSucceeded = true;      // HTTP OK
      attempt.extractionSucceeded = true;   // Passed all static gates, HTML stored
      // evidenceSucceeded is set by the service layer once structured blocks are counted
      attempt.evidenceSucceeded = false;
      attempt.backendStatus = "success";
      attempt.extractionStatus = "success";
      attempt.statusCode = 200;
      attempt.title = title;
      attempt.textLength = textLength;
      attempt.usefulTextLength = usefulTextLength;
      attempt.html = body; // Store HTML to avoid double-fetching
      attempt.discoveredLinks = extractLinks(body, url);
      attempt.pageType = classification.pageType;
      attempt.usefulnessScore = adjustedUsefulness;
      attempt.usefulnessTier = getUsefulnessTier(adjustedUsefulness);
      attempt.classificationSignals = classification.signals;

      return attempt;
    } catch (err) {
      const isLastRetry = retryCount === maxRetries;

      if (err instanceof HttpFetchError) {
        attempt.statusCode = err.status ?? 0;

        // Classify errors based on HttpFetchError kind and status
        if (err.kind === "timeout") {
          attempt.backendStatus = "timeout";
          attempt.extractionStatus = "timeout";
          attempt.errorMessage = "Request timed out";
          
          // Retry timeout once
          if (retryCount < 1) {
            retryCount++;
            await new Promise((r) => setTimeout(r, 1000)); // 1 second delay for timeout
            continue;
          }
        } else if (err.kind === "dns") {
          attempt.backendStatus = "dns_error";
          attempt.extractionStatus = "error";
          attempt.errorMessage = "DNS resolution failed";
          // Don't retry DNS errors
          break;
        } else if (err.kind === "tls") {
          attempt.backendStatus = "network_error";
          attempt.extractionStatus = "error";
          attempt.errorMessage = "TLS/SSL error";
          // Don't retry TLS errors
          break;
        } else if (err.kind === "http") {
          const status = err.status ?? 0;
          if (status === 403) {
            attempt.backendStatus = "forbidden_403";
            attempt.extractionStatus = "blocked";
            attempt.errorMessage = "Access forbidden by site";
            // Don't retry 403 aggressively
            break;
          } else if (status === 429) {
            attempt.backendStatus = "rate_limited_429";
            attempt.extractionStatus = "error";
            attempt.errorMessage = "Rate limited by site";
            
            // Retry 429 with exponential backoff
            if (!isLastRetry) {
              retryCount++;
              const backoffMs = Math.min(1000 * Math.pow(2, retryCount - 1), 10000); // Max 10 seconds
              await new Promise((r) => setTimeout(r, backoffMs));
              continue;
            }
          } else if (status >= 500) {
            attempt.backendStatus = "server_error_5xx";
            attempt.extractionStatus = "error";
            attempt.errorMessage = `Server error: ${status}`;
            
            // Retry 5xx with jitter
            if (!isLastRetry) {
              retryCount++;
              const jitterMs = Math.random() * 1000; // Random jitter up to 1 second
              const backoffMs = Math.min(1000 * Math.pow(2, retryCount - 1), 8000) + jitterMs;
              await new Promise((r) => setTimeout(r, backoffMs));
              continue;
            }
          } else {
            attempt.backendStatus = "blocked_by_site";
            attempt.extractionStatus = "blocked";
            attempt.errorMessage = `HTTP ${status}: ${err.message}`;
            // Don't retry other HTTP errors
            break;
          }
        } else {
          attempt.backendStatus = "network_error";
          attempt.extractionStatus = "error";
          attempt.errorMessage = err.message;
          // Don't retry other errors
          break;
        }
      } else {
        attempt.backendStatus = "network_error";
        attempt.extractionStatus = "error";
        attempt.errorMessage = err instanceof Error ? err.message : String(err);
        // Don't retry unknown errors
        break;
      }
    }
  }

  // Even on failure, try to classify based on URL alone
  const urlOnlyClassification = classifyPage(url);
  attempt.pageType = urlOnlyClassification.pageType;
  attempt.usefulnessScore = urlOnlyClassification.usefulnessScore;
  attempt.usefulnessTier = urlOnlyClassification.usefulnessTier;
  attempt.classificationSignals = urlOnlyClassification.signals;

  // 4. Render Eligibility Check for Recovery
  const effectivePageType = attempt.success ? attempt.pageType : urlOnlyClassification.pageType;
  const isHighValue = 
    ["security", "trust", "compliance", "privacy", "dpa", "subprocessors", "homepage", "product", "solutions", "platform", "legal"].includes(effectivePageType) ||
    depth === 0;
  const isHtml = attempt.contentType?.includes('text/html') || attempt.contentType?.includes('application/xhtml+xml');
  
  if (isHtml) {
    const usefulTextLength = attempt.usefulTextLength ?? 0;
    const jsHeavy = isJsHeavy(attempt.html || "", usefulTextLength);
    const recoverableFailure = ["unreadable_content", "no_useful_content", "network_error", "timeout", "blocked_by_site", "forbidden_403", "rate_limited_429"].includes(attempt.backendStatus);
    
    // Eligibility reasons
    if (isHighValue && recoverableFailure) {
      attempt.renderEligible = true;
    } else if (isHighValue && jsHeavy && usefulTextLength < 600) {
      attempt.renderEligible = true;
    } else if (jsHeavy && usefulTextLength < 200) {
      // Generic but very suspicious JS-heavy shell
      attempt.renderEligible = true;
    }
  }

  return attempt;
}

/**
 * Detects if a page is a JS-heavy application shell (e.g. React, Next.js) 
 * with minimal static content but large script/hydration payloads.
 */
function isJsHeavy(html: string, usefulTextLength: number): boolean {
  if (!html || html.length < 500) return false;
  
  const rawLength = html.length;

  // 1. Hydration data detection (Next.js, Nuxt, etc)
  const hasHydrationData = html.includes('__NEXT_DATA__') || html.includes('window.__INITIAL_STATE__') || html.includes('window.__APOLLO_STATE__');
  
  // 2. SPA root container detection
  const hasRootContainer = html.includes('id="root"') || html.includes('id="__next"') || html.includes('id="app"') || html.includes('id="main-app"');
  
  // 3. Script-to-HTML ratio
  const scriptMatch = html.match(/<script[\s\S]*?<\/script>/gi);
  const scriptChars = scriptMatch ? scriptMatch.reduce((sum, s) => sum + s.length, 0) : 0;
  const scriptRatio = scriptChars / rawLength;

  // 4. Content Density (high HTML weight vs thin text)
  const isLargeHtmlWithThinText = rawLength > 40000 && usefulTextLength < 500;

  // Thresholds for "JS Heavy"
  if (hasHydrationData && usefulTextLength < 1000) return true;
  if (hasRootContainer && usefulTextLength < 400) return true;
  if (scriptRatio > 0.6 && usefulTextLength < 500) return true;
  if (isLargeHtmlWithThinText) return true;

  return false;
}

const SIGNAL_TERMS = [
  "soc2", "soc 2", "iso27001", "iso 27001", "hipaa", "gdpr", "pci", 
  "privacy policy", "data protection", "security policy", "compliance",
  "encryption", "subprocessors", "dpa", "trust center"
];

function hasSignalTerms(text: string): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  return SIGNAL_TERMS.some(term => lower.includes(term));
}

function isAllowedByRobots(url: string, disallowPrefixes: string[]): boolean {
  try {
    const pathname = new URL(url).pathname;
    for (const prefix of disallowPrefixes) {
      if (pathname.startsWith(prefix)) {
        return false;
      }
    }
  } catch {
    return true;
  }
  return true;
}

/**
 * Build a structured EvidencePack from crawl results.
 */
export function buildEvidencePack(
  crawlResult: CrawlResult,
  options: {
    crawlRunId?: string;
    canonicalBaseUrl?: string;
  } = {}
): EvidencePack {
  const issues: CrawlIssue[] = [];
  const evidencePages: EvidencePage[] = [];
  let totalUsefulChars = 0;
  
  // Convert crawl attempts to evidence pages
  for (const attempt of crawlResult.pages) {
    const evidencePage: EvidencePage = {
      url: attempt.attemptedUrl,
      finalUrl: attempt.fetchedUrl,
      title: attempt.title,
      pageType: attempt.pageType,
      statusCode: attempt.statusCode,
      extractionStatus: attempt.extractionStatus,
      textLength: attempt.textLength,
      usefulTextLength: attempt.html ? calculateUsefulTextLength(attempt.html) : undefined,
      headings: attempt.html ? extractHeadings(attempt.html) : [],
      metaDescription: attempt.html ? extractMetaDescription(attempt.html) : undefined,
      evidenceSnippets: attempt.html ? extractEvidenceSnippets(attempt.html, attempt.pageType) : [],
      usefulnessScore: attempt.usefulnessScore,
    };
    
    evidencePages.push(evidencePage);
    
    // Accumulate useful characters
    if (evidencePage.usefulTextLength) {
      totalUsefulChars += evidencePage.usefulTextLength;
    }
    
    // Add issues for failed attempts
    if (!attempt.success && attempt.backendStatus !== "robots_disallowed") {
      issues.push({
        type: "error",
        message: attempt.errorMessage || `Failed to fetch ${attempt.attemptedUrl}`,
        url: attempt.attemptedUrl,
        timestamp: attempt.timestamp,
      });
    }
  }
  
  // Calculate summary statistics
  const highValuePagesFound = crawlResult.pages.filter(p => 
    p.success && (p.usefulnessTier === "critical" || p.usefulnessTier === "high")
  ).length;
  
  const securityLegalPagesFound = crawlResult.pages.filter(p => 
    p.success && ["security", "trust", "compliance", "privacy", "legal", "dpa"].includes(p.pageType)
  ).length;
  
  // Add warnings for common issues
  if (crawlResult.totalFetched === 0) {
    issues.push({
      type: "warning",
      message: "No pages were successfully fetched",
      timestamp: new Date(),
    });
  }
  
  if (securityLegalPagesFound === 0 && crawlResult.totalFetched > 0) {
    issues.push({
      type: "warning",
      message: "No security or legal pages found",
      timestamp: new Date(),
    });
  }
  
  if (totalUsefulChars < 1000 && crawlResult.totalFetched > 0) {
    issues.push({
      type: "warning",
      message: "Low amount of useful content extracted",
      timestamp: new Date(),
    });
  }
  
  return {
    crawlRunId: options.crawlRunId,
    domain: crawlResult.baseDomain,
    canonicalBaseUrl: options.canonicalBaseUrl || crawlResult.startUrl,
    pagesAttempted: crawlResult.totalAttempted,
    pagesFetched: crawlResult.totalFetched,
    highValuePagesFound,
    securityLegalPagesFound,
    totalUsefulChars,
    issues,
    pages: evidencePages,
    durationMs: crawlResult.durationMs,
    completedAt: new Date(),
  };
}

/**
 * Analyze a single public page URL for evidence extraction
 * Used as recovery path when domain crawl is blocked or weak
 */
export async function analyzeSinglePage(
  pageUrl: string,
  config: CrawlConfig = DEFAULT_CRAWL_CONFIG,
): Promise<CrawlResult> {
  const startTime = Date.now();
  
  // Normalize the URL
  const normalizedUrl = pageUrl.startsWith("http")
    ? pageUrl
    : `https://${pageUrl}`;

  let baseDomain: string;
  try {
    baseDomain = new URL(normalizedUrl).hostname.replace(/^www\./, "");
  } catch {
    throw new Error(`Invalid URL: ${pageUrl}`);
  }

  const result: CrawlResult = {
    baseDomain,
    startUrl: normalizedUrl,
    pages: [],
    totalAttempted: 0,
    totalRequested: 0,
    totalExtracted: 0,
    totalEvidenced: 0,
    totalFetched: 0,
    totalSuccessful: 0,
    durationMs: 0,
    robotsTxt: undefined,
    sitemapUrls: [],
    highValueUrls: [],
    classificationSummary: {} as Record<PageType, number>,
    pagesByTier: {} as Record<UsefulnessTier, CrawlAttempt[]>,
    highValuePages: [],
  };

  // Fetch the single page
  const attempt = await fetchPage(normalizedUrl, 0, config);
  result.pages.push(attempt);
  result.totalAttempted++;

  if (attempt.success) {
    result.totalFetched++;
    result.totalSuccessful++;
  }
  if (attempt.requestSucceeded) result.totalRequested++;
  if (attempt.extractionSucceeded) result.totalExtracted++;
  // totalEvidenced is updated by the service layer

  // Update classification summary and pages by tier
  updateClassificationAndTiering(result);

  // Add to high-value URLs if successful
  if (attempt.success && attempt.usefulnessTier !== "minimal") {
    result.highValueUrls.push(normalizedUrl);
  }

  result.durationMs = Date.now() - startTime;
  return result;
}

/**
 * Validate if a URL belongs to the same domain or an acceptable related domain
 * according to product policy for user-provided URLs
 */
export function validatePageUrl(
  pageUrl: string,
  originalDomain: string,
  options: {
    allowSubdomains?: boolean;
    allowRelatedDomains?: string[];
  } = {}
): { isValid: boolean; reason?: string } {
  try {
    const url = new URL(pageUrl.startsWith("http") ? pageUrl : `https://${pageUrl}`);
    const pageDomain = url.hostname.replace(/^www\./, "");
    
    // Exact match
    if (pageDomain === originalDomain) {
      return { isValid: true };
    }
    
    // Subdomain match (if allowed)
    if (options.allowSubdomains) {
      if (pageDomain.endsWith(`.${originalDomain}`) || originalDomain.endsWith(`.${pageDomain}`)) {
        return { isValid: true };
      }
    }
    
    // Related domain match (if allowed)
    if (options.allowRelatedDomains) {
      for (const relatedDomain of options.allowRelatedDomains) {
        const related = relatedDomain.replace(/^www\./, "");
        if (pageDomain === related || pageDomain.endsWith(`.${related}`) || related.endsWith(`.${pageDomain}`)) {
          return { isValid: true };
        }
      }
    }
    
    return { 
      isValid: false, 
      reason: `Domain ${pageDomain} does not match original domain ${originalDomain}` 
    };
  } catch {
    return { isValid: false, reason: "Invalid URL format" };
  }
}

/**
 * Update classification summary and pages by tier for crawl results
 */
function updateClassificationAndTiering(result: CrawlResult): void {
  // Initialize classification summary
  result.classificationSummary = {} as Record<PageType, number>;
  result.pagesByTier = {} as Record<UsefulnessTier, CrawlAttempt[]>;
  
  // Initialize tiers
  const tiers: UsefulnessTier[] = ["critical", "high", "medium", "low", "minimal"];
  for (const tier of tiers) {
    result.pagesByTier[tier] = [];
  }
  
  // Classify pages
  for (const page of result.pages) {
    // Update classification summary
    result.classificationSummary[page.pageType] = (result.classificationSummary[page.pageType] || 0) + 1;
    
    // Add to tier
    result.pagesByTier[page.usefulnessTier].push(page);
    
    // Add to high-value pages
    if (page.usefulnessTier === "critical" || page.usefulnessTier === "high") {
      result.highValuePages.push(page);
    }
  }
  
  // Sort high-value pages by usefulness score
  result.highValuePages.sort((a, b) => b.usefulnessScore - a.usefulnessScore);
}

/**
 * Probes common trust subdomains for a base domain.
 * Only attempts allowlisted subdomains: trust, security, status, docs.
 */
async function discoverSubdomains(baseDomain: string, timeoutMs: number): Promise<string[]> {
  const subdomains = ["trust", "security", "status", "docs"];
  const discovered: string[] = [];

  const probes = subdomains.map(async (sub) => {
    const url = `https://${sub}.${baseDomain}`;
    try {
      // Use a very short timeout for subdomain probing
      const response = await AiHttpClient.getFull(url, {}, { timeoutMs: Math.min(timeoutMs, 5000) });
      if (response.statusCode >= 200 && response.statusCode < 400) {
        return url;
      }
    } catch (e) {
      // Ignore failures
    }
    return null;
  });

  const results = await Promise.all(probes);
  return results.filter((r): r is string => r !== null);
}

export async function crawlDomain(
  startUrl: string,
  config: CrawlConfig = DEFAULT_CRAWL_CONFIG,
): Promise<CrawlResult> {
  const correlationId = generateCorrelationId();
  const startTime = Date.now();
  const startUrlNormalized = startUrl.startsWith("http")
    ? startUrl
    : `https://${startUrl}`;

  const baseDomain = new URL(startUrlNormalized).hostname.replace(/^www\./, "");

  logCrawlStart(baseDomain, config);

  const result: CrawlResult = {
    baseDomain,
    startUrl: startUrlNormalized,
    pages: [],
    totalAttempted: 0,
    totalRequested: 0,
    totalExtracted: 0,
    totalEvidenced: 0,
    totalFetched: 0,
    totalSuccessful: 0,
    durationMs: 0,
    sitemapUrls: [],
    highValueUrls: [],
    pdfCandidates: [],
    subdomainsAttempted: ["trust", "security", "status", "docs"],
    subdomainsFound: [],
    classificationSummary: {
      security: 0,
      trust: 0,
      compliance: 0,
      privacy: 0,
      legal: 0,
      dpa: 0,
      subprocessors: 0,
      docs: 0,
      status: 0,
      pricing: 0,
      customers: 0,
      case_study: 0,
      integrations: 0,
      marketplace: 0,
      homepage: 0,
      about: 0,
      company: 0,
      product: 0,
      platform: 0,
      solutions: 0,
      other: 0,
    },
    pagesByTier: {
      critical: [],
      high: [],
      medium: [],
      low: [],
      minimal: [],
    },
    highValuePages: [],
  };

  // Track visited URLs and discovery candidates
  const visited = new Set<string>();
  const discoveryCandidates = new Map<string, { url: string; score: number; intent: EvidenceIntent; reasons: string[]; source: string }>();
  let queue: Array<{ url: string; depth: number }> = [];

  // Step 1: Fetch robots.txt
  if (config.respectRobotsTxt) {
    result.robotsTxt = await fetchRobotsTxt(baseDomain, config.timeoutMs);

    // Step 2: Fetch sitemaps from robots.txt
    if (result.robotsTxt?.sitemaps) {
      for (const sitemapUrl of result.robotsTxt.sitemaps) {
        if (sameDomain(sitemapUrl, startUrlNormalized)) {
          const urls = await fetchSitemap(sitemapUrl, config.timeoutMs);
          result.sitemapUrls.push(...urls);
        }
      }
    }
  }

  // Also try standard sitemap paths
  const standardSitemaps = [
    `https://${baseDomain}/sitemap.xml`,
    `https://${baseDomain}/sitemap_index.xml`,
    `https://www.${baseDomain}/sitemap.xml`,
  ];

  for (const sitemapUrl of standardSitemaps) {
    if (!result.sitemapUrls.some((u) => u.startsWith(sitemapUrl.replace("/sitemap.xml", "")))) {
      const urls = await fetchSitemap(sitemapUrl, config.timeoutMs);
      result.sitemapUrls.push(...urls);
      logSitemapDiscovery(correlationId, baseDomain, urls.length);
    }
  }

  // Step 2.5: Subdomain Discovery
  const discoveredSubdomains = await discoverSubdomains(baseDomain, config.timeoutMs);
  result.subdomainsFound = discoveredSubdomains;
  for (const subUrl of discoveredSubdomains) {
    if (!visited.has(subUrl)) {
      const type = classifyType(subUrl);
      discoveryCandidates.set(subUrl, { 
        url: subUrl, 
        score: 110, // Top priority for trust subdomains
        intent: getEvidenceIntent(subUrl, type),
        reasons: ["trust-subdomain-probe"],
        source: "subdomain_probe"
      });
      visited.add(subUrl);
    }
  }

  // Step 3: Score sitemap URLs
  const scoredSitemapUrls = result.sitemapUrls
    .filter((url) => sameDomain(url, startUrlNormalized))
    .filter((url) => !shouldSkipUrl(url, config))
    .filter((url) =>
      config.respectRobotsTxt && result.robotsTxt
        ? isAllowedByRobots(url, result.robotsTxt.disallowPrefixes)
        : true,
    )
    .map((url) => scoreUrl(url, "sitemap"));

  // Sort by score descending
  scoredSitemapUrls.sort((a, b) => b.score - a.score);

  // Add top sitemap URLs to candidates
  for (const { url, score, patterns: reasons } of scoredSitemapUrls) {
    if (!visited.has(url)) {
      const type = classifyType(url);
      discoveryCandidates.set(url, { 
        url, 
        score, 
        intent: getEvidenceIntent(url, type),
        reasons: reasons || [],
        source: "sitemap" 
      });
      visited.add(url);
    }
  }

  // Step 4: Fetch homepage to extract nav/footer links
  logUrlAttempt(correlationId, startUrlNormalized, baseDomain);
  const homepageAttempt = await fetchPage(startUrlNormalized, 0, config);
  result.pages.push(homepageAttempt);
  result.totalAttempted++;

  if (homepageAttempt.success) {
    result.totalFetched++;
    result.totalSuccessful++;
    logUrlSuccess(correlationId, homepageAttempt.finalUrl || homepageAttempt.attemptedUrl, baseDomain, 
      homepageAttempt.statusCode || 200, homepageAttempt.pageType, homepageAttempt.duration || 0);

    // Categorize discovered links
    const navLinks: Array<{ url: string; anchorText?: string }> = [];
    const footerLinks: Array<{ url: string; anchorText?: string }> = [];

    for (const { url, anchorText } of homepageAttempt.discoveredLinks) {
      if (visited.has(url)) continue;
      if (shouldSkipUrl(url, config)) continue;
      if (
        config.respectRobotsTxt &&
        result.robotsTxt &&
        !isAllowedByRobots(url, result.robotsTxt.disallowPrefixes)
      ) {
        continue;
      }

      // Simple heuristic: links with high-value patterns likely in nav
      const score = scoreUrl(url, "html_nav");
      if (score.score > 0) {
        navLinks.push({ url, anchorText });
      } else {
        footerLinks.push({ url, anchorText });
      }
    }

    // Score and sort nav links
    const scoredNavLinks = navLinks
      .map((link) => ({ ...scoreUrl(link.url, "html_nav"), anchorText: link.anchorText }))
      .sort((a, b) => b.score - a.score);

    // Score and sort footer links
    const scoredFooterLinks = footerLinks
      .map((link) => ({ ...scoreUrl(link.url, "html_footer"), anchorText: link.anchorText }))
      .sort((a, b) => b.score - a.score);

    // Add nav links to candidates
    for (const { url, score, patterns: reasons, anchorText } of scoredNavLinks) {
      if (!visited.has(url)) {
        const type = classifyType(url, anchorText);
        discoveryCandidates.set(url, { 
          url, 
          score, 
          intent: getEvidenceIntent(url, type),
          reasons: reasons || [],
          source: "html_nav" 
        });
        visited.add(url);
      }
    }

    // Add footer links to candidates
    for (const { url, score, patterns: reasons, anchorText } of scoredFooterLinks) {
      if (!visited.has(url)) {
        const type = classifyType(url, anchorText);
        discoveryCandidates.set(url, { 
          url, 
          score, 
          intent: getEvidenceIntent(url, type),
          reasons: reasons || [],
          source: "html_footer" 
        });
        visited.add(url);
      }
    }
  } else {
    logUrlFailure(correlationId, homepageAttempt.attemptedUrl, baseDomain, 
      homepageAttempt.backendStatus || "unknown_error", homepageAttempt.statusCode || 0);
  }
  // Lifecycle counters — set after if/else so they always run regardless of success
  if (homepageAttempt.requestSucceeded) result.totalRequested++;
  if (homepageAttempt.extractionSucceeded) result.totalExtracted++;

  // Step 4.5: Always add high-value paths for comprehensive discovery
  // This ensures we have fallback URLs even if homepage succeeds but has thin navigation
  const highValuePaths = [
    // Business & Company pages
    "/about", "/company", "/team", "/leadership",
    // Product pages
    "/product", "/products", "/platform", "/solutions", "/features",
    // Security & Trust pages (highest priority)
    "/security", "/trust", "/trust-center", "/compliance", "/privacy",
    // Legal pages
    "/legal", "/terms", "/terms-of-service", "/dpa", "/data-processing-agreement",
    // Documentation & Support
    "/docs", "/documentation", "/help", "/support", "/api",
    // Business proof pages
    "/customers", "/case-studies", "/case-studies", "/testimonials", "/integrations",
  ];

  // Prioritize security/trust/privacy pages first
  const prioritizedPaths = [
    "/security", "/trust", "/trust-center", "/compliance", "/privacy",
    "/privacy-center", "/legal", "/terms", "/dpa", "/data-processing-addendum",
    "/subprocessors", "/gdpr", "/hipaa", "/soc2", "/iso27001", "/iso-27001",
    "/compliance-reports", "/security-and-compliance", "/docs/security", "/help/security",
    "/about", "/company", "/product", "/products", "/platform",
    "/solutions", "/docs", "/help", "/integrations", "/customers", "/case-studies"
  ];

  // Add high-value paths to candidates
  for (const path of prioritizedPaths) {
    const url = new URL(path, startUrlNormalized).toString();
    
    // Skip if already visited
    if (visited.has(url)) continue;
    
    // Skip if not same domain
    const urlObj = new URL(url);
    if (urlObj.hostname !== new URL(startUrlNormalized).hostname) continue;
    
    // Check if disallowed by robots.txt
    if (
      config.respectRobotsTxt &&
      result.robotsTxt &&
      !isAllowedByRobots(url, result.robotsTxt.disallowPrefixes)
    ) {
      continue;
    }
    
    const type = classifyType(url);
    const score = scoreUrl(url, "prioritized_guess");
    discoveryCandidates.set(url, { 
      url, 
      score: score.score, 
      intent: getEvidenceIntent(url, type),
      reasons: score.patterns,
      source: "prioritized_guess" 
    });
    visited.add(url);
    result.highValueUrls.push(url);
  }

  // Step 4.6: Assemble Scored Queue
  const { queue: scoredQueue, diagnostics } = assembleScoredQueue(
    discoveryCandidates, 
    config, 
    startUrlNormalized
  );
  queue = scoredQueue;
  result.stagedDiagnostics = diagnostics;

  logger.info("domain-crawler:scored-queue-assembled", {
    domain: baseDomain,
    allocation: diagnostics.stageAllocation,
    totalQueued: queue.length
  });

  // Step 5: Process queue (breadth-first with depth tracking)
  let successfulEvidence = 0;
  const actualBucketUsage: Record<string, number> = {
    trustCompliance: 0,
    productServices: 0,
    privacyLegal: 0,
    integrationsDocs: 0,
    homepageCore: 0,
  };
  let totalAttempts = 0;

  // Track product-specific diagnostics
  const productDiagnostics = {
    attempted: 0,
    fetched: 0,
    evidenced: 0,
    namedDetected: 0,
    budgetUsed: 0,
    budgetSkipped: result.stagedDiagnostics?.skippedHighValuePagesByBucket?.productServices || 0,
  };

  while (queue.length > 0 && successfulEvidence < config.maxEvidencePages && totalAttempts < config.maxAttempts) {
    const batchSize = Math.min(queue.length, 3, config.maxAttempts - totalAttempts);
    const batch = queue.splice(0, batchSize); 

    const attempts = await Promise.all(
      batch.map(({ url, depth }) => fetchPage(url, depth, config)),
    );

    for (const attempt of attempts) {
      totalAttempts++;
      if (attempt.success) {
        successfulEvidence++;
        const intent = getEvidenceIntent(attempt.attemptedUrl, attempt.pageType);
        if (intent === "trust" || intent === "compliance" || intent === "security") {
          actualBucketUsage.trustCompliance++;
        } else if (intent === "product") {
          actualBucketUsage.productServices++;
          productDiagnostics.budgetUsed++;
        } else if (intent === "privacy") {
          actualBucketUsage.privacyLegal++;
        } else if (intent === "integration") {
          actualBucketUsage.integrationsDocs++;
        } else if (intent === "marketing") {
          actualBucketUsage.homepageCore++;
        }

        // Product diagnostics
        if (attempt.pageType === "product" || attempt.pageType === "solutions" || attempt.pageType === "platform") {
          productDiagnostics.fetched++;
          if (attempt.evidenceSucceeded) {
            productDiagnostics.evidenced++;
          }
          if (attempt.classificationSignals?.urlPattern || attempt.classificationSignals?.titlePattern) {
            productDiagnostics.namedDetected++;
          }
        }
      }

      // Track attempts for product
      const currentIntent = getEvidenceIntent(attempt.attemptedUrl, attempt.pageType);
      if (currentIntent === "product") {
        productDiagnostics.attempted++;
      }
      
      result.pages.push(attempt);
      result.totalAttempted++;

      if (attempt.success) {
        result.totalFetched++;
        result.totalSuccessful++;

        if (attempt.documentEvidenceCandidate) {
          result.pdfCandidates.push(attempt.attemptedUrl);
        }

        logUrlSuccess(correlationId, attempt.finalUrl || attempt.attemptedUrl, baseDomain, 
          attempt.statusCode || 200, attempt.pageType, attempt.duration || 0);
        logPageClassification(correlationId, attempt.attemptedUrl, baseDomain, 
          attempt.pageType, attempt.usefulnessScore || 0);
      } else {
        logUrlFailure(correlationId, attempt.attemptedUrl, baseDomain, 
          attempt.backendStatus || "unknown_error", attempt.statusCode || 0);
      }
      if (attempt.requestSucceeded) result.totalRequested++;
      if (attempt.extractionSucceeded) result.totalExtracted++;
      // totalEvidenced is incremented by the service layer

      // Discover new links if we haven't hit depth limit and have budget
      if (attempt.depth < config.maxDepth && successfulEvidence < config.maxEvidencePages) {
        for (const { url, anchorText } of attempt.discoveredLinks) {
          if (visited.has(url)) continue;
          if (shouldSkipUrl(url, config)) continue;
          if (
            config.respectRobotsTxt &&
            result.robotsTxt &&
            !isAllowedByRobots(url, result.robotsTxt.disallowPrefixes)
          ) {
            continue;
          }

          const score = scoreUrl(url, "html_body");
          if (score.score > 50) {
            // Only follow high-value links from inner pages
            queue.push({ url, depth: attempt.depth + 1 });
            visited.add(url);
            result.highValueUrls.push(url);
          }
        }
      }
    }

    // Respect crawl delay if specified
    if (result.robotsTxt?.crawlDelay && queue.length > 0) {
      await new Promise<void>((r) => setTimeout(r, result.robotsTxt!.crawlDelay! * 1000));
    }
  }

  result.durationMs = Date.now() - startTime;
  
  result.budgetUsage = {
    attemptsUsed: totalAttempts,
    evidencePagesFound: successfulEvidence,
    remainingAttempts: config.maxAttempts - totalAttempts,
    remainingEvidenceSlots: config.maxEvidencePages - successfulEvidence,
    bucketUsage: actualBucketUsage,
    productDiagnostics,
  };

  // Update classification summary and pages by tier using helper function
  updateClassificationAndTiering(result);

  logCrawlComplete(correlationId, {
    correlationId,
    domain: baseDomain,
    totalPagesAttempted: result.totalAttempted,
    totalPagesFetched: result.totalFetched,
    totalPagesSuccessful: result.totalSuccessful,
    highValuePagesFound: result.highValueUrls.length,
    securityLegalPagesFound: result.classificationSummary.security + 
      result.classificationSummary.compliance + 
      result.classificationSummary.privacy + 
      result.classificationSummary.legal + 
      result.classificationSummary.dpa + 
      result.classificationSummary.trust,
    totalUsefulChars: result.pages.reduce((sum, page) => sum + (page.usefulTextLength || 0), 0),
    sitemapUrlsDiscovered: result.sitemapUrls.length,
    crawlDuration: result.durationMs,
    stagedDiagnostics: result.stagedDiagnostics,
    budgetUsage: result.budgetUsage,
    issues: result.pages.filter(p => !p.success).map(p => ({
      type: p.backendStatus?.startsWith("error") ? "error" : "warning",
      message: p.errorMessage || `Backend status: ${p.backendStatus}`,
      url: p.attemptedUrl,
    })),
  });

  return result;
}
