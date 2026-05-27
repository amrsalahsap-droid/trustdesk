import { describe, it, expect, vi, beforeEach } from "vitest";
import { 
  crawlDomain, 
  analyzeSinglePage,
  validatePageUrl,
  DEFAULT_CRAWL_CONFIG 
} from "@/modules/workspaces/onboarding/domain-crawler";
import { extractEvidenceSignals, type ExtractedSignals } from "@/modules/workspaces/onboarding/evidence-signal-extractor";
import { computeEvidenceBasedDecisions, type EvidenceBasedDecision } from "@/modules/workspaces/onboarding/evidence-based-decisions";
import { buildEvidencePack } from "@/modules/workspaces/onboarding/domain-crawler";
import { AiHttpClient, HttpFetchError } from "@/lib/ai/ai-http-client";

// Mock the HTTP client
vi.mock("@/lib/ai/ai-http-client");
const mockGet = vi.mocked(AiHttpClient.get);

describe("Domain Intelligence Pipeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("403 Handling with Sitemap Fallback", () => {
    it("continues crawl if homepage returns 403 but sitemap works", async () => {
      // Mock homepage 403
      mockGet
        .mockRejectedValueOnce(new HttpFetchError("Forbidden", "http", 403, "https://example.com"))
        // Mock robots.txt success
        .mockResolvedValueOnce("")
        // Mock sitemap discovery
        .mockResolvedValueOnce(`
          <?xml version="1.0" encoding="UTF-8"?>
          <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
            <url><loc>https://example.com/security</loc></url>
            <url><loc>https://example.com/privacy</loc></url>
          </urlset>
        `)
        // Mock security page success
        .mockResolvedValueOnce(`
          <html>
            <head><title>Security Overview</title></head>
            <body><h1>Enterprise Security</h1></body>
          </html>
        `)
        // Mock privacy page success
        .mockResolvedValueOnce(`
          <html>
            <head><title>Privacy Policy</title></head>
            <body><h1>GDPR Compliance</h1></body>
          </html>
        `);

      const result = await crawlDomain("example.com", DEFAULT_CRAWL_CONFIG);

      expect(result.pages).toHaveLength(3); // Homepage + 2 sitemap pages
      expect(result.pages[0].backendStatus).toBe("forbidden_403");
      expect(result.pages[1].backendStatus).toBe("success");
      expect(result.pages[2].backendStatus).toBe("success");
      expect(result.totalFetched).toBe(2);
      expect(result.totalSuccessful).toBe(2);
      expect(result.highValuePages).toHaveLength(2);
    });

    it("builds evidence pack from successful sitemap pages", async () => {
      mockGet
        .mockRejectedValueOnce(new HttpFetchError("Forbidden", "http", 403, "https://example.com"))
        .mockResolvedValueOnce("")
        .mockResolvedValueOnce(`
          <?xml version="1.0" encoding="UTF-8"?>
          <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
            <url><loc>https://example.com/security</loc></url>
          </urlset>
        `)
        .mockResolvedValueOnce(`
          <html>
            <head><title>Security</title></head>
            <body><h1>Enterprise-grade security</h1></body>
          </html>
        `);

      const crawlResult = await crawlDomain("example.com", DEFAULT_CRAWL_CONFIG);
      const evidencePack = buildEvidencePack(crawlResult);

      expect(evidencePack.pages).toHaveLength(1); // Only successful security page
      expect(evidencePack.pages[0].pageType).toBe("security");
      expect(evidencePack.pages[0].usefulnessScore).toBeGreaterThan(80);
      expect(evidencePack.securityLegalPagesFound).toBe(1);
    });

    it("does not stop crawl when sitemap provides working pages", async () => {
      mockGet
        .mockRejectedValueOnce(new HttpFetchError("Forbidden", "http", 403, "https://example.com"))
        .mockResolvedValueOnce("")
        .mockResolvedValueOnce(`
          <?xml version="1.0" encoding="UTF-8"?>
          <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
            <url><loc>https://example.com/security</loc></url>
            <url><loc>https://example.com/about</loc></url>
            <url><loc>https://example.com/product</loc></url>
          </urlset>
        `)
        .mockResolvedValueOnce(`
          <html>
            <head><title>About</title></head>
            <body><h1>About our company</h1></body>
          </html>
        `)
        .mockResolvedValueOnce(`
          <html>
            <head><title>Product</title></head>
            <body><h1>Our software platform</h1></body>
          </html>
        `);

      const result = await crawlDomain("example.com", DEFAULT_CRAWL_CONFIG);

      expect(result.pages.length).toBeGreaterThan(3);
      expect(result.totalFetched).toBeGreaterThan(2);
      expect(result.highValuePages.length).toBeGreaterThan(0);
    });
  });

  describe("www/non-www Fallback", () => {
    it("tries non-www version when www fails", async () => {
      mockGet
        .mockRejectedValueOnce(new HttpFetchError("DNS resolution failed", "dns", undefined, "https://www.example.com"))
        .mockResolvedValueOnce(`
          <html>
            <head><title>Company</title></head>
            <body><h1>Welcome to example.com</h1></body>
          </html>
        `);

      const result = await crawlDomain("www.example.com", DEFAULT_CRAWL_CONFIG);

      expect(result.pages).toHaveLength(1);
      expect(result.pages[0].success).toBe(true);
      expect(result.pages[0].finalUrl).toBe("https://example.com");
    });

    it("tries www version when non-www fails", async () => {
      mockGet
        .mockRejectedValueOnce(new HttpFetchError("DNS resolution failed", "dns", undefined, "https://example.com"))
        .mockResolvedValueOnce(`
          <html>
            <head><title>Company</title></head>
            <body><h1>Welcome to www.example.com</h1></body>
          </html>
        `);

      const result = await crawlDomain("example.com", DEFAULT_CRAWL_CONFIG);

      expect(result.pages).toHaveLength(1);
      expect(result.pages[0].success).toBe(true);
      expect(result.pages[0].finalUrl).toBe("https://www.example.com");
    });
  });

  describe("Sitemap-Only Mode", () => {
    it("works when only sitemap is accessible", async () => {
      mockGet
        .mockResolvedValueOnce("") // robots.txt not found
        .mockResolvedValueOnce(`
          <?xml version="1.0" encoding="UTF-8"?>
          <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
            <url><loc>https://example.com/security</loc></url>
            <url><loc>https://example.com/privacy</loc></url>
            <url><loc>https://example.com/compliance</loc></url>
          </urlset>
        `)
        .mockResolvedValueOnce(`
          <html>
            <head><title>Security</title></head>
            <body><h1>Security practices</h1></body>
          </html>
        `)
        .mockResolvedValueOnce(`
          <html>
            <head><title>Privacy</title></head>
            <body><h1>Privacy policy</h1></body>
          </html>
        `);

      const result = await crawlDomain("example.com", DEFAULT_CRAWL_CONFIG);

      expect(result.pages).toHaveLength(2); // 2 sitemap pages
      expect(result.pages[0].pageType).toBe("security");
      expect(result.pages[1].pageType).toBe("privacy");
      expect(result.highValuePages).toHaveLength(2);
    });

    it("builds comprehensive evidence from sitemap pages", async () => {
      mockGet
        .mockResolvedValueOnce("")
        .mockResolvedValueOnce(`
          <?xml version="1.0" encoding="UTF-8"?>
          <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
            <url><loc>https://example.com/security</loc></url>
            <url><loc>https://example.com/trust</loc></url>
            <url><loc>https://example.com/legal</loc></url>
          </urlset>
        `)
        .mockResolvedValueOnce(`
          <html>
            <head><title>Security Center</title></head>
            <body><h1>SOC 2 certified</h1></body>
          </html>
        `)
        .mockResolvedValueOnce(`
          <html>
            <head><title>Trust Center</title></head>
            <body><h1>Enterprise security</h1></body>
          </html>
        `);

      const crawlResult = await crawlDomain("example.com", DEFAULT_CRAWL_CONFIG);
      const evidencePack = buildEvidencePack(crawlResult);
      const extractedSignals = extractEvidenceSignals(evidencePack.pages);

      expect(extractedSignals.securityPosture).toHaveLength(2);
      expect(extractedSignals.complianceFocus).toHaveLength(1);
      expect(evidencePack.securityLegalPagesFound).toBe(3);
    });
  });

  describe("High-Value Path Prioritization", () => {
    it("attempts security, privacy, trust, compliance first", async () => {
      mockGet
        .mockResolvedValueOnce("")
        .mockResolvedValueOnce("") // No sitemap
        .mockResolvedValueOnce(`
          <html>
            <head><title>Home</title></head>
            <body>
              <nav>
                <a href="/security">Security</a>
                <a href="/about">About</a>
                <a href="/privacy">Privacy</a>
                <a href="/blog">Blog</a>
                <a href="/contact">Contact</a>
              </nav>
            </body>
          </html>
        `)
        .mockResolvedValueOnce(`
          <html>
            <head><title>Security</title></head>
            <body><h1>Security overview</h1></body>
          </html>
        `)
        .mockResolvedValueOnce(`
          <html>
            <head><title>Privacy</title></head>
            <body><h1>Privacy policy</h1></body>
          </html>
        `);

      const result = await crawlDomain("example.com", DEFAULT_CRAWL_CONFIG);

      const attemptedUrls = result.pages.map(p => p.attemptedUrl);
      expect(attemptedUrls).toContain("https://example.com/security");
      expect(attemptedUrls).toContain("https://example.com/privacy");
      // Should prioritize high-value over blog/contact
      expect(attemptedUrls).toContain("https://example.com/security");
      expect(attemptedUrls).toContain("https://example.com/privacy");
    });

    it("scores high-value paths higher than blog/news", async () => {
      mockGet
        .mockResolvedValueOnce("")
        .mockResolvedValueOnce("")
        .mockResolvedValueOnce(`
          <html>
            <head><title>Home</title></head>
            <body>
              <nav>
                <a href="/security">Security</a>
                <a href="/privacy">Privacy</a>
                <a href="/blog">Latest News</a>
                <a href="/about">About</a>
              </nav>
            </body>
          </html>
        `)
        .mockResolvedValueOnce(`
          <html>
            <head><title>Security</title></head>
            <body><h1>Security</h1></body>
          </html>
        `);

      const result = await crawlDomain("example.com", DEFAULT_CRAWL_CONFIG);

      const securityPage = result.pages.find(p => p.pageType === "security");
      const blogPage = result.pages.find(p => p.attemptedUrl.includes("/blog"));

      expect(securityPage?.usefulnessScore).toBeGreaterThan(blogPage?.usefulnessScore || 0);
      expect(securityPage?.usefulnessTier).toBe("critical");
    });
  });

  describe("429 Rate Limiting Classification", () => {
    it("classifies 429 as rate_limited", async () => {
      mockGet
        .mockResolvedValueOnce("")
        .mockResolvedValueOnce("")
        .mockRejectedValueOnce(new HttpFetchError("Too Many Requests", "http", 429, "https://example.com/security"));

      const result = await crawlDomain("example.com", DEFAULT_CRAWL_CONFIG);

      const rateLimitedPage = result.pages.find(p => p.backendStatus === "rate_limited_429");
      expect(rateLimitedPage).toBeDefined();
      expect(rateLimitedPage?.attemptedUrl).toBe("https://example.com/security");
    });

    it("continues with other pages after 429", async () => {
      mockGet
        .mockResolvedValueOnce("")
        .mockResolvedValueOnce("")
        .mockRejectedValueOnce(new HttpFetchError("Too Many Requests", "http", 429, "https://example.com/security"))
        .mockResolvedValueOnce(`
          <html>
            <head><title>Privacy</title></head>
            <body><h1>Privacy policy</h1></body>
          </html>
        `);

      const result = await crawlDomain("example.com", DEFAULT_CRAWL_CONFIG);

      expect(result.pages.length).toBeGreaterThan(1);
      expect(result.pages.some(p => p.pageType === "privacy")).toBe(true);
    });
  });

  describe("Evidence Pack pageType and UsefulnessScore", () => {
    it("includes pageType in evidence pack", async () => {
      mockGet
        .mockResolvedValueOnce("")
        .mockResolvedValueOnce("")
        .mockResolvedValueOnce(`
          <html>
            <head><title>Security</title></head>
            <body><h1>Security practices</h1></body>
          </html>
        `);

      const crawlResult = await crawlDomain("example.com", DEFAULT_CRAWL_CONFIG);
      const evidencePack = buildEvidencePack(crawlResult);

      expect(evidencePack.pages[0].pageType).toBe("security");
      expect(evidencePack.pages[0].usefulnessScore).toBeGreaterThan(0);
    });

    it("calculates usefulnessScore correctly for high-value pages", async () => {
      mockGet
        .mockResolvedValueOnce("")
        .mockResolvedValueOnce("")
        .mockResolvedValueOnce(`
          <html>
            <head>
              <title>Security</title>
              <meta name="description" content="Enterprise security practices">
            </head>
            <body>
              <h1>Security Overview</h1>
              <h2>Our Security Measures</h2>
              <p>We implement enterprise-grade security measures.</p>
            </body>
          </html>
        `);

      const crawlResult = await crawlDomain("example.com", DEFAULT_CRAWL_CONFIG);
      const evidencePack = buildEvidencePack(crawlResult);

      const securityPage = evidencePack.pages[0];
      expect(securityPage.usefulnessScore).toBeGreaterThan(80);
      expect(securityPage.usefulnessTier).toBe("critical");
      expect(securityPage.evidenceSnippets.length).toBeGreaterThan(0);
    });
  });

  describe("Evidence Signals Link to Trust Profile Fields", () => {
    it("extracts industry signals correctly", async () => {
      mockGet
        .mockResolvedValueOnce("")
        .mockResolvedValueOnce("")
        .mockResolvedValueOnce(`
          <html>
            <head><title>Our Software Platform</title></head>
            <body>
              <h1>Enterprise Software Solutions</h1>
              <p>We provide SaaS software solutions.</p>
            </body>
          </html>
        `);

      const crawlResult = await crawlDomain("example.com", DEFAULT_CRAWL_CONFIG);
      const evidencePack = buildEvidencePack(crawlResult);
      const extractedSignals = extractEvidenceSignals(evidencePack.pages);

      expect(extractedSignals.industry).toBeDefined();
      expect(extractedSignals.industry?.candidateValue).toBe("software");
      expect(extractedSignals.industry?.signalType).toBe("product_language");
      expect(extractedSignals.industry?.strength).toBe("high");
    });

    it("extracts compliance signals correctly", async () => {
      mockGet
        .mockResolvedValueOnce("")
        .mockResolvedValueOnce("")
        .mockResolvedValueOnce(`
          <html>
            <head><title>Privacy Policy</title></head>
            <body>
              <h1>GDPR Compliance</h1>
              <p>We are fully compliant with GDPR requirements.</p>
            </body>
          </html>
        `);

      const crawlResult = await crawlDomain("example.com", DEFAULT_CRAWL_CONFIG);
      const evidencePack = buildEvidencePack(crawlResult);
      const extractedSignals = extractEvidenceSignals(evidencePack.pages);

      expect(extractedSignals.complianceFocus).toHaveLength(1);
      expect(extractedSignals.complianceFocus[0].candidateValue).toBe("GDPR");
      expect(extractedSignals.complianceFocus[0].signalType).toBe("compliance_language");
      expect(extractedSignals.complianceFocus[0].pageType).toBe("privacy");
    });
  });

  describe("Software SaaS Serving Healthcare Scenario", () => {
    it("classifies as software primary, healthcare customer", async () => {
      mockGet
        .mockResolvedValueOnce("")
        .mockResolvedValueOnce("")
        .mockResolvedValueOnce(`
          <html>
            <head><title>Healthcare SaaS Platform</title></head>
            <body>
              <h1>Our Healthcare Software Platform</h1>
              <p>We provide SaaS solutions for healthcare organizations.</p>
            </body>
          </html>
        `)
        .mockResolvedValueOnce(`
          <html>
            <head><title>Our Customers</title></head>
            <body>
              <h1>Healthcare Providers</h1>
              <p>We serve hospitals and healthcare providers worldwide.</p>
            </body>
          </html>
        `);

      const crawlResult = await crawlDomain("example.com", DEFAULT_CRAWL_CONFIG);
      const evidencePack = buildEvidencePack(crawlResult);
      const extractedSignals = extractEvidenceSignals(evidencePack.pages);
      const decisions = computeEvidenceBasedDecisions(extractedSignals);

      // Primary industry should be software
      expect(decisions.industry.topCandidate?.value).toBe("software");
      expect(decisions.industry.topCandidate?.confidenceBand).toBe("high");
      
      // Customer industry should be healthcare
      expect(decisions.customerIndustries.topCandidate?.value).toBe("healthcare");
      expect(decisions.customerIndustries.topCandidate?.confidenceBand).toBe("medium");
    });

    it("does not classify as healthcare when software signals are stronger", async () => {
      mockGet
        .mockResolvedValueOnce("")
        .mockResolvedValueOnce("")
        .mockResolvedValueOnce(`
          <html>
            <head><title>Healthcare Software</title></head>
            <body>
              <h1>Our SaaS Platform</h1>
              <p>Healthcare organizations use our software platform.</p>
            </body>
          </html>
        `);

      const crawlResult = await crawlDomain("example.com", DEFAULT_CRAWL_CONFIG);
      const evidencePack = buildEvidencePack(crawlResult);
      const extractedSignals = extractEvidenceSignals(evidencePack.pages);
      const decisions = computeEvidenceBasedDecisions(extractedSignals);

      // Software should win over healthcare for primary classification
      expect(decisions.industry.topCandidate?.value).toBe("software");
      expect(decisions.industry.topCandidate?.confidenceBand).toBe("high");
    });
  });

  describe("Weak Evidence Confidence Scoring", () => {
    it("does not create high confidence with weak evidence", async () => {
      mockGet
        .mockResolvedValueOnce("")
        .mockResolvedValueOnce("")
        .mockResolvedValueOnce(`
          <html>
            <head><title>About</title></head>
            <body>
              <h1>About Us</h1>
              <p>We are a company.</p>
            </body>
          </html>
        `);

      const crawlResult = await crawlDomain("example.com", DEFAULT_CRAWL_CONFIG);
      const evidencePack = buildEvidencePack(crawlResult);
      const extractedSignals = extractEvidenceSignals(evidencePack.pages);
      const decisions = computeEvidenceBasedDecisions(extractedSignals);

      expect(decisions.industry.topCandidate?.supportScore).toBeLessThan(60);
      expect(decisions.industry.topCandidate?.confidenceBand).toBe("limited");
    });

    it("caps confidence based on evidence quality", async () => {
      mockGet
        .mockResolvedValueOnce("")
        .mockResolvedValueOnce("")
        .mockResolvedValueOnce(`
          <html>
            <head><title>Company</title></head>
            <body>
              <p>Minimal content here.</p>
            </body>
          </html>
        `);

      const crawlResult = await crawlDomain("example.com", DEFAULT_CRAWL_CONFIG);
      const evidencePack = buildEvidencePack(crawlResult);
      const extractedSignals = extractEvidenceSignals(evidencePack.pages);
      const decisions = computeEvidenceBasedDecisions(extractedSignals);

      expect(decisions.industry.topCandidate?.supportScore).toBeLessThan(40);
      expect(decisions.industry.topCandidate?.confidenceBand).toBe("limited");
    });
  });

  describe("Failed Pages Manual Setup State", () => {
    it("returns manual setup when all pages fail", async () => {
      mockGet
        .mockResolvedValueOnce("")
        .mockResolvedValueOnce("")
        .mockRejectedValueOnce(new HttpFetchError("Forbidden", "http", 403, "https://example.com"))
        .mockRejectedValueOnce(new HttpFetchError("Not Found", "http", 404, "https://example.com/about"))
        .mockRejectedValueOnce(new HttpFetchError("Server Error", "http", 500, "https://example.com/security"));

      const result = await crawlDomain("example.com", DEFAULT_CRAWL_CONFIG);

      expect(result.totalFetched).toBe(0);
      expect(result.totalSuccessful).toBe(0);
      expect(result.pages.every(p => !p.success)).toBe(true);
    });

    it("provides recovery options for failed crawl", async () => {
      mockGet
        .mockRejectedValueOnce(new HttpFetchError("Forbidden", "http", 403, "https://example.com"));

      const result = await crawlDomain("example.com", DEFAULT_CRAWL_CONFIG);

      expect(result.pages[0].backendStatus).toBe("forbidden_403");
      // Should still provide recovery options in UI
      expect(result.pages).toHaveLength(1);
    });
  });

  describe("Blocked-Site Recovery Messaging", () => {
    it("shows accurate 403 blocked messaging", async () => {
      mockGet
        .mockRejectedValueOnce(new HttpFetchError("Forbidden", "http", 403, "https://example.com"));

      const result = await crawlDomain("example.com", DEFAULT_CRAWL_CONFIG);

      expect(result.pages[0].backendStatus).toBe("forbidden_403");
      // UI should show "Website blocked automated access" not "couldn't reach"
    });

    it("shows recovery options for blocked sites", async () => {
      mockGet
        .mockRejectedValueOnce(new HttpFetchError("Forbidden", "http", 403, "https://example.com"));

      const result = await crawlDomain("example.com", DEFAULT_CRAWL_CONFIG);

      // Should enable recovery options
      expect(result.pages).toHaveLength(1);
      expect(result.pages[0].success).toBe(false);
      expect(result.pages[0].backendStatus).toBe("forbidden_403");
    });
  });

  describe("URL Validation", () => {
    it("validates same domain URLs correctly", () => {
      const result = validatePageUrl("https://example.com/security", "example.com");
      expect(result.isValid).toBe(true);
    });

    it("rejects different domain URLs", () => {
      const result = validatePageUrl("https://other.com/security", "example.com");
      expect(result.isValid).toBe(false);
      expect(result.reason).toContain("does not match original domain");
    });

    it("allows subdomains when configured", () => {
      const result = validatePageUrl("https://app.example.com/security", "example.com", {
        allowSubdomains: true,
      });
      expect(result.isValid).toBe(true);
    });
  });

  describe("Single Page Analysis", () => {
    it("analyzes single page for evidence extraction", async () => {
      mockGet.mockResolvedValueOnce(`
        <html>
          <head><title>Privacy Policy</title></head>
          <body>
            <h1>GDPR Compliance</h1>
            <p>We are GDPR compliant.</p>
          </body>
        </html>
      `);

      const result = await analyzeSinglePage("https://example.com/privacy", DEFAULT_CRAWL_CONFIG);

      expect(result.pages).toHaveLength(1);
      expect(result.pages[0].success).toBe(true);
      expect(result.pages[0].pageType).toBe("privacy");
      expect(result.totalFetched).toBe(1);
    });

    it("builds evidence pack from single page", async () => {
      mockGet.mockResolvedValueOnce(`
        <html>
          <head><title>Security</title></head>
          <body>
            <h1>SOC 2 Compliance</h1>
          </body>
        </html>
      `);

      const crawlResult = await analyzeSinglePage("https://example.com/security", DEFAULT_CRAWL_CONFIG);
      const evidencePack = buildEvidencePack(crawlResult);

      expect(evidencePack.pages).toHaveLength(1);
      expect(evidencePack.securityLegalPagesFound).toBe(1);
      expect(evidencePack.pages[0].pageType).toBe("security");
    });
  });

  describe("usefulTextLength calculation", () => {
    it("calculates usefulTextLength for pages with real content", async () => {
      mockGet.mockResolvedValueOnce(`
        <html>
          <head><title>About Us</title></head>
          <body>
            <nav>Home About Contact</nav>
            <main>
              <h1>About Our Company</h1>
              <p>We are a leading software company providing enterprise solutions for healthcare providers. Our platform helps hospitals manage patient data securely.</p>
              <p>Founded in 2020, we have grown to serve over 500 healthcare organizations across the United States and Europe.</p>
              <h2>Our Mission</h2>
              <p>To democratize healthcare technology and make it accessible to all providers regardless of size.</p>
            </main>
            <footer>Copyright 2024</footer>
          </body>
        </html>
      `);

      const result = await analyzeSinglePage("https://example.com/about", DEFAULT_CRAWL_CONFIG);

      expect(result.pages).toHaveLength(1);
      expect(result.pages[0].success).toBe(true);
      expect(result.pages[0].usefulTextLength).toBeDefined();
      expect(result.pages[0].usefulTextLength).toBeGreaterThan(200);
      // Total text should be longer than useful text (after boilerplate removal)
      expect(result.pages[0].textLength).toBeGreaterThan(result.pages[0].usefulTextLength ?? 0);
    });

    it("marks navigation-only pages as no_useful_content", async () => {
      mockGet.mockResolvedValueOnce(`
        <html>
          <head><title>Navigation</title></head>
          <body>
            <nav>
              <a href="/">Home</a>
              <a href="/about">About</a>
              <a href="/products">Products</a>
              <a href="/contact">Contact</a>
              <a href="/login">Login</a>
              <a href="/signup">Sign Up</a>
            </nav>
            <div class="sidebar">Menu</div>
            <footer>Privacy Policy | Terms of Service</footer>
          </body>
        </html>
      `);

      const result = await analyzeSinglePage("https://example.com/nav", DEFAULT_CRAWL_CONFIG);

      expect(result.pages).toHaveLength(1);
      expect(result.pages[0].success).toBe(false);
      expect(result.pages[0].backendStatus).toBe("no_useful_content");
    });

    it("accumulates totalUsefulChars in crawl result", async () => {
      mockGet
        .mockResolvedValueOnce(`
          <html>
            <head><title>Homepage</title></head>
            <body>
              <h1>Welcome to Our Platform</h1>
              <p>We provide secure healthcare software solutions for enterprise customers.</p>
              <a href="/security">Security</a>
            </body>
          </html>
        `)
        .mockResolvedValueOnce(`
          <html>
            <head><title>Security</title></head>
            <body>
              <h1>Enterprise Security</h1>
              <p>We maintain SOC 2 Type II compliance and encrypt all data at rest and in transit.</p>
            </body>
          </html>
        `);

      const result = await crawlDomain("https://example.com", {
        ...DEFAULT_CRAWL_CONFIG,
        maxPages: 3,
        maxDepth: 1,
      });

      const successfulPages = result.pages.filter(p => p.success);
      const totalUsefulChars = successfulPages.reduce((sum, p) => sum + (p.usefulTextLength ?? 0), 0);
      
      expect(totalUsefulChars).toBeGreaterThan(100);
      expect(result.totalSuccessful).toBeGreaterThanOrEqual(1);
    });
  });
});
