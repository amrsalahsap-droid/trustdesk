import { describe, it, expect } from "vitest";
import type { WorkspaceRole } from "@prisma/client";
import { Permission } from "@/lib/auth/permissions";
import { InsufficientRoleError } from "@/lib/auth/errors";
import type { AuthContext } from "@/lib/auth/types";
import {
  assertAnswerCreate,
  assertAnswerDelete,
  assertAnswerPatchAllowed,
  assertPromoteDrafts,
  assertQuestionnaireExport,
  assertWorkflowActionPermission,
  canEditAnswerContent,
} from "@/lib/auth/governance-actions";

function ctx(
  role: WorkspaceRole,
  permissions: Permission[],
  userId = "u-1",
): AuthContext {
  return {
    userId,
    workspaceId: "ws-1",
    membershipId: "m-1",
    role,
    permissions,
  };
}

describe("governance-actions", () => {
  it("blocks operator from editing another user's answer content rules", () => {
    const op = ctx("OPERATOR", [
      Permission.EDIT_ANSWERS,
      Permission.ASSIGN_OWNERS,
      Permission.VIEW_ANSWERS,
    ]);
    expect(canEditAnswerContent(op, "owner-other")).toBe(false);
    expect(() =>
      assertAnswerPatchAllowed(op, {
        ownerId: "owner-other",
        approverId: null,
        governanceStatus: "DRAFT",
        status: "DRAFT",
      }, { title: "x" }),
    ).toThrow(InsufficientRoleError);
  });

  it("allows owner with EDIT to patch content", () => {
    const owner = ctx("ANSWER_OWNER", [Permission.EDIT_ANSWERS, Permission.VIEW_ANSWERS], "owner-1");
    expect(() =>
      assertAnswerPatchAllowed(owner, {
        ownerId: "owner-1",
        approverId: null,
        governanceStatus: "DRAFT",
        status: "DRAFT",
      }, { title: "Updated" }),
    ).not.toThrow();
  });

  it("requires ASSIGN_OWNERS for reassignment", () => {
    const editor = ctx("EDITOR", [Permission.EDIT_ANSWERS, Permission.VIEW_ANSWERS], "u-ed");
    expect(() =>
      assertAnswerPatchAllowed(editor, {
        ownerId: "owner-1",
        approverId: null,
        governanceStatus: "DRAFT",
        status: "DRAFT",
      }, { ownerId: "owner-2" }),
    ).toThrow(InsufficientRoleError);
  });

  it("allows contributor suggest path for title only in DRAFT", () => {
    const contrib = ctx("CONTRIBUTOR", [
      Permission.SUGGEST_EDITS,
      Permission.VIEW_ANSWERS,
      Permission.VIEW_EVIDENCE,
      Permission.VIEW_HISTORY,
      Permission.COMMENT,
      Permission.UPLOAD_EVIDENCE,
    ]);
    expect(() =>
      assertAnswerPatchAllowed(contrib, {
        ownerId: "owner-1",
        approverId: null,
        governanceStatus: "DRAFT",
        status: "DRAFT",
      }, { title: "Suggested title" }),
    ).not.toThrow();
  });

  it("blocks contributor from assignment patch", () => {
    const contrib = ctx("CONTRIBUTOR", [
      Permission.SUGGEST_EDITS,
      Permission.VIEW_ANSWERS,
      Permission.VIEW_EVIDENCE,
      Permission.VIEW_HISTORY,
      Permission.COMMENT,
      Permission.UPLOAD_EVIDENCE,
    ]);
    expect(() =>
      assertAnswerPatchAllowed(contrib, {
        ownerId: "owner-1",
        approverId: null,
        governanceStatus: "DRAFT",
        status: "DRAFT",
      }, { title: "x", ownerId: "owner-2" }),
    ).toThrow(InsufficientRoleError);
  });

  it("assertAnswerCreate requires EDIT and APPROVE for approved initial status", () => {
    expect(() => assertAnswerCreate(ctx("VIEWER", [Permission.VIEW_ANSWERS]), "DRAFT")).toThrow(
      InsufficientRoleError,
    );
    expect(() =>
      assertAnswerCreate(ctx("EDITOR", [Permission.EDIT_ANSWERS, Permission.VIEW_ANSWERS]), "APPROVED"),
    ).toThrow(InsufficientRoleError);
  });

  it("assertAnswerDelete requires owner or admin", () => {
    expect(() =>
      assertAnswerDelete(ctx("EDITOR", [Permission.EDIT_ANSWERS, Permission.VIEW_ANSWERS], "u-ed"), "owner-1"),
    ).toThrow(InsufficientRoleError);
    expect(() =>
      assertAnswerDelete(ctx("ADMIN", [Permission.EDIT_ANSWERS, Permission.VIEW_ANSWERS], "u-ad"), "owner-1"),
    ).not.toThrow();
  });

  it("assertWorkflowActionPermission denies auditor for approve", () => {
    expect(() =>
      assertWorkflowActionPermission(ctx("AUDITOR", [Permission.VIEW_ANSWERS, Permission.VIEW_AUDIT]), "approveInternal"),
    ).toThrow(InsufficientRoleError);
  });

  it("assertPromoteDrafts denies viewer", () => {
    expect(() => assertPromoteDrafts(ctx("VIEWER", [Permission.VIEW_ANSWERS]))).toThrow(InsufficientRoleError);
  });

  it("assertQuestionnaireExport requires EXPORT_DATA", () => {
    expect(() =>
      assertQuestionnaireExport(ctx("APPROVER", [Permission.VIEW_ANSWERS, Permission.APPROVE_ANSWERS])),
    ).toThrow(InsufficientRoleError);
  });
});
