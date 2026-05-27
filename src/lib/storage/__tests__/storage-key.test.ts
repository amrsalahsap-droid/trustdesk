import { describe, it, expect } from "vitest";
import { buildStorageKey } from "../storage-key";

describe("buildStorageKey", () => {
  it("includes workspace and document id and sanitized name", () => {
    const key = buildStorageKey("ws-1", "doc-abc", "Report Final.pdf");
    expect(key).toBe("workspaces/ws-1/source-documents/doc-abc/Report_Final.pdf");
  });
});
