import { describe, it, expect, vi } from "vitest";
import { ProductGraphEngine } from "../product-graph/product-graph-engine";
import { DeepInferredProfile } from "../../onboarding-core-types";
import { StructuredPageEvidence } from "../../evidence";

describe("ProductGraphEngine", () => {
  it("should successfully build an empty product graph when no signals are present", () => {
    const profile: DeepInferredProfile = {
      tailoringConfidence: 0.1,
      suggestedDocuments: [],
      pagesScanned: [],
    };

    const graph = ProductGraphEngine.build({ profile, extractedPages: [] });

    expect(graph.productCapabilities).toHaveLength(0);
    expect(graph.procurementImplications).toHaveLength(0);
    expect(graph.accessPatterns).toHaveLength(0);
    expect(graph.infrastructureTouchpoints).toHaveLength(0);
    expect(graph.externalDependencyPatterns).toHaveLength(0);
  });

  it("should detect cloud_scanning with strong confidence from docs/security pages", () => {
    const profile: DeepInferredProfile = {
      tailoringConfidence: 0.8,
      suggestedDocuments: [],
      pagesScanned: ["https://example.com/docs/security"],
    };

    const extractedPages: StructuredPageEvidence[] = [
      {
        url: "https://example.com/docs/security",
        title: "Security and Cloud Architecture",
        pageType: "security",
        score: 0.9,
        sourceConfidence: 0.9,
        blocks: [
          {
            kind: "heading-section",
            source: "visible_text",
            level: 2,
            heading: "AWS Cloud Access",
            bodyText: "Our service needs to scan AWS subscriptions to monitor configuration changes and secure the cloud posture.",
          },
        ],
      },
    ];

    const graph = ProductGraphEngine.build({ profile, extractedPages });

    // Verify capability detection
    const cap = graph.productCapabilities.find(c => c.key === "cloud_scanning");
    expect(cap).toBeDefined();
    expect(cap!.confidence).toBe(0.95);
    expect(cap!.evidenceStrength).toBe("strong");
    expect(cap!.inferredFrom).toContain("strong_kw:scan aws");
    expect(cap!.sourcePages).toContain("https://example.com/docs/security");
    expect(cap!.evidenceRefs).toHaveLength(1);
    expect(cap!.evidenceRefs[0].snippet).toContain("AWS Cloud Access");

    // Verify implication mapping
    const imp = graph.procurementImplications.find(i => i.key === "privileged_cloud_access");
    expect(imp).toBeDefined();
    expect(imp!.severity).toBe("high");
    expect(imp!.triggeredByCapabilities).toContain("cloud_scanning");

    // Verify access patterns & touchpoints
    const access = graph.accessPatterns.find(a => a.key === "cloud_credential_access");
    expect(access).toBeDefined();
    expect(access!.confidence).toBe(0.95);

    const touchpoint = graph.infrastructureTouchpoints.find(t => t.key === "customer_cloud_account");
    expect(touchpoint).toBeDefined();
    expect(touchpoint!.confidence).toBe(0.95);
  });

  it("should detect data_classification with medium confidence from homepage and check context keyword", () => {
    const profile: DeepInferredProfile = {
      tailoringConfidence: 0.7,
      suggestedDocuments: [],
      pagesScanned: ["https://example.com/"],
    };

    const extractedPages: StructuredPageEvidence[] = [
      {
        url: "https://example.com/",
        title: "Secure Enterprise Classification",
        pageType: "other", // Homepage
        score: 0.5,
        sourceConfidence: 0.6,
        blocks: [
          {
            kind: "body-fallback",
            source: "visible_text",
            text: "We automatically classify sensitive data across all your document repositories and tag CCPA/GDPR violations.",
          },
        ],
      },
    ];

    const graph = ProductGraphEngine.build({ profile, extractedPages });

    const cap = graph.productCapabilities.find(c => c.key === "data_classification");
    expect(cap).toBeDefined();
    expect(cap!.confidence).toBe(0.75); // strong keyword on a normal page
    expect(cap!.evidenceStrength).toBe("medium");
    expect(cap!.inferredFrom).toContain("strong_kw:classify sensitive data");
  });

  it("should fall back to profile data interaction model signals for detection", () => {
    const profile: DeepInferredProfile = {
      tailoringConfidence: 0.9,
      suggestedDocuments: [],
      pagesScanned: [],
      dataInteractionModel: {
        value: {
          scansInfrastructure: true,
          processesSensitiveData: true,
          usesAIOnCustomerData: true,
          storesCustomerData: false,
          accessesCustomerData: false,
          integratesWithCloudProviders: false,
          handlesPayments: false,
          handlesPII: false,
        },
        category: "DERIVED",
        confidence: 0.8,
        confidenceBand: "high",
        evidenceCoverage: "strong",
        supportScore: 90,
      },
    };

    const graph = ProductGraphEngine.build({ profile, extractedPages: [] });

    expect(graph.productCapabilities.some(c => c.key === "cloud_scanning")).toBe(true);
    expect(graph.productCapabilities.some(c => c.key === "data_classification")).toBe(true);
    expect(graph.productCapabilities.some(c => c.key === "ai_inference")).toBe(true);

    const cloudCap = graph.productCapabilities.find(c => c.key === "cloud_scanning");
    expect(cloudCap!.confidence).toBe(0.35);
    expect(cloudCap!.evidenceStrength).toBe("weak");
  });

  it("should combine procurement implications triggered by multiple capabilities and suppress duplicates", () => {
    const profile: DeepInferredProfile = {
      tailoringConfidence: 0.8,
      suggestedDocuments: [],
      pagesScanned: ["https://example.com/docs"],
    };

    const extractedPages: StructuredPageEvidence[] = [
      {
        url: "https://example.com/docs",
        title: "API Docs",
        pageType: "docs",
        score: 0.8,
        sourceConfidence: 0.8,
        blocks: [
          {
            kind: "body-fallback",
            source: "visible_text",
            text: "Features inbound email ingestion for processing support tickets automatically. We also ingest Slack integration channels.",
          },
        ],
      },
    ];

    const graph = ProductGraphEngine.build({ profile, extractedPages });

    // Both email_ingestion and communication_ingestion are triggered
    expect(graph.productCapabilities.some(c => c.key === "email_ingestion")).toBe(true);
    expect(graph.productCapabilities.some(c => c.key === "communication_ingestion")).toBe(true);

    // Both trigger customer_content_exposure and retention_concerns. Verify they aren't duplicated.
    const exposures = graph.procurementImplications.filter(i => i.key === "customer_content_exposure");
    expect(exposures).toHaveLength(1);

    const exposure = exposures[0];
    expect(exposure.triggeredByCapabilities).toContain("email_ingestion");
    expect(exposure.triggeredByCapabilities).toContain("communication_ingestion");
  });
});
