import { describe, it, expect } from "vitest";
import {
  classifyPage,
  getUsefulnessTier,
  adjustForContentQuality,
  type PageType,
  type UsefulnessTier,
} from "@/modules/workspaces/onboarding/domain-crawler";

describe("Page Classification", () => {
  describe("classifyPage", () => {
    it("classifies security pages by URL", () => {
      const result = classifyPage("https://example.com/security");
      expect(result.pageType).toBe("security");
      expect(result.usefulnessScore).toBe(100);
      expect(result.usefulnessTier).toBe("critical");
    });

    it("classifies trust center pages by URL", () => {
      const result = classifyPage("https://example.com/trust-center");
      expect(result.pageType).toBe("trust");
      expect(result.usefulnessScore).toBe(95);
      expect(result.usefulnessTier).toBe("critical");
    });

    it("classifies privacy pages by URL", () => {
      const result = classifyPage("https://example.com/privacy-policy");
      expect(result.pageType).toBe("privacy");
      expect(result.usefulnessScore).toBe(85);
      expect(result.usefulnessTier).toBe("critical");
    });

    it("classifies compliance pages by URL", () => {
      const result = classifyPage("https://example.com/compliance");
      expect(result.pageType).toBe("compliance");
      expect(result.usefulnessScore).toBe(90);
      expect(result.usefulnessTier).toBe("critical");
    });

    it("classifies legal pages by URL", () => {
      const result = classifyPage("https://example.com/legal");
      expect(result.pageType).toBe("legal");
      expect(result.usefulnessScore).toBe(80);
      expect(result.usefulnessTier).toBe("high");
    });

    it("classifies product pages by URL", () => {
      const result = classifyPage("https://example.com/products");
      expect(result.pageType).toBe("product");
      expect(result.usefulnessScore).toBe(75);
      expect(result.usefulnessTier).toBe("high");
    });

    it("classifies solutions pages by URL", () => {
      const result = classifyPage("https://example.com/solutions");
      expect(result.pageType).toBe("solutions");
      expect(result.usefulnessScore).toBe(70);
      expect(result.usefulnessTier).toBe("high");
    });

    it("classifies about pages by URL", () => {
      const result = classifyPage("https://example.com/about");
      expect(result.pageType).toBe("about");
      expect(result.usefulnessScore).toBe(65);
      expect(result.usefulnessTier).toBe("medium");
    });

    it("classifies docs pages by URL", () => {
      const result = classifyPage("https://example.com/docs");
      expect(result.pageType).toBe("docs");
      expect(result.usefulnessScore).toBe(60);
      expect(result.usefulnessTier).toBe("medium");
    });

    it("classifies pricing pages by URL", () => {
      const result = classifyPage("https://example.com/pricing");
      expect(result.pageType).toBe("pricing");
      expect(result.usefulnessScore).toBe(55);
      expect(result.usefulnessTier).toBe("medium");
    });

    it("classifies customers pages by URL", () => {
      const result = classifyPage("https://example.com/customers");
      expect(result.pageType).toBe("customers");
      expect(result.usefulnessScore).toBe(50);
      expect(result.usefulnessTier).toBe("medium");
    });

    it("classifies case studies pages by URL", () => {
      const result = classifyPage("https://example.com/case-studies");
      expect(result.pageType).toBe("case_study");
      expect(result.usefulnessScore).toBe(50);
      expect(result.usefulnessTier).toBe("medium");
    });

    it("classifies integrations pages by URL", () => {
      const result = classifyPage("https://example.com/integrations");
      expect(result.pageType).toBe("integrations");
      expect(result.usefulnessScore).toBe(45);
      expect(result.usefulnessTier).toBe("low");
    });

    it("classifies homepage", () => {
      const result = classifyPage("https://example.com/");
      expect(result.pageType).toBe("homepage");
      expect(result.usefulnessScore).toBe(40);
      expect(result.usefulnessTier).toBe("low");
    });

    it("classifies unknown pages", () => {
      const result = classifyPage("https://example.com/random-page");
      expect(result.pageType).toBe("unknown");
      expect(result.usefulnessScore).toBe(10);
      expect(result.usefulnessTier).toBe("minimal");
    });

    it("uses title for classification when URL is ambiguous", () => {
      const result = classifyPage(
        "https://example.com/page",
        "Security Overview - Trust Center"
      );
      expect(result.pageType).toBe("trust");
      expect(result.signals.titlePattern).toBeDefined();
    });

    it("combines URL and title signals", () => {
      const result = classifyPage(
        "https://example.com/security",
        "Security Features"
      );
      expect(result.pageType).toBe("security");
      expect(result.signals.urlPattern).toBeDefined();
      expect(result.signals.titlePattern).toBeDefined();
    });

    it("uses headings for additional classification", () => {
      const result = classifyPage(
        "https://example.com/page",
        "Generic Page",
        ["Our Security Practices", "Compliance Certifications", "Privacy Policy"]
      );
      expect(result.signals.headingMatches).toBeDefined();
      expect(result.signals.headingMatches!.length).toBeGreaterThan(0);
    });

    it("handles DPA pages", () => {
      const result = classifyPage("https://example.com/dpa");
      expect(result.pageType).toBe("dpa");
      expect(result.usefulnessScore).toBe(85);
    });

    it("handles terms of service pages", () => {
      const result = classifyPage("https://example.com/terms-of-service");
      expect(result.pageType).toBe("legal");
    });

    it("handles platform pages as product", () => {
      const result = classifyPage("https://example.com/platform");
      expect(result.pageType).toBe("product");
    });

    it("handles company pages as about", () => {
      const result = classifyPage("https://example.com/company");
      expect(result.pageType).toBe("about");
    });

    it("handles API docs as docs", () => {
      const result = classifyPage("https://example.com/api");
      expect(result.pageType).toBe("docs");
    });

    it("handles help center as docs", () => {
      const result = classifyPage("https://example.com/help");
      expect(result.pageType).toBe("docs");
    });
  });

  describe("getUsefulnessTier", () => {
    it("returns critical for scores >= 85", () => {
      expect(getUsefulnessTier(100)).toBe("critical");
      expect(getUsefulnessTier(90)).toBe("critical");
      expect(getUsefulnessTier(85)).toBe("critical");
    });

    it("returns high for scores 70-84", () => {
      expect(getUsefulnessTier(84)).toBe("high");
      expect(getUsefulnessTier(70)).toBe("high");
    });

    it("returns medium for scores 50-69", () => {
      expect(getUsefulnessTier(69)).toBe("medium");
      expect(getUsefulnessTier(50)).toBe("medium");
    });

    it("returns low for scores 30-49", () => {
      expect(getUsefulnessTier(49)).toBe("low");
      expect(getUsefulnessTier(30)).toBe("low");
    });

    it("returns minimal for scores < 30", () => {
      expect(getUsefulnessTier(29)).toBe("minimal");
      expect(getUsefulnessTier(10)).toBe("minimal");
      expect(getUsefulnessTier(0)).toBe("minimal");
    });
  });

  describe("adjustForContentQuality", () => {
    it("penalizes thin pages heavily", () => {
      const adjusted = adjustForContentQuality(80, 50, "Security Page");
      expect(adjusted).toBeLessThan(80);
    });

    it("penalizes moderately thin pages", () => {
      const adjusted = adjustForContentQuality(80, 300, "Security Page");
      expect(adjusted).toBeLessThan(80);
    });

    it("bonuses substantial content", () => {
      const adjusted = adjustForContentQuality(80, 3500, "Security Page");
      expect(adjusted).toBeGreaterThan(80);
    });

    it("penalizes 404 pages heavily", () => {
      const adjusted = adjustForContentQuality(80, 1000, "404 Not Found");
      expect(adjusted).toBeLessThan(50);
    });

    it("penalizes error pages", () => {
      const adjusted = adjustForContentQuality(80, 1000, "Error Page");
      expect(adjusted).toBeLessThan(80);
    });

    it("penalizes generic home titles", () => {
      const adjusted = adjustForContentQuality(80, 1000, "home");
      expect(adjusted).toBeLessThan(80);
    });

    it("caps at 100", () => {
      const adjusted = adjustForContentQuality(98, 5000, "Good Page");
      expect(adjusted).toBe(100);
    });

    it("floors at 0", () => {
      const adjusted = adjustForContentQuality(10, 50, "404 Error");
      expect(adjusted).toBe(0);
    });
  });
});
