import { describe, it, expect } from "vitest";
import { sanitizeFilename } from "../sanitize-filename";

describe("sanitizeFilename", () => {
  it("strips path segments", () => {
    expect(sanitizeFilename("../../../etc/passwd")).toBe("passwd");
  });

  it("replaces unsafe characters", () => {
    expect(sanitizeFilename("my file (1).pdf")).toBe("my_file_1_.pdf");
  });

  it("returns unnamed for empty result", () => {
    expect(sanitizeFilename("...")).toBe("unnamed");
  });
});
