import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { testUploadSourceDocument } from "../test-upload-source-document";
import { InsufficientRoleError } from "@/lib/auth/errors";
import type { AuthContext } from "@/lib/auth/types";
import { StorageUploadError } from "@/lib/storage/errors";

vi.mock("@/lib/storage/s3-object-service", () => ({
  uploadObject: vi.fn(),
  deleteObject: vi.fn(),
  getSignedDownloadUrl: vi.fn(),
  resetS3ClientForTests: vi.fn(),
}));

vi.mock("@/lib/storage/storage-env", () => ({
  requireStorageConfig: vi.fn(() => ({
    bucket: "test-bucket",
    region: "us-east-1",
    endpoint: "http://127.0.0.1:9000",
    accessKeyId: "access",
    secretAccessKey: "secret",
    forcePathStyle: true,
  })),
}));

import { uploadObject, deleteObject } from "@/lib/storage/s3-object-service";

const mockCreate = vi.mocked(prisma.sourceDocument.create);
const mockUpdateMany = vi.mocked(prisma.sourceDocument.updateMany);
const mockAuditCreate = vi.mocked(prisma.auditEvent.create);
const mockUpload = vi.mocked(uploadObject);
const mockDelete = vi.mocked(deleteObject);

const ctx: AuthContext = {
  userId: "u1",
  workspaceId: "ws-a",
  membershipId: "m1",
  role: "EDITOR",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("testUploadSourceDocument", () => {
  it("creates PENDING row, uploads, then marks UPLOADED", async () => {
    mockCreate.mockResolvedValue({} as never);
    mockUpdateMany.mockResolvedValue({ count: 1 } as never);
    mockUpload.mockResolvedValue(undefined);

    const buf = new TextEncoder().encode("%PDF-1.4 minimal");
    const result = await testUploadSourceDocument(ctx, {
      buffer: buf,
      originalName: "report.pdf",
      mimeType: "application/pdf",
      byteLength: buf.byteLength,
    });

    expect(result.id).toBeDefined();
    expect(result.storageKey).toContain("workspaces/ws-a/source-documents/");
    expect(result.storageKey).toContain("/report.pdf");
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          workspaceId: "ws-a",
          uploadedById: "u1",
          uploadStatus: "PENDING",
          storageBucket: "test-bucket",
          mimeType: "application/pdf",
        }),
      }),
    );
    expect(mockUpload).toHaveBeenCalled();
    expect(mockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ workspaceId: "ws-a" }),
        data: { uploadStatus: "UPLOADED" },
      }),
    );
    expect(mockAuditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ eventType: "SOURCE_DOCUMENT_RECORD_CREATED" }),
    });
    expect(mockAuditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ eventType: "SOURCE_DOCUMENT_UPLOAD_STARTED" }),
    });
    expect(mockAuditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ eventType: "SOURCE_DOCUMENT_UPLOAD_SUCCEEDED" }),
    });
  });

  it("marks FAILED and attempts delete when upload fails", async () => {
    mockCreate.mockResolvedValue({} as never);
    mockUpdateMany.mockResolvedValue({ count: 1 } as never);
    mockUpload.mockRejectedValue(new StorageUploadError());
    mockDelete.mockResolvedValue(undefined);

    const buf = new TextEncoder().encode("%PDF-1.4");
    await expect(
      testUploadSourceDocument(ctx, {
        buffer: buf,
        originalName: "a.pdf",
        mimeType: "application/pdf",
        byteLength: buf.byteLength,
      }),
    ).rejects.toThrow(StorageUploadError);

    expect(mockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { uploadStatus: "FAILED" },
      }),
    );
    expect(mockDelete).toHaveBeenCalled();
    expect(mockAuditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ eventType: "SOURCE_DOCUMENT_UPLOAD_FAILED" }),
    });
  });

  it("rejects VIEWER", async () => {
    await expect(
      testUploadSourceDocument(
        { ...ctx, role: "VIEWER" },
        {
          buffer: new Uint8Array([1]),
          originalName: "a.pdf",
          mimeType: "application/pdf",
          byteLength: 1,
        },
      ),
    ).rejects.toThrow(InsufficientRoleError);

    expect(mockCreate).not.toHaveBeenCalled();
  });
});
