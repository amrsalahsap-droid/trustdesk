import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/onboarding/profile/route";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";

// Mock dependencies
vi.mock("@/lib/auth/resolve-identity");
vi.mock("@/lib/db/prisma");
vi.mock("@/modules/workspaces/trust-profile-service");
vi.mock("@/modules/workspaces/profile-field-service");
vi.mock("@/lib/audit");

describe("Profile Save API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("POST /api/onboarding/profile", () => {
    it("should save profile with analyzed profile data", async () => {
      // Mock successful authentication
      const { resolveUserIdentity } = await import("@/lib/auth/resolve-identity");
      vi.mocked(resolveUserIdentity).mockResolvedValue({ userId: "test-user-id" });

      // Mock workspace membership check
      vi.mocked(prisma.workspaceMembership.findFirst).mockResolvedValue({
        id: "membership-id",
        workspaceId: "test-workspace-id",
        userId: "test-user-id",
        role: "OWNER",
        status: "ACTIVE",
      } as any);

      // Mock TrustProfileService.updateProfile
      const { TrustProfileService } = await import("@/modules/workspaces/trust-profile-service");
      vi.mocked(TrustProfileService.updateProfile).mockResolvedValue({
        workspace: { id: "test-workspace-id", name: "Test Workspace" },
        packs: [],
        documents: [],
      });

      // Create test request with analyzed profile
      const request = new NextRequest("http://localhost:3000/api/onboarding/profile", {
        method: "POST",
        body: JSON.stringify({
          workspaceId: "test-workspace-id",
          industry: ["software"],
          productType: ["saas"],
          customerSegment: ["b2b"],
          dataTypes: ["email", "name"],
          complianceTargets: ["SOC2"],
          analyzedProfile: {
            industry: {
              value: ["software"],
              category: "OBSERVED",
              confidence: 0.8,
              confidenceBand: "high",
              evidenceCoverage: "strong",
              supportScore: 85,
              aiConfidence: 0.75,
              reasons: ["Strong evidence from multiple pages"],
              citations: [],
              candidates: [
                {
                  value: "software",
                  confidence: 0.8,
                  sources: [],
                  sourcePages: ["https://example.com/about"],
                },
              ],
            },
            productType: {
              value: ["saas"],
              category: "OBSERVED",
              confidence: 0.7,
              confidenceBand: "medium",
              evidenceCoverage: "medium",
              supportScore: 65,
              aiConfidence: 0.68,
              reasons: ["Evidence from product page"],
              citations: [],
              candidates: [
                {
                  value: "saas",
                  confidence: 0.7,
                  sources: [],
                  sourcePages: ["https://example.com/product"],
                },
              ],
            },
            tailoringConfidence: 0.75,
          },
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.packs).toBeDefined();
      expect(data.documents).toBeDefined();

      // Verify TrustProfileService.updateProfile was called with correct data
      expect(TrustProfileService.updateProfile).toHaveBeenCalledWith(
        "test-workspace-id",
        "test-user-id",
        expect.objectContaining({
          industry: ["software"],
          productType: ["saas"],
          customerSegment: ["b2b"],
          dataTypes: ["email", "name"],
          complianceTargets: ["SOC2"],
          analyzedProfile: expect.objectContaining({
            industry: expect.objectContaining({
              value: ["software"],
              confidenceBand: "high",
              evidenceCoverage: "strong",
              supportScore: 85,
            }),
          }),
        })
      );
    });

    it("should return 400 for invalid request body", async () => {
      // Mock successful authentication
      const { resolveUserIdentity } = await import("@/lib/auth/resolve-identity");
      vi.mocked(resolveUserIdentity).mockResolvedValue({ userId: "test-user-id" });

      // Create invalid request
      const request = new NextRequest("http://localhost:3000/api/onboarding/profile", {
        method: "POST",
        body: JSON.stringify({
          // Missing required workspaceId
          industry: ["software"],
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("Invalid body");
      expect(data.details).toBeDefined();
    });

    it("should return 403 for unauthorized users", async () => {
      // Mock successful authentication
      const { resolveUserIdentity } = await import("@/lib/auth/resolve-identity");
      vi.mocked(resolveUserIdentity).mockResolvedValue({ userId: "test-user-id" });

      // Mock no workspace membership
      vi.mocked(prisma.workspaceMembership.findFirst).mockResolvedValue(null);

      // Create valid request
      const request = new NextRequest("http://localhost:3000/api/onboarding/profile", {
        method: "POST",
        body: JSON.stringify({
          workspaceId: "test-workspace-id",
          industry: ["software"],
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe("Only workspace owners or admins can update the profile");
    });

    it("should handle profile update errors gracefully", async () => {
      // Mock successful authentication
      const { resolveUserIdentity } = await import("@/lib/auth/resolve-identity");
      vi.mocked(resolveUserIdentity).mockResolvedValue({ userId: "test-user-id" });

      // Mock workspace membership check
      vi.mocked(prisma.workspaceMembership.findFirst).mockResolvedValue({
        id: "membership-id",
        workspaceId: "test-workspace-id",
        userId: "test-user-id",
        role: "OWNER",
        status: "ACTIVE",
      } as any);

      // Mock TrustProfileService.updateProfile to throw error
      const { TrustProfileService } = await import("@/modules/workspaces/trust-profile-service");
      const mockError = new Error("Database constraint violation");
      vi.mocked(TrustProfileService.updateProfile).mockRejectedValue(mockError);

      // Mock handleApiError
      const { handleApiError } = await import("@/lib/api/error-handler");
      vi.mocked(handleApiError).mockReturnValue(
        new Response(JSON.stringify({ error: "Internal server error" }), { status: 500 })
      );

      // Create valid request
      const request = new NextRequest("http://localhost:3000/api/onboarding/profile", {
        method: "POST",
        body: JSON.stringify({
          workspaceId: "test-workspace-id",
          industry: ["software"],
        }),
      });

      const response = await POST(request);

      expect(response.status).toBe(500);
      expect(handleApiError).toHaveBeenCalledWith(mockError);
    });

    it("should handle conflicted fields correctly", async () => {
      // Mock successful authentication
      const { resolveUserIdentity } = await import("@/lib/auth/resolve-identity");
      vi.mocked(resolveUserIdentity).mockResolvedValue({ userId: "test-user-id" });

      // Mock workspace membership check
      vi.mocked(prisma.workspaceMembership.findFirst).mockResolvedValue({
        id: "membership-id",
        workspaceId: "test-workspace-id",
        userId: "test-user-id",
        role: "OWNER",
        status: "ACTIVE",
      } as any);

      // Mock TrustProfileService.updateProfile to throw UnresolvedConflictsError
      const { TrustProfileService, UnresolvedConflictsError } = await import("@/modules/workspaces/trust-profile-service");
      const conflictError = new UnresolvedConflictsError(
        "Unresolved conflicts exist",
        ["industry"],
        [{ fieldKey: "industry", conflict: { hasConflict: true, rival: { value: "fintech" } } }]
      );
      vi.mocked(TrustProfileService.updateProfile).mockRejectedValue(conflictError);

      // Create valid request
      const request = new NextRequest("http://localhost:3000/api/onboarding/profile", {
        method: "POST",
        body: JSON.stringify({
          workspaceId: "test-workspace-id",
          industry: ["software"],
          analyzedProfile: {
            industry: {
              value: ["software"],
              category: "OBSERVED",
              confidence: 0.5,
              confidenceBand: "conflicted",
              evidenceCoverage: "medium",
              supportScore: 50,
              conflict: {
                hasConflict: true,
                rival: { value: "fintech" },
              },
              candidates: [
                { value: "software", confidence: 0.5, sources: [], sourcePages: [] },
                { value: "fintech", confidence: 0.45, sources: [], sourcePages: [] },
              ],
            },
          },
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500); // Will be handled by handleApiError
    });

    it("should save profile without analyzed profile", async () => {
      // Mock successful authentication
      const { resolveUserIdentity } = await import("@/lib/auth/resolve-identity");
      vi.mocked(resolveUserIdentity).mockResolvedValue({ userId: "test-user-id" });

      // Mock workspace membership check
      vi.mocked(prisma.workspaceMembership.findFirst).mockResolvedValue({
        id: "membership-id",
        workspaceId: "test-workspace-id",
        userId: "test-user-id",
        role: "OWNER",
        status: "ACTIVE",
      } as any);

      // Mock TrustProfileService.updateProfile
      const { TrustProfileService } = await import("@/modules/workspaces/trust-profile-service");
      vi.mocked(TrustProfileService.updateProfile).mockResolvedValue({
        workspace: { id: "test-workspace-id", name: "Test Workspace" },
        packs: [],
        documents: [],
      });

      // Create test request without analyzed profile
      const request = new NextRequest("http://localhost:3000/api/onboarding/profile", {
        method: "POST",
        body: JSON.stringify({
          workspaceId: "test-workspace-id",
          industry: ["software"],
          productType: ["saas"],
          customerSegment: ["b2b"],
          dataTypes: ["email", "name"],
          complianceTargets: ["SOC2"],
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);

      // Verify TrustProfileService.updateProfile was called with correct data
      expect(TrustProfileService.updateProfile).toHaveBeenCalledWith(
        "test-workspace-id",
        "test-user-id",
        expect.objectContaining({
          industry: ["software"],
          productType: ["saas"],
          customerSegment: ["b2b"],
          dataTypes: ["email", "name"],
          complianceTargets: ["SOC2"],
          analyzedProfile: undefined,
        })
      );
    });
  });

  describe("confirmAll functionality", () => {
    it("should confirm all non-conflicted fields", async () => {
      // Mock successful authentication
      const { resolveUserIdentity } = await import("@/lib/auth/resolve-identity");
      vi.mocked(resolveUserIdentity).mockResolvedValue({ userId: "test-user-id" });

      // Mock workspace membership check
      vi.mocked(prisma.workspaceMembership.findFirst).mockResolvedValue({
        id: "membership-id",
        workspaceId: "test-workspace-id",
        userId: "test-user-id",
        role: "OWNER",
        status: "ACTIVE",
      } as any);

      // Mock TrustProfileService.confirmAllSafeFields
      const { TrustProfileService } = await import("@/modules/workspaces/trust-profile-service");
      vi.mocked(TrustProfileService.confirmAllSafeFields).mockResolvedValue({
        confirmed: [{ fieldKey: "industry" }],
        skipped: [],
      });

      // Create test request with confirmAll
      const request = new NextRequest("http://localhost:3000/api/onboarding/profile", {
        method: "POST",
        body: JSON.stringify({
          workspaceId: "test-workspace-id",
          confirmAll: true,
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.confirmed).toHaveLength(1);
      expect(data.message).toBe("Confirmed 1 fields.");
    });

    it("should return 409 for unresolved conflicts", async () => {
      // Mock successful authentication
      const { resolveUserIdentity } = await import("@/lib/auth/resolve-identity");
      vi.mocked(resolveUserIdentity).mockResolvedValue({ userId: "test-user-id" });

      // Mock workspace membership check
      vi.mocked(prisma.workspaceMembership.findFirst).mockResolvedValue({
        id: "membership-id",
        workspaceId: "test-workspace-id",
        userId: "test-user-id",
        role: "OWNER",
        status: "ACTIVE",
      } as any);

      // Mock TrustProfileService.confirmAllSafeFields to throw UnresolvedConflictsError
      const { TrustProfileService, UnresolvedConflictsError } = await import("@/modules/workspaces/trust-profile-service");
      const conflictError = new UnresolvedConflictsError(
        "Unresolved conflicts exist",
        ["industry"],
        [{ fieldKey: "industry", conflict: { hasConflict: true, rival: { value: "fintech" } } }]
      );
      vi.mocked(TrustProfileService.confirmAllSafeFields).mockRejectedValue(conflictError);

      // Create test request with confirmAll
      const request = new NextRequest("http://localhost:3000/api/onboarding/profile", {
        method: "POST",
        body: JSON.stringify({
          workspaceId: "test-workspace-id",
          confirmAll: true,
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(409);
      expect(data.error.code).toBe("UNRESOLVED_CONFLICTS");
      expect(data.error.unresolvedFields).toEqual(["industry"]);
    });
  });
});
