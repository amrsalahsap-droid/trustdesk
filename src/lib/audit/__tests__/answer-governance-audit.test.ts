import { describe, it, expect } from "vitest";
import { buildGovernanceAuditMetadata, governanceAuditSnapshot } from "../answer-governance-audit";

describe("answer-governance-audit", () => {
  it("governanceAuditSnapshot serializes dates to ISO", () => {
    const d = new Date("2026-01-15T12:00:00.000Z");
    const snap = governanceAuditSnapshot({
      governanceStatus: "APPROVED_INTERNAL",
      approvalScope: "INTERNAL_ONLY",
      exportSafe: true,
      status: "APPROVED",
      nextReviewDueAt: d,
      reviewCadenceDays: 90,
      ownerId: "u1",
      approverId: "u2",
    });
    expect(snap.nextReviewDueAt).toBe("2026-01-15T12:00:00.000Z");
    expect(snap.reviewCadenceDays).toBe(90);
  });

  it("buildGovernanceAuditMetadata flattens before/after prefixes", () => {
    const meta = buildGovernanceAuditMetadata({
      action: "patch",
      version: 3,
      source: "patch",
      changeReason: "Cadence update",
      before: governanceAuditSnapshot({
        governanceStatus: "APPROVED_INTERNAL",
        approvalScope: "INTERNAL_ONLY",
        exportSafe: false,
        status: "APPROVED",
        nextReviewDueAt: null,
        reviewCadenceDays: 90,
        ownerId: null,
        approverId: null,
      }),
      after: governanceAuditSnapshot({
        governanceStatus: "APPROVED_INTERNAL",
        approvalScope: "INTERNAL_ONLY",
        exportSafe: false,
        status: "APPROVED",
        nextReviewDueAt: new Date("2026-04-01T00:00:00.000Z"),
        reviewCadenceDays: 180,
        ownerId: null,
        approverId: null,
      }),
    });
    expect(meta.action).toBe("patch");
    expect(meta.version).toBe(3);
    expect(meta.before_reviewCadenceDays).toBe(90);
    expect(meta.after_reviewCadenceDays).toBe(180);
    expect(meta.after_nextReviewDueAt).toBe("2026-04-01T00:00:00.000Z");
  });
});
