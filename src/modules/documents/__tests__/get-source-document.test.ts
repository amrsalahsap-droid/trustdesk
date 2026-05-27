import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    sourceDocument: {
      findFirst: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/db/prisma";
import { getSourceDocumentById } from "../get-source-document";
import { ScopedResourceNotFoundError } from "@/lib/domain/scoped-resource-not-found";
import type { AuthContext } from "@/lib/auth/types";

const mockFindFirst = vi.mocked(prisma.sourceDocument.findFirst);

const ctxA: AuthContext = {
  userId: "u1",
  workspaceId: "ws-a",
  membershipId: "m1",
  role: "EDITOR",
};

const ctxB: AuthContext = {
  userId: "u2",
  workspaceId: "ws-b",
  membershipId: "m2",
  role: "EDITOR",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getSourceDocumentById", () => {
  it("returns the document when it belongs to the workspace", async () => {
    const createdAt = new Date("2026-01-01T00:00:00.000Z");
    const updatedAt = new Date("2026-01-02T00:00:00.000Z");
    mockFindFirst.mockResolvedValue({
      id: "doc-1",
      fileName: "f.pdf",
      originalName: "f.pdf",
      mimeType: "application/pdf",
      fileSizeBytes: 3,
      storageKey: "k",
      storageBucket: "b",
      uploadStatus: "UPLOADED",
      createdAt,
      updatedAt,
    } as never);

    const doc = await getSourceDocumentById(ctxA, "doc-1");

    expect(doc.id).toBe("doc-1");
    expect(mockFindFirst).toHaveBeenCalledWith({
      where: {
        id: "doc-1",
        workspaceId: "ws-a",
      },
      select: {
        id: true,
        fileName: true,
        originalName: true,
        mimeType: true,
        fileSizeBytes: true,
        storageKey: true,
        storageBucket: true,
        uploadStatus: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  });

  it("throws ScopedResourceNotFoundError when id exists only in another workspace (same id, no row)", async () => {
    mockFindFirst.mockResolvedValue(null);

    await expect(getSourceDocumentById(ctxB, "doc-1")).rejects.toThrow(ScopedResourceNotFoundError);

    expect(mockFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "doc-1",
          workspaceId: "ws-b",
        },
      }),
    );
  });
});
