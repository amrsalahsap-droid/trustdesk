import { describe, it, expect, vi, beforeEach } from "vitest";
import { ProfileFieldStatus, ProfileFieldSourceType } from "@prisma/client";

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    workspaceProfileField: {
      findUnique: vi.fn(),
      update: vi.fn(),
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
    SIGNAL_REJECTED: "SIGNAL_REJECTED",
  },
  AUDIT_OBJECT_TYPES: {
    WORKSPACE: "Workspace",
  },
}));

import { prisma } from "@/lib/db/prisma";
import { recordAuditEventSafe } from "@/lib/audit";
import { ProfileFieldService } from "@/modules/workspaces/profile-field-service";

const mockPrisma = vi.mocked(prisma);
const mockAudit = vi.mocked(recordAuditEventSafe);

describe("ProfileFieldService.updateField", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates field with EDITED status and marks as MANUAL", async () => {
    const workspaceId = "ws-123";
    const userId = "user-456";
    const fieldKey = "industry";
    const value = ["fintech"];

    mockPrisma.workspaceProfileField.findUnique.mockResolvedValue({
      id: "pf-1",
      workspaceId,
      fieldKey,
      suggestedValue: ["software"],
      confirmedValue: null,
      status: ProfileFieldStatus.SUGGESTED,
      sourceType: ProfileFieldSourceType.OBSERVED,
      confidence: 0.85,
    } as any);

    mockPrisma.workspaceProfileField.update.mockResolvedValue({} as any);
    mockPrisma.workspace.update.mockResolvedValue({} as any);

    await ProfileFieldService.updateField(
      workspaceId,
      userId,
      fieldKey,
      value,
      ProfileFieldStatus.EDITED,
      { preserveOriginal: true }
    );

    expect(mockPrisma.workspaceProfileField.update).toHaveBeenCalledWith({
      where: {
        workspaceId_fieldKey: {
          workspaceId,
          fieldKey,
        },
      },
      data: expect.objectContaining({
        confirmedValue: value,
        status: ProfileFieldStatus.EDITED,
        sourceType: ProfileFieldSourceType.MANUAL,
        confirmedAt: expect.any(Date),
        rejectedAt: null,
      }),
    });

    expect(mockAudit).toHaveBeenCalledWith({
      workspaceId,
      actorUserId: userId,
      eventType: "SIGNAL_CONFIRMED",
      objectType: "Workspace",
      objectId: workspaceId,
      metadata: expect.objectContaining({
        fieldKey,
        status: ProfileFieldStatus.EDITED,
        confirmedValue: value,
        previousStatus: ProfileFieldStatus.SUGGESTED,
      }),
    });

    // Should sync to workspace
    expect(mockPrisma.workspace.update).toHaveBeenCalled();
  });

  it("updates conflicted field with CONFIRMED status when user selects candidate", async () => {
    const workspaceId = "ws-123";
    const userId = "user-456";
    const fieldKey = "industry";
    const selectedValue = ["software"];

    mockPrisma.workspaceProfileField.findUnique.mockResolvedValue({
      id: "pf-1",
      workspaceId,
      fieldKey,
      suggestedValue: ["software"],
      confirmedValue: null,
      status: ProfileFieldStatus.NEEDS_REVIEW,
      sourceType: ProfileFieldSourceType.CONFLICTED,
      confidence: 0.75,
      conflictInfo: {
        hasConflict: true,
        rival: { value: "healthtech", confidence: 0.72 },
      },
    } as any);

    mockPrisma.workspaceProfileField.update.mockResolvedValue({} as any);
    mockPrisma.workspace.update.mockResolvedValue({} as any);

    await ProfileFieldService.updateField(
      workspaceId,
      userId,
      fieldKey,
      selectedValue,
      ProfileFieldStatus.CONFIRMED,
      { preserveOriginal: true }
    );

    expect(mockPrisma.workspaceProfileField.update).toHaveBeenCalledWith({
      where: {
        workspaceId_fieldKey: {
          workspaceId,
          fieldKey,
        },
      },
      data: expect.objectContaining({
        confirmedValue: selectedValue,
        status: ProfileFieldStatus.CONFIRMED,
        sourceType: ProfileFieldSourceType.MANUAL,
        confirmedAt: expect.any(Date),
      }),
    });
  });

  it("preserves original suggestedValue when preserveOriginal is true", async () => {
    const workspaceId = "ws-123";
    const userId = "user-456";
    const fieldKey = "industry";
    const originalValue = ["software"];
    const newValue = ["fintech"];

    mockPrisma.workspaceProfileField.findUnique.mockResolvedValue({
      id: "pf-1",
      workspaceId,
      fieldKey,
      suggestedValue: originalValue,
      confirmedValue: null,
      status: ProfileFieldStatus.SUGGESTED,
      sourceType: ProfileFieldSourceType.OBSERVED,
    } as any);

    mockPrisma.workspaceProfileField.update.mockResolvedValue({} as any);
    mockPrisma.workspace.update.mockResolvedValue({} as any);

    await ProfileFieldService.updateField(
      workspaceId,
      userId,
      fieldKey,
      newValue,
      ProfileFieldStatus.EDITED,
      { preserveOriginal: true }
    );

    // The suggestedValue should remain intact
    expect(mockPrisma.workspaceProfileField.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({
          suggestedValue: expect.anything(),
        }),
      })
    );
  });

  it("marks field as REJECTED with proper audit event", async () => {
    const workspaceId = "ws-123";
    const userId = "user-456";
    const fieldKey = "industry";

    mockPrisma.workspaceProfileField.findUnique.mockResolvedValue({
      id: "pf-1",
      workspaceId,
      fieldKey,
      suggestedValue: ["software"],
      confirmedValue: null,
      status: ProfileFieldStatus.SUGGESTED,
      sourceType: ProfileFieldSourceType.OBSERVED,
    } as any);

    mockPrisma.workspaceProfileField.update.mockResolvedValue({} as any);
    mockPrisma.workspace.update.mockResolvedValue({} as any);

    await ProfileFieldService.updateField(
      workspaceId,
      userId,
      fieldKey,
      null,
      ProfileFieldStatus.REJECTED
    );

    expect(mockPrisma.workspaceProfileField.update).toHaveBeenCalledWith({
      where: {
        workspaceId_fieldKey: {
          workspaceId,
          fieldKey,
        },
      },
      data: expect.objectContaining({
        confirmedValue: null,
        status: ProfileFieldStatus.REJECTED,
        rejectedAt: expect.any(Date),
        confirmedAt: null,
      }),
    });

    expect(mockAudit).toHaveBeenCalledWith({
      workspaceId,
      actorUserId: userId,
      eventType: "SIGNAL_REJECTED",
      objectType: "Workspace",
      objectId: workspaceId,
      metadata: expect.objectContaining({
        fieldKey,
        status: ProfileFieldStatus.REJECTED,
        confirmedValue: null,
      }),
    });
  });

  it("syncs confirmed values to workspace after update", async () => {
    const workspaceId = "ws-123";
    const userId = "user-456";

    mockPrisma.workspaceProfileField.findUnique.mockResolvedValue({
      id: "pf-1",
      workspaceId,
      fieldKey: "industry",
      suggestedValue: ["software"],
      confirmedValue: null,
      status: ProfileFieldStatus.SUGGESTED,
    } as any);

    mockPrisma.workspaceProfileField.update.mockResolvedValue({} as any);

    // Mock the findMany for syncConfirmedValuesToWorkspace
    mockPrisma.workspaceProfileField.findMany.mockResolvedValue([
      {
        fieldKey: "industry",
        confirmedValue: ["fintech"],
        status: ProfileFieldStatus.EDITED,
      },
    ] as any);

    mockPrisma.workspace.update.mockResolvedValue({} as any);

    await ProfileFieldService.updateField(
      workspaceId,
      userId,
      "industry",
      ["fintech"],
      ProfileFieldStatus.EDITED
    );

    // Should update workspace industry field
    expect(mockPrisma.workspace.update).toHaveBeenCalledWith({
      where: { id: workspaceId },
      data: expect.objectContaining({
        industry: ["fintech"],
      }),
    });
  });

  it("handles unknown field gracefully", async () => {
    const workspaceId = "ws-123";
    const userId = "user-456";

    mockPrisma.workspaceProfileField.findUnique.mockResolvedValue(null);

    await expect(
      ProfileFieldService.updateField(
        workspaceId,
        userId,
        "industry",
        ["fintech"],
        ProfileFieldStatus.EDITED
      )
    ).rejects.toThrow();
  });
});
