import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/build-context", () => ({
  buildAuthContext: vi.fn(),
}));

vi.mock("@/modules/documents", () => ({
  getSourceDocumentById: vi.fn(),
}));

import { buildAuthContext } from "@/lib/auth/build-context";
import { getSourceDocumentById } from "@/modules/documents";
import { GET } from "@/app/api/app/documents/[id]/route";

const mockBuildContext = vi.mocked(buildAuthContext);
const mockGetDoc = vi.mocked(getSourceDocumentById);

const ctx = {
  userId: "u1",
  workspaceId: "ws-a",
  membershipId: "m1",
  role: "EDITOR" as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockBuildContext.mockReset();
});

describe("GET /api/app/documents/[id]", () => {
  it("returns 200 with document payload", async () => {
    mockBuildContext.mockResolvedValue(ctx);
    const createdAt = new Date("2026-01-01T00:00:00.000Z");
    const updatedAt = new Date("2026-01-02T00:00:00.000Z");
    mockGetDoc.mockResolvedValue({
      id: "doc-1",
      fileName: "a.pdf",
      originalName: "a.pdf",
      mimeType: "application/pdf",
      fileSizeBytes: 12,
      storageKey: "k",
      storageBucket: "b",
      uploadStatus: "UPLOADED",
      createdAt,
      updatedAt,
    });

    const req = new Request("http://localhost/api/app/documents/doc-1");
    const res = await GET(req, { params: Promise.resolve({ id: "doc-1" }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.id).toBe("doc-1");
    expect(body.uploadStatus).toBe("UPLOADED");
    expect(mockGetDoc).toHaveBeenCalledWith(ctx, "doc-1");
  });

  it("returns 404 when document is not in workspace", async () => {
    mockBuildContext.mockResolvedValue(ctx);
    const { ScopedResourceNotFoundError } = await import(
      "@/lib/domain/scoped-resource-not-found"
    );
    mockGetDoc.mockRejectedValue(new ScopedResourceNotFoundError());

    const req = new Request("http://localhost/api/app/documents/doc-x");
    const res = await GET(req, { params: Promise.resolve({ id: "doc-x" }) });
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error.code).toBe("RESOURCE_NOT_FOUND");
  });
});
