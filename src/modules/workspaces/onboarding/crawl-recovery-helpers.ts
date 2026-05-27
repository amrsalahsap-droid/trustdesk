/**
 * Crawl Recovery Helpers for TrustDesk
 * 
 * Provides suggestions and utilities for recovery paths when public domain crawl is blocked or weak
 */

/**
 * High-value page suggestions for recovery
 */
export interface PageSuggestion {
  /** URL path to try */
  path: string;
  /** Description of what this page typically contains */
  description: string;
  /** Priority level for trying this page */
  priority: "high" | "medium" | "low";
  /** Typical page type classification */
  pageType: string;
}

/**
 * Crawl recovery options for frontend
 */
export interface CrawlRecoveryOptions {
  /** Whether to show continue manually option */
  showContinueManually: boolean;
  /** Whether to show try another URL option */
  showTryAnotherUrl: boolean;
  /** Whether to show add public page URL option */
  showAddPublicPage: boolean;
  /** Suggested high-value pages to try */
  suggestedPages: PageSuggestion[];
  /** Helper text for user guidance */
  helperText: string;
  /** Reason for crawl failure/weakness */
  failureReason: string;
}

/**
 * Get high-value page suggestions for a domain
 */
export function getHighValuePageSuggestions(baseDomain: string): PageSuggestion[] {
  const suggestions: PageSuggestion[] = [
    // Security & Trust pages (highest priority)
    {
      path: "/security",
      description: "Security overview, practices, and certifications",
      priority: "high",
      pageType: "security",
    },
    {
      path: "/trust",
      description: "Trust center and security compliance information",
      priority: "high",
      pageType: "trust",
    },
    {
      path: "/trust-center",
      description: "Trust center with security and compliance details",
      priority: "high",
      pageType: "trust",
    },
    {
      path: "/privacy",
      description: "Privacy policy and data protection practices",
      priority: "high",
      pageType: "privacy",
    },
    {
      path: "/privacy-policy",
      description: "Detailed privacy policy and data handling",
      priority: "high",
      pageType: "privacy",
    },
    {
      path: "/compliance",
      description: "Compliance certifications and regulatory information",
      priority: "high",
      pageType: "compliance",
    },
    
    // Legal & Documentation pages (medium priority)
    {
      path: "/legal",
      description: "Legal terms, conditions, and policies",
      priority: "medium",
      pageType: "legal",
    },
    {
      path: "/terms",
      description: "Terms of service and usage conditions",
      priority: "medium",
      pageType: "legal",
    },
    {
      path: "/terms-of-service",
      description: "Detailed terms of service agreement",
      priority: "medium",
      pageType: "legal",
    },
    {
      path: "/dpa",
      description: "Data processing agreement and privacy terms",
      priority: "medium",
      pageType: "dpa",
    },
    {
      path: "/docs",
      description: "Documentation and developer resources",
      priority: "medium",
      pageType: "docs",
    },
    {
      path: "/documentation",
      description: "Technical documentation and API references",
      priority: "medium",
      pageType: "docs",
    },
    
    // Product & Company pages (lower priority but still valuable)
    {
      path: "/about",
      description: "Company information and overview",
      priority: "low",
      pageType: "about",
    },
    {
      path: "/company",
      description: "Company details and business information",
      priority: "low",
      pageType: "company",
    },
    {
      path: "/product",
      description: "Product overview and features",
      priority: "low",
      pageType: "product",
    },
    {
      path: "/products",
      description: "Product catalog and solutions",
      priority: "low",
      pageType: "product",
    },
    {
      path: "/platform",
      description: "Platform capabilities and architecture",
      priority: "low",
      pageType: "product",
    },
    {
      path: "/solutions",
      description: "Industry solutions and use cases",
      priority: "low",
      pageType: "solutions",
    },
  ];

  return suggestions;
}

/**
 * Generate recovery options based on crawl results
 */
export function generateRecoveryOptions(
  baseDomain: string,
  crawlResult: {
    totalAttempted: number;
    totalFetched: number;
    totalSuccessful: number;
    pages: Array<{ success: boolean; backendStatus?: string }>;
  }
): CrawlRecoveryOptions {
  const { totalAttempted, totalFetched, totalSuccessful, pages } = crawlResult;
  
  // Determine failure reason
  let failureReason = "";
  let showContinueManually = false;
  let showTryAnotherUrl = true;
  let showAddPublicPage = true;
  
  if (totalAttempted === 0) {
    failureReason = "Unable to connect to the domain";
    showContinueManually = true;
  } else if (totalFetched === 0) {
    failureReason = "No pages could be fetched (blocked or unavailable)";
    showContinueManually = true;
  } else if (totalSuccessful === 0) {
    failureReason = "All pages failed to load properly";
    showContinueManually = true;
  } else if (totalSuccessful < 3) {
    failureReason = "Limited evidence collected (few pages successful)";
    showContinueManually = false;
  } else {
    failureReason = "Crawl completed but evidence may be insufficient";
    showContinueManually = false;
  }
  
  // Check for specific failure patterns
  const blockedPages = pages.filter(p => !p.success);
  const forbiddenPages = blockedPages.filter(p => p.backendStatus === "forbidden_403");
  const rateLimitedPages = blockedPages.filter(p => p.backendStatus === "rate_limited_429");
  const serverErrorPages = blockedPages.filter(p => p.backendStatus === "server_error_5xx");
  
  if (forbiddenPages.length > 0) {
    failureReason = "Access blocked by website (403 Forbidden)";
    showTryAnotherUrl = false;
  } else if (rateLimitedPages.length > 0) {
    failureReason = "Rate limited by website (429 Too Many Requests)";
    showTryAnotherUrl = false;
  } else if (serverErrorPages.length > 0) {
    failureReason = "Server errors encountered (5xx responses)";
    showTryAnotherUrl = true;
  }
  
  // Get suggested pages
  const suggestedPages = getHighValuePageSuggestions(baseDomain);
  
  // Generate helper text
  let helperText = "";
  if (forbiddenPages.length > 0) {
    helperText = "Try a specific page URL that might be accessible, such as a security or privacy page.";
  } else if (rateLimitedPages.length > 0) {
    helperText = "Try again later or provide a specific page URL to continue.";
  } else if (totalSuccessful < 2) {
    helperText = "Try a product, security, trust, privacy, legal, or compliance page.";
  } else {
    helperText = "You can provide additional page URLs to strengthen the evidence.";
  }
  
  return {
    showContinueManually,
    showTryAnotherUrl,
    showAddPublicPage,
    suggestedPages,
    helperText,
    failureReason,
  };
}

/**
 * Build full URL from domain and path
 */
export function buildFullUrl(baseDomain: string, path: string): string {
  const cleanDomain = baseDomain.replace(/^https?:\/\//, "").replace(/^www\./, "");
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `https://${cleanDomain}${cleanPath}`;
}

/**
 * Validate and normalize a user-provided URL
 */
export function validateUserUrl(url: string, baseDomain: string): {
  isValid: boolean;
  normalizedUrl?: string;
  error?: string;
} {
  try {
    // Add protocol if missing
    const withProtocol = url.startsWith("http") ? url : `https://${url}`;
    const urlObj = new URL(withProtocol);
    
    // Extract domain for comparison
    const urlDomain = urlObj.hostname.replace(/^www\./, "");
    const cleanBaseDomain = baseDomain.replace(/^www\./, "");
    
    // Check if same domain
    if (urlDomain !== cleanBaseDomain) {
      return {
        isValid: false,
        error: `URL must belong to the same domain (${baseDomain})`,
      };
    }
    
    return {
      isValid: true,
      normalizedUrl: withProtocol,
    };
  } catch {
    return {
      isValid: false,
      error: "Invalid URL format",
    };
  }
}

/**
 * Get the most relevant page suggestions based on crawl failure type
 */
export function getRelevantPageSuggestions(
  failureReason: string,
  baseDomain: string
): PageSuggestion[] {
  const allSuggestions = getHighValuePageSuggestions(baseDomain);
  
  // Prioritize suggestions based on failure type
  if (failureReason.includes("blocked") || failureReason.includes("403")) {
    // For blocked sites, try alternative pages that might be accessible
    return allSuggestions.filter(s => 
      s.priority === "high" && 
      ["privacy", "legal", "docs", "about"].includes(s.pageType)
    ).slice(0, 3);
  }
  
  if (failureReason.includes("rate") || failureReason.includes("429")) {
    // For rate limiting, suggest high-value pages worth waiting for
    return allSuggestions.filter(s => s.priority === "high").slice(0, 2);
  }
  
  if (failureReason.includes("limited evidence")) {
    // For weak evidence, suggest security and trust pages
    return allSuggestions.filter(s => 
      ["security", "trust", "privacy", "compliance"].includes(s.pageType)
    ).slice(0, 4);
  }
  
  // Default: return top high-priority suggestions
  return allSuggestions.filter(s => s.priority === "high").slice(0, 5);
}
