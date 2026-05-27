import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  analyzeSinglePage,
  validatePageUrl,
  crawlDomain,
  DEFAULT_CRAWL_CONFIG,
  type CrawlConfig,
} from "@/modules/workspaces/onboarding/domain-crawler";
import {
  getHighValuePageSuggestions,
  generateRecoveryOptions,
  buildFullUrl,
  validateUserUrl,
  getRelevantPageSuggestions,
  type PageSuggestion,
  type CrawlRecoveryOptions,
} from "@/modules/workspaces/onboarding/crawl-recovery-helpers";
import { AiHttpClient, HttpFetchError } from "@/lib/ai/ai-http-client";

vi.mock("@/lib/ai/ai-http-client");

const mockGet = vi.mocked(AiHttpClient.get);

describe("Crawl Recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("analyzeSinglePage", () => {
    it("analyzes a single page successfully", async () => {
      mockGet.mockResolvedValueOnce(`
<html>
<head>
  <title>Security Overview</title>
  <meta name="description" content="Our security practices">
</head>
<body>
  <h1>Security Practices</h1>
  <p>We implement enterprise-grade security measures.</p>
</body>
</html>
      `);

      const result = await analyzeSinglePage("https://example.com/security");

      expect(result.baseDomain).toBe("example.com");
      expect(result.startUrl).toBe("https://example.com/security");
      expect(result.pages).toHaveLength(1);
      expect(result.totalAttempted).toBe(1);
      expect(result.totalFetched).toBe(1);
      expect(result.totalSuccessful).toBe(1);
      expect(result.pages[0].success).toBe(true);
      expect(result.pages[0].pageType).toBe("security");
      expect(result.highValueUrls).toContain("https://example.com/security");
    });

    it("handles single page failure", async () => {
      mockGet.mockRejectedValueOnce(new HttpFetchError("Forbidden", "http", 403, "https://example.com/security"));

      const result = await analyzeSinglePage("https://example.com/security");

      expect(result.pages).toHaveLength(1);
      expect(result.totalAttempted).toBe(1);
      expect(result.totalFetched).toBe(0);
      expect(result.totalSuccessful).toBe(0);
      expect(result.pages[0].success).toBe(false);
      expect(result.pages[0].backendStatus).toBe("forbidden_403");
    });

    it("normalizes URL without protocol", async () => {
      mockGet.mockResolvedValueOnce("<html><head><title>Test</title></head><body></body></html>");

      const result = await analyzeSinglePage("example.com/about");

      expect(result.startUrl).toBe("https://example.com/about");
      expect(result.baseDomain).toBe("example.com");
    });

    it("throws error for invalid URL", async () => {
      await expect(analyzeSinglePage("invalid-url")).rejects.toThrow("Invalid URL: invalid-url");
    });
  });

  describe("validatePageUrl", () => {
    it("validates same domain URL", () => {
      const result = validatePageUrl("https://example.com/security", "example.com");
      expect(result.isValid).toBe(true);
    });

    it("validates subdomain when allowed", () => {
      const result = validatePageUrl("https://app.example.com/security", "example.com", {
        allowSubdomains: true,
      });
      expect(result.isValid).toBe(true);
    });

    it("rejects subdomain when not allowed", () => {
      const result = validatePageUrl("https://app.example.com/security", "example.com");
      expect(result.isValid).toBe(false);
      expect(result.reason).toContain("does not match original domain");
    });

    it("validates related domain when allowed", () => {
      const result = validatePageUrl("https://example.co.uk/security", "example.com", {
        allowRelatedDomains: ["example.co.uk"],
      });
      expect(result.isValid).toBe(true);
    });

    it("rejects different domain", () => {
      const result = validatePageUrl("https://other.com/security", "example.com");
      expect(result.isValid).toBe(false);
      expect(result.reason).toContain("does not match original domain");
    });

    it("handles invalid URL format", () => {
      const result = validatePageUrl("not-a-url", "example.com");
      expect(result.isValid).toBe(false);
      expect(result.reason).toBe("Invalid URL format");
    });
  });

  describe("getHighValuePageSuggestions", () => {
    it("returns prioritized page suggestions", () => {
      const suggestions = getHighValuePageSuggestions("example.com");

      expect(suggestions.length).toBeGreaterThan(15);
      
      // Check high priority suggestions
      const highPriority = suggestions.filter(s => s.priority === "high");
      expect(highPriority.length).toBeGreaterThan(5);
      
      // Should include security and privacy pages
      expect(suggestions.some(s => s.path === "/security")).toBe(true);
      expect(suggestions.some(s => s.path === "/privacy")).toBe(true);
      expect(suggestions.some(s => s.path === "/trust")).toBe(true);
      expect(suggestions.some(s => s.path === "/compliance")).toBe(true);
      
      // Check suggestion structure
      const securitySuggestion = suggestions.find(s => s.path === "/security");
      expect(securitySuggestion).toMatchObject({
        path: "/security",
        description: expect.stringContaining("Security"),
        priority: "high",
        pageType: "security",
      });
    });
  });

  describe("generateRecoveryOptions", () => {
    it("generates options for blocked homepage", () => {
      const crawlResult = {
        totalAttempted: 1,
        totalFetched: 0,
        totalSuccessful: 0,
        pages: [{ success: false, backendStatus: "forbidden_403" }],
      };

      const options = generateRecoveryOptions("example.com", crawlResult);

      expect(options.showContinueManually).toBe(true);
      expect(options.showTryAnotherUrl).toBe(false);
      expect(options.showAddPublicPage).toBe(true);
      expect(options.failureReason).toBe("Access blocked by website (403 Forbidden)");
      expect(options.helperText).toContain("specific page URL");
      expect(options.suggestedPages.length).toBeGreaterThan(0);
    });

    it("generates options for rate limited crawl", () => {
      const crawlResult = {
        totalAttempted: 3,
        totalFetched: 1,
        totalSuccessful: 0,
        pages: [
          { success: false, backendStatus: "rate_limited_429" },
          { success: false, backendStatus: "rate_limited_429" },
          { success: false, backendStatus: "rate_limited_429" },
        ],
      };

      const options = generateRecoveryOptions("example.com", crawlResult);

      expect(options.showContinueManually).toBe(true);
      expect(options.showTryAnotherUrl).toBe(false);
      expect(options.showAddPublicPage).toBe(true);
      expect(options.failureReason).toBe("Rate limited by website (429 Too Many Requests)");
      expect(options.helperText).toContain("Try again later");
    });

    it("generates options for limited evidence", () => {
      const crawlResult = {
        totalAttempted: 5,
        totalFetched: 5,
        totalSuccessful: 2,
        pages: [
          { success: true },
          { success: true },
          { success: false },
          { success: false },
          { success: false },
        ],
      };

      const options = generateRecoveryOptions("example.com", crawlResult);

      expect(options.showContinueManually).toBe(false);
      expect(options.showTryAnotherUrl).toBe(true);
      expect(options.showAddPublicPage).toBe(true);
      expect(options.failureReason).toBe("Limited evidence collected (few pages successful)");
      expect(options.helperText).toContain("product, security, trust");
    });

    it("generates options for complete failure", () => {
      const crawlResult = {
        totalAttempted: 0,
        totalFetched: 0,
        totalSuccessful: 0,
        pages: [],
      };

      const options = generateRecoveryOptions("example.com", crawlResult);

      expect(options.showContinueManually).toBe(true);
      expect(options.showTryAnotherUrl).toBe(true);
      expect(options.showAddPublicPage).toBe(true);
      expect(options.failureReason).toBe("Unable to connect to the domain");
    });
  });

  describe("buildFullUrl", () => {
    it("builds full URL from domain and path", () => {
      const url = buildFullUrl("example.com", "/security");
      expect(url).toBe("https://example.com/security");
    });

    it("handles domain with protocol", () => {
      const url = buildFullUrl("https://example.com", "/privacy");
      expect(url).toBe("https://example.com/privacy");
    });

    it("handles domain with www", () => {
      const url = buildFullUrl("www.example.com", "/about");
      expect(url).toBe("https://example.com/about");
    });

    it("adds leading slash to path", () => {
      const url = buildFullUrl("example.com", "security");
      expect(url).toBe("https://example.com/security");
    });
  });

  describe("validateUserUrl", () => {
    it("validates correct URL", () => {
      const result = validateUserUrl("https://example.com/security", "example.com");
      expect(result.isValid).toBe(true);
      expect(result.normalizedUrl).toBe("https://example.com/security");
    });

    it("adds protocol to URL", () => {
      const result = validateUserUrl("example.com/security", "example.com");
      expect(result.isValid).toBe(true);
      expect(result.normalizedUrl).toBe("https://example.com/security");
    });

    it("rejects different domain", () => {
      const result = validateUserUrl("https://other.com/security", "example.com");
      expect(result.isValid).toBe(false);
      expect(result.error).toContain("must belong to the same domain");
    });

    it("handles www subdomain", () => {
      const result = validateUserUrl("https://www.example.com/security", "example.com");
      expect(result.isValid).toBe(true);
    });

    it("rejects invalid URL", () => {
      const result = validateUserUrl("not-a-url", "example.com");
      expect(result.isValid).toBe(false);
      expect(result.error).toBe("Invalid URL format");
    });
  });

  describe("getRelevantPageSuggestions", () => {
    it("returns relevant suggestions for blocked sites", () => {
      const suggestions = getRelevantPageSuggestions("Access blocked by website (403 Forbidden)", "example.com");
      
      expect(suggestions.length).toBeLessThanOrEqual(3);
      expect(suggestions.every(s => s.priority === "high")).toBe(true);
      expect(suggestions.some(s => s.pageType === "privacy")).toBe(true);
      expect(suggestions.some(s => s.pageType === "legal")).toBe(true);
    });

    it("returns relevant suggestions for rate limiting", () => {
      const suggestions = getRelevantPageSuggestions("Rate limited by website (429 Too Many Requests)", "example.com");
      
      expect(suggestions.length).toBeLessThanOrEqual(2);
      expect(suggestions.every(s => s.priority === "high")).toBe(true);
    });

    it("returns relevant suggestions for limited evidence", () => {
      const suggestions = getRelevantPageSuggestions("Limited evidence collected", "example.com");
      
      expect(suggestions.length).toBeLessThanOrEqual(4);
      expect(suggestions.some(s => s.pageType === "security")).toBe(true);
      expect(suggestions.some(s => s.pageType === "trust")).toBe(true);
      expect(suggestions.some(s => s.pageType === "privacy")).toBe(true);
    });

    it("returns default suggestions for unknown failure", () => {
      const suggestions = getRelevantPageSuggestions("Unknown error", "example.com");
      
      expect(suggestions.length).toBeLessThanOrEqual(5);
      expect(suggestions.every(s => s.priority === "high")).toBe(true);
      expect(suggestions.some(s => s.path === "/security")).toBe(true);
    });
  });

  describe("Integration: Single Page Analysis with Evidence Pipeline", () => {
    it("can analyze single page and build evidence pack", async () => {
      mockGet.mockResolvedValueOnce(`
<html>
<head>
  <title>Privacy Policy</title>
  <meta name="description" content="Our privacy practices and GDPR compliance">
</head>
<body>
  <h1>Privacy Policy</h1>
  <p>We are fully compliant with GDPR and protect your personal data.</p>
  <h2>Data Processing</h2>
  <p>All data processing follows GDPR requirements with proper consent mechanisms.</p>
</body>
</html>
      `);

      const crawlResult = await analyzeSinglePage("https://example.com/privacy");
      
      // Import and use evidence pack builder
      const { buildEvidencePack } = await import("@/modules/workspaces/onboarding/domain-crawler");
      const evidencePack = buildEvidencePack(crawlResult);

      expect(evidencePack.pages).toHaveLength(1);
      expect(evidencePack.pagesFetched).toBe(1);
      expect(evidencePack.securityLegalPagesFound).toBe(1);
      
      const privacyPage = evidencePack.pages[0];
      expect(privacyPage.pageType).toBe("privacy");
      expect(privacyPage.title).toBe("Privacy Policy");
      expect(privacyPage.evidenceSnippets.length).toBeGreaterThan(0);
    });

    it("validates user-provided URL and analyzes it", async () => {
      mockGet.mockResolvedValueOnce(`
<html>
<head>
  <title>Security Overview</title>
</head>
<body>
  <h1>Enterprise Security</h1>
  <p>We maintain enterprise-grade security practices.</p>
</body>
</html>
      `);

      const userUrl = "https://example.com/security";
      const validation = validateUserUrl(userUrl, "example.com");
      
      expect(validation.isValid).toBe(true);
      
      if (validation.isValid) {
        const crawlResult = await analyzeSinglePage(validation.normalizedUrl!);
        expect(crawlResult.pages[0].pageType).toBe("security");
      }
    });
  });

  describe("Frontend Recovery Scenarios", () => {
    it("blocked homepage shows appropriate recovery options", () => {
      const crawlResult = {
        totalAttempted: 1,
        totalFetched: 0,
        totalSuccessful: 0,
        pages: [{ success: false, backendStatus: "forbidden_403" }],
      };

      const options = generateRecoveryOptions("example.com", crawlResult);

      // Frontend should show these recovery options
      const frontendOptions = {
        canContinueManually: options.showContinueManually,
        canTryAnotherUrl: options.showTryAnotherUrl,
        canAddPublicPage: options.showAddPublicPage,
        suggestedPages: options.suggestedPages.slice(0, 3), // Show top 3 suggestions
        helperMessage: options.helperText,
        failureMessage: options.failureReason,
      };

      expect(frontendOptions.canContinueManually).toBe(true);
      expect(frontendOptions.canTryAnotherUrl).toBe(false);
      expect(frontendOptions.canAddPublicPage).toBe(true);
      expect(frontendOptions.suggestedPages.length).toBeGreaterThan(0);
      expect(frontendOptions.helperMessage).toContain("specific page URL");
    });

    it("user can provide /security URL for recovery", async () => {
      mockGet.mockResolvedValueOnce(`
<html>
<head>
  <title>Security Center</title>
</head>
<body>
  <h1>Security Overview</h1>
  <p>Our comprehensive security program.</p>
</body>
</html>
      `);

      // User provides security URL
      const userUrl = "https://example.com/security";
      const validation = validateUserUrl(userUrl, "example.com");
      
      expect(validation.isValid).toBe(true);
      
      if (validation.isValid) {
        const crawlResult = await analyzeSinglePage(validation.normalizedUrl!);
        expect(crawlResult.pages[0].success).toBe(true);
        expect(crawlResult.pages[0].pageType).toBe("security");
        
        // Can build evidence pack from this single page
        const { buildEvidencePack } = await import("@/modules/workspaces/onboarding/domain-crawler");
        const evidencePack = buildEvidencePack(crawlResult);
        
        expect(evidencePack.pagesFetched).toBe(1);
        expect(evidencePack.securityLegalPagesFound).toBe(1);
      }
    });

    it("user can provide /privacy URL for recovery", async () => {
      mockGet.mockResolvedValueOnce(`
<html>
<head>
  <title>Privacy Policy</title>
</head>
<body>
  <h1>Privacy Policy</h1>
  <p>GDPR compliant privacy practices.</p>
</body>
</html>
      `);

      const userUrl = "https://example.com/privacy";
      const validation = validateUserUrl(userUrl, "example.com");
      
      expect(validation.isValid).toBe(true);
      
      if (validation.isValid) {
        const crawlResult = await analyzeSinglePage(validation.normalizedUrl!);
        expect(crawlResult.pages[0].pageType).toBe("privacy");
        
        const { buildEvidencePack } = await import("@/modules/workspaces/onboarding/domain-crawler");
        const evidencePack = buildEvidencePack(crawlResult);
        
        expect(evidencePack.securityLegalPagesFound).toBe(1);
      }
    });

    it("manual setup remains available when all recovery fails", () => {
      const crawlResult = {
        totalAttempted: 0,
        totalFetched: 0,
        totalSuccessful: 0,
        pages: [],
      };

      const options = generateRecoveryOptions("example.com", crawlResult);

      expect(options.showContinueManually).toBe(true);
      expect(options.showTryAnotherUrl).toBe(true);
      expect(options.showAddPublicPage).toBe(true);
      
      // User can always choose manual setup
      const canProceedManually = options.showContinueManually;
      expect(canProceedManually).toBe(true);
    });
  });
});
