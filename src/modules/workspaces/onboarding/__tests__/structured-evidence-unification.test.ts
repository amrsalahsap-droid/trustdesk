import { describe, it, expect } from "vitest";
import { 
  getUsableTextFromEvidence, 
  ensureUsableSnippet,
  type StructuredPageEvidence 
} from "../evidence";
import { extractEvidence, type EvidenceFieldKey } from "../evidence-extraction";

describe("Structured Evidence Unification", () => {
  const mockStructuredRich: StructuredPageEvidence = {
    url: "https://example.com/security",
    title: "Security & Trust",
    pageType: "security",
    score: 100,
    sourceConfidence: 0.9,
    blocks: [
      {
        kind: "meta",
        metaDescription: "TrustDesk provides secure enterprise SaaS solutions with SOC 2 compliance."
      },
      {
        kind: "heading-section",
        level: 1,
        heading: "Enterprise Security",
        bodyText: "Our platform is built with security at its core, featuring AES-256 encryption."
      }
    ]
  };

  const mockStructuredSparse: StructuredPageEvidence = {
    url: "https://example.com/about",
    title: "About Us",
    pageType: "about",
    score: 50,
    sourceConfidence: 0.3,
    blocks: [
      {
        kind: "body-fallback",
        text: "Just some basic text about our company."
      }
    ]
  };

  describe("getUsableTextFromEvidence", () => {
    it("extracts text from all block types including title", () => {
      const text = getUsableTextFromEvidence(mockStructuredRich);
      expect(text).toContain("Security & Trust");
      expect(text).toContain("SOC 2 compliance");
      expect(text).toContain("AES-256 encryption");
    });
  });

  describe("ensureUsableSnippet", () => {
    it("generates snippet from structured text when original is empty", () => {
      const snippet = ensureUsableSnippet({
        snippet: "",
        structured: mockStructuredRich
      });
      expect(snippet).toContain("TrustDesk provides secure enterprise SaaS solutions");
    });

    it("preserves original snippet if it is sufficiently rich", () => {
      const original = "This is a very good and long enough snippet that should be preserved.";
      const snippet = ensureUsableSnippet({
        snippet: original,
        structured: mockStructuredRich
      });
      expect(snippet).toBe(original);
    });

    it("falls back to structured text if original is too short", () => {
      const original = "Short";
      const snippet = ensureUsableSnippet({
        snippet: original,
        structured: mockStructuredRich
      });
      expect(snippet).toContain("TrustDesk provides secure enterprise SaaS solutions");
    });
  });

  describe("extractEvidence with Structured Content", () => {
    it("produces SaaS signal from rich structured content even if snippet is empty", () => {
      const pages = [
        {
          url: "https://example.com/security",
          pageType: "security" as any,
          title: "Security",
          snippet: "", // EMPTY SNIPPET
          structured: mockStructuredRich
        }
      ];

      const result = extractEvidence(pages);
      
      // Should find productType: saas because "SaaS" is in metaDescription
      const saasSignals = result.fields.productType.signals.filter((s: any) => s.candidateValue === "saas");
      expect(saasSignals.length).toBeGreaterThan(0);
      expect(saasSignals[0].snippet).toContain("TrustDesk provides secure enterprise SaaS solutions");
      
      // Should also find complianceFocus: soc2
      const soc2Signals = result.fields.complianceFocus.signals.filter((s: any) => s.candidateValue === "soc2");
      expect(soc2Signals.length).toBeGreaterThan(0);
    });

    it("still works with sparse snippet-only fallback", () => {
      const sparseStructured: StructuredPageEvidence = {
        url: "https://example.com/legacy",
        title: "Legacy",
        pageType: "about",
        score: 10,
        sourceConfidence: 0.1,
        blocks: []
      };

      const pages = [
        {
          url: "https://example.com/legacy",
          pageType: "about" as any,
          title: "Legacy",
          snippet: "We are a fintech company offering banking services.",
          structured: sparseStructured
        }
      ];

      const result = extractEvidence(pages);
      
      const fintechSignals = result.fields.industry.signals.filter((s: any) => s.candidateValue === "fintech");
      expect(fintechSignals.length).toBeGreaterThan(0);
      expect(fintechSignals[0].snippet).toBe("We are a fintech company offering banking services.");
    });

    it("creates a diagnostic (empty signals) for high-content/zero-signal case", () => {
      const highContentNoSignal: StructuredPageEvidence = {
        url: "https://example.com/irrelevant",
        title: "Irrelevant Content",
        pageType: "other",
        score: 100,
        sourceConfidence: 1.0,
        blocks: [
          {
            kind: "body-fallback",
            text: "This is a lot of text about gardening and cooking recipes. It has absolutely no mention of software, security, compliance, or anything relevant to TrustDesk."
          }
        ]
      };

      const pages = [
        {
          url: "https://example.com/irrelevant",
          pageType: "other" as any,
          title: "Gardening Blog",
          snippet: "",
          structured: highContentNoSignal
        }
      ];

      const result = extractEvidence(pages);
      
      // All fields should be empty
      (Object.keys(result.fields) as EvidenceFieldKey[]).forEach(fieldKey => {
        const field = result.fields[fieldKey];
        expect(field.signals).toHaveLength(0);
      });
      
      // Page should be in emptyPages
      expect(result.emptyPages).toContain("https://example.com/irrelevant");
    });
  });
});
