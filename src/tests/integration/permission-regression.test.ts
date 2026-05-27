import { describe, it, expect, vi } from "vitest";
import { Permission, RolePermissions, getPermissionsForRole } from "@/lib/auth/permissions";
import { WorkspaceRole } from "@prisma/client";
import { authorizePermission } from "@/lib/auth/authorize-role";
import { InsufficientRoleError } from "@/lib/auth/errors";
import * as Governance from "@/lib/auth/governance-actions";

/**
 * TrustDesk Permission Regression Suite
 * 
 * This suite ensures that the permission boundaries for all roles are correctly defined
 * and enforced, preventing "permission drift" during development.
 */
describe("Permission Regression Suite", () => {

  const allRoles: WorkspaceRole[] = [
    "OWNER",
    "ADMIN",
    "OPERATOR",
    "APPROVER",
    "ANSWER_OWNER",
    "CONTRIBUTOR",
    "AUDITOR",
    "VIEWER"
  ];

  describe("Role Capability Matrix (Canonical Truth)", () => {
    
    const testCapability = (role: WorkspaceRole, permission: Permission, expected: boolean) => {
      const permissions = getPermissionsForRole(role);
      const hasPerm = permissions.includes(permission);
      if (expected) {
        expect(hasPerm, `${role} should have ${permission}`).toBe(true);
      } else {
        expect(hasPerm, `${role} should NOT have ${permission}`).toBe(false);
      }
    };

    it("OWNER: should have absolute power", () => {
      Object.values(Permission).forEach(p => {
        testCapability("OWNER", p, true);
      });
    });

    it("ADMIN: should manage workspace but not destructive actions", () => {
      testCapability("ADMIN", Permission.MANAGE_MEMBERS, true);
      testCapability("ADMIN", Permission.MANAGE_SETTINGS, true);
      testCapability("ADMIN", Permission.VIEW_AUDIT, true);
      testCapability("ADMIN", Permission.MANAGE_WORKSPACE, false); // OWNER only
    });

    it("OPERATOR: should run questionnaire workflow but not admin settings", () => {
      testCapability("OPERATOR", Permission.IMPORT_QUESTIONNAIRES, true);
      testCapability("OPERATOR", Permission.RUN_AI_OPERATIONS, true);
      testCapability("OPERATOR", Permission.REVIEW_ROWS, true);
      testCapability("OPERATOR", Permission.MANAGE_MEMBERS, false);
      testCapability("OPERATOR", Permission.MANAGE_SETTINGS, false);
    });

    it("APPROVER: should approve/reject but not manage users", () => {
      testCapability("APPROVER", Permission.APPROVE_ANSWERS, true);
      testCapability("APPROVER", Permission.REQUIRE_REVISION, true);
      testCapability("APPROVER", Permission.EXPORT_EXTERNAL, true);
      testCapability("APPROVER", Permission.MANAGE_MEMBERS, false);
      testCapability("APPROVER", Permission.IMPORT_QUESTIONNAIRES, false);
    });

    it("CONTRIBUTOR: should upload and suggest but not approve/export", () => {
      testCapability("CONTRIBUTOR", Permission.UPLOAD_EVIDENCE, true);
      testCapability("CONTRIBUTOR", Permission.SUGGEST_EDITS, true);
      testCapability("CONTRIBUTOR", Permission.APPROVE_ANSWERS, false);
      testCapability("CONTRIBUTOR", Permission.EXPORT_EXTERNAL, false);
      testCapability("CONTRIBUTOR", Permission.MANAGE_DOCUMENTS, false);
    });

    it("AUDITOR: should view audit/history but not edit", () => {
      testCapability("AUDITOR", Permission.VIEW_AUDIT, true);
      testCapability("AUDITOR", Permission.VIEW_HISTORY, true);
      testCapability("AUDITOR", Permission.EDIT_ANSWERS, false);
      testCapability("AUDITOR", Permission.UPLOAD_EVIDENCE, false);
    });
  });

  describe("API Assertion Logic (Governance Guards)", () => {
    
    const mockCtx = (role: WorkspaceRole, userId = "test-user"): any => ({
      userId,
      workspaceId: "test-ws",
      role,
      permissions: getPermissionsForRole(role)
    });

    it("assertAnswerCreate: should reject non-editors", () => {
      expect(() => Governance.assertAnswerCreate(mockCtx("VIEWER"), "DRAFT")).toThrow(InsufficientRoleError);
      expect(() => Governance.assertAnswerCreate(mockCtx("CONTRIBUTOR"), "DRAFT")).toThrow(InsufficientRoleError);
      expect(() => Governance.assertAnswerCreate(mockCtx("ANSWER_OWNER"), "DRAFT")).not.toThrow();
    });

    it("assertAnswerCreate: should reject pre-approved for non-approvers", () => {
      // Non-approver with edit (ANSWER_OWNER)
      expect(() => Governance.assertAnswerCreate(mockCtx("ANSWER_OWNER"), "APPROVED")).toThrow(InsufficientRoleError);
      // Admin with edit and approve
      expect(() => Governance.assertAnswerCreate(mockCtx("ADMIN"), "APPROVED")).not.toThrow();
    });

    it("assertQuestionnaireExport: should respect internal vs external boundaries", () => {
      // OPERATOR can export internal (CSV) but not external (XLSX)
      expect(() => Governance.assertQuestionnaireExport(mockCtx("OPERATOR"), "csv")).not.toThrow();
      expect(() => Governance.assertQuestionnaireExport(mockCtx("OPERATOR"), "xlsx")).toThrow(InsufficientRoleError);
      
      // APPROVER can export external (XLSX)
      expect(() => Governance.assertQuestionnaireExport(mockCtx("APPROVER"), "xlsx")).not.toThrow();
    });

    it("assertQuestionnaireReview: should reject non-operators", () => {
      expect(() => Governance.assertQuestionnaireReview(mockCtx("CONTRIBUTOR"))).toThrow(InsufficientRoleError);
      expect(() => Governance.assertQuestionnaireReview(mockCtx("OPERATOR"))).not.toThrow();
    });

    it("assertAnswerDelete: should only allow owner or admin", () => {
      const ownerId = "owner-123";
      expect(() => Governance.assertAnswerDelete(mockCtx("ANSWER_OWNER", ownerId), ownerId)).not.toThrow();
      expect(() => Governance.assertAnswerDelete(mockCtx("ANSWER_OWNER", "other-user"), ownerId)).toThrow(InsufficientRoleError);
      expect(() => Governance.assertAnswerDelete(mockCtx("ADMIN", "any-user"), ownerId)).not.toThrow();
    });
  });

  describe("Middleware & Routing Truth Alignment", () => {
    // We simulate the mapping logic in middleware.ts
    const ROUTE_PERMISSIONS: Record<string, Permission | Permission[]> = {
      "/app": Permission.MANAGE_TOPICS,
      "/app/questionnaires": [Permission.IMPORT_QUESTIONNAIRES, Permission.ASSIGN_ROWS],
      "/app/library": Permission.VIEW_ANSWERS,
      "/app/governance": [Permission.APPROVE_ANSWERS, Permission.MANAGE_TOPICS],
      "/app/audit": Permission.VIEW_AUDIT,
      "/app/exports": [Permission.EXPORT_INTERNAL, Permission.EXPORT_EXTERNAL],
      "/app/documents": Permission.VIEW_EVIDENCE,
      "/app/settings": [Permission.MANAGE_SETTINGS, Permission.MANAGE_MEMBERS, Permission.VIEW_AUDIT],
    };

    const hasPermission = (userPermissions: Permission[], required: Permission | Permission[]): boolean => {
      if (Array.isArray(required)) return required.some(p => userPermissions.includes(p));
      return userPermissions.includes(required);
    };

    it("should verify that Auditor is allowed in /app/audit and /app/settings (for logs)", () => {
      const perms = getPermissionsForRole("AUDITOR");
      expect(hasPermission(perms, ROUTE_PERMISSIONS["/app/audit"])).toBe(true);
      expect(hasPermission(perms, ROUTE_PERMISSIONS["/app/settings"])).toBe(true); // Authorized to see Audit Trail in settings
      expect(hasPermission(perms, ROUTE_PERMISSIONS["/app/questionnaires"])).toBe(false);
    });

    it("should verify that Contributor is blocked from Governance and Settings", () => {
      const perms = getPermissionsForRole("CONTRIBUTOR");
      expect(hasPermission(perms, ROUTE_PERMISSIONS["/app/governance"])).toBe(false);
      expect(hasPermission(perms, ROUTE_PERMISSIONS["/app/settings"])).toBe(false);
      expect(hasPermission(perms, ROUTE_PERMISSIONS["/app/library"])).toBe(true);
    });
  });

  describe("Danger Zone & Membership Management", () => {
    it("should restrict user management to ADMIN/OWNER", () => {
      expect(getPermissionsForRole("ADMIN")).toContain(Permission.MANAGE_MEMBERS);
      expect(getPermissionsForRole("OPERATOR")).not.toContain(Permission.MANAGE_MEMBERS);
    });

    it("should strictly restrict workspace archive to OWNER", () => {
      expect(getPermissionsForRole("OWNER")).toContain(Permission.MANAGE_WORKSPACE);
      expect(getPermissionsForRole("ADMIN")).not.toContain(Permission.MANAGE_WORKSPACE);
    });
  });
});
