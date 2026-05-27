import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { listAuditEventsForWorkspace } from "../list-audit-events";

const mockFindMany = vi.mocked(prisma.auditEvent.findMany);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("listAuditEventsForWorkspace isolation", () => {
  it("only queries the requested workspaceId", async () => {
    mockFindMany.mockResolvedValue([]);

    await listAuditEventsForWorkspace({ workspaceId: "ws-tenant-a" });

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId: "ws-tenant-a" },
      }),
    );
  });
});
