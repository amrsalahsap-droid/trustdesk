import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
vi.unmock("@/lib/db/prisma");

import { prisma } from "@/lib/db/prisma";
import { buildAuthContext } from "@/lib/auth/build-context";
import { Permission } from "@/lib/auth/permissions";
import { authorizePermission } from "@/lib/auth/authorize-role";
import { InsufficientRoleError } from "@/lib/auth/errors";

describe("API Security & Fail-Closed Guards", () => {
  let auditorUserId: string;
  let contributorUserId: string;
  let workspaceId: string;

  beforeAll(async () => {
    // Setup test workspace and users with specific roles
    const workspace = await prisma.workspace.create({
      data: { name: "Security Test", slug: "sec-test-" + Math.random().toString(36).substring(7) }
    });
    workspaceId = workspace.id;

    const auditor = await prisma.user.create({
      data: { email: "auditor@sec.com", name: "Auditor User", passwordHash: "hash" }
    });
    auditorUserId = auditor.id;
    await prisma.workspaceMembership.create({
      data: { userId: auditor.id, workspaceId, role: "AUDITOR", status: "ACTIVE" }
    });

    const contributor = await prisma.user.create({
      data: { email: "contrib@sec.com", name: "Contrib User", passwordHash: "hash" }
    });
    contributorUserId = contributor.id;
    await prisma.workspaceMembership.create({
      data: { userId: contributor.id, workspaceId, role: "CONTRIBUTOR", status: "ACTIVE" }
    });
  });

  afterAll(async () => {
    await prisma.workspaceMembership.deleteMany({ where: { workspaceId } });
    await prisma.workspace.delete({ where: { id: workspaceId } });
    await prisma.user.deleteMany({ where: { email: { contains: "sec.com" } } });
  });

  it("should deny access to audit logs for a CONTRIBUTOR", async () => {
    // We simulate the logic inside the API route
    const ctx = {
      userId: contributorUserId,
      workspaceId,
      role: "CONTRIBUTOR" as const,
      permissions: ["VIEW_ANSWERS", "COMMENT"] as Permission[] // Mocked or derived
    };

    // Auditor role has VIEW_AUDIT, Contributor does not.
    // Let's use the real permission resolver
    const { getPermissionsForRole } = await import("@/lib/auth/permissions");
    const actualCtx = {
      ...ctx,
      permissions: getPermissionsForRole("CONTRIBUTOR")
    };

    expect(() => authorizePermission(actualCtx, Permission.VIEW_AUDIT)).toThrow(InsufficientRoleError);
  });

  it("should allow access to audit logs for an AUDITOR", async () => {
    const { getPermissionsForRole } = await import("@/lib/auth/permissions");
    const ctx = {
      userId: auditorUserId,
      workspaceId,
      role: "AUDITOR" as const,
      permissions: getPermissionsForRole("AUDITOR")
    };

    expect(() => authorizePermission(ctx, Permission.VIEW_AUDIT)).not.toThrow();
  });

  it("should deny answer approval for a CONTRIBUTOR", async () => {
    const { getPermissionsForRole } = await import("@/lib/auth/permissions");
    const ctx = {
      userId: contributorUserId,
      workspaceId,
      role: "CONTRIBUTOR" as const,
      permissions: getPermissionsForRole("CONTRIBUTOR")
    };

    expect(() => authorizePermission(ctx, Permission.APPROVE_ANSWERS)).toThrow(InsufficientRoleError);
  });
  
  it("should deny workspace management for an APPROVER", async () => {
    const { getPermissionsForRole } = await import("@/lib/auth/permissions");
    const ctx = {
      userId: "some-user",
      workspaceId,
      role: "APPROVER" as const,
      permissions: getPermissionsForRole("APPROVER")
    };

    expect(() => authorizePermission(ctx, Permission.MANAGE_MEMBERS)).toThrow(InsufficientRoleError);
  });
});
