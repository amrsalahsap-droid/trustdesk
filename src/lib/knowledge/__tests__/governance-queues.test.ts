import { describe, it, expect } from "vitest";
import type { AuthContext } from "@/lib/auth/types";
import { Permission } from "@/lib/auth/permissions";
import {
  canAccessQueueList,
  GOVERNANCE_QUEUE_IDS,
  isGovernanceQueueId,
  isLibraryCrossTopicGovernanceFilter,
  prismaWhereForQueue,
} from "@/lib/knowledge/governance-queues";

function ctx(over: Partial<AuthContext> & Pick<AuthContext, "userId" | "workspaceId">): AuthContext {
  return {
    membershipId: "mem-1",
    role: "EDITOR",
    permissions: [Permission.VIEW_ANSWERS],
    ...over,
  };
}

describe("governance-queues", () => {
  it("exposes stable queue id list", () => {
    expect(GOVERNANCE_QUEUE_IDS).toContain("my_approvals");
    expect(GOVERNANCE_QUEUE_IDS).toContain("drafts_awaiting_approval");
    expect(isGovernanceQueueId("my_approvals")).toBe(true);
    expect(isGovernanceQueueId("not_a_queue")).toBe(false);
  });

  it("treats governance chip ids as cross-topic filters", () => {
    expect(isLibraryCrossTopicGovernanceFilter("my_owned")).toBe(true);
    expect(isLibraryCrossTopicGovernanceFilter("freshness_expired")).toBe(true);
    expect(isLibraryCrossTopicGovernanceFilter("exportSafety_restricted")).toBe(true);
    expect(isLibraryCrossTopicGovernanceFilter("ALL")).toBe(false);
  });

  it("scopes my_approvals to IN_REVIEW for the designated approver", () => {
    const where = prismaWhereForQueue("my_approvals", ctx({ userId: "u-approver", workspaceId: "ws-1" }));
    expect(where).toMatchObject({
      workspaceId: "ws-1",
      approverId: "u-approver",
      governanceStatus: "IN_REVIEW",
      status: { not: "ARCHIVED" },
    });
  });

  it("scopes drafts_awaiting_approval workspace-wide to IN_REVIEW", () => {
    const where = prismaWhereForQueue("drafts_awaiting_approval", ctx({ userId: "u-1", workspaceId: "ws-9" }));
    expect(where).toMatchObject({
      workspaceId: "ws-9",
      governanceStatus: "IN_REVIEW",
    });
  });

  it("allows operators to list workspace ops queues", () => {
    const base = ctx({ userId: "u-1", workspaceId: "ws-1", role: "OPERATOR", permissions: [Permission.VIEW_ANSWERS] });
    expect(canAccessQueueList("unowned", base)).toBe(true);
    expect(canAccessQueueList("export_blocked", base)).toBe(true);
    expect(canAccessQueueList("drafts_awaiting_approval", base)).toBe(true);
  });

  it("denies workspace ops queues to plain viewers with only VIEW_ANSWERS", () => {
    const base = ctx({ userId: "u-1", workspaceId: "ws-1", role: "VIEWER", permissions: [Permission.VIEW_ANSWERS] });
    expect(canAccessQueueList("unowned", base)).toBe(false);
    expect(canAccessQueueList("my_owned", base)).toBe(true);
  });

  it("allows my_approvals when user can approve or is admin", () => {
    const approver = ctx({
      userId: "u-1",
      workspaceId: "ws-1",
      role: "EDITOR",
      permissions: [Permission.VIEW_ANSWERS, Permission.APPROVE_ANSWERS],
    });
    expect(canAccessQueueList("my_approvals", approver)).toBe(true);

    const admin = ctx({ userId: "u-1", workspaceId: "ws-1", role: "ADMIN", permissions: [Permission.VIEW_ANSWERS] });
    expect(canAccessQueueList("my_approvals", admin)).toBe(true);
  });
});
