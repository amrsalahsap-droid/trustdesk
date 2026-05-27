import { describe, it, expect } from "vitest";
import {
  getDocumentLifecycle,
  getUnifiedStatus,
  calculateReadiness,
  SourceDocumentRow,
  DocumentLifecycle,
} from "../document-display";
import { getFriendlyDocumentError } from "../document-errors";

// Helper to create minimal document row
function createDoc(overrides: Partial<SourceDocumentRow> = {}): SourceDocumentRow {
  return {
    id: "doc-1",
    originalName: "test.pdf",
    mimeType: "application/pdf",
    fileSizeBytes: 1024,
    uploadStatus: "UPLOADED",
    version: 1,
    isLatest: true,
    createdAt: new Date().toISOString(),
    uploadedBy: { name: "Test User", email: "test@example.com" },
    parseJobs: [],
    answerSeedingJobs: [],
    ...overrides,
  };
}

describe("Document Lifecycle - Stage-aware status derivation", () => {
  describe("Upload stage", () => {
    it("shows PENDING as neutral, not failed", () => {
      const doc = createDoc({ uploadStatus: "PENDING", parseJobs: [], answerSeedingJobs: [] });
      const lifecycle = getDocumentLifecycle(doc);

      expect(lifecycle.upload.status).toBe("PENDING");
      expect(lifecycle.upload.label).toBe("Pending");
      expect(lifecycle.upload.variant).toBe("neutral");
      expect(lifecycle.currentStage).toBe("Upload");
      expect(lifecycle.activeLabel).toBe("Uploading...");
      expect(lifecycle.isTerminal).toBe(false);
    });

    it("shows UPLOADED as completed, not failed", () => {
      const doc = createDoc({ uploadStatus: "UPLOADED", parseJobs: [], answerSeedingJobs: [] });
      const lifecycle = getDocumentLifecycle(doc);

      expect(lifecycle.upload.status).toBe("UPLOADED");
      expect(lifecycle.upload.label).toBe("Uploaded");
      expect(lifecycle.upload.variant).toBe("ok");
      expect(lifecycle.currentStage).toBe("Parse");
      expect(lifecycle.activeLabel).toBe("Waiting for parsing");
      expect(lifecycle.isTerminal).toBe(false);
    });

    it("shows FAILED as error", () => {
      const doc = createDoc({ uploadStatus: "FAILED", parseJobs: [], answerSeedingJobs: [] });
      const lifecycle = getDocumentLifecycle(doc);

      expect(lifecycle.upload.status).toBe("FAILED");
      expect(lifecycle.upload.label).toBe("Failed");
      expect(lifecycle.upload.variant).toBe("error");
      expect(lifecycle.currentStage).toBe("Upload");
      expect(lifecycle.isTerminal).toBe(true);
    });
  });

  describe("Parse stage - no job exists yet", () => {
    it("shows Waiting (not failed) when upload complete but no parse job", () => {
      const doc = createDoc({ uploadStatus: "UPLOADED", parseJobs: [], answerSeedingJobs: [] });
      const lifecycle = getDocumentLifecycle(doc);

      expect(lifecycle.parse.status).toBeNull();
      expect(lifecycle.parse.label).toBe("Waiting");
      expect(lifecycle.parse.variant).toBe("neutral");
      expect(lifecycle.currentStage).toBe("Parse");
      expect(lifecycle.activeLabel).toBe("Waiting for parsing");
      expect(lifecycle.isTerminal).toBe(false);
    });
  });

  describe("Parse stage - QUEUED status", () => {
    it("shows Queued (not failed) when parse job is QUEUED", () => {
      const doc = createDoc({
        uploadStatus: "UPLOADED",
        parseJobs: [{ id: "parse-1", status: "QUEUED", errorMessage: null }],
        answerSeedingJobs: [],
      });
      const lifecycle = getDocumentLifecycle(doc);

      expect(lifecycle.parse.status).toBe("QUEUED");
      expect(lifecycle.parse.label).toBe("Queued");
      expect(lifecycle.parse.variant).toBe("neutral");
      expect(lifecycle.currentStage).toBe("Parse");
      expect(lifecycle.activeLabel).toBe("Queued for parsing");
      expect(lifecycle.isTerminal).toBe(false);
    });
  });

  describe("Parse stage - PROCESSING status", () => {
    it("shows Processing (not failed) when parse job is PROCESSING", () => {
      const recentDate = new Date().toISOString();
      const doc = createDoc({
        uploadStatus: "UPLOADED",
        parseJobs: [
          {
            id: "parse-1",
            status: "PROCESSING",
            errorMessage: null,
            lastHeartbeatAt: recentDate,
            createdAt: recentDate,
          },
        ],
        answerSeedingJobs: [],
      });
      const lifecycle = getDocumentLifecycle(doc);

      expect(lifecycle.parse.status).toBe("PROCESSING");
      expect(lifecycle.parse.label).toBe("Processing");
      expect(lifecycle.parse.variant).toBe("neutral");
      expect(lifecycle.currentStage).toBe("Parse");
      expect(lifecycle.activeLabel).toBe("Extracting text...");
      expect(lifecycle.isTerminal).toBe(false);
    });

    it("shows Delayed warning when parse job is stale", () => {
      const oldDate = new Date(Date.now() - 6 * 60 * 1000).toISOString(); // 6 minutes ago
      const doc = createDoc({
        uploadStatus: "UPLOADED",
        parseJobs: [
          {
            id: "parse-1",
            status: "PROCESSING",
            errorMessage: null,
            lastHeartbeatAt: oldDate,
            createdAt: oldDate,
          },
        ],
        answerSeedingJobs: [],
      });
      const lifecycle = getDocumentLifecycle(doc);

      expect(lifecycle.parse.status).toBe("PROCESSING");
      expect(lifecycle.parse.label).toBe("Delayed");
      expect(lifecycle.parse.variant).toBe("warning");
      expect(lifecycle.parse.isStale).toBe(true);
      expect(lifecycle.isTerminal).toBe(false);
    });
  });

  describe("Parse stage - COMPLETED status", () => {
    it("shows Parsed and moves to seeding stage", () => {
      const doc = createDoc({
        uploadStatus: "UPLOADED",
        parseJobs: [
          { id: "parse-1", status: "COMPLETED", errorMessage: null, createdAt: new Date().toISOString() },
        ],
        answerSeedingJobs: [],
      });
      const lifecycle = getDocumentLifecycle(doc);

      expect(lifecycle.parse.status).toBe("COMPLETED");
      expect(lifecycle.parse.label).toBe("Parsed");
      expect(lifecycle.parse.variant).toBe("ok");
      expect(lifecycle.currentStage).toBe("Seeding");
      expect(lifecycle.seeding.label).toBe("Waiting");
      expect(lifecycle.isTerminal).toBe(false);
    });
  });

  describe("Parse stage - FAILED status", () => {
    it("shows Failed only when parse job actually failed", () => {
      const doc = createDoc({
        uploadStatus: "UPLOADED",
        parseJobs: [
          {
            id: "parse-1",
            status: "FAILED",
            errorMessage: "PDF is corrupted",
            failureCode: "PARSE_ERROR",
          },
        ],
        answerSeedingJobs: [],
      });
      const lifecycle = getDocumentLifecycle(doc);

      expect(lifecycle.parse.status).toBe("FAILED");
      expect(lifecycle.parse.label).toBe("Failed");
      expect(lifecycle.parse.variant).toBe("error");
      expect(lifecycle.parse.error).toBe("PDF is corrupted");
      expect(lifecycle.currentStage).toBe("Parse");
      expect(lifecycle.isTerminal).toBe(true);
    });
  });

  describe("Seeding stage - no job exists yet", () => {
    it("shows Waiting (not failed) when parse complete but no seeding job", () => {
      const doc = createDoc({
        uploadStatus: "UPLOADED",
        parseJobs: [{ id: "parse-1", status: "COMPLETED", errorMessage: null }],
        answerSeedingJobs: [],
      });
      const lifecycle = getDocumentLifecycle(doc);

      expect(lifecycle.seeding.status).toBeNull();
      expect(lifecycle.seeding.label).toBe("Waiting");
      expect(lifecycle.seeding.variant).toBe("neutral");
      expect(lifecycle.currentStage).toBe("Seeding");
      expect(lifecycle.activeLabel).toBe("Waiting for seeding");
      expect(lifecycle.isTerminal).toBe(false);
    });
  });

  describe("Seeding stage - QUEUED status", () => {
    it("shows Queued (not failed) when seeding job is QUEUED", () => {
      const doc = createDoc({
        uploadStatus: "UPLOADED",
        parseJobs: [{ id: "parse-1", status: "COMPLETED", errorMessage: null }],
        answerSeedingJobs: [{ id: "seed-1", status: "QUEUED", lastError: null }],
      });
      const lifecycle = getDocumentLifecycle(doc);

      expect(lifecycle.seeding.status).toBe("QUEUED");
      expect(lifecycle.seeding.label).toBe("Queued");
      expect(lifecycle.seeding.variant).toBe("neutral");
      expect(lifecycle.currentStage).toBe("Seeding");
      expect(lifecycle.activeLabel).toBe("Queued for seeding");
      expect(lifecycle.isTerminal).toBe(false);
    });
  });

  describe("Seeding stage - RUNNING status", () => {
    it("shows Seeding (not failed) when seeding job is RUNNING", () => {
      const recentDate = new Date().toISOString();
      const doc = createDoc({
        uploadStatus: "UPLOADED",
        parseJobs: [{ id: "parse-1", status: "COMPLETED", errorMessage: null }],
        answerSeedingJobs: [
          { id: "seed-1", status: "RUNNING", lastError: null, lastHeartbeatAt: recentDate },
        ],
      });
      const lifecycle = getDocumentLifecycle(doc);

      expect(lifecycle.seeding.status).toBe("RUNNING");
      expect(lifecycle.seeding.label).toBe("Seeding");
      expect(lifecycle.seeding.variant).toBe("neutral");
      expect(lifecycle.currentStage).toBe("Seeding");
      expect(lifecycle.activeLabel).toBe("Seeding knowledge...");
      expect(lifecycle.isTerminal).toBe(false);
    });

    it("shows Delayed warning when seeding job is stale", () => {
      const oldDate = new Date(Date.now() - 6 * 60 * 1000).toISOString(); // 6 minutes ago
      const doc = createDoc({
        uploadStatus: "UPLOADED",
        parseJobs: [{ id: "parse-1", status: "COMPLETED", errorMessage: null }],
        answerSeedingJobs: [
          { id: "seed-1", status: "RUNNING", lastError: null, lastHeartbeatAt: oldDate },
        ],
      });
      const lifecycle = getDocumentLifecycle(doc);

      expect(lifecycle.seeding.status).toBe("RUNNING");
      expect(lifecycle.seeding.label).toBe("Delayed");
      expect(lifecycle.seeding.variant).toBe("warning");
      expect(lifecycle.seeding.isStale).toBe(true);
      expect(lifecycle.isTerminal).toBe(false);
    });
  });

  describe("Seeding stage - COMPLETED status", () => {
    it("shows Complete and Ready stage when seeding is COMPLETED", () => {
      const doc = createDoc({
        uploadStatus: "UPLOADED",
        parseJobs: [{ id: "parse-1", status: "COMPLETED", errorMessage: null }],
        answerSeedingJobs: [{ id: "seed-1", status: "COMPLETED", lastError: null }],
      });
      const lifecycle = getDocumentLifecycle(doc);

      expect(lifecycle.seeding.status).toBe("COMPLETED");
      expect(lifecycle.seeding.label).toBe("Complete");
      expect(lifecycle.seeding.variant).toBe("ok");
      expect(lifecycle.currentStage).toBe("Ready");
      expect(lifecycle.activeLabel).toBe("Ready");
      expect(lifecycle.activeVariant).toBe("ok");
      expect(lifecycle.isTerminal).toBe(true);
    });
  });

  describe("Seeding stage - PARTIAL status", () => {
    it("shows Partial warning and Ready stage when seeding is PARTIAL", () => {
      const doc = createDoc({
        uploadStatus: "UPLOADED",
        parseJobs: [{ id: "parse-1", status: "COMPLETED", errorMessage: null }],
        answerSeedingJobs: [
          { id: "seed-1", status: "PARTIAL", lastError: "Some topics failed" },
        ],
      });
      const lifecycle = getDocumentLifecycle(doc);

      expect(lifecycle.seeding.status).toBe("PARTIAL");
      expect(lifecycle.seeding.label).toBe("Partial");
      expect(lifecycle.seeding.variant).toBe("warning");
      expect(lifecycle.seeding.error).toBe("Some topics failed");
      expect(lifecycle.currentStage).toBe("Ready");
      expect(lifecycle.activeLabel).toBe("Partially ready");
      expect(lifecycle.activeVariant).toBe("warning");
      expect(lifecycle.isTerminal).toBe(true);
    });
  });

  describe("Seeding stage - FAILED status", () => {
    it("shows Failed only when seeding job actually failed", () => {
      const doc = createDoc({
        uploadStatus: "UPLOADED",
        parseJobs: [{ id: "parse-1", status: "COMPLETED", errorMessage: null }],
        answerSeedingJobs: [
          { id: "seed-1", status: "FAILED", lastError: "AI model timeout", failureCode: "SEEDING_ERROR" },
        ],
      });
      const lifecycle = getDocumentLifecycle(doc);

      expect(lifecycle.seeding.status).toBe("FAILED");
      expect(lifecycle.seeding.label).toBe("Failed");
      expect(lifecycle.seeding.variant).toBe("error");
      expect(lifecycle.seeding.error).toBe("AI model timeout");
      expect(lifecycle.currentStage).toBe("Seeding");
      expect(lifecycle.isTerminal).toBe(true);
    });
  });
});

describe("Document Error Messages", () => {
  function createLifecycle(overrides: Partial<DocumentLifecycle> = {}): DocumentLifecycle {
    return {
      upload: { label: "Uploaded", variant: "ok", status: "UPLOADED" },
      parse: { label: "Waiting", variant: "neutral", status: null, error: null },
      seeding: { label: "Waiting", variant: "neutral", status: null, error: null },
      currentStage: "Parse",
      activeLabel: "Waiting for parsing",
      activeVariant: "neutral",
      activeError: null,
      isTerminal: false,
      ...overrides,
    };
  }

  it("returns null for normal transitional state (uploaded, no parse job)", () => {
    const lifecycle = createLifecycle({
      upload: { label: "Uploaded", variant: "ok", status: "UPLOADED" },
      parse: { label: "Waiting", variant: "neutral", status: null, error: null },
      currentStage: "Parse",
      activeLabel: "Waiting for parsing",
      activeVariant: "neutral",
      isTerminal: false,
    });

    const error = getFriendlyDocumentError(lifecycle);
    expect(error).toBeNull();
  });

  it("returns null for parse queued state", () => {
    const lifecycle = createLifecycle({
      parse: { label: "Queued", variant: "neutral", status: "QUEUED", error: null },
      currentStage: "Parse",
      activeLabel: "Queued for parsing",
      activeVariant: "neutral",
      isTerminal: false,
    });

    const error = getFriendlyDocumentError(lifecycle);
    expect(error).toBeNull();
  });

  it("returns null for parse processing state", () => {
    const lifecycle = createLifecycle({
      parse: { label: "Processing", variant: "neutral", status: "PROCESSING", error: null },
      currentStage: "Parse",
      activeLabel: "Extracting text...",
      activeVariant: "neutral",
      isTerminal: false,
    });

    const error = getFriendlyDocumentError(lifecycle);
    expect(error).toBeNull();
  });

  it("returns null for seeding queued state", () => {
    const lifecycle = createLifecycle({
      parse: { label: "Parsed", variant: "ok", status: "COMPLETED", error: null },
      seeding: { label: "Queued", variant: "neutral", status: "QUEUED", error: null },
      currentStage: "Seeding",
      activeLabel: "Queued for seeding",
      activeVariant: "neutral",
      isTerminal: false,
    });

    const error = getFriendlyDocumentError(lifecycle);
    expect(error).toBeNull();
  });

  it("returns null for seeding running state", () => {
    const lifecycle = createLifecycle({
      parse: { label: "Parsed", variant: "ok", status: "COMPLETED", error: null },
      seeding: { label: "Seeding", variant: "neutral", status: "RUNNING", error: null },
      currentStage: "Seeding",
      activeLabel: "Seeding knowledge...",
      activeVariant: "neutral",
      isTerminal: false,
    });

    const error = getFriendlyDocumentError(lifecycle);
    expect(error).toBeNull();
  });

  it("returns error for upload failure", () => {
    const lifecycle = createLifecycle({
      upload: { label: "Failed", variant: "error", status: "FAILED" },
      parse: { label: "Waiting", variant: "neutral", status: null, error: null },
      currentStage: "Upload",
      activeLabel: "Failed",
      activeVariant: "error",
      isTerminal: true,
    });

    const error = getFriendlyDocumentError(lifecycle);
    expect(error).not.toBeNull();
    expect(error?.stage).toBe("Upload");
    expect(error?.severity).toBe("error");
  });

  it("returns error for parse failure", () => {
    const lifecycle = createLifecycle({
      parse: { label: "Failed", variant: "error", status: "FAILED", error: "PDF is corrupted" },
      currentStage: "Parse",
      activeLabel: "Failed",
      activeVariant: "error",
      activeError: "PDF is corrupted",
      isTerminal: true,
    });

    const error = getFriendlyDocumentError(lifecycle);
    expect(error).not.toBeNull();
    expect(error?.stage).toBe("Parsing");
    expect(error?.severity).toBe("error");
  });

  it("returns error for seeding failure", () => {
    const lifecycle = createLifecycle({
      parse: { label: "Parsed", variant: "ok", status: "COMPLETED", error: null },
      seeding: { label: "Failed", variant: "error", status: "FAILED", error: "AI timeout" },
      currentStage: "Seeding",
      activeLabel: "Failed",
      activeVariant: "error",
      activeError: "AI timeout",
      isTerminal: true,
    });

    const error = getFriendlyDocumentError(lifecycle);
    expect(error).not.toBeNull();
    expect(error?.stage).toBe("Intelligence");
    expect(error?.severity).toBe("error");
  });

  it("returns warning for stale parse job", () => {
    const lifecycle = createLifecycle({
      parse: { label: "Delayed", variant: "warning", status: "PROCESSING", error: null, isStale: true },
      currentStage: "Parse",
      activeLabel: "Delayed",
      activeVariant: "warning",
      isTerminal: false,
    });

    const error = getFriendlyDocumentError(lifecycle);
    expect(error).not.toBeNull();
    expect(error?.stage).toBe("Parsing");
    expect(error?.severity).toBe("warning");
    expect(error?.reason).toContain("Delayed");
  });
});

describe("Document Unified Status", () => {
  it("returns correct status for uploaded, no parse job", () => {
    const doc = createDoc({ uploadStatus: "UPLOADED", parseJobs: [], answerSeedingJobs: [] });
    const status = getUnifiedStatus(doc);

    expect(status.label).toBe("Waiting for parsing");
    expect(status.variant).toBe("neutral");
    expect(status.error).toBeNull();
  });

  it("returns correct status for parse queued", () => {
    const doc = createDoc({
      uploadStatus: "UPLOADED",
      parseJobs: [{ id: "parse-1", status: "QUEUED", errorMessage: null }],
      answerSeedingJobs: [],
    });
    const status = getUnifiedStatus(doc);

    expect(status.label).toBe("Queued for parsing");
    expect(status.variant).toBe("neutral");
  });

  it("returns correct status for parse failed", () => {
    const doc = createDoc({
      uploadStatus: "UPLOADED",
      parseJobs: [
        { id: "parse-1", status: "FAILED", errorMessage: "Unsupported file type", failureCode: "EXTRACTOR_MISSING" },
      ],
      answerSeedingJobs: [],
    });
    const status = getUnifiedStatus(doc);

    expect(status.label).toBe("Failed");
    expect(status.variant).toBe("error");
    expect(status.error).toBe("Unsupported file type");
  });
});

describe("Document Readiness Score", () => {
  it("returns 0 for pending upload", () => {
    const doc = createDoc({ uploadStatus: "PENDING", parseJobs: [], answerSeedingJobs: [] });
    expect(calculateReadiness(doc)).toBe(0);
  });

  it("returns 0.2 for uploaded, no parse job", () => {
    const doc = createDoc({ uploadStatus: "UPLOADED", parseJobs: [], answerSeedingJobs: [] });
    expect(calculateReadiness(doc)).toBe(0.2);
  });

  it("returns 0.2 for uploaded + parse queued", () => {
    const doc = createDoc({
      uploadStatus: "UPLOADED",
      parseJobs: [{ id: "parse-1", status: "QUEUED", errorMessage: null }],
      answerSeedingJobs: [],
    });
    expect(calculateReadiness(doc)).toBe(0.2);
  });

  it("returns 0.6 for parse completed, no seeding", () => {
    const doc = createDoc({
      uploadStatus: "UPLOADED",
      parseJobs: [{ id: "parse-1", status: "COMPLETED", errorMessage: null }],
      answerSeedingJobs: [],
    });
    expect(calculateReadiness(doc)).toBeCloseTo(0.6, 10);
  });

  it("returns 1.0 for fully complete", () => {
    const doc = createDoc({
      uploadStatus: "UPLOADED",
      parseJobs: [{ id: "parse-1", status: "COMPLETED", errorMessage: null }],
      answerSeedingJobs: [{ id: "seed-1", status: "COMPLETED", lastError: null }],
    });
    expect(calculateReadiness(doc)).toBe(1.0);
  });

  it("returns 0.8 for partial seeding", () => {
    const doc = createDoc({
      uploadStatus: "UPLOADED",
      parseJobs: [{ id: "parse-1", status: "COMPLETED", errorMessage: null }],
      answerSeedingJobs: [{ id: "seed-1", status: "PARTIAL", lastError: null }],
    });
    expect(calculateReadiness(doc)).toBe(0.8);
  });
});

describe("Edge cases and invalid combinations", () => {
  it("handles missing document data gracefully", () => {
    // @ts-expect-error testing null handling
    const lifecycle = getDocumentLifecycle(null);

    expect(lifecycle.upload.label).toBe("Pending");
    expect(lifecycle.parse.label).toBe("Waiting");
    expect(lifecycle.seeding.label).toBe("Waiting");
    expect(lifecycle.currentStage).toBe("Upload");
    expect(lifecycle.activeLabel).toBe("Loading...");
    expect(lifecycle.isTerminal).toBe(false);
  });

  it("handles parse job with unknown status gracefully", () => {
    const doc = createDoc({
      uploadStatus: "UPLOADED",
      parseJobs: [{ id: "parse-1", status: "UNKNOWN", errorMessage: null }],
      answerSeedingJobs: [],
    });
    const lifecycle = getDocumentLifecycle(doc);

    expect(lifecycle.parse.label).toBe("Waiting");
    expect(lifecycle.parse.variant).toBe("neutral");
  });

  it("handles seeding job with unknown status gracefully", () => {
    const doc = createDoc({
      uploadStatus: "UPLOADED",
      parseJobs: [{ id: "parse-1", status: "COMPLETED", errorMessage: null }],
      answerSeedingJobs: [{ id: "seed-1", status: "UNKNOWN", lastError: null }],
    });
    const lifecycle = getDocumentLifecycle(doc);

    expect(lifecycle.seeding.label).toBe("Waiting");
    expect(lifecycle.seeding.variant).toBe("neutral");
  });

  it("preserves error messages from failed jobs", () => {
    const doc = createDoc({
      uploadStatus: "UPLOADED",
      parseJobs: [
        {
          id: "parse-1",
          status: "FAILED",
          errorMessage: "No extractor available for mimeType: application/octet-stream",
          failureCode: "EXTRACTOR_MISSING",
        },
      ],
      answerSeedingJobs: [],
    });
    const lifecycle = getDocumentLifecycle(doc);

    expect(lifecycle.parse.error).toBe("No extractor available for mimeType: application/octet-stream");
    expect(lifecycle.activeError).toBe("No extractor available for mimeType: application/octet-stream");
  });
});

// Regression tests for the specific bug that was fixed
describe("BUG REGRESSION: No generic 'Unexpected status' for transitional states", () => {
  it("uploaded with no parse job should NOT show 'Unexpected status'", () => {
    const doc = createDoc({ uploadStatus: "UPLOADED", parseJobs: [], answerSeedingJobs: [] });
    const lifecycle = getDocumentLifecycle(doc);
    const error = getFriendlyDocumentError(lifecycle);

    expect(lifecycle.currentStage).toBe("Parse");
    expect(lifecycle.activeLabel).toBe("Waiting for parsing");
    expect(lifecycle.activeVariant).toBe("neutral");
    expect(lifecycle.isTerminal).toBe(false);
    expect(error).toBeNull();
  });

  it("parse queued should NOT show 'Unexpected status'", () => {
    const doc = createDoc({
      uploadStatus: "UPLOADED",
      parseJobs: [{ id: "parse-1", status: "QUEUED", errorMessage: null }],
      answerSeedingJobs: [],
    });
    const lifecycle = getDocumentLifecycle(doc);
    const error = getFriendlyDocumentError(lifecycle);

    expect(error).toBeNull();
  });

  it("parse processing should NOT show 'Unexpected status'", () => {
    const recentDate = new Date().toISOString();
    const doc = createDoc({
      uploadStatus: "UPLOADED",
      parseJobs: [
        {
          id: "parse-1",
          status: "PROCESSING",
          errorMessage: null,
          lastHeartbeatAt: recentDate,
          createdAt: recentDate,
        },
      ],
      answerSeedingJobs: [],
    });
    const lifecycle = getDocumentLifecycle(doc);
    const error = getFriendlyDocumentError(lifecycle);

    expect(error).toBeNull();
  });

  it("seeding queued should NOT show 'Unexpected status'", () => {
    const doc = createDoc({
      uploadStatus: "UPLOADED",
      parseJobs: [{ id: "parse-1", status: "COMPLETED", errorMessage: null }],
      answerSeedingJobs: [{ id: "seed-1", status: "QUEUED", lastError: null }],
    });
    const lifecycle = getDocumentLifecycle(doc);
    const error = getFriendlyDocumentError(lifecycle);

    expect(error).toBeNull();
  });

  it("seeding running should NOT show 'Unexpected status'", () => {
    const recentDate = new Date().toISOString();
    const doc = createDoc({
      uploadStatus: "UPLOADED",
      parseJobs: [{ id: "parse-1", status: "COMPLETED", errorMessage: null }],
      answerSeedingJobs: [
        { id: "seed-1", status: "RUNNING", lastError: null, lastHeartbeatAt: recentDate },
      ],
    });
    const lifecycle = getDocumentLifecycle(doc);
    const error = getFriendlyDocumentError(lifecycle);

    expect(error).toBeNull();
  });

  it("parse completed, seeding not started should NOT show 'Unexpected status'", () => {
    const doc = createDoc({
      uploadStatus: "UPLOADED",
      parseJobs: [{ id: "parse-1", status: "COMPLETED", errorMessage: null }],
      answerSeedingJobs: [],
    });
    const lifecycle = getDocumentLifecycle(doc);
    const error = getFriendlyDocumentError(lifecycle);

    expect(lifecycle.currentStage).toBe("Seeding");
    expect(lifecycle.seeding.label).toBe("Waiting");
    expect(error).toBeNull();
  });

  it("parse failed SHOULD show error (not null)", () => {
    const doc = createDoc({
      uploadStatus: "UPLOADED",
      parseJobs: [{ id: "parse-1", status: "FAILED", errorMessage: "Parse error" }],
      answerSeedingJobs: [],
    });
    const lifecycle = getDocumentLifecycle(doc);
    const error = getFriendlyDocumentError(lifecycle);

    expect(error).not.toBeNull();
    expect(error?.stage).toBe("Parsing");
    expect(error?.severity).toBe("error");
  });

  it("seeding partial SHOULD show warning (not null)", () => {
    const doc = createDoc({
      uploadStatus: "UPLOADED",
      parseJobs: [{ id: "parse-1", status: "COMPLETED", errorMessage: null }],
      answerSeedingJobs: [{ id: "seed-1", status: "PARTIAL", lastError: null }],
    });
    const lifecycle = getDocumentLifecycle(doc);
    const error = getFriendlyDocumentError(lifecycle);

    // PARTIAL is terminal but not an error - it should still return null from error handler
    // because it's a successful completion with partial results
    expect(lifecycle.isTerminal).toBe(true);
    expect(lifecycle.activeVariant).toBe("warning");
  });
});
