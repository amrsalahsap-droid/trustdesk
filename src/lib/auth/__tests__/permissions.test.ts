import { describe, it, expect } from "vitest";
import { Permission, RolePermissions, hasPermission, getPermissionsForRole } from "../permissions";
import { WorkspaceRole } from "@prisma/client";

describe("Permissions Matrix", () => {
  it("grants all permissions to OWNER and ADMIN", () => {
    const allPermissions = Object.values(Permission);
    
    expect(getPermissionsForRole("OWNER" as WorkspaceRole)).toEqual(
      expect.arrayContaining(allPermissions)
    );
    expect(getPermissionsForRole("ADMIN" as WorkspaceRole)).toEqual(
      expect.arrayContaining(allPermissions)
    );
  });

  it("grants specific permissions to OPERATOR", () => {
    expect(hasPermission("OPERATOR" as WorkspaceRole, Permission.RUN_AI_OPERATIONS)).toBe(true);
    expect(hasPermission("OPERATOR" as WorkspaceRole, Permission.IMPORT_QUESTIONNAIRES)).toBe(true);
    expect(hasPermission("OPERATOR" as WorkspaceRole, Permission.MANAGE_MEMBERS)).toBe(false);
  });

  it("grants limited permissions to AUDITOR", () => {
    expect(hasPermission("AUDITOR" as WorkspaceRole, Permission.VIEW_ANSWERS)).toBe(true);
    expect(hasPermission("AUDITOR" as WorkspaceRole, Permission.VIEW_AUDIT)).toBe(true);
    expect(hasPermission("AUDITOR" as WorkspaceRole, Permission.EDIT_ANSWERS)).toBe(false);
    expect(hasPermission("AUDITOR" as WorkspaceRole, Permission.APPROVE_ANSWERS)).toBe(false);
  });

  it("grants specific permissions to ANSWER_OWNER", () => {
    expect(hasPermission("ANSWER_OWNER" as WorkspaceRole, Permission.EDIT_ANSWERS)).toBe(true);
    expect(hasPermission("ANSWER_OWNER" as WorkspaceRole, Permission.SUBMIT_FOR_APPROVAL)).toBe(true);
    expect(hasPermission("ANSWER_OWNER" as WorkspaceRole, Permission.APPROVE_ANSWERS)).toBe(false);
  });

  it("grants specific permissions to APPROVER", () => {
    expect(hasPermission("APPROVER" as WorkspaceRole, Permission.APPROVE_ANSWERS)).toBe(true);
    expect(hasPermission("APPROVER" as WorkspaceRole, Permission.REQUIRE_REVISION)).toBe(true);
    expect(hasPermission("APPROVER" as WorkspaceRole, Permission.EDIT_ANSWERS)).toBe(false);
  });

  it("grants limited permissions to CONTRIBUTOR", () => {
    expect(hasPermission("CONTRIBUTOR" as WorkspaceRole, Permission.COMMENT)).toBe(true);
    expect(hasPermission("CONTRIBUTOR" as WorkspaceRole, Permission.SUGGEST_EDITS)).toBe(true);
    expect(hasPermission("CONTRIBUTOR" as WorkspaceRole, Permission.APPROVE_ANSWERS)).toBe(false);
    expect(hasPermission("CONTRIBUTOR" as WorkspaceRole, Permission.EXPORT_DATA)).toBe(false);
  });

  it("maintains backward compatibility for EDITOR and VIEWER", () => {
    expect(hasPermission("EDITOR" as WorkspaceRole, Permission.EDIT_ANSWERS)).toBe(true);
    expect(hasPermission("VIEWER" as WorkspaceRole, Permission.VIEW_ANSWERS)).toBe(true);
    expect(hasPermission("VIEWER" as WorkspaceRole, Permission.EDIT_ANSWERS)).toBe(false);
  });
});
