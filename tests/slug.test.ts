import { describe, it, expect } from "vitest";
import { slugify } from "@/lib/utils/slug";

describe("slugify", () => {
  it("normalizes a company name to a URL slug", () => {
    expect(slugify("Acme Inc")).toBe("acme-inc");
  });

  it("trims and collapses punctuation and spaces", () => {
    expect(slugify("  My Cool Workspace!  ")).toBe("my-cool-workspace");
  });
});
