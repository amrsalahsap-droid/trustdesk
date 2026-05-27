import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  crawlDomain,
  buildEvidencePack,
  DEFAULT_CRAWL_CONFIG,
  type CrawlConfig,
  type EvidencePack,
  type EvidencePage,
  type PageType,
} from "@/modules/workspaces/onboarding/domain-crawler";
import { AiHttpClient, HttpFetchError } from "@/lib/ai/ai-http-client";

vi.mock("@/lib/ai/ai-http-client");

const mockGet = vi.mocked(AiHttpClient.get);

describe("Evidence Pack Generation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("builds structured evidence pack from crawl results", async () => {
    mockGet
      .mockResolvedValueOnce("") // robots
      .mockResolvedValueOnce("") // sitemap
      .mockResolvedValueOnce(`
<html>
<head>
  <title>Security Overview</title>
  <meta name="description" content="Our comprehensive security practices and certifications">
</head>
<body>
  <h1>Security Practices</h1>
  <p>We implement industry-standard security measures including encryption and authentication.</p>
  <h2>Compliance</h2>
  <p>Our compliance program includes SOC 2, ISO 27001, and GDPR certifications.</p>
</body>
</html>
      `); // security page

    const config: CrawlConfig = { ...DEFAULT_CRAWL_CONFIG, maxPages: 3 };
    const crawlResult = await crawlDomain("example.com", config);
    const evidencePack = buildEvidencePack(crawlResult, {
      crawlRunId: "test-run-123",
      canonicalBaseUrl: "https://example.com",
    });

    // Verify evidence pack structure
    expect(evidencePack.crawlRunId).toBe("test-run-123");
    expect(evidencePack.domain).toBe("example.com");
    expect(evidencePack.canonicalBaseUrl).toBe("https://example.com");
    expect(evidencePack.pagesAttempted).toBe(3);
    expect(evidencePack.pagesFetched).toBe(1);
    expect(evidencePack.highValuePagesFound).toBe(1);
    expect(evidencePack.securityLegalPagesFound).toBe(1);
    expect(evidencePack.totalUsefulChars).toBeGreaterThan(0);
    expect(evidencePack.pages).toHaveLength(3);
    expect(evidencePack.issues).toHaveLength(0);
    expect(evidencePack.durationMs).toBeGreaterThan(0);
    expect(evidencePack.completedAt).toBeInstanceOf(Date);

    // Verify evidence page structure
    const securityPage = evidencePack.pages.find(p => p.pageType === "security");
    expect(securityPage).toBeDefined();
    expect(securityPage?.url).toContain("example.com");
    expect(securityPage?.title).toBe("Security Overview");
    expect(securityPage?.pageType).toBe("security");
    expect(securityPage?.statusCode).toBe(200);
    expect(securityPage?.extractionStatus).toBe("success");
    expect(securityPage?.textLength).toBeGreaterThan(0);
    expect(securityPage?.usefulTextLength).toBeGreaterThan(0);
    expect(securityPage?.headings).toEqual(["Security Practices", "Compliance"]);
    expect(securityPage?.metaDescription).toBe("Our comprehensive security practices and certifications");
    expect(securityPage?.evidenceSnippets.length).toBeGreaterThan(0);
    expect(securityPage?.usefulnessScore).toBeGreaterThan(80);
  });

  it("classifies product page correctly", async () => {
    mockGet
      .mockResolvedValueOnce("") // robots
      .mockResolvedValueOnce("") // sitemap
      .mockResolvedValueOnce(`
<html>
<head>
  <title>Product Features</title>
  <meta name="description" content="Explore our comprehensive product features and capabilities">
</head>
<body>
  <h1>Our Product Platform</h1>
  <p>Discover the powerful features that make our platform the best choice for your business.</p>
  <h2>Key Features</h2>
  <ul>
    <li>Advanced analytics dashboard</li>
    <li>Real-time collaboration tools</li>
    <li>Enterprise-grade security</li>
  </ul>
</body>
</html>
      `); // product page

    const config: CrawlConfig = { ...DEFAULT_CRAWL_CONFIG, maxPages: 3 };
    const crawlResult = await crawlDomain("example.com", config);
    const evidencePack = buildEvidencePack(crawlResult);

    const productPage = evidencePack.pages.find(p => p.pageType === "product");
    expect(productPage).toBeDefined();
    expect(productPage?.pageType).toBe("product");
    expect(productPage?.title).toBe("Product Features");
    expect(productPage?.metaDescription).toContain("product features");
    expect(productPage?.evidenceSnippets.some(s => s.type === "heading")).toBe(true);
    expect(productPage?.evidenceSnippets.some(s => s.type === "list")).toBe(true);
    expect(productPage?.usefulnessScore).toBeGreaterThan(70);
  });

  it("classifies privacy page correctly", async () => {
    mockGet
      .mockResolvedValueOnce("") // robots
      .mockResolvedValueOnce("") // sitemap
      .mockResolvedValueOnce(`
<html>
<head>
  <title>Privacy Policy</title>
  <meta name="description" content="Our commitment to protecting your privacy and personal data">
</head>
<body>
  <h1>Privacy Policy</h1>
  <p>We are committed to protecting your personal information and privacy.</p>
  <h2>Data Collection</h2>
  <p>We collect only the minimum data necessary to provide our services.</p>
  <h2>Your Rights</h2>
  <p>You have the right to access, correct, and delete your personal data.</p>
</body>
</html>
      `); // privacy page

    const config: CrawlConfig = { ...DEFAULT_CRAWL_CONFIG, maxPages: 3 };
    const crawlResult = await crawlDomain("example.com", config);
    const evidencePack = buildEvidencePack(crawlResult);

    const privacyPage = evidencePack.pages.find(p => p.pageType === "privacy");
    expect(privacyPage).toBeDefined();
    expect(privacyPage?.pageType).toBe("privacy");
    expect(privacyPage?.title).toBe("Privacy Policy");
    expect(privacyPage?.metaDescription).toContain("privacy");
    expect(privacyPage?.evidenceSnippets.some(s => s.content.toLowerCase().includes("privacy"))).toBe(true);
    expect(privacyPage?.usefulnessScore).toBeGreaterThan(80);
    expect(evidencePack.securityLegalPagesFound).toBe(1);
  });

  it("classifies security page correctly", async () => {
    mockGet
      .mockResolvedValueOnce("") // robots
      .mockResolvedValueOnce("") // sitemap
      .mockResolvedValueOnce(`
<html>
<head>
  <title>Security Center</title>
  <meta name="description" content="Learn about our comprehensive security measures and certifications">
</head>
<body>
  <h1>Security Overview</h1>
  <p>Our security program includes multiple layers of protection and regular audits.</p>
  <h2>Encryption</h2>
  <p>All data is encrypted using industry-standard AES-256 encryption.</p>
  <h2>Compliance</h2>
  <p>We maintain SOC 2 Type II, ISO 27001, and GDPR compliance.</p>
</body>
</html>
      `); // security page

    const config: CrawlConfig = { ...DEFAULT_CRAWL_CONFIG, maxPages: 3 };
    const crawlResult = await crawlDomain("example.com", config);
    const evidencePack = buildEvidencePack(crawlResult);

    const securityPage = evidencePack.pages.find(p => p.pageType === "security");
    expect(securityPage).toBeDefined();
    expect(securityPage?.pageType).toBe("security");
    expect(securityPage?.title).toBe("Security Overview");
    expect(securityPage?.metaDescription).toContain("security");
    expect(securityPage?.evidenceSnippets.some(s => s.content.toLowerCase().includes("encryption"))).toBe(true);
    expect(securityPage?.usefulnessScore).toBe(100); // Security pages get highest score
    expect(evidencePack.securityLegalPagesFound).toBe(1);
  });

  it("calculates evidence pack summary counts correctly", async () => {
    mockGet
      .mockResolvedValueOnce("") // robots
      .mockResolvedValueOnce("") // sitemap
      .mockResolvedValueOnce(`
<html>
<head><title>Security</title></head>
<body><h1>Security</h1><p>Security content</p></body>
</html>
      `) // security page (critical)
      .mockResolvedValueOnce(`
<html>
<head><title>Privacy</title></head>
<body><h1>Privacy</h1><p>Privacy content</p></body>
</html>
      `) // privacy page (critical)
      .mockResolvedValueOnce(`
<html>
<head><title>About</title></head>
<body><h1>About</h1><p>About content</p></body>
</html>
      `) // about page (medium)
      .mockRejectedValueOnce(new HttpFetchError("Not Found", "http", 404, "https://example.com/not-found")); // 404 error

    const config: CrawlConfig = { ...DEFAULT_CRAWL_CONFIG, maxPages: 5 };
    const crawlResult = await crawlDomain("example.com", config);
    const evidencePack = buildEvidencePack(crawlResult);

    // Verify counts
    expect(evidencePack.pagesAttempted).toBe(5);
    expect(evidencePack.pagesFetched).toBe(3);
    expect(evidencePack.highValuePagesFound).toBe(2); // security + privacy (critical/high)
    expect(evidencePack.securityLegalPagesFound).toBe(2); // security + privacy
    expect(evidencePack.totalUsefulChars).toBeGreaterThan(0);
    expect(evidencePack.pages).toHaveLength(5);
    expect(evidencePack.issues).toHaveLength(1); // One 404 error
    expect(evidencePack.issues[0].type).toBe("error");
    expect(evidencePack.issues[0].url).toContain("not-found");
  });

  it("extracts evidence snippets with relevance scores", async () => {
    mockGet
      .mockResolvedValueOnce("") // robots
      .mockResolvedValueOnce("") // sitemap
      .mockResolvedValueOnce(`
<html>
<head>
  <title>Security Features</title>
  <meta name="description" content="Advanced security features and encryption">
</head>
<body>
  <h1>Security Architecture</h1>
  <p>Our comprehensive security architecture includes multiple layers of protection, encryption, and regular security audits.</p>
  <h2>Encryption Standards</h2>
  <p>We use AES-256 encryption for data at rest and TLS 1.3 for data in transit.</p>
  <ul>
    <li>End-to-end encryption</li>
    <li>Zero-knowledge architecture</li>
    <li>Regular penetration testing</li>
  </ul>
</body>
</html>
      `);

    const config: CrawlConfig = { ...DEFAULT_CRAWL_CONFIG, maxPages: 3 };
    const crawlResult = await crawlDomain("example.com", config);
    const evidencePack = buildEvidencePack(crawlResult);

    const securityPage = evidencePack.pages.find(p => p.pageType === "security");
    expect(securityPage).toBeDefined();
    
    const snippets = securityPage?.evidenceSnippets || [];
    expect(snippets.length).toBeGreaterThan(0);
    
    // Verify snippet types
    expect(snippets.some(s => s.type === "heading")).toBe(true);
    expect(snippets.some(s => s.type === "paragraph")).toBe(true);
    expect(snippets.some(s => s.type === "list")).toBe(true);
    expect(snippets.some(s => s.type === "meta")).toBe(true);
    
    // Verify relevance scores
    expect(snippets.every(s => s.relevanceScore >= 0 && s.relevanceScore <= 100)).toBe(true);
    expect(snippets.some(s => s.relevanceScore > 70)).toBe(true); // Security-related content should score high
    
    // Verify content quality
    expect(snippets.every(s => s.content.trim().length > 0)).toBe(true);
    expect(snippets.some(s => s.content.toLowerCase().includes("security"))).toBe(true);
  });

  it("handles failed pages and generates appropriate issues", async () => {
    mockGet
      .mockResolvedValueOnce("") // robots
      .mockResolvedValueOnce("") // sitemap
      .mockRejectedValueOnce(new HttpFetchError("Forbidden", "http", 403, "https://example.com/security"))
      .mockRejectedValueOnce(new HttpFetchError("Not Found", "http", 404, "https://example.com/privacy"))
      .mockResolvedValueOnce(`
<html>
<head><title>About</title></head>
<body><h1>About</h1><p>About content</p></body>
</html>
      `); // Only one successful page

    const config: CrawlConfig = { ...DEFAULT_CRAWL_CONFIG, maxPages: 4 };
    const crawlResult = await crawlDomain("example.com", config);
    const evidencePack = buildEvidencePack(crawlResult);

    // Verify issues are generated for failed pages
    expect(evidencePack.issues.length).toBeGreaterThan(0);
    
    const errorIssues = evidencePack.issues.filter(i => i.type === "error");
    expect(errorIssues.length).toBe(2); // 403 and 404 errors
    
    expect(errorIssues.some(i => i.url?.includes("/security"))).toBe(true);
    expect(errorIssues.some(i => i.url?.includes("/privacy"))).toBe(true);
    
    // Verify successful page is still processed
    const successfulPages = evidencePack.pages.filter(p => p.extractionStatus === "success");
    expect(successfulPages.length).toBe(1);
    expect(successfulPages[0].pageType).toBe("about");
  });

  it("generates warnings for common crawl issues", async () => {
    mockGet
      .mockResolvedValueOnce("") // robots
      .mockResolvedValueOnce("") // sitemap
      .mockRejectedValueOnce(new HttpFetchError("Forbidden", "http", 403, "https://example.com"))
      .mockRejectedValueOnce(new HttpFetchError("Forbidden", "http", 403, "https://example.com/about"));

    const config: CrawlConfig = { ...DEFAULT_CRAWL_CONFIG, maxPages: 3 };
    const crawlResult = await crawlDomain("example.com", config);
    const evidencePack = buildEvidencePack(crawlResult);

    // Should have warning for no pages fetched
    const warningIssues = evidencePack.issues.filter(i => i.type === "warning");
    expect(warningIssues.some(w => w.message.includes("No pages were successfully fetched"))).toBe(true);
    expect(warningIssues.some(w => w.message.includes("No security or legal pages found"))).toBe(true);
  });

  it("uses default values when options are not provided", async () => {
    mockGet
      .mockResolvedValueOnce("") // robots
      .mockResolvedValueOnce("") // sitemap
      .mockResolvedValueOnce(`
<html>
<head><title>Test</title></head>
<body><h1>Test</h1><p>Test content</p></body>
</html>
      `);

    const config: CrawlConfig = { ...DEFAULT_CRAWL_CONFIG, maxPages: 2 };
    const crawlResult = await crawlDomain("example.com", config);
    const evidencePack = buildEvidencePack(crawlResult); // No options provided

    expect(evidencePack.crawlRunId).toBeUndefined();
    expect(evidencePack.canonicalBaseUrl).toBe(crawlResult.startUrl);
    expect(evidencePack.domain).toBe("example.com");
  });
});
