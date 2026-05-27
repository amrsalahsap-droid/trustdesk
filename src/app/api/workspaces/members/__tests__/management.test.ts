import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

vi.mock("@/lib/auth/build-context", () => ({
  buildAuthContext: vi.fn(),
}));

vi.mock("@/lib/auth/authorize-role", () => ({
  authorizePermission: vi.fn(),
}));

import { prisma } from "@/lib/db/prisma";
import { buildAuthContext } from "@/lib/auth/build-context";
import { authorizePermission } from "@/lib/auth/authorize-role";
import { PATCH, DELETE } from "@/app/api/workspaces/members/[membershipId]/route";

const mockBuildContext = vi.mocked(buildAuthContext);
const mockAuthorize = vi.mocked(authorizePermission);

const findUniqueMembership = prisma.workspaceMembership.findUnique as unknown as Mock;
const countMemberships = prisma.workspaceMembership.count as unknown as Mock;
const updateMembership = prisma.workspaceMembership.update as unknown as Mock;

const ctx = {
  userId: "admin-1",
  workspaceId: "ws-1",
  membershipId: "mem-admin",
  role: "ADMIN" as const,
  permissions: ["MANAGE_MEMBERS"],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockBuildContext.mockResolvedValue(ctx as any);
  findUniqueMembership.mockReset();
  countMemberships.mockReset();
  updateMembership.mockReset();
});

describe("Member Management API", () => {
  describe("PATCH /api/workspaces/members/[id]", () => {
    it("updates member role", async () => {
      findUniqueMembership.mockResolvedValue({ id: "mem-2", role: "CONTRIBUTOR" });
      updateMembership.mockResolvedValue({ id: "mem-2", role: "OPERATOR" });

      const req = new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({ role: "OPERATOR" }),
      });

      const res = await PATCH(req, { params: { membershipId: "mem-2" } });
      expect(res.status).toBe(200);
      expect(updateMembership).toHaveBeenCalled();
    });

    it("prevents downgrading the last admin", async () => {
      findUniqueMembership.mockResolvedValue({ id: "mem-admin", role: "ADMIN" });
      countMemberships.mockResolvedValue(0); // No other admins

      const req = new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({ role: "CONTRIBUTOR" }),
      });

      const res = await PATCH(req, { params: { membershipId: "mem-admin" } });
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.error.code).toBe("LAST_ADMIN");
    });
  });

  describe("DELETE /api/workspaces/members/[id]", () => {
    it("removes a member (soft delete)", async () => {
      findUniqueMembership.mockResolvedValue({ id: "mem-2", role: "CONTRIBUTOR" });
      updateMembership.mockResolvedValue({ id: "mem-2", status: "REMOVED" });

      const res = await DELETE(new Request("http://localhost"), { params: { membershipId: "mem-2" } });
      expect(res.status).toBe(200);
      expect(updateMembership).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ status: "REMOVED" })
      }));
    });

    it("prevents removing the last admin", async () => {
      findUniqueMembership.mockResolvedValue({ id: "mem-admin", role: "ADMIN" });
      countMemberships.mockResolvedValue(0);

      const res = await DELETE(new Request("http://localhost"), { params: { membershipId: "mem-admin" } });
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.error.code).toBe("LAST_ADMIN");
    });
  });
});
