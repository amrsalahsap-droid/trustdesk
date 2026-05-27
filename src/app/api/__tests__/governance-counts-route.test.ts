import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

vi.mock("@/lib/auth/build-context", () => ({
  buildAuthContext: vi.fn(),
}));

vi.mock("@/lib/knowledge/governance-queues", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/knowledge/governance-queues")>();
  return {
    ...actual,
    countQuestionnaireExportMirrorBlocks: vi.fn().mockResolvedValue(7),
  };
});

import { prisma } from "@/lib/db/prisma";
import { buildAuthContext } from "@/lib/auth/build-context";
import { Permission } from "@/lib/auth/permissions";
import { countQuestionnaireExportMirrorBlocks } from "@/lib/knowledge/governance-queues";
import { GET as governanceCountsGET } from "@/app/api/knowledge/answers/governance-counts/route";

const mockBuildContext = vi.mocked(buildAuthContext);
const answerCount = prisma.answerLibraryItem.count as unknown as Mock;
const mockMirrorBlocks = vi.mocked(countQuestionnaireExportMirrorBlocks);

function makeRequest(): Request {
  return new Request("http://localhost/api/knowledge/answers/governance-counts", {
    headers: { "x-workspace-id": "ws-1" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockBuildContext.mockReset();
  answerCount.mockReset();
  answerCount.mockResolvedValue(0);
  mockMirrorBlocks.mockReset();
  mockMirrorBlocks.mockResolvedValue(7);
});

describe("GET /api/knowledge/answers/governance-counts", () => {
  it("returns 403 without VIEW_ANSWERS", async () => {
    mockBuildContext.mockResolvedValue({
      userId: "u-1",
      workspaceId: "ws-1",
      membershipId: "m-1",
      role: "VIEWER",
      permissions: [],
    });

    const res = await governanceCountsGET(makeRequest());
    expect(res.status).toBe(403);
  });

  it("queries my_approvals with IN_REVIEW when approver may see the queue", async () => {
    mockBuildContext.mockResolvedValue({
      userId: "u-appr",
      workspaceId: "ws-1",
      membershipId: "m-1",
      role: "EDITOR",
      permissions: [Permission.VIEW_ANSWERS, Permission.APPROVE_ANSWERS],
    });

    await governanceCountsGET(makeRequest());

    const inReviewApproverCalls = answerCount.mock.calls.filter(
      (call) =>
        call[0]?.where?.governanceStatus === "IN_REVIEW" && call[0]?.where?.approverId === "u-appr",
    );
    expect(inReviewApproverCalls.length).toBeGreaterThanOrEqual(1);
    // drafts_awaiting_approval also uses IN_REVIEW without approver — ensure approver-scoped queue exists
    const myApprovalsShape = inReviewApproverCalls.some(
      (call) => call[0]?.where?.approverId === "u-appr" && call[0]?.where?.governanceStatus === "IN_REVIEW",
    );
    expect(myApprovalsShape).toBe(true);
  });

  it("loads questionnaire mirror block count for operator-like roles", async () => {
    mockBuildContext.mockResolvedValue({
      userId: "u-op",
      workspaceId: "ws-1",
      membershipId: "m-1",
      role: "OPERATOR",
      permissions: [Permission.VIEW_ANSWERS],
    });

    const res = await governanceCountsGET(makeRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { operatorQuestionnaireExportMirrorBlocks: number };
    expect(body.operatorQuestionnaireExportMirrorBlocks).toBe(7);
    expect(mockMirrorBlocks).toHaveBeenCalledWith("ws-1", expect.any(Date));
  });

  it("does not load questionnaire mirror block count for non-operator members", async () => {
    mockBuildContext.mockResolvedValue({
      userId: "u-ed",
      workspaceId: "ws-1",
      membershipId: "m-1",
      role: "EDITOR",
      permissions: [Permission.VIEW_ANSWERS, Permission.EDIT_ANSWERS],
    });

    const res = await governanceCountsGET(makeRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { operatorQuestionnaireExportMirrorBlocks: number };
    expect(body.operatorQuestionnaireExportMirrorBlocks).toBe(0);
    expect(mockMirrorBlocks).not.toHaveBeenCalled();
  });
});
