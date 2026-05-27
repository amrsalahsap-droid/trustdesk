import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma, uncheckedPrisma } from "@/lib/db/prisma";
import { enqueueParseJob, runParseJob } from "../parse-job-service";
import { AUDIT_EVENT_TYPES, recordAuditEventSafe } from "@/lib/audit";

vi.mock("@/lib/storage/storage-service", () => ({
  downloadObject: vi.fn().mockResolvedValue(Buffer.from("plain text body")),
}));

vi.mock("../chunking-service", () => ({
  ChunkingService: {
    runChunking: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    sourceDocumentParseJob: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    sourceDocumentContent: {
      upsert: vi.fn().mockResolvedValue({}),
    },
  },
  uncheckedPrisma: {
    sourceDocumentParseJob: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/lib/audit", () => ({
  AUDIT_EVENT_TYPES: {
    SOURCE_DOCUMENT_PARSE_JOB_CREATED: "CREATED",
    SOURCE_DOCUMENT_PARSE_JOB_STARTED: "STARTED",
    SOURCE_DOCUMENT_PARSE_JOB_COMPLETED: "COMPLETED",
    SOURCE_DOCUMENT_PARSE_JOB_FAILED: "FAILED",
  },
  AUDIT_OBJECT_TYPES: {
    SOURCE_DOCUMENT_PARSE_JOB: "SourceDocumentParseJob",
  },
  recordAuditEventSafe: vi.fn(),
}));

vi.mock("@/lib/logging/logger", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock("@/modules/workspaces/intelligence/answer-seeding-job-service", () => ({
  enqueueAnswerSeedingAfterParse: vi.fn().mockResolvedValue({ jobId: "seed-job-1" }),
}));

vi.mock("../classification-service", () => ({
  ClassificationService: {
    classifyDocumentChunks: vi.fn().mockResolvedValue(0),
  },
}));

describe("Parse Job Queue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("enqueueParseJob", () => {
    it("creates a job and records an audit event", async () => {
      const mockJob = { id: "job-1", status: "QUEUED" };
      (prisma.sourceDocumentParseJob.create as any).mockResolvedValue(mockJob);

      const result = await enqueueParseJob({
        workspaceId: "ws-1",
        sourceDocumentId: "doc-1",
        triggeredById: "user-1",
      });

      expect(prisma.sourceDocumentParseJob.create).toHaveBeenCalledWith({
        data: {
          workspaceId: "ws-1",
          sourceDocumentId: "doc-1",
          triggeredById: "user-1",
          status: "QUEUED",
        },
      });
      expect(recordAuditEventSafe).toHaveBeenCalledWith(expect.objectContaining({
        eventType: "CREATED",
        objectId: "job-1",
      }));
      expect(result.id).toBe("job-1");
    });
  });

  describe("runParseJob", () => {
    it("transitions through processing and completed states", async () => {
      const mockBaseJob = {
        id: "job-1",
        workspaceId: "ws-1",
        sourceDocumentId: "doc-1",
        triggeredById: "user-1",
        retryCount: 0,
      };
      const mockJob = {
        id: "job-1",
        status: "QUEUED",
        workspaceId: "ws-1",
        sourceDocumentId: "doc-1",
        triggeredById: "user-1",
        sourceDocument: {
          storageKey: "ws-1/documents/test.txt",
          mimeType: "text/plain",
        },
      };
      (uncheckedPrisma.sourceDocumentParseJob.findUnique as any).mockResolvedValue(mockBaseJob);
      (prisma.sourceDocumentParseJob.findUnique as any).mockResolvedValue(mockJob);
      (prisma.sourceDocumentParseJob.update as any).mockResolvedValue({ ...mockJob, status: "COMPLETED" });

      await runParseJob("job-1");

      // Verify status transitions
      expect(prisma.sourceDocumentParseJob.update).toHaveBeenCalledWith({
        where: { id: "job-1", workspaceId: "ws-1" },
        data: expect.objectContaining({ status: "PROCESSING" }),
      });
      expect(prisma.sourceDocumentParseJob.update).toHaveBeenCalledWith({
        where: { id: "job-1", workspaceId: "ws-1" },
        data: expect.objectContaining({ status: "COMPLETED" }),
      });

      // Verify audit events
      expect(recordAuditEventSafe).toHaveBeenCalledWith(expect.objectContaining({ eventType: "STARTED" }));
      expect(recordAuditEventSafe).toHaveBeenCalledWith(expect.objectContaining({ eventType: "COMPLETED" }));
    });

    it("marks job as FAILED if an error occurs", async () => {
      const mockBaseJob = {
        id: "job-1",
        workspaceId: "ws-1",
        sourceDocumentId: "doc-1",
        triggeredById: "user-1",
        retryCount: 0,
      };
      const mockJob = {
        id: "job-1",
        status: "QUEUED",
        workspaceId: "ws-1",
        triggeredById: "user-1",
        sourceDocument: {
          storageKey: "ws-1/documents/test.txt",
          mimeType: "text/plain",
        },
      };
      (uncheckedPrisma.sourceDocumentParseJob.findUnique as any).mockResolvedValue(mockBaseJob);
      (prisma.sourceDocumentParseJob.findUnique as any).mockResolvedValue(mockJob);
      (prisma.sourceDocumentParseJob.update as any).mockImplementationOnce(() => {
          throw new Error("Parsing engine crashed");
      });

      await runParseJob("job-1");

      // The error is caught and status is set to FAILED with more fields now
      const updateCalls = (prisma.sourceDocumentParseJob.update as any).mock.calls;
      const lastCall = updateCalls[updateCalls.length - 1];
      expect(lastCall[0].where).toEqual({ id: "job-1", workspaceId: "ws-1" });
      expect(lastCall[0].data.status).toBe("FAILED");
      expect(lastCall[0].data.errorMessage).toBe("Parsing engine crashed");

      expect(recordAuditEventSafe).toHaveBeenCalledWith(expect.objectContaining({
        eventType: "FAILED",
        metadata: { error: "Parsing engine crashed" }
      }));
    });
  });
});
