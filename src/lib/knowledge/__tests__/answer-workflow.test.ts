import { describe, it, expect } from "vitest";
import { Permission } from "@/lib/auth/permissions";
import {
  applyWorkflowAction,
  WorkflowValidationError,
  isEligibleForInternalReuse,
  isEligibleForExportReuse,
} from "@/lib/knowledge/answer-workflow";

const baseAnswer = {
  governanceStatus: "DRAFT" as const,
  status: "DRAFT" as const,
  ownerId: "owner-1",
  approverId: "approver-1",
  workspaceId: "ws-1",
};

describe("applyWorkflowAction", () => {
  it("submitForApproval moves to IN_REVIEW", () => {
    const out = applyWorkflowAction(
      "submitForApproval",
      baseAnswer,
      { userId: "owner-1", role: "ANSWER_OWNER", permissions: [Permission.SUBMIT_FOR_APPROVAL] },
      { allowOwnerSelfApprove: false },
    );
    expect(out.governanceStatus).toBe("IN_REVIEW");
    expect(out.status).toBe("DRAFT");
  });

  it("denies submit when not owner", () => {
    expect(() =>
      applyWorkflowAction(
        "submitForApproval",
        baseAnswer,
        { userId: "other", role: "ANSWER_OWNER", permissions: [Permission.SUBMIT_FOR_APPROVAL] },
        { allowOwnerSelfApprove: false },
      ),
    ).toThrow(WorkflowValidationError);
  });

  it("approveInternal from IN_REVIEW as approver", () => {
    const out = applyWorkflowAction(
      "approveInternal",
      { ...baseAnswer, governanceStatus: "IN_REVIEW" },
      { userId: "approver-1", role: "APPROVER", permissions: [Permission.APPROVE_ANSWERS] },
      { allowOwnerSelfApprove: false },
      { resolvedCadenceDays: 90 },
    );
    expect(out.governanceStatus).toBe("APPROVED_INTERNAL");
    expect(out.status).toBe("APPROVED");
    expect(out.exportSafe).toBe(false);
    expect(out.nextReviewDueAt).toBeInstanceOf(Date);
    expect(out.expiresAt).toBeNull();
  });

  it("denies owner self-approve when policy off", () => {
    expect(() =>
      applyWorkflowAction(
        "approveInternal",
        { ...baseAnswer, governanceStatus: "IN_REVIEW", ownerId: "u1", approverId: "u1" },
        { userId: "u1", role: "APPROVER", permissions: [Permission.APPROVE_ANSWERS] },
        { allowOwnerSelfApprove: false },
        { resolvedCadenceDays: 90 },
      ),
    ).toThrow(WorkflowValidationError);
  });

  it("allows owner self-approve when workspace policy on", () => {
    const out = applyWorkflowAction(
      "approveInternal",
      { ...baseAnswer, governanceStatus: "IN_REVIEW", ownerId: "u1", approverId: "u1" },
      { userId: "u1", role: "APPROVER", permissions: [Permission.APPROVE_ANSWERS] },
      { allowOwnerSelfApprove: true },
      { resolvedCadenceDays: 180 },
    );
    expect(out.governanceStatus).toBe("APPROVED_INTERNAL");
  });

  const inReview = {
    ...baseAnswer,
    governanceStatus: "IN_REVIEW" as const,
    approvalScope: "INTERNAL_ONLY" as const,
    exportSafe: false,
    lastReviewedAt: new Date(),
    approvedAt: null,
    approvedByUserId: null,
    nextReviewDueAt: null,
    expiresAt: null,
  };

  it("approveForExport leaves exportSafe false when confirmation required", () => {
    const out = applyWorkflowAction(
      "approveForExport",
      inReview,
      { userId: "approver-1", role: "APPROVER", permissions: [Permission.APPROVE_ANSWERS] },
      { allowOwnerSelfApprove: false, requireApproverExportSafeConfirmation: true },
      { resolvedCadenceDays: 90 },
    );
    expect(out.governanceStatus).toBe("APPROVED_FOR_EXPORT");
    expect(out.approvalScope).toBe("EXPORT_ALLOWED");
    expect(out.exportSafe).toBe(false);
  });

  it("approveForExport sets exportSafe true when confirmation disabled", () => {
    const out = applyWorkflowAction(
      "approveForExport",
      inReview,
      { userId: "approver-1", role: "APPROVER", permissions: [Permission.APPROVE_ANSWERS] },
      { allowOwnerSelfApprove: false, requireApproverExportSafeConfirmation: false },
      { resolvedCadenceDays: 90 },
    );
    expect(out.exportSafe).toBe(true);
  });

  const exportPath = {
    ...inReview,
    governanceStatus: "APPROVED_FOR_EXPORT" as const,
    approvalScope: "EXPORT_ALLOWED" as const,
    exportSafe: false,
    status: "APPROVED" as const,
    approvedAt: new Date(),
    approvedByUserId: "approver-1",
  };

  it("confirmExportSafe sets exportSafe true", () => {
    const out = applyWorkflowAction(
      "confirmExportSafe",
      exportPath,
      { userId: "approver-1", role: "APPROVER", permissions: [Permission.APPROVE_ANSWERS] },
      { allowOwnerSelfApprove: false },
    );
    expect(out.exportSafe).toBe(true);
    expect(out.governanceStatus).toBe("APPROVED_FOR_EXPORT");
  });

  it("revokeExportSafe clears exportSafe", () => {
    const out = applyWorkflowAction(
      "revokeExportSafe",
      { ...exportPath, exportSafe: true },
      { userId: "approver-1", role: "APPROVER", permissions: [Permission.APPROVE_ANSWERS] },
      { allowOwnerSelfApprove: false },
    );
    expect(out.exportSafe).toBe(false);
  });
});

describe("isEligibleForInternalReuse", () => {
  it("allows APPROVED_INTERNAL", () => {
    expect(
      isEligibleForInternalReuse({
        status: "APPROVED",
        governanceStatus: "APPROVED_INTERNAL",
      }),
    ).toBe(true);
  });

  it("allows legacy APPROVED + DRAFT governance", () => {
    expect(
      isEligibleForInternalReuse({
        status: "APPROVED",
        governanceStatus: "DRAFT",
      }),
    ).toBe(true);
  });

  it("blocks IN_REVIEW", () => {
    expect(
      isEligibleForInternalReuse({
        status: "DRAFT",
        governanceStatus: "IN_REVIEW",
      }),
    ).toBe(false);
  });

  it("allows EXPIRED with APPROVED status for penalized reuse", () => {
    expect(
      isEligibleForInternalReuse({
        status: "APPROVED",
        governanceStatus: "EXPIRED",
      }),
    ).toBe(true);
  });
});

describe("isEligibleForExportReuse", () => {
  it("requires APPROVED_FOR_EXPORT and flags", () => {
    expect(
      isEligibleForExportReuse({
        status: "APPROVED",
        governanceStatus: "APPROVED_FOR_EXPORT",
        approvalScope: "EXPORT_ALLOWED",
        exportSafe: true,
      }),
    ).toBe(true);
    expect(
      isEligibleForExportReuse({
        status: "APPROVED",
        governanceStatus: "APPROVED_INTERNAL",
        approvalScope: "INTERNAL_ONLY",
        exportSafe: false,
      }),
    ).toBe(false);
  });

  it("blocks export reuse when next review is past due", () => {
    const past = new Date("2020-01-01");
    expect(
      isEligibleForExportReuse(
        {
          status: "APPROVED",
          governanceStatus: "APPROVED_FOR_EXPORT",
          approvalScope: "EXPORT_ALLOWED",
          exportSafe: true,
          nextReviewDueAt: past,
        },
        new Date("2025-06-01"),
      ),
    ).toBe(false);
  });
});
