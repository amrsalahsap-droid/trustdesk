import { describe, it, expect } from "vitest";
import { resolveDeepLinkActiveId } from "../deep-link";

const items = [
  { id: "item-1" },
  { id: "item-2" },
  { id: "item-3" },
];

describe("resolveDeepLinkActiveId", () => {
  it("returns the target id when present in the loaded list", () => {
    expect(resolveDeepLinkActiveId("item-2", items)).toBe("item-2");
  });

  it("returns null when no itemId query is present", () => {
    expect(resolveDeepLinkActiveId(null, items)).toBeNull();
  });

  it("returns null when questions are still loading (empty list)", () => {
    expect(resolveDeepLinkActiveId("item-2", [])).toBeNull();
  });

  it("returns null when the target itemId is not in the list (stale or cross-questionnaire link)", () => {
    expect(resolveDeepLinkActiveId("missing-id", items)).toBeNull();
  });
});
