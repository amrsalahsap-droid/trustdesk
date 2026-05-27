import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/build-context", () => ({
  buildAuthContext: vi.fn(),
}));

vi.mock("@/lib/knowledge/governance-metrics", () => ({
  getGovernanceMetricsSnapshot: vi.fn(),
}));

import { buildAuthContext } from "@/lib/auth/build-context";
import { Permission } from "@/lib/auth/permissions";
import { getGovernanceMetricsSnapshot } from "@/lib/knowledge/governance-metrics";
import { GET as governanceMetricsGET } from "@/app/api/workspaces/governance-metrics/route";

const mockBuildContext = vi.mocked(buildAuthContext);
const mockSnapshot = vi.mocked(getGovernanceMetricsSnapshot);

beforeEach(() => {
  vi.clearAllMocks();
  mockBuildContext.mockReset();
  mockSnapshot.mockReset();
  mockSnapshot.mockResolvedValue({
    totalGovernedAnswers: 10,
    approvedInternal: 4,
    approvedForExport: 2,
    expired: 1,
    unowned: 0,
    missingApprover: 1,
    missingEvidence: 3,
    pendingApprovals: 2,
    overriddenThisMonth: 0,
    reviewedThisMonth: 0,
    newlyExpiredThisMonth: 0,
    openContradictionResultsHighOrCritical: 0,
    openContradictionResultsMedium: 0,
    contradictionGovernance: {
      unresolvedTotal: 0,
      highSeverityUnresolved: 0,
      dismissedTotal: 0,
      dismissedLast30Days: 0,
      canonicalUpdateRequestsOpen: 0,
      detectedLast7Days: 0,
      resolvedLast7Days: 0,
    },
    contradictionBreakdowns: {
      byTopic: [],
      byOwner: [],
      byApprover: [],
      byQuestionnaire: [],
      bySeverity: [],
    },
  });
});

describe("GET /api/workspaces/governance-metrics", () => {
  it("returns 403 without VIEW_ANSWERS", async () => {
    mockBuildContext.mockResolvedValue({
      userId: "u-1",
      workspaceId: "ws-1",
      membershipId: "m-1",
      role: "VIEWER",
      permissions: [],
    });

    const res = await governanceMetricsGET(
      new Request("http://localhost/api/workspaces/governance-metrics", {
        headers: { "x-workspace-id": "ws-1" },
      }),
    );
    expect(res.status).toBe(403);
    expect(mockSnapshot).not.toHaveBeenCalled();
  });

  it("returns snapshot JSON for authorized callers", async () => {
    mockBuildContext.mockResolvedValue({
      userId: "u-1",
      workspaceId: "ws-42",
      membershipId: "m-1",
      role: "AUDITOR",
      permissions: [Permission.VIEW_ANSWERS],
    });

    const res = await governanceMetricsGET(
      new Request("http://localhost/api/workspaces/governance-metrics", {
        headers: { "x-workspace-id": "ws-42" },
      }),
    );
    expect(res.status).toBe(200);
    expect(mockSnapshot).toHaveBeenCalledWith("ws-42");
    const body = await res.json();
    expect(body.totalGovernedAnswers).toBe(10);
    expect(body.pendingApprovals).toBe(2);
  });
});
