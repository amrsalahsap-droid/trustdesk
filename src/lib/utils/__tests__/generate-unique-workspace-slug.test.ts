import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { generateUniqueWorkspaceSlug } from "../generate-unique-workspace-slug";

const mockFindMany = vi.mocked(prisma.workspace.findMany);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("generateUniqueWorkspaceSlug", () => {
  it("returns base slug when unused", async () => {
    mockFindMany.mockResolvedValue([]);

    await expect(generateUniqueWorkspaceSlug("Acme Inc")).resolves.toBe("acme-inc");
  });

  it("appends -2 when base slug is taken", async () => {
    mockFindMany.mockResolvedValue([{ slug: "acme-inc" }] as never);

    await expect(generateUniqueWorkspaceSlug("Acme Inc")).resolves.toBe("acme-inc-2");
  });

  it("throws when slugify produces empty string", async () => {
    mockFindMany.mockResolvedValue([]);

    await expect(generateUniqueWorkspaceSlug("   ")).rejects.toThrow("WORKSPACE_SLUG_EMPTY");
  });
});
