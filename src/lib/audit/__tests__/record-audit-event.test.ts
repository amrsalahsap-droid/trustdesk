import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { recordAuditEvent } from "../record-audit-event";
import { AUDIT_EVENT_TYPES, AUDIT_OBJECT_TYPES } from "../audit-event-types";

const mockCreate = vi.mocked(prisma.auditEvent.create);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("recordAuditEvent", () => {
  it("persists a workspace-scoped event", async () => {
    mockCreate.mockResolvedValue({} as never);

    await recordAuditEvent({
      workspaceId: "ws-1",
      actorUserId: "u1",
      eventType: AUDIT_EVENT_TYPES.WORKSPACE_CREATED,
      objectType: AUDIT_OBJECT_TYPES.WORKSPACE,
      objectId: "ws-1",
      metadata: { slug: "acme" },
    });

    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        workspaceId: "ws-1",
        actorUserId: "u1",
        eventType: AUDIT_EVENT_TYPES.WORKSPACE_CREATED,
        objectType: AUDIT_OBJECT_TYPES.WORKSPACE,
        objectId: "ws-1",
        metadataJson: { slug: "acme" },
      },
    });
  });

  it("allows pre-tenant signup events without workspaceId", async () => {
    mockCreate.mockResolvedValue({} as never);

    await recordAuditEvent({
      actorUserId: "u1",
      eventType: AUDIT_EVENT_TYPES.USER_SIGNED_UP,
      objectType: AUDIT_OBJECT_TYPES.USER,
      objectId: "u1",
    });

    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: null,
        actorUserId: "u1",
        eventType: AUDIT_EVENT_TYPES.USER_SIGNED_UP,
      }),
    });
  });

  it("rejects empty eventType", async () => {
    await expect(
      recordAuditEvent({
        workspaceId: "ws-1",
        eventType: "",
        objectType: "X",
      }),
    ).rejects.toThrow();
  });
});
