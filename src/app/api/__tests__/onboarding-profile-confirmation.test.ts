import { describe, it, expect, vi, beforeEach } from "vitest";
import { ProfileFieldStatus, ProfileFieldSourceType } from "@prisma/client";

vi.mock("@/lib/auth/resolve-identity", () => ({
  resolveUserIdentity: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    workspaceMembership: {
      findFirst: vi.fn(),
    },
    workspaceProfileField: {
      findMany: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    workspace: {
      update: vi.fn(),
    },
    $transaction: vi.fn((ops) => Promise.all(ops)),
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

vi.mock("@/modules/workspaces/onboarding/document-enrichment-service", () => ({
  DocumentEnrichmentService: {
    generateTailoredTemplate: vi.fn(),
  },
}));

import { resolveUserIdentity } from "@/lib/auth/resolve-identity";
import { prisma } from "@/lib/db/prisma";
import { POST } from "@/app/api/onboarding/profile/route";
import { ProfileFieldService, UnresolvedConflictsError } from "@/modules/workspaces/profile-field-service";

const mockResolveIdentity = vi.mocked(resolveUserIdentity);
const mockPrisma = vi.mocked(prisma);

describe("POST /api/onboarding/profile - Confirm All Hardening", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function makeConfirmAllRequest(workspaceId: string): Request {
    return new Request("http://localhost/api/onboarding/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspaceId,
        confirmAll: true,
      }),
    });
  }

  it("fails with 409 when unresolved conflicted industry exists", async () => {
    mockResolveIdentity.mockResolvedValue({ userId: "user-1" });
    
    // Mock workspace membership check
    mockPrisma.workspaceMembership.findFirst.mockResolvedValue({
      id: "mem-1",
      workspaceId: "ws-1",
      userId: "user-1",
      role: "OWNER",
    } as any);

    // Mock conflicted field data
    mockPrisma.workspaceProfileField.findMany.mockResolvedValue([
      {
        id: "pf-1",
        fieldKey: "industry",
        suggestedValue: ["software"],
        status: ProfileFieldStatus.NEEDS_REVIEW,
        sourceType: ProfileFieldSourceType.CONFLICTED,
        confidence: 0.75,
        conflictInfo: {
          hasConflict: true,
          rival: { value: "healthtech", confidence: 0.72 },
        },
      },
      {
        id: "pf-2",
        fieldKey: "productType",
        suggestedValue: ["saas"],
        status: ProfileFieldStatus.SUGGESTED,
        sourceType: ProfileFieldSourceType.OBSERVED,
        confidence: 0.85,
        conflictInfo: null,
      },
    ] as any);

    const res = await POST(makeConfirmAllRequest("ws-1"));
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error.code).toBe("UNRESOLVED_CONFLICTS");
    expect(body.error.unresolvedFields).toContain("industry");
    expect(body.error.unresolvedFieldDetails).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fieldKey: "industry",
          reason: "conflict",
          suggestedValue: ["software"],
        }),
      ])
    );
    // Verify no fields were confirmed
    expect(mockPrisma.workspaceProfileField.update).not.toHaveBeenCalled();
  });

  it("succeeds after user resolves conflicted field", async () => {
    mockResolveIdentity.mockResolvedValue({ userId: "user-1" });

    // First call - field is now resolved (user selected an industry)
    mockPrisma.workspaceProfileField.findMany
      .mockResolvedValueOnce([
        // After resolution, only safe fields remain
        {
          id: "pf-2",
          fieldKey: "productType",
          suggestedValue: ["saas"],
          status: ProfileFieldStatus.SUGGESTED,
          sourceType: ProfileFieldSourceType.OBSERVED,
          confidence: 0.85,
          conflictInfo: null,
        },
        {
          id: "pf-3",
          fieldKey: "customerSegment",
          suggestedValue: ["b2b"],
          status: ProfileFieldStatus.SUGGESTED,
          sourceType: ProfileFieldSourceType.DERIVED,
          confidence: 0.80,
          conflictInfo: null,
        },
      ] as any);

    // Mock the confirmation update
    mockPrisma.workspaceProfileField.update.mockResolvedValue({} as any);
    mockPrisma.workspace.update.mockResolvedValue({} as any);

    const res = await POST(makeConfirmAllRequest("ws-1"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.confirmed).toContain("productType");
    expect(body.confirmed).toContain("customerSegment");
    expect(body.message).toContain("Confirmed 2 fields");
    
    // Verify fields were confirmed
    expect(mockPrisma.workspaceProfileField.update).toHaveBeenCalledTimes(2);
  });

  it("fails with 409 when low-confidence fields exist", async () => {
    mockResolveIdentity.mockResolvedValue({ userId: "user-1" });

    mockPrisma.workspaceMembership.findFirst.mockResolvedValue({
      id: "mem-1",
      role: "OWNER",
    } as any);

    // Low confidence fields should block confirmation
    mockPrisma.workspaceProfileField.findMany.mockResolvedValue([
      {
        id: "pf-1",
        fieldKey: "industry",
        suggestedValue: ["software"],
        status: ProfileFieldStatus.SUGGESTED,
        sourceType: ProfileFieldSourceType.HYPOTHESIZED,
        confidence: 0.35, // Below 40% threshold
        conflictInfo: null,
      },
    ] as any);

    const res = await POST(makeConfirmAllRequest("ws-1"));
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error.code).toBe("UNRESOLVED_CONFLICTS");
    expect(body.error.unresolvedFields).toContain("industry");
    expect(body.error.unresolvedFieldDetails[0].reason).toBe("low_confidence");
  });

  it("blocks confirmation with multiple unresolved fields", async () => {
    mockResolveIdentity.mockResolvedValue({ userId: "user-1" });

    mockPrisma.workspaceMembership.findFirst.mockResolvedValue({
      id: "mem-1",
      role: "OWNER",
    } as any);

    mockPrisma.workspaceProfileField.findMany.mockResolvedValue([
      {
        id: "pf-1",
        fieldKey: "industry",
        suggestedValue: ["software"],
        status: ProfileFieldStatus.NEEDS_REVIEW,
        sourceType: ProfileFieldSourceType.CONFLICTED,
        confidence: 0.75,
        conflictInfo: { hasConflict: true },
      },
      {
        id: "pf-2",
        fieldKey: "productType",
        suggestedValue: ["saas"],
        status: ProfileFieldStatus.NEEDS_REVIEW,
        sourceType: ProfileFieldSourceType.HYPOTHESIZED,
        confidence: 0.30, // Low confidence
        conflictInfo: null,
      },
      {
        id: "pf-3",
        fieldKey: "dataTypes",
        suggestedValue: ["pii"],
        status: ProfileFieldStatus.NEEDS_REVIEW,
        sourceType: ProfileFieldSourceType.UNKNOWN,
        confidence: 0.50,
        conflictInfo: null,
      },
    ] as any);

    const res = await POST(makeConfirmAllRequest("ws-1"));
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error.unresolvedFields).toHaveLength(3);
    
    // Check reasons are included
    const reasons = body.error.unresolvedFieldDetails.map((f: any) => f.reason);
    expect(reasons).toContain("conflict");
    expect(reasons).toContain("low_confidence");
    expect(reasons).toContain("needs_review");
  });

  it("allows field-level confirmation to resolve conflicted field", async () => {
    mockResolveIdentity.mockResolvedValue({ userId: "user-1" });

    mockPrisma.workspaceMembership.findFirst.mockResolvedValue({
      id: "mem-1",
      role: "OWNER",
    } as any);

    // User manually selects "software" for the conflicted industry field
    const res = await POST(new Request("http://localhost/api/onboarding/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspaceId: "ws-1",
        industry: ["software"], // User's manual selection
        fieldConfirmations: [
          {
            fieldKey: "industry",
            confirmedValue: ["software"],
            status: ProfileFieldStatus.CONFIRMED,
          },
        ],
      }),
    }));

    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it("allows manual edit status for conflicted field", async () => {
    mockResolveIdentity.mockResolvedValue({ userId: "user-1" });

    mockPrisma.workspaceMembership.findFirst.mockResolvedValue({
      id: "mem-1",
      role: "OWNER",
    } as any);

    mockPrisma.workspaceProfileField.update.mockResolvedValue({} as any);
    mockPrisma.workspace.update.mockResolvedValue({} as any);

    // User chooses a different value than what AI suggested
    const res = await POST(new Request("http://localhost/api/onboarding/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspaceId: "ws-1",
        industry: ["fintech"], // User overrides AI
        productType: ["saas"],
        fieldConfirmations: [
          {
            fieldKey: "industry",
            confirmedValue: ["fintech"],
            status: ProfileFieldStatus.EDITED, // Mark as edited
          },
          {
            fieldKey: "productType",
            confirmedValue: ["saas"],
            status: ProfileFieldStatus.CONFIRMED,
          },
        ],
      }),
    }));

    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it("rejects blind confirmation of unknown fields", async () => {
    mockResolveIdentity.mockResolvedValue({ userId: "user-1" });

    mockPrisma.workspaceMembership.findFirst.mockResolvedValue({
      id: "mem-1",
      role: "OWNER",
    } as any);

    // Field with unknown status should block confirmation
    mockPrisma.workspaceProfileField.findMany.mockResolvedValue([
      {
        id: "pf-1",
        fieldKey: "complianceTargets",
        suggestedValue: [],
        status: ProfileFieldStatus.UNKNOWN,
        sourceType: ProfileFieldSourceType.UNKNOWN,
        confidence: 0,
        conflictInfo: null,
      },
    ] as any);

    const res = await POST(makeConfirmAllRequest("ws-1"));
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error.unresolvedFields).toContain("complianceTargets");
  });
});

describe("ProfileFieldService.validateConfirmAll", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws UnresolvedConflictsError with conflicted field details", async () => {
    mockPrisma.workspaceProfileField.findMany.mockResolvedValue([
      {
        fieldKey: "industry",
        suggestedValue: ["software"],
        status: ProfileFieldStatus.NEEDS_REVIEW,
        sourceType: ProfileFieldSourceType.CONFLICTED,
        confidence: 0.75,
        conflictInfo: { hasConflict: true, rival: { value: "healthtech", confidence: 0.72 } },
      },
    ] as any);

    await expect(
      ProfileFieldService.validateConfirmAll("ws-1")
    ).rejects.toThrow(UnresolvedConflictsError);

    try {
      await ProfileFieldService.validateConfirmAll("ws-1");
    } catch (error) {
      expect(error).toBeInstanceOf(UnresolvedConflictsError);
      expect((error as UnresolvedConflictsError).unresolvedFields).toContain("industry");
      expect((error as UnresolvedConflictsError).unresolvedFieldDetails[0].reason).toBe("conflict");
    }
  });

  it("does not throw when all fields are safe", async () => {
    mockPrisma.workspaceProfileField.findMany.mockResolvedValue([
      {
        fieldKey: "industry",
        suggestedValue: ["software"],
        status: ProfileFieldStatus.SUGGESTED,
        sourceType: ProfileFieldSourceType.OBSERVED,
        confidence: 0.85,
        conflictInfo: null,
      },
    ] as any);

    await expect(
      ProfileFieldService.validateConfirmAll("ws-1")
    ).resolves.not.toThrow();
  });
});
