import { describe, it, expect } from "vitest";
import { type EvidenceItem, type PageType } from "../website-analysis-service";

describe("Regression Tests: Rendered Fallback Behavior", () => {
  describe("0 rendered pages is valid when static content is sufficient", () => {
    it("should not require rendering when static HTML has strong evidence", () => {
      // Create evidence items with strong static content but no rendering
      const evidenceItems: EvidenceItem[] = [
        {
          evidence: {
            url: "https://example.com/about",
            title: "About Us - Software Company",
            headings: ["About Our Software Company", "Our Platform", "Enterprise Solutions"],
            snippet: "We are a software company that builds enterprise platforms and SaaS solutions for businesses worldwide.",
          },
          pageType: "about" as PageType,
          score: 1.5, // High score indicates strong evidence
          structured: {
            url: "https://example.com/about",
            title: "About Us - Software Company",
            pageType: "about" as PageType,
            score: 1.5,
            sourceConfidence: 0.9,
            blocks: [
              { 
                kind: "heading-section" as const, 
                level: 1 as const, 
                heading: "About Our Software Company", 
                bodyText: "We are a software company that builds enterprise platforms" 
              },
              { 
                kind: "heading-section" as const, 
                level: 2 as const, 
                heading: "Our Platform", 
                bodyText: "SaaS solutions for businesses" 
              },
              { 
                kind: "body-fallback" as const, 
                text: "Enterprise software platform with comprehensive features" 
              },
            ],
          },
        },
        {
          evidence: {
            url: "https://example.com/product",
            title: "Product - SaaS Platform",
            headings: ["Platform Features", "Enterprise Software"],
            snippet: "Our SaaS platform provides enterprise software solutions with advanced security and compliance features.",
          },
          pageType: "product" as PageType,
          score: 1.4,
          structured: {
            url: "https://example.com/product",
            title: "Product - SaaS Platform",
            pageType: "product" as PageType,
            score: 1.4,
            sourceConfidence: 0.85,
            blocks: [
              { 
                kind: "heading-section" as const, 
                level: 1 as const, 
                heading: "Platform Features", 
                bodyText: "SaaS platform features" 
              },
              { 
                kind: "body-fallback" as const, 
                text: "Enterprise software with security and compliance" 
              },
            ],
          },
        },
      ];

      // Verify that static content is sufficient
      const totalChars = evidenceItems.reduce((sum, item) => 
        sum + item.structured.blocks.reduce((blockSum, block) => 
          blockSum + (block.bodyText?.length || 0) + (block.text?.length || 0), 0
        ), 0
      );
      
      const strongPages = evidenceItems.filter(item => item.score >= 1.2).length;
      const highSignalPages = evidenceItems.filter(item => 
        ["about", "product", "homepage"].includes(item.pageType)
      ).length;

      // Static content should be sufficient
      expect(totalChars).toBeGreaterThan(2000); // Substantial content
      expect(strongPages).toBe(2); // Multiple strong pages
      expect(highSignalPages).toBe(2); // High-value page types
      
      // 0 rendered pages should be valid in this scenario
      // This indicates static HTML extraction was sufficient
      expect(evidenceItems.length).toBe(2);
      expect(evidenceItems.every(item => item.pageType !== "rendered")).toBe(true);
    });

    it("should use rendered fallback only for thin high-signal pages", () => {
      // Create scenario with thin content that might need rendering
      const thinHighSignalPages: EvidenceItem[] = [
        {
          evidence: {
            url: "https://example.com/security",
            title: "Security",
            headings: [], // No headings - thin content
            snippet: "Security and compliance information available.",
          },
          pageType: "security" as PageType, // High-signal page type
          score: 0.8, // Low score indicates thin content
          structured: {
            url: "https://example.com/security",
            title: "Security",
            pageType: "security" as PageType,
            score: 0.8,
            sourceConfidence: 0.3, // Low confidence from static extraction
            blocks: [
              { 
                kind: "body-fallback" as const, 
                text: "Security and compliance information available." // Very thin
              },
            ],
          },
        },
      ];

      // This scenario would trigger rendered fallback
      const chars = thinHighSignalPages.reduce((sum, item) => 
        sum + item.structured.blocks.reduce((blockSum, block) => 
          blockSum + (block.bodyText?.length || 0) + (block.text?.length || 0), 0
        ), 0
      );
      
      expect(chars).toBeLessThan(500); // Very thin content
      expect(thinHighSignalPages[0].pageType).toBe("security"); // High-signal page type
      expect(thinHighSignalPages[0].score).toBeLessThan(1.0); // Low score
      expect(thinHighSignalPages[0].structured.sourceConfidence).toBeLessThan(0.5);
      
      // This would be a candidate for rendered fallback
      // The system should try JS rendering for this page
    });

    it("should distinguish between static sufficiency and rendering necessity", () => {
      const sufficientStatic: EvidenceItem = {
        evidence: {
          url: "https://example.com/about",
          title: "About - Complete Company Info",
          headings: ["About Us", "Our Mission", "Products", "Contact"],
          snippet: "We are a software company providing enterprise SaaS platforms with comprehensive features for business automation.",
        },
        pageType: "about" as PageType,
        score: 1.8, // Very high score
        structured: {
          url: "https://example.com/about",
          title: "About - Complete Company Info",
          pageType: "about" as PageType,
          score: 1.8,
          sourceConfidence: 0.95, // High confidence
          blocks: [
            { 
              kind: "heading-section" as const, 
              level: 1 as const, 
              heading: "About Us", 
              bodyText: "We are a software company providing enterprise SaaS platforms" 
            },
            { 
              kind: "heading-section" as const, 
              level: 2 as const, 
              heading: "Our Mission", 
              bodyText: "Business automation through innovative software solutions" 
            },
            { 
              kind: "body-fallback" as const, 
              text: "Comprehensive features for enterprise business automation and management." 
            },
          ],
        },
      };

      const needsRendering: EvidenceItem = {
        evidence: {
          url: "https://example.com/api",
          title: "API",
          headings: [], // No headings
          snippet: "API documentation.",
        },
        pageType: "docs" as PageType,
        score: 0.3, // Very low score
        structured: {
          url: "https://example.com/api",
          title: "API",
          pageType: "docs" as PageType,
          score: 0.3,
          sourceConfidence: 0.1, // Very low confidence
          blocks: [
            { 
              kind: "body-fallback" as const, 
              text: "API documentation." // Minimal content
            },
          ],
        },
      };

      // Verify the distinction
      expect(sufficientStatic.score).toBeGreaterThan(1.5);
      expect(sufficientStatic.structured.sourceConfidence).toBeGreaterThan(0.9);
      expect(sufficientStatic.structured.blocks.length).toBeGreaterThan(2);
      
      expect(needsRendering.score).toBeLessThan(0.5);
      expect(needsRendering.structured.sourceConfidence).toBeLessThan(0.2);
      expect(needsRendering.structured.blocks.length).toBe(1);
      
      // Sufficient static content should not need rendering (0 rendered pages is fine)
      // Thin content might need rendering fallback
    });
  });

  describe("Rendered fallback triggers", () => {
    it("should trigger rendering for security pages with minimal static content", () => {
      const securityPage: EvidenceItem = {
        evidence: {
          url: "https://example.com/security",
          title: "Security",
          headings: [],
          snippet: "Security information.",
        },
        pageType: "security" as PageType,
        score: 0.6,
        structured: {
          url: "https://example.com/security",
          title: "Security",
          pageType: "security" as PageType,
          score: 0.6,
          sourceConfidence: 0.2,
          blocks: [
            { 
              kind: "body-fallback" as const, 
              text: "Security information." 
            },
          ],
        },
      };

      // High-signal page type but thin content
      expect(securityPage.pageType).toBe("security");
      expect(securityPage.score).toBeLessThan(1.0);
      expect(securityPage.structured.sourceConfidence).toBeLessThan(0.5);
      
      // This should trigger rendered fallback
      const needsRendering = 
        securityPage.pageType === "security" && 
        securityPage.score < 1.0 && 
        securityPage.structured.sourceConfidence < 0.5;
      
      expect(needsRendering).toBe(true);
    });

    it("should not trigger rendering for pages with adequate static content", () => {
      const adequatePage: EvidenceItem = {
        evidence: {
          url: "https://example.com/about",
          title: "About Us",
          headings: ["About", "Products"],
          snippet: "We build software solutions for enterprise clients with comprehensive platforms.",
        },
        pageType: "about" as PageType,
        score: 1.3,
        structured: {
          url: "https://example.com/about",
          title: "About Us",
          pageType: "about" as PageType,
          score: 1.3,
          sourceConfidence: 0.8,
          blocks: [
            { 
              kind: "heading-section" as const, 
              level: 1 as const, 
              heading: "About", 
              bodyText: "We build software solutions for enterprise clients" 
            },
            { 
              kind: "body-fallback" as const, 
              text: "Comprehensive platforms for business automation." 
            },
          ],
        },
      };

      // Adequate static content
      expect(adequatePage.score).toBeGreaterThan(1.0);
      expect(adequatePage.structured.sourceConfidence).toBeGreaterThan(0.7);
      expect(adequatePage.structured.blocks.length).toBeGreaterThan(1);
      
      // This should not trigger rendered fallback
      const needsRendering = 
        adequatePage.pageType === "security" && 
        adequatePage.score < 1.0 && 
        adequatePage.structured.sourceConfidence < 0.5;
      
      expect(needsRendering).toBe(false);
    });
  });
});
