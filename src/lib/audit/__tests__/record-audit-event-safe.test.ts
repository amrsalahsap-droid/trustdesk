import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logging/logger";
import { recordAuditEventSafe } from "../record-audit-event";

vi.mock("@/lib/logging/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const mockCreate = vi.mocked(prisma.auditEvent.create);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("recordAuditEventSafe", () => {
  it("does not throw when persistence fails", async () => {
    mockCreate.mockRejectedValue(new Error("db down"));

    await expect(
      recordAuditEventSafe({
        workspaceId: "ws-1",
        eventType: "TEST",
        objectType: "Test",
      }),
    ).resolves.toBeUndefined();

    expect(vi.mocked(logger.error)).toHaveBeenCalledWith(
      "audit:write-failed",
      expect.objectContaining({ eventType: "TEST" }),
    );
  });
});
