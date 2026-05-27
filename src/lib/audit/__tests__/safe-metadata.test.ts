import { describe, it, expect } from "vitest";
import { sanitizeAuditMetadata } from "../safe-metadata";

describe("sanitizeAuditMetadata", () => {
  it("strips dangerous keys", () => {
    const out = sanitizeAuditMetadata({
      password: "x",
      token: "y",
      slug: "acme",
    });
    expect(out).toEqual({ slug: "acme" });
  });

  it("returns undefined for empty after sanitization", () => {
    expect(sanitizeAuditMetadata({ password: "x" })).toBeUndefined();
  });
});
