import { describe, it, expect } from "vitest";
import { WorkflowExtractionEngine } from "../workflow-analysis/workflow-extraction-engine";
import { DeepInferredProfile } from "../../onboarding-core-types";
import { StructuredPageEvidence } from "../../evidence";

describe("WorkflowExtractionEngine", () => {
  it("should successfully build an empty workflow list when no signals are present", () => {
    const profile: DeepInferredProfile = {
      tailoringConfidence: 0.1,
      suggestedDocuments: [],
      pagesScanned: [],
    };

    const workflows = WorkflowExtractionEngine.extract({ profile, extractedPages: [] });
    expect(workflows).toHaveLength(0);
  });

  it("should extract email ingestion workflow from mailbox integration documents", () => {
    const profile: DeepInferredProfile = {
      tailoringConfidence: 0.8,
      suggestedDocuments: [],
      pagesScanned: ["https://example.com/docs/email"],
    };

    const extractedPages: StructuredPageEvidence[] = [
      {
        url: "https://example.com/docs/email",
        title: "Setting up Email Ingestion",
        pageType: "docs",
        score: 0.9,
        sourceConfidence: 0.9,
        blocks: [
          {
            kind: "heading-section",
            source: "visible_text",
            level: 2,
            heading: "IMAP Mailbox Connection",
            bodyText: "Configure IMAP poll access so our support ticket system can ingest emails and parse attachments directly.",
          },
        ],
      },
    ];

    const workflows = WorkflowExtractionEngine.extract({ profile, extractedPages });

    const flow = workflows.find(w => w.key === "ingestion");
    expect(flow).toBeDefined();
    expect(flow!.confidence).toBe(0.95);
    expect(flow!.steps).toHaveLength(5);
    expect(flow!.dataFlow).toHaveLength(2);
    expect(flow!.accessFlow).toHaveLength(2);
    expect(flow!.persistenceBehavior?.doesStoreData).toBe(true);

    // Verify risks and trust implications
    expect(flow!.procurementRisks).toContain("customer_content_exposure");
    expect(flow!.procurementRisks).toContain("retention_concerns");
    expect(flow!.trustImplications).toContain("Data Handling & Privacy");
  });

  it("should extract cloud scanning workflow from AWS infrastructure docs", () => {
    const profile: DeepInferredProfile = {
      tailoringConfidence: 0.8,
      suggestedDocuments: [],
      pagesScanned: ["https://example.com/docs/security"],
    };

    const extractedPages: StructuredPageEvidence[] = [
      {
        url: "https://example.com/docs/security",
        title: "AWS Cloud Scanning Setup",
        pageType: "docs",
        score: 0.9,
        sourceConfidence: 0.9,
        blocks: [
          {
            kind: "body-fallback",
            source: "visible_text",
            text: "To run cloud scanning, you must provision an IAM role allowing us to inspect infrastructure configuration.",
          },
        ],
      },
    ];

    const workflows = WorkflowExtractionEngine.extract({ profile, extractedPages });

    const flow = workflows.find(w => w.key === "scanning");
    expect(flow).toBeDefined();
    expect(flow!.confidence).toBe(0.95);
    expect(flow!.procurementRisks).toContain("privileged_cloud_access");
    expect(flow!.procurementRisks).toContain("tenant_isolation_risk");
    expect(flow!.evidenceRequirements).toContain("Least Privilege Architecture");
  });

  it("should extract AI analysis workflow and verify AI Interaction attributes", () => {
    const profile: DeepInferredProfile = {
      tailoringConfidence: 0.8,
      suggestedDocuments: [],
      pagesScanned: ["https://example.com/docs/ai"],
    };

    const extractedPages: StructuredPageEvidence[] = [
      {
        url: "https://example.com/docs/ai",
        title: "GPT-4 Model Integration",
        pageType: "docs",
        score: 0.9,
        sourceConfidence: 0.9,
        blocks: [
          {
            kind: "body-fallback",
            source: "visible_text",
            text: "We offer generative AI reasoning through OpenAI API endpoints to summarize your data.",
          },
        ],
      },
    ];

    const workflows = WorkflowExtractionEngine.extract({ profile, extractedPages });

    const flow = workflows.find(w => w.key === "ai_analysis");
    expect(flow).toBeDefined();
    expect(flow!.confidence).toBe(0.95);
    expect(flow!.aiInteraction?.usesLLM).toBe(true);
    expect(flow!.aiInteraction?.provider).toBe("OpenAI/Anthropic APIs");
    expect(flow!.procurementRisks).toContain("ai_governance_requirements");
  });

  it("should extract export workflow and Temporary persistence behavior", () => {
    const profile: DeepInferredProfile = {
      tailoringConfidence: 0.8,
      suggestedDocuments: [],
      pagesScanned: ["https://example.com/pricing"],
    };

    const extractedPages: StructuredPageEvidence[] = [
      {
        url: "https://example.com/pricing",
        title: "Exporting Logs",
        pageType: "pricing",
        score: 0.8,
        sourceConfidence: 0.8,
        blocks: [
          {
            kind: "body-fallback",
            source: "visible_text",
            text: "Users can bulk export all customer metrics to secure CSV exports.",
          },
        ],
      },
    ];

    const workflows = WorkflowExtractionEngine.extract({ profile, extractedPages });

    const flow = workflows.find(w => w.key === "export_report");
    expect(flow).toBeDefined();
    expect(flow!.confidence).toBe(0.95); // strong keyword on a high signal (pricing) page
    expect(flow!.persistenceBehavior?.doesStoreData).toBe(false);
  });

  it("should extract webhook workflow and verify HTTP outbound event properties", () => {
    const profile: DeepInferredProfile = {
      tailoringConfidence: 0.8,
      suggestedDocuments: [],
      pagesScanned: ["https://example.com/docs/api"],
    };

    const extractedPages: StructuredPageEvidence[] = [
      {
        url: "https://example.com/docs/api",
        title: "Outbound Webhooks",
        pageType: "docs",
        score: 0.9,
        sourceConfidence: 0.9,
        blocks: [
          {
            kind: "body-fallback",
            source: "visible_text",
            text: "Configure outbound webhooks with custom payload configurations in the settings page.",
          },
        ],
      },
    ];

    const workflows = WorkflowExtractionEngine.extract({ profile, extractedPages });

    const flow = workflows.find(w => w.key === "webhook_event");
    expect(flow).toBeDefined();
    expect(flow!.confidence).toBe(0.95); // strong keyword on a high signal (docs) page
    expect(flow!.steps[3].description).toContain("HTTP POST");
  });
});
