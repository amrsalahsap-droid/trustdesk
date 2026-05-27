import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { listAuditEventsForWorkspace } from "../list-audit-events";

const mockFindMany = vi.mocked(prisma.auditEvent.findMany);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("listAuditEventsForWorkspace", () => {
  it("filters by workspaceId and orders newest first", async () => {
    mockFindMany.mockResolvedValue([]);

    await listAuditEventsForWorkspace({ workspaceId: "ws-a", limit: 10 });

    expect(mockFindMany).toHaveBeenCalledWith({
      where: { workspaceId: "ws-a" },
      orderBy: { createdAt: "desc" },
      take: 10,
    });
  });

  it("caps limit at MAX", async () => {
    mockFindMany.mockResolvedValue([]);

    await listAuditEventsForWorkspace({ workspaceId: "ws-a", limit: 9999 });

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 500,
      }),
    );
  });
});
