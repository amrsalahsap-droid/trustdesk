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
      count: vi.fn(),
    },
  },
}));

vi.mock("@/modules/workspaces/trust-profile-service", () => ({
  TrustProfileService: {
    updateProfile: vi.fn(),
  },
}));

vi.mock("@/modules/workspaces/profile-field-service", () => ({
  ProfileFieldService: {
    getFields: vi.fn(),
    getConfirmedValues: vi.fn(),
    hasUnconfirmedFields: vi.fn(),
  },
}));

import { resolveUserIdentity } from "@/lib/auth/resolve-identity";
import { prisma } from "@/lib/db/prisma";
import { TrustProfileService } from "@/modules/workspaces/trust-profile-service";
import { ProfileFieldService } from "@/modules/workspaces/profile-field-service";
import { GET, POST } from "@/app/api/onboarding/profile/route";

const mockResolveIdentity = vi.mocked(resolveUserIdentity);
const mockPrisma = vi.mocked(prisma);
const mockTrustProfileService = vi.mocked(TrustProfileService);
const mockProfileFieldService = vi.mocked(ProfileFieldService);

describe("GET /api/onboarding/profile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function makeGetRequest(workspaceId: string): Request {
    return new Request(`http://localhost/api/onboarding/profile?workspaceId=${workspaceId}`);
  }

  it("returns profile fields and confirmed values for authorized user", async () => {
    mockResolveIdentity.mockResolvedValue({ userId: "user-1" });
    mockPrisma.workspaceMembership.findFirst.mockResolvedValue({ id: "mem-1" } as any);
    mockProfileFieldService.getFields.mockResolvedValue([
      { id: "pf-1", fieldKey: "industry", status: ProfileFieldStatus.SUGGESTED, confidence: 0.8, sourceType: ProfileFieldSourceType.OBSERVED, createdAt: new Date(), updatedAt: new Date() },
    ] as any);
    mockProfileFieldService.getConfirmedValues.mockResolvedValue({});
    mockProfileFieldService.hasUnconfirmedFields.mockResolvedValue(true);

    const res = await GET(makeGetRequest("ws-1"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.fields).toHaveLength(1);
    expect(body.fields[0].fieldKey).toBe("industry");
    expect(body.hasUnconfirmedFields).toBe(true);
    expect(mockPrisma.workspaceMembership.findFirst).toHaveBeenCalledWith({
      where: { workspaceId: "ws-1", userId: "user-1", status: "ACTIVE" },
    });
  });

  it("returns 400 when workspaceId is missing", async () => {
    mockResolveIdentity.mockResolvedValue({ userId: "user-1" });

    const res = await GET(new Request("http://localhost/api/onboarding/profile"));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("Missing workspaceId");
  });

  it("returns 403 for unauthorized user", async () => {
    mockResolveIdentity.mockResolvedValue({ userId: "user-1" });
    mockPrisma.workspaceMembership.findFirst.mockResolvedValue(null);

    const res = await GET(makeGetRequest("ws-1"));
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toBe("Unauthorized");
  });
});

describe("POST /api/onboarding/profile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function makePostRequest(body: unknown): Request {
    return new Request("http://localhost/api/onboarding/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("updates profile with field confirmations", async () => {
    mockResolveIdentity.mockResolvedValue({ userId: "user-1" });
    mockTrustProfileService.updateProfile.mockResolvedValue({
      workspace: { id: "ws-1" },
      packs: [],
      documents: [],
    } as any);

    const res = await POST(makePostRequest({
      workspaceId: "ws-1",
      industry: ["software"],
      fieldConfirmations: [
        { fieldKey: "industry", confirmedValue: ["software"], status: ProfileFieldStatus.CONFIRMED },
        { fieldKey: "productType", confirmedValue: ["saas"], status: ProfileFieldStatus.EDITED },
      ],
    }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(mockTrustProfileService.updateProfile).toHaveBeenCalledWith(
      "ws-1",
      "user-1",
      expect.objectContaining({
        industry: ["software"],
        fieldConfirmations: [
          { fieldKey: "industry", confirmedValue: ["software"], status: ProfileFieldStatus.CONFIRMED },
          { fieldKey: "productType", confirmedValue: ["saas"], status: ProfileFieldStatus.EDITED },
        ],
      })
    );
  });

  it("stores AI suggestions without confirmations on initial save", async () => {
    mockResolveIdentity.mockResolvedValue({ userId: "user-1" });
    mockTrustProfileService.updateProfile.mockResolvedValue({
      workspace: { id: "ws-1" },
      packs: [],
      documents: [],
    } as any);

    const analyzedProfile = {
      industry: { value: "software", category: "OBSERVED", confidence: 0.85 },
      productType: { value: "saas", category: "DERIVED", confidence: 0.75 },
    };

    const res = await POST(makePostRequest({
      workspaceId: "ws-1",
      industry: ["software"],
      productType: ["saas"],
      analyzedProfile,
    }));

    expect(res.status).toBe(200);
    expect(mockTrustProfileService.updateProfile).toHaveBeenCalledWith(
      "ws-1",
      "user-1",
      expect.objectContaining({
        analyzedProfile,
        industry: ["software"],
        productType: ["saas"],
      })
    );
  });

  it("rejects field confirmations with invalid status", async () => {
    mockResolveIdentity.mockResolvedValue({ userId: "user-1" });

    const res = await POST(makePostRequest({
      workspaceId: "ws-1",
      fieldConfirmations: [
        { fieldKey: "industry", confirmedValue: ["software"], status: "INVALID_STATUS" },
      ],
    }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("Invalid body");
  });

  it("returns 400 for invalid body", async () => {
    mockResolveIdentity.mockResolvedValue({ userId: "user-1" });

    const res = await POST(makePostRequest({ invalid: "data" }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("Invalid body");
  });
});
