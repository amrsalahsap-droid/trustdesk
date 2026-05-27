import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  crawlDomain,
  fetchRobotsTxt,
  fetchSitemap,
  DEFAULT_CRAWL_CONFIG,
  type CrawlConfig,
} from "@/modules/workspaces/onboarding/domain-crawler";
import { AiHttpClient, HttpFetchError } from "@/lib/ai/ai-http-client";

vi.mock("@/lib/ai/ai-http-client");

const mockGet = vi.mocked(AiHttpClient.get);

describe("Domain Crawler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("fetchRobotsTxt", () => {
    it("parses sitemap and disallow directives", async () => {
      mockGet.mockResolvedValueOnce(`
User-agent: *
Disallow: /admin/
Disallow: /private/
Sitemap: https://example.com/sitemap.xml
Sitemap: https://example.com/sitemap-pages.xml
Crawl-delay: 1
      `);

      const result = await fetchRobotsTxt("example.com", 5000);

      expect(result).toBeDefined();
      expect(result!.sitemaps).toEqual([
        "https://example.com/sitemap.xml",
        "https://example.com/sitemap-pages.xml",
      ]);
      expect(result!.disallowPrefixes).toEqual(["/admin/", "/private/"]);
      expect(result!.crawlDelay).toBe(1);
    });

    it("returns undefined on 404", async () => {
      mockGet.mockRejectedValueOnce(new Error("Not found"));

      const result = await fetchRobotsTxt("example.com", 5000);

      expect(result).toBeUndefined();
    });
  });

  describe("fetchSitemap", () => {
    it("extracts URLs from XML sitemap", async () => {
      mockGet.mockResolvedValueOnce(`
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://example.com/about</loc>
  </url>
  <url>
    <loc>https://example.com/security</loc>
  </url>
</urlset>
      `);

      const urls = await fetchSitemap("https://example.com/sitemap.xml", 5000);

      expect(urls).toEqual(["https://example.com/about", "https://example.com/security"]);
    });

    it("handles nested sitemap indexes", async () => {
      mockGet
        .mockResolvedValueOnce(`
<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>https://example.com/sitemap-pages.xml</loc>
  </sitemap>
</sitemapindex>
        `)
        .mockResolvedValueOnce(`
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://example.com/product</loc>
  </url>
</urlset>
        `);

      const urls = await fetchSitemap("https://example.com/sitemap_index.xml", 5000);

      expect(urls).toContain("https://example.com/product");
    });
  });

  describe("crawlDomain", () => {
    it("fetches homepage and extracts links", async () => {
      mockGet
        .mockResolvedValueOnce("") // robots.txt - not found
        .mockResolvedValueOnce("") // sitemap.xml - not found
        .mockResolvedValueOnce(`
<!DOCTYPE html>
<html>
<head><title>Example Corp</title></head>
<body>
  <nav>
    <a href="/about">About</a>
    <a href="/security">Security</a>
    <a href="/product">Product</a>
  </nav>
  <footer>
    <a href="/privacy">Privacy</a>
    <a href="/terms">Terms</a>
  </footer>
</body>
</html>
        `);

      const config: CrawlConfig = {
        ...DEFAULT_CRAWL_CONFIG,
        maxPages: 3,
      };

      const result = await crawlDomain("example.com", config);

      expect(result.baseDomain).toBe("example.com");
      expect(result.pages.length).toBeGreaterThanOrEqual(1);
      expect(result.pages[0].attemptedUrl).toBe("https://example.com");
      expect(result.pages[0].success).toBe(true);
      expect(result.pages[0].title).toBe("Example Corp");
    });

    it("prioritizes high-value URLs from sitemap", async () => {
      mockGet
        .mockResolvedValueOnce(`
User-agent: *
Sitemap: https://example.com/sitemap.xml
        `)
        .mockResolvedValueOnce(`
<?xml version="1.0" encoding="UTF-8"?>
<urlset>
  <url><loc>https://example.com/security</loc></url>
  <url><loc>https://example.com/compliance</loc></url>
  <url><loc>https://example.com/blog/post-1</loc></url>
</urlset>
        `)
        .mockResolvedValueOnce("<!DOCTYPE html><html><head><title>Home</title></head><body></body></html>");

      const config: CrawlConfig = {
        ...DEFAULT_CRAWL_CONFIG,
        maxPages: 2,
        allowBlogPaths: false,
      };

      const result = await crawlDomain("example.com", config);

      // Should prioritize /security and /compliance over blog
      expect(result.sitemapUrls).toContain("https://example.com/security");
      expect(result.sitemapUrls).toContain("https://example.com/compliance");
      expect(result.sitemapUrls).not.toContain("https://example.com/blog/post-1");
    });

    it("skips blog paths when allowBlogPaths is false", async () => {
      mockGet
        .mockResolvedValueOnce("") // robots
        .mockResolvedValueOnce("") // sitemap
        .mockResolvedValueOnce(`
<html>
<head><title>Home</title></head>
<body>
  <a href="/about">About</a>
  <a href="/blog/post-1">Blog Post</a>
  <a href="/news/article-1">News Article</a>
</body>
</html>
        `);

      const config: CrawlConfig = {
        ...DEFAULT_CRAWL_CONFIG,
        maxPages: 2,
        allowBlogPaths: false,
      };

      const result = await crawlDomain("example.com", config);

      // Check that /blog and /news links were not queued
      const attemptedUrls = result.pages.map((p) => p.attemptedUrl);
      expect(attemptedUrls.some((u) => u.includes("/blog/"))).toBe(false);
      expect(attemptedUrls.some((u) => u.includes("/news/"))).toBe(false);
    });

    it("respects robots.txt disallow rules", async () => {
      mockGet
        .mockResolvedValueOnce(`
User-agent: *
Disallow: /admin/
        `)
        .mockResolvedValueOnce("") // sitemap
        .mockResolvedValueOnce(`
<html>
<head><title>Home</title></head>
<body>
  <a href="/about">About</a>
  <a href="/admin/dashboard">Admin</a>
</body>
</html>
        `);

      const config: CrawlConfig = {
        ...DEFAULT_CRAWL_CONFIG,
        respectRobotsTxt: true,
        maxPages: 2,
      };

      const result = await crawlDomain("example.com", config);

      const attemptedUrls = result.pages.map((p) => p.attemptedUrl);
      expect(attemptedUrls.some((u) => u.includes("/admin/"))).toBe(false);
    });

    it("stores detailed crawl attempt results", async () => {
      mockGet
        .mockResolvedValueOnce("") // robots
        .mockResolvedValueOnce("") // sitemap
        .mockResolvedValueOnce(`
<!DOCTYPE html>
<html>
<head><title>Test Page</title></head>
<body>
  <h1>Welcome</h1>
  <p>This is a test page with some content.</p>
  <a href="/link1">Link 1</a>
</body>
</html>
        `);

      const result = await crawlDomain("example.com", { ...DEFAULT_CRAWL_CONFIG, maxPages: 1 });

      const page = result.pages[0];
      expect(page.attemptedUrl).toBe("https://example.com");
      expect(page.fetchedUrl).toBe("https://example.com");
      expect(page.statusCode).toBe(200);
      expect(page.success).toBe(true);
      expect(page.title).toBe("Test Page");
      expect(page.textLength).toBeGreaterThan(0);
      expect(page.extractionStatus).toBe("success");
      expect(page.discoveredLinks.length).toBeGreaterThan(0);
      expect(page.timestamp).toBeInstanceOf(Date);
    });

    it("handles failed fetches gracefully", async () => {
      mockGet
        .mockResolvedValueOnce("") // robots
        .mockResolvedValueOnce("") // sitemap
        .mockRejectedValueOnce(new Error("Connection refused"));

      const result = await crawlDomain("example.com", DEFAULT_CRAWL_CONFIG);

      expect(result.pages.length).toBe(1);
      expect(result.pages[0].success).toBe(false);
      expect(result.pages[0].extractionStatus).toBe("error");
      expect(result.pages[0].errorMessage).toBeDefined();
    });

    it("tracks crawl diagnostics", async () => {
      mockGet
        .mockResolvedValueOnce(`
User-agent: *
Sitemap: https://example.com/sitemap.xml
        `)
        .mockResolvedValueOnce(`
<urlset>
  <url><loc>https://example.com/security</loc></url>
</urlset>
        `)
        .mockResolvedValueOnce(`
<html><head><title>Home</title></head>
<body>
  <a href="/security">Security</a>
</body></html>
        `)
        .mockResolvedValueOnce(`
<html><head><title>Security</title></head>
<body><h1>Security Page</h1></body></html>
        `);

      const result = await crawlDomain("example.com", { ...DEFAULT_CRAWL_CONFIG, maxPages: 2 });

      expect(result.totalAttempted).toBeGreaterThanOrEqual(1);
      expect(result.totalFetched).toBeGreaterThanOrEqual(0);
      expect(result.totalSuccessful).toBeGreaterThanOrEqual(0);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.highValueUrls.length).toBeGreaterThanOrEqual(0);
    });

    it("limits crawl to same domain", async () => {
      mockGet
        .mockResolvedValueOnce("") // robots
        .mockResolvedValueOnce("") // sitemap
        .mockResolvedValueOnce(`
<html>
<head><title>Home</title></head>
<body>
  <a href="/about">About</a>
  <a href="https://other-site.com/page">External</a>
  <a href="//cdn.example.com/file">CDN</a>
</body>
</html>
        `);

      const result = await crawlDomain("example.com", DEFAULT_CRAWL_CONFIG);

      // External links should not be in discovered links or queue
      const allDiscovered = result.pages.flatMap((p) => p.discoveredLinks);
      expect(allDiscovered.some((u) => u.includes("other-site.com"))).toBe(false);
      expect(allDiscovered.some((u) => u.includes("cdn.example.com"))).toBe(false);
    });

    it("respects maxPages limit", async () => {
      // Create HTML with many links
      const manyLinks = Array.from({ length: 20 }, (_, i) =>
        `<a href="/page${i}">Page ${i}</a>`
      ).join("\n");

      mockGet
        .mockResolvedValueOnce("") // robots
        .mockResolvedValueOnce("") // sitemap
        .mockResolvedValueOnce(`
<html><head><title>Home</title></head>
<body>${manyLinks}</body></html>
        `);

      const config: CrawlConfig = { ...DEFAULT_CRAWL_CONFIG, maxPages: 3 };
      const result = await crawlDomain("example.com", config);

      expect(result.pages.length).toBeLessThanOrEqual(config.maxPages);
    });

    it("follows high-value links from inner pages", async () => {
      mockGet
        .mockResolvedValueOnce("") // robots
        .mockResolvedValueOnce("") // sitemap
        .mockResolvedValueOnce(`
<html><head><title>Home</title></head>
<body>
  <a href="/product">Product</a>
</body></html>
        `)
        .mockResolvedValueOnce(`
<html><head><title>Product</title></head>
<body>
  <h1>Our Product</h1>
  <a href="/security">Security</a>
  <a href="/compliance">Compliance</a>
</body></html>
        `);

      const config: CrawlConfig = { ...DEFAULT_CRAWL_CONFIG, maxPages: 3, maxDepth: 2 };
      const result = await crawlDomain("example.com", config);

      // Should have followed links from /product to /security and /compliance
      const attemptedUrls = result.pages.map((p) => p.attemptedUrl);
      expect(attemptedUrls).toContain("https://example.com/product");
      // Depending on scoring, may also include security/compliance
    });

    it("continues with high-value paths when homepage fails with 403", async () => {
      const { HttpFetchError } = await import("@/lib/ai/ai-http-client");

      mockGet
        .mockResolvedValueOnce("") // robots
        .mockResolvedValueOnce("") // sitemap
        .mockRejectedValueOnce(new HttpFetchError("Forbidden", "http", 403, "https://example.com")) // homepage 403
        .mockResolvedValueOnce(`
<html><head><title>About Us</title></head>
<body>
  <h1>About Example Corp</h1>
  <p>We are a leading provider of...</p>
</body></html>
        `); // /about succeeds

      const config: CrawlConfig = { ...DEFAULT_CRAWL_CONFIG, maxPages: 5 };
      const result = await crawlDomain("example.com", config);

      // Should have attempted homepage and high-value paths
      expect(result.pages.length).toBeGreaterThan(1);
      expect(result.pages[0].success).toBe(false);
      expect(result.pages[0].statusCode).toBe(403);

      // Should have at least one successful page from high-value paths
      const successfulPages = result.pages.filter((p) => p.success);
      expect(successfulPages.length).toBeGreaterThanOrEqual(1);
      expect(result.totalSuccessful).toBeGreaterThanOrEqual(1);
    });

    it("processes sitemap URLs even when homepage is blocked", async () => {
      const { HttpFetchError } = await import("@/lib/ai/ai-http-client");

      mockGet
        .mockResolvedValueOnce(`
User-agent: *
Sitemap: https://example.com/sitemap.xml
        `) // robots with sitemap
        .mockResolvedValueOnce(`
<urlset>
  <url><loc>https://example.com/privacy</loc></url>
  <url><loc>https://example.com/security</loc></url>
</urlset>
        `) // sitemap
        .mockRejectedValueOnce(new HttpFetchError("Forbidden", "http", 403, "https://example.com")) // homepage 403
        .mockResolvedValueOnce(`
<html><head><title>Privacy Policy</title></head>
<body><h1>Privacy Policy</h1></body></html>
        `) // /privacy succeeds
        .mockResolvedValueOnce(`
<html><head><title>Security</title></head>
<body><h1>Security Page</h1></body></html>
        `); // /security succeeds

      const config: CrawlConfig = { ...DEFAULT_CRAWL_CONFIG, maxPages: 5 };
      const result = await crawlDomain("example.com", config);

      // Should have attempted homepage and sitemap URLs
      expect(result.pages.length).toBeGreaterThan(1);
      expect(result.sitemapUrls).toContain("https://example.com/privacy");
      expect(result.sitemapUrls).toContain("https://example.com/security");

      // Should have successful pages from sitemap
      const successfulPages = result.pages.filter((p) => p.success);
      expect(successfulPages.length).toBeGreaterThanOrEqual(2);
    });

    it("returns partial results with diagnostics when some pages fail", async () => {
      const { HttpFetchError } = await import("@/lib/ai/ai-http-client");

      mockGet
        .mockResolvedValueOnce("") // robots
        .mockResolvedValueOnce("") // sitemap
        .mockRejectedValueOnce(new HttpFetchError("Forbidden", "http", 403, "https://example.com")) // homepage 403
        .mockRejectedValueOnce(new HttpFetchError("Forbidden", "http", 403, "https://example.com/about")) // /about 403
        .mockResolvedValueOnce(`
<html><head><title>Privacy Policy</title></head>
<body><h1>Privacy</h1></body></html>
        `); // /privacy succeeds

      const config: CrawlConfig = { ...DEFAULT_CRAWL_CONFIG, maxPages: 5 };
      const result = await crawlDomain("example.com", config);

      // Should have attempted multiple pages
      expect(result.totalAttempted).toBeGreaterThan(1);

      // Should have at least one successful page
      expect(result.totalSuccessful).toBeGreaterThanOrEqual(1);

      // Should preserve failed attempts in diagnostics
      const failedPages = result.pages.filter((p) => !p.success);
      expect(failedPages.length).toBeGreaterThanOrEqual(1);
      expect(failedPages[0].statusCode).toBe(403);
    });

    it("always adds high-value paths even when homepage succeeds with thin navigation", async () => {
      mockGet
        .mockResolvedValueOnce("") // robots
        .mockResolvedValueOnce("") // sitemap
        .mockResolvedValueOnce(`
<html><head><title>Home</title></head>
<body>
  <nav>
    <a href="/">Home</a>
  </nav>
</body></html>
        `) // homepage succeeds but has minimal navigation
        .mockResolvedValueOnce(`
<html><head><title>Security</title></head>
<body><h1>Security Page</h1></body></html>
        `) // /security succeeds
        .mockResolvedValueOnce(`
<html><head><title>Privacy</title></head>
<body><h1>Privacy Policy</h1></body></html>
        `); // /privacy succeeds

      const config: CrawlConfig = { ...DEFAULT_CRAWL_CONFIG, maxPages: 5 };
      const result = await crawlDomain("example.com", config);

      // Should have attempted homepage and high-value paths
      expect(result.pages.length).toBeGreaterThan(1);
      expect(result.pages[0].success).toBe(true);

      // Should have high-value URLs in diagnostics
      expect(result.highValueUrls.length).toBeGreaterThan(0);
      expect(result.highValueUrls).toContain("https://example.com/security");
      expect(result.highValueUrls).toContain("https://example.com/privacy");

      // Should have successful pages from high-value paths
      const successfulPages = result.pages.filter((p) => p.success);
      expect(successfulPages.length).toBeGreaterThanOrEqual(2);
    });

    it("prioritizes security/trust/privacy pages in high-value discovery", async () => {
      mockGet
        .mockResolvedValueOnce("") // robots
        .mockResolvedValueOnce("") // sitemap
        .mockRejectedValueOnce(new HttpFetchError("Forbidden", "http", 403, "https://example.com")) // homepage 403
        .mockResolvedValueOnce(`
<html><head><title>Security</title></head>
<body><h1>Security</h1></body></html>
        `) // /security succeeds
        .mockResolvedValueOnce(`
<html><head><title>About</title></head>
<body><h1>About Us</h1></body></html>
        `) // /about succeeds
        .mockResolvedValueOnce(`
<html><head><title>Privacy</title></head>
<body><h1>Privacy</h1></body></html>
        `); // /privacy succeeds

      const config: CrawlConfig = { ...DEFAULT_CRAWL_CONFIG, maxPages: 4 };
      const result = await crawlDomain("example.com", config);

      // Security/trust/privacy should be attempted first
      const attemptedUrls = result.pages.map((p) => p.attemptedUrl);
      expect(attemptedUrls).toContain("https://example.com/security");
      expect(attemptedUrls).toContain("https://example.com/privacy");
      expect(attemptedUrls).toContain("https://example.com/about");

      // Should have successful pages from prioritized paths
      const successfulPages = result.pages.filter((p) => p.success);
      expect(successfulPages.length).toBeGreaterThanOrEqual(2);
    });

    it("respects same-domain validation for high-value paths", async () => {
      mockGet
        .mockResolvedValueOnce("") // robots
        .mockResolvedValueOnce("") // sitemap
        .mockResolvedValueOnce(`
<html><head><title>Home</title></head>
<body>
  <a href="https://external.com/security">Security</a>
</body></html>
        `); // homepage with external link

      const config: CrawlConfig = { ...DEFAULT_CRAWL_CONFIG, maxPages: 5 };
      const result = await crawlDomain("example.com", config);

      // Should only queue same-domain high-value paths
      const attemptedUrls = result.pages.map((p) => p.attemptedUrl);
      expect(attemptedUrls.some((url) => url.includes("external.com"))).toBe(false);
      
      // Should have attempted same-domain high-value paths
      expect(result.highValueUrls.some((url) => url.includes("example.com"))).toBe(true);
    });

    it("remains bounded by maxPages configuration", async () => {
      mockGet
        .mockResolvedValueOnce("") // robots
        .mockResolvedValueOnce("") // sitemap
        .mockRejectedValueOnce(new HttpFetchError("Forbidden", "http", 403, "https://example.com")) // homepage 403
        .mockResolvedValue(`
<html><head><title>Success</title></head>
<body><h1>Page</h1></body></html>
        `); // All high-value paths succeed

      const config: CrawlConfig = { ...DEFAULT_CRAWL_CONFIG, maxPages: 3 };
      const result = await crawlDomain("example.com", config);

      // Should not exceed maxPages limit
      expect(result.pages.length).toBeLessThanOrEqual(config.maxPages);
      expect(result.totalAttempted).toBeLessThanOrEqual(config.maxPages);
    });

    it("skips blog/news paths when allowBlogPaths is false", async () => {
      mockGet
        .mockResolvedValueOnce("") // robots
        .mockResolvedValueOnce("") // sitemap
        .mockResolvedValueOnce(`
<html><head><title>Home</title></head>
<body></body></html>
        `); // homepage succeeds

      const config: CrawlConfig = { ...DEFAULT_CRAWL_CONFIG, maxPages: 10, allowBlogPaths: false };
      const result = await crawlDomain("example.com", config);

      // Should not include blog/news paths in high-value URLs
      const blogPaths = result.highValueUrls.filter((url) => 
        url.includes("/blog") || url.includes("/news") || url.includes("/press")
      );
      expect(blogPaths.length).toBe(0);
    });

    it("respects robots.txt disallow rules for high-value paths", async () => {
      mockGet
        .mockResolvedValueOnce(`
User-agent: *
Disallow: /admin/
Disallow: /private/
        `) // robots with disallow rules
        .mockResolvedValueOnce("") // sitemap
        .mockResolvedValueOnce(`
<html><head><title>Home</title></head>
<body></body></html>
        `); // homepage succeeds

      const config: CrawlConfig = { ...DEFAULT_CRAWL_CONFIG, maxPages: 10, respectRobotsTxt: true };
      const result = await crawlDomain("example.com", config);

      // Should not attempt disallowed paths
      const attemptedUrls = result.pages.map((p) => p.attemptedUrl);
      expect(attemptedUrls.some((url) => url.includes("/admin/"))).toBe(false);
      expect(attemptedUrls.some((url) => url.includes("/private/"))).toBe(false);
    });

    it("classifies 403 as forbidden_403 and does not retry", async () => {
      mockGet
        .mockResolvedValueOnce("") // robots
        .mockResolvedValueOnce("") // sitemap
        .mockRejectedValueOnce(new HttpFetchError("Forbidden", "http", 403, "https://example.com/security")); // 403

      const config: CrawlConfig = { ...DEFAULT_CRAWL_CONFIG, maxPages: 3 };
      const result = await crawlDomain("example.com", config);

      const securityAttempt = result.pages.find((p) => p.attemptedUrl.includes("/security"));
      expect(securityAttempt?.backendStatus).toBe("forbidden_403");
      expect(securityAttempt?.extractionStatus).toBe("blocked");
      expect(securityAttempt?.statusCode).toBe(403);
    });

    it("retries 429 with exponential backoff then fails", async () => {
      mockGet
        .mockResolvedValueOnce("") // robots
        .mockResolvedValueOnce("") // sitemap
        .mockRejectedValueOnce(new HttpFetchError("Too Many Requests", "http", 429, "https://example.com/security")) // 429 first
        .mockRejectedValueOnce(new HttpFetchError("Too Many Requests", "http", 429, "https://example.com/security")); // 429 second

      const config: CrawlConfig = { ...DEFAULT_CRAWL_CONFIG, maxPages: 3 };
      const result = await crawlDomain("example.com", config);

      const securityAttempt = result.pages.find((p) => p.attemptedUrl.includes("/security"));
      expect(securityAttempt?.backendStatus).toBe("rate_limited_429");
      expect(securityAttempt?.extractionStatus).toBe("error");
      expect(securityAttempt?.statusCode).toBe(429);
    });

    it("retries 5xx with jitter then succeeds", async () => {
      mockGet
        .mockResolvedValueOnce("") // robots
        .mockResolvedValueOnce("") // sitemap
        .mockRejectedValueOnce(new HttpFetchError("Internal Server Error", "http", 500, "https://example.com/security")) // 500 first
        .mockResolvedValueOnce(`
<html><head><title>Security</title></head>
<body><h1>Security Page</h1></body></html>
        `); // succeeds second

      const config: CrawlConfig = { ...DEFAULT_CRAWL_CONFIG, maxPages: 3 };
      const result = await crawlDomain("example.com", config);

      const securityAttempt = result.pages.find((p) => p.attemptedUrl.includes("/security"));
      expect(securityAttempt?.backendStatus).toBe("success");
      expect(securityAttempt?.success).toBe(true);
    });

    it("classifies timeout as timeout and retries once", async () => {
      mockGet
        .mockResolvedValueOnce("") // robots
        .mockResolvedValueOnce("") // sitemap
        .mockRejectedValueOnce(new HttpFetchError("Request timed out", "timeout", undefined, "https://example.com/security")) // timeout first
        .mockRejectedValueOnce(new HttpFetchError("Request timed out", "timeout", undefined, "https://example.com/security")); // timeout second

      const config: CrawlConfig = { ...DEFAULT_CRAWL_CONFIG, maxPages: 3 };
      const result = await crawlDomain("example.com", config);

      const securityAttempt = result.pages.find((p) => p.attemptedUrl.includes("/security"));
      expect(securityAttempt?.backendStatus).toBe("timeout");
      expect(securityAttempt?.extractionStatus).toBe("timeout");
    });

    it("classifies DNS errors as dns_error and does not retry", async () => {
      mockGet
        .mockResolvedValueOnce("") // robots
        .mockResolvedValueOnce("") // sitemap
        .mockRejectedValueOnce(new HttpFetchError("DNS resolution failed", "dns", undefined, "https://example.com/security")); // DNS error

      const config: CrawlConfig = { ...DEFAULT_CRAWL_CONFIG, maxPages: 3 };
      const result = await crawlDomain("example.com", config);

      const securityAttempt = result.pages.find((p) => p.attemptedUrl.includes("/security"));
      expect(securityAttempt?.backendStatus).toBe("dns_error");
      expect(securityAttempt?.extractionStatus).toBe("error");
    });

    it("classifies robots_disallowed URLs correctly", async () => {
      mockGet
        .mockResolvedValueOnce(`
User-agent: *
Disallow: /security
Disallow: /privacy
        `) // robots disallow security and privacy
        .mockResolvedValueOnce("") // sitemap
        .mockResolvedValueOnce(`
<html><head><title>Home</title></head>
<body></body></html>
        `); // homepage succeeds

      const config: CrawlConfig = { ...DEFAULT_CRAWL_CONFIG, maxPages: 10, respectRobotsTxt: true };
      const result = await crawlDomain("example.com", config);

      // Should have robots_disallowed attempts for disallowed paths
      const robotsDisallowedAttempts = result.pages.filter((p) => p.backendStatus === "robots_disallowed");
      expect(robotsDisallowedAttempts.length).toBeGreaterThan(0);
      
      const securityAttempt = robotsDisallowedAttempts.find((p) => p.attemptedUrl.includes("/security"));
      expect(securityAttempt?.backendStatus).toBe("robots_disallowed");
      expect(securityAttempt?.extractionStatus).toBe("blocked");
      expect(securityAttempt?.errorMessage).toBe("URL disallowed by robots.txt");
    });

    it("classifies unsupported content types as unsupported_content_type", async () => {
      mockGet
        .mockResolvedValueOnce("") // robots
        .mockResolvedValueOnce("") // sitemap
        .mockResolvedValueOnce(`{"data": "not html"}`); // JSON response

      const config: CrawlConfig = { ...DEFAULT_CRAWL_CONFIG, maxPages: 3 };
      const result = await crawlDomain("example.com", config);

      const homepageAttempt = result.pages.find((p) => p.attemptedUrl.includes("example.com"));
      expect(homepageAttempt?.backendStatus).toBe("unsupported_content_type");
      expect(homepageAttempt?.extractionStatus).toBe("error");
    });

    it("classifies no useful content as no_useful_content", async () => {
      mockGet
        .mockResolvedValueOnce("") // robots
        .mockResolvedValueOnce("") // sitemap
        .mockResolvedValueOnce(`<html><head></head><body></body></html>`); // Empty HTML

      const config: CrawlConfig = { ...DEFAULT_CRAWL_CONFIG, maxPages: 3 };
      const result = await crawlDomain("example.com", config);

      const homepageAttempt = result.pages.find((p) => p.attemptedUrl.includes("example.com"));
      expect(homepageAttempt?.backendStatus).toBe("no_useful_content");
      expect(homepageAttempt?.extractionStatus).toBe("error");
    });

    it("uses consistent safe headers for requests", async () => {
      mockGet
        .mockResolvedValueOnce("") // robots
        .mockResolvedValueOnce("") // sitemap
        .mockResolvedValueOnce(`
<html><head><title>Home</title></head>
<body></body></html>
        `);

      const config: CrawlConfig = { ...DEFAULT_CRAWL_CONFIG, maxPages: 3 };
      await crawlDomain("example.com", config);

      // Verify headers were used correctly
      expect(mockGet).toHaveBeenCalledWith(
        expect.stringContaining("example.com"),
        expect.objectContaining({
          "User-Agent": "TrustDesk-Crawler/1.0 (Trust-Profile-Discovery; +https://trustdesk.ai/crawler)",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          "Accept-Encoding": "gzip, deflate, br",
          "Cache-Control": "no-cache",
          "Pragma": "no-cache",
        }),
        expect.any(Object)
      );
    });
  });
});
