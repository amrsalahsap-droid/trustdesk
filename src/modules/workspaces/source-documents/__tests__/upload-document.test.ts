import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { uploadSourceDocument } from "../upload-document";
import { buildAuthContext } from "@/lib/auth/build-context";
import { uploadObject } from "@/lib/storage/s3-object-service";
import { validateUpload } from "@/lib/storage/validate-upload";

vi.mock("@/lib/auth/build-context");
vi.mock("@/lib/storage/s3-object-service");
vi.mock("@/lib/storage/validate-upload");
vi.mock("@/lib/audit", () => ({
  AUDIT_EVENT_TYPES: {
    SOURCE_DOCUMENT_UPLOAD_STARTED: "SOURCE_DOCUMENT_UPLOAD_STARTED",
    SOURCE_DOCUMENT_UPLOAD_SUCCEEDED: "SOURCE_DOCUMENT_UPLOAD_SUCCEEDED",
    SOURCE_DOCUMENT_UPLOAD_FAILED: "SOURCE_DOCUMENT_UPLOAD_FAILED",
  },
  AUDIT_OBJECT_TYPES: {
    SOURCE_DOCUMENT: "SourceDocument",
  },
  recordAuditEventSafe: vi.fn(),
}));
vi.mock("@/lib/storage/storage-env", () => ({
  requireStorageConfig: vi.fn().mockReturnValue({
    bucket: "test-bucket",
    region: "us-east-1",
    endpoint: "http://localhost:4566",
    accessKeyId: "test",
    secretAccessKey: "test",
    forcePathStyle: true,
  }),
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    sourceDocument: {
      create: vi.fn(),
      update: vi.fn(),
      findFirst: vi.fn(),
    },
    auditEvent: {
      create: vi.fn(),
    },
  },
}));

describe("uploadSourceDocument", () => {
  const mockFile = new File(["test content"], "test.pdf", { type: "application/pdf" });
  const mockRequest = new Request("http://localhost/api/documents", { method: "POST" });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("successfully uploads a new document", async () => {
    vi.mocked(buildAuthContext).mockResolvedValue({
      userId: "user-1",
      workspaceId: "ws-1",
      membershipId: "mem-1",
      role: "ADMIN",
    });

    vi.mocked(prisma.sourceDocument.findFirst).mockResolvedValue(null);

    vi.mocked(prisma.sourceDocument.create).mockResolvedValue({
      id: "doc-1",
      workspaceId: "ws-1",
      uploadedById: "user-1",
      originalName: "test.pdf",
      fileName: "test.pdf",
      mimeType: "application/pdf",
      fileSizeBytes: 12,
      storageKey: "pending",
      storageBucket: "pending",
      uploadStatus: "PENDING",
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    vi.mocked(prisma.sourceDocument.update).mockResolvedValue({
      id: "doc-1",
      uploadStatus: "UPLOADED",
    } as any);

    const result = await uploadSourceDocument({
      request: mockRequest,
      file: mockFile,
    });

    expect(prisma.sourceDocument.findFirst).toHaveBeenCalled();
    expect(prisma.sourceDocument.create).toHaveBeenCalled();
    expect(result.uploadStatus).toBe("UPLOADED");
  });

  it("re-uses existing record if filename matches", async () => {
    vi.mocked(buildAuthContext).mockResolvedValue({
      userId: "user-1",
      workspaceId: "ws-1",
      membershipId: "mem-1",
      role: "ADMIN",
    });

    // Existing doc found
    vi.mocked(prisma.sourceDocument.findFirst).mockResolvedValue({
      id: "existing-doc-123",
      originalName: "test.pdf",
      workspaceId: "ws-1",
    } as any);

    vi.mocked(prisma.sourceDocument.update).mockResolvedValue({
      id: "existing-doc-123",
      uploadStatus: "UPLOADED",
    } as any);

    const result = await uploadSourceDocument({
      request: mockRequest,
      file: mockFile,
    });

    // Should NOT call create
    expect(prisma.sourceDocument.create).not.toHaveBeenCalled();
    
    // Should call update for the existing ID
    expect(prisma.sourceDocument.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "existing-doc-123", workspaceId: "ws-1" },
      data: expect.objectContaining({ uploadStatus: "PENDING" })
    }));

    expect(result.id).toBe("existing-doc-123");
  });

  it("marks status as FAILED if storage upload fails", async () => {
    vi.mocked(buildAuthContext).mockResolvedValue({
      userId: "user-1",
      workspaceId: "ws-1",
      membershipId: "mem-1",
      role: "ADMIN",
    });

    vi.mocked(prisma.sourceDocument.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.sourceDocument.create).mockResolvedValue({
      id: "doc-1",
      workspaceId: "ws-1",
      uploadedById: "user-1",
      originalName: "test.pdf",
      fileName: "test.pdf",
      mimeType: "application/pdf",
      fileSizeBytes: 12,
      storageKey: "pending",
      storageBucket: "pending",
      uploadStatus: "PENDING",
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    vi.mocked(uploadObject).mockRejectedValue(new Error("S3 failed"));

    await expect(
      uploadSourceDocument({
        request: mockRequest,
        file: mockFile,
      }),
    ).rejects.toThrow("S3 failed");

    const { recordAuditEventSafe } = await import("@/lib/audit");
    expect(recordAuditEventSafe).toHaveBeenCalledWith(expect.objectContaining({
      eventType: "SOURCE_DOCUMENT_UPLOAD_FAILED",
    }));

    expect(prisma.sourceDocument.update).toHaveBeenCalledWith({
      where: { id: "doc-1", workspaceId: "ws-1" },
      data: { uploadStatus: "FAILED" },
    });
  });
});
