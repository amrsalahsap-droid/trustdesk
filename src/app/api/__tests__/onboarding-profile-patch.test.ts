import { describe, it, expect, vi, beforeEach } from "vitest";
import { ProfileFieldStatus } from "@prisma/client";

vi.mock("@/lib/auth/resolve-identity", () => ({
  resolveUserIdentity: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    workspaceMembership: {
      findFirst: vi.fn(),
    },
    workspaceProfileField: {
      findUnique: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
    },
    workspace: {
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/audit", () => ({
  recordAuditEventSafe: vi.fn(),
  AUDIT_EVENT_TYPES: {
    SIGNAL_CONFIRMED: "SIGNAL_CONFIRMED",
  },
  AUDIT_OBJECT_TYPES: {
    WORKSPACE: "Workspace",
  },
}));

import { resolveUserIdentity } from "@/lib/auth/resolve-identity";
import { prisma } from "@/lib/db/prisma";
import { recordAuditEventSafe } from "@/lib/audit";
import { PATCH } from "@/app/api/onboarding/profile/route";

const mockResolveIdentity = vi.mocked(resolveUserIdentity);
const mockPrisma = vi.mocked(prisma);
const mockAudit = vi.mocked(recordAuditEventSafe);

describe("PATCH /api/onboarding/profile - Field-level updates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function makePatchRequest(body: object): Request {
    return new Request("http://localhost/api/onboarding/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("successfully updates industry field with EDITED status", async () => {
    mockResolveIdentity.mockResolvedValue({ userId: "user-1" });

    mockPrisma.workspaceMembership.findFirst.mockResolvedValue({
      id: "mem-1",
      workspaceId: "ws-1",
      userId: "user-1",
      role: "OWNER",
      status: "ACTIVE",
    } as any);

    mockPrisma.workspaceProfileField.findUnique.mockResolvedValue({
      id: "pf-1",
      fieldKey: "industry",
      suggestedValue: ["software"],
      confirmedValue: null,
      status: ProfileFieldStatus.SUGGESTED,
    } as any);

    mockPrisma.workspaceProfileField.update.mockResolvedValue({} as any);
    mockPrisma.workspaceProfileField.findMany.mockResolvedValue([
      {
        fieldKey: "industry",
        confirmedValue: ["fintech"],
        status: ProfileFieldStatus.EDITED,
      },
    ] as any);
    mockPrisma.workspace.update.mockResolvedValue({} as any);

    const res = await PATCH(
      makePatchRequest({
        workspaceId: "ws-1",
        fieldKey: "industry",
        value: ["fintech"],
        status: ProfileFieldStatus.EDITED,
      })
    );

    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.message).toContain("industry");

    expect(mockPrisma.workspaceProfileField.update).toHaveBeenCalledWith({
      where: {
        workspaceId_fieldKey: {
          workspaceId: "ws-1",
          fieldKey: "industry",
        },
      },
      data: expect.objectContaining({
        confirmedValue: ["fintech"],
        status: ProfileFieldStatus.EDITED,
        confirmedAt: expect.any(Date),
      }),
    });

    expect(mockAudit).toHaveBeenCalled();
  });

  it("successfully resolves conflicted field with CONFIRMED status", async () => {
    mockResolveIdentity.mockResolvedValue({ userId: "user-1" });

    mockPrisma.workspaceMembership.findFirst.mockResolvedValue({
      id: "mem-1",
      role: "OWNER",
      status: "ACTIVE",
    } as any);

    mockPrisma.workspaceProfileField.findUnique.mockResolvedValue({
      id: "pf-1",
      fieldKey: "industry",
      suggestedValue: ["software"],
      status: ProfileFieldStatus.NEEDS_REVIEW,
      sourceType: "CONFLICTED",
      conflictInfo: {
        hasConflict: true,
        rival: { value: "healthtech", confidence: 0.72 },
      },
    } as any);

    mockPrisma.workspaceProfileField.update.mockResolvedValue({} as any);
    mockPrisma.workspaceProfileField.findMany.mockResolvedValue([
      {
        fieldKey: "industry",
        confirmedValue: ["software"],
        status: ProfileFieldStatus.CONFIRMED,
      },
    ] as any);
    mockPrisma.workspace.update.mockResolvedValue({} as any);

    const res = await PATCH(
      makePatchRequest({
        workspaceId: "ws-1",
        fieldKey: "industry",
        value: ["software"],
        status: ProfileFieldStatus.CONFIRMED,
      })
    );

    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.field).toBeDefined();
  });

  it("returns 400 for invalid request body", async () => {
    mockResolveIdentity.mockResolvedValue({ userId: "user-1" });

    const res = await PATCH(
      makePatchRequest({
        workspaceId: "ws-1",
        // missing fieldKey, value, status
      })
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid body");
  });

  it("returns 403 for unauthorized user", async () => {
    mockResolveIdentity.mockResolvedValue({ userId: "user-1" });

    mockPrisma.workspaceMembership.findFirst.mockResolvedValue(null);

    const res = await PATCH(
      makePatchRequest({
        workspaceId: "ws-1",
        fieldKey: "industry",
        value: ["fintech"],
        status: ProfileFieldStatus.EDITED,
      })
    );

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("updates productType field successfully", async () => {
    mockResolveIdentity.mockResolvedValue({ userId: "user-1" });

    mockPrisma.workspaceMembership.findFirst.mockResolvedValue({
      id: "mem-1",
      role: "ADMIN",
      status: "ACTIVE",
    } as any);

    mockPrisma.workspaceProfileField.findUnique.mockResolvedValue({
      id: "pf-2",
      fieldKey: "productType",
      suggestedValue: ["saas"],
      status: ProfileFieldStatus.SUGGESTED,
    } as any);

    mockPrisma.workspaceProfileField.update.mockResolvedValue({} as any);
    mockPrisma.workspaceProfileField.findMany.mockResolvedValue([
      {
        fieldKey: "productType",
        confirmedValue: ["on-premise"],
        status: ProfileFieldStatus.EDITED,
      },
    ] as any);
    mockPrisma.workspace.update.mockResolvedValue({} as any);

    const res = await PATCH(
      makePatchRequest({
        workspaceId: "ws-1",
        fieldKey: "productType",
        value: ["on-premise"],
        status: ProfileFieldStatus.EDITED,
      })
    );

    expect(res.status).toBe(200);
    expect(mockPrisma.workspace.update).toHaveBeenCalledWith({
      where: { id: "ws-1" },
      data: expect.objectContaining({
        productType: ["on-premise"],
      }),
    });
  });

  it("updates complianceTargets field successfully", async () => {
    mockResolveIdentity.mockResolvedValue({ userId: "user-1" });

    mockPrisma.workspaceMembership.findFirst.mockResolvedValue({
      id: "mem-1",
      role: "OWNER",
      status: "ACTIVE",
    } as any);

    mockPrisma.workspaceProfileField.findUnique.mockResolvedValue({
      id: "pf-3",
      fieldKey: "complianceTargets",
      suggestedValue: ["soc2"],
      status: ProfileFieldStatus.SUGGESTED,
    } as any);

    mockPrisma.workspaceProfileField.update.mockResolvedValue({} as any);
    mockPrisma.workspaceProfileField.findMany.mockResolvedValue([
      {
        fieldKey: "complianceTargets",
        confirmedValue: ["soc2", "iso27001"],
        status: ProfileFieldStatus.EDITED,
      },
    ] as any);
    mockPrisma.workspace.update.mockResolvedValue({} as any);

    const res = await PATCH(
      makePatchRequest({
        workspaceId: "ws-1",
        fieldKey: "complianceTargets",
        value: ["soc2", "iso27001"],
        status: ProfileFieldStatus.EDITED,
      })
    );

    expect(res.status).toBe(200);
    expect(mockPrisma.workspace.update).toHaveBeenCalledWith({
      where: { id: "ws-1" },
      data: expect.objectContaining({
        complianceTargets: ["soc2", "iso27001"],
      }),
    });
  });

  it("marks field as NEEDS_REVIEW when user is unsure", async () => {
    mockResolveIdentity.mockResolvedValue({ userId: "user-1" });

    mockPrisma.workspaceMembership.findFirst.mockResolvedValue({
      id: "mem-1",
      role: "OWNER",
      status: "ACTIVE",
    } as any);

    mockPrisma.workspaceProfileField.findUnique.mockResolvedValue({
      id: "pf-1",
      fieldKey: "industry",
      suggestedValue: ["software"],
      status: ProfileFieldStatus.SUGGESTED,
    } as any);

    mockPrisma.workspaceProfileField.update.mockResolvedValue({} as any);
    mockPrisma.workspaceProfileField.findMany.mockResolvedValue([] as any);

    const res = await PATCH(
      makePatchRequest({
        workspaceId: "ws-1",
        fieldKey: "industry",
        value: [],
        status: ProfileFieldStatus.NEEDS_REVIEW,
      })
    );

    expect(res.status).toBe(200);
    expect(mockPrisma.workspaceProfileField.update).toHaveBeenCalledWith({
      where: {
        workspaceId_fieldKey: {
          workspaceId: "ws-1",
          fieldKey: "industry",
        },
      },
      data: expect.objectContaining({
        confirmedValue: [],
        status: ProfileFieldStatus.NEEDS_REVIEW,
      }),
    });
  });
});
