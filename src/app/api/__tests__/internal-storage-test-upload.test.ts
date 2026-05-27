import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/auth/build-context", () => ({
  buildAuthContext: vi.fn(),
}));

vi.mock("@/modules/documents/test-upload-source-document", () => ({
  testUploadSourceDocument: vi.fn(),
}));

import { buildAuthContext } from "@/lib/auth/build-context";
import { testUploadSourceDocument } from "@/modules/documents/test-upload-source-document";
import { POST } from "@/app/api/internal/storage/test-upload/route";

const mockBuildContext = vi.mocked(buildAuthContext);
const mockUpload = vi.mocked(testUploadSourceDocument);

const ctx = {
  userId: "u1",
  workspaceId: "ws-a",
  membershipId: "m1",
  role: "EDITOR" as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockBuildContext.mockReset();
  delete process.env.STORAGE_TEST_UPLOAD_ENABLED;
});

afterEach(() => {
  delete process.env.STORAGE_TEST_UPLOAD_ENABLED;
});

describe("POST /api/internal/storage/test-upload", () => {
  it("returns 404 when test upload is disabled", async () => {
    process.env.STORAGE_TEST_UPLOAD_ENABLED = "false";
    mockBuildContext.mockResolvedValue(ctx);

    const form = new FormData();
    form.append("file", new File([new Uint8Array([1])], "a.pdf", { type: "application/pdf" }));

    const req = new Request("http://localhost/api/internal/storage/test-upload", {
      method: "POST",
      body: form,
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error.code).toBe("NOT_FOUND");
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it("returns 201 when enabled and upload succeeds", async () => {
    process.env.STORAGE_TEST_UPLOAD_ENABLED = "true";
    mockBuildContext.mockResolvedValue(ctx);
    mockUpload.mockResolvedValue({ id: "doc-1", storageKey: "workspaces/ws-a/..." });

    const form = new FormData();
    form.append("file", new File([new Uint8Array([37, 80, 68, 70])], "a.pdf", { type: "application/pdf" }));

    const req = new Request("http://localhost/api/internal/storage/test-upload", {
      method: "POST",
      body: form,
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.id).toBe("doc-1");
    expect(mockUpload).toHaveBeenCalled();
  });
});
