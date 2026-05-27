import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

vi.mock("@/lib/auth/build-context", () => ({
  buildAuthContext: vi.fn(),
}));

vi.mock("@/lib/audit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/audit")>();
  return {
    ...actual,
    recordAuditEventSafe: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock("@/modules/workspaces/intelligence/answer-embedding", () => ({
  computeAnswerEmbedding: vi.fn().mockResolvedValue(Array(64).fill(0.01)),
}));

import { prisma } from "@/lib/db/prisma";
import { buildAuthContext } from "@/lib/auth/build-context";
import { Permission } from "@/lib/auth/permissions";
import { recordAuditEventSafe, AUDIT_EVENT_TYPES } from "@/lib/audit";
import { POST } from "@/app/api/knowledge/answers/[id]/workflow/route";

const mockRecordAudit = vi.mocked(recordAuditEventSafe);

const mockBuildContext = vi.mocked(buildAuthContext);
const answerFindFirst = prisma.answerLibraryItem.findFirst as unknown as Mock;
const workspaceFindUnique = prisma.workspace.findUnique as unknown as Mock;
const answerTransaction = prisma.$transaction as unknown as Mock;

function makePostRequest(body: unknown): Request {
  return new Request("http://localhost/api/knowledge/answers/ans-1/workflow", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-workspace-id": "ws-1" },
    body: JSON.stringify(body),
  });
}

const baseAnswer = {
  id: "ans-1",
  workspaceId: "ws-1",
  title: "Title",
  answer: "Body",
  topicId: null as string | null,
  subControlKey: null as string | null,
  subControlLabels: [] as string[],
  owner: "Owner",
  ownerId: "owner-1",
  approverId: "approver-1",
  status: "DRAFT" as const,
  governanceStatus: "DRAFT" as const,
  approvalScope: "INTERNAL_ONLY" as const,
  exportSafe: false,
  confidenceScore: null as number | null,
  currentVersion: 1,
  reviewCadenceDays: null as number | null,
  evidenceRequired: false,
  approvedAt: null as Date | null,
  approvedByUserId: null as string | null,
  lastReviewedAt: null as Date | null,
  nextReviewDueAt: null as Date | null,
  expiresAt: null as Date | null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockBuildContext.mockReset();
  workspaceFindUnique.mockReset();
  workspaceFindUnique.mockResolvedValue({
    allowOwnerSelfApprove: false,
    defaultAnswerReviewCadenceDays: 90,
  } as never);
  answerFindFirst.mockReset();
  answerTransaction.mockReset();
});

describe("POST /api/knowledge/answers/[id]/workflow", () => {
  it("submits for approval when owner has submit permission", async () => {
    mockBuildContext.mockResolvedValue({
      userId: "owner-1",
      workspaceId: "ws-1",
      membershipId: "mem-1",
      role: "EDITOR",
      permissions: [Permission.EDIT_ANSWERS, Permission.SUBMIT_FOR_APPROVAL],
    });

    answerFindFirst
      .mockResolvedValueOnce({ ...baseAnswer } as never)
      .mockResolvedValueOnce({
        ...baseAnswer,
        governanceStatus: "IN_REVIEW",
        currentVersion: 2,
        topic: null,
        ownerUser: null,
        approverUser: null,
        approvedByUser: null,
        versions: [],
        evidence: [],
      } as never);

    answerTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        answerEvidence: {
          findMany: vi.fn().mockResolvedValue([] as never),
        },
        answerLibraryItem: {
          findFirst: vi.fn().mockResolvedValue({ ...baseAnswer } as never),
          update: vi.fn().mockResolvedValue({
            ...baseAnswer,
            governanceStatus: "IN_REVIEW",
            currentVersion: 2,
          } as never),
        },
        answerLibraryItemVersion: {
          create: vi.fn().mockResolvedValue({ id: "ver-2" } as never),
        },
      };
      return fn(tx);
    });

    const res = await POST(makePostRequest({ action: "submitForApproval" }), {
      params: Promise.resolve({ id: "ans-1" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.item.governanceStatus).toBe("IN_REVIEW");
    expect(answerTransaction).toHaveBeenCalled();

    expect(mockRecordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          before_governanceStatus: "DRAFT",
          after_governanceStatus: "IN_REVIEW",
        }),
      }),
    );
    expect(mockRecordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: AUDIT_EVENT_TYPES.ANSWER_LIBRARY_VERSION_RECORDED,
        metadata: expect.objectContaining({ version: 2, source: "workflow" }),
      }),
    );
  });

  it("approves internal when caller is designated approver", async () => {
    mockBuildContext.mockResolvedValue({
      userId: "approver-1",
      workspaceId: "ws-1",
      membershipId: "mem-2",
      role: "EDITOR",
      permissions: [Permission.EDIT_ANSWERS, Permission.APPROVE_ANSWERS],
    });

    const inReview = {
      ...baseAnswer,
      governanceStatus: "IN_REVIEW" as const,
      status: "DRAFT" as const,
    };

    answerFindFirst
      .mockResolvedValueOnce(inReview as never)
      .mockResolvedValueOnce({
        ...inReview,
        governanceStatus: "APPROVED_INTERNAL",
        status: "APPROVED",
        currentVersion: 2,
        topic: null,
        ownerUser: null,
        approverUser: null,
        approvedByUser: null,
        versions: [],
        evidence: [],
      } as never);

    answerTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        answerEvidence: {
          findMany: vi.fn().mockResolvedValue([] as never),
        },
        answerLibraryItem: {
          findFirst: vi.fn().mockResolvedValue({ ...inReview } as never),
          update: vi.fn().mockResolvedValue({
            ...inReview,
            governanceStatus: "APPROVED_INTERNAL",
            status: "APPROVED",
            currentVersion: 2,
          } as never),
        },
        answerLibraryItemVersion: {
          create: vi.fn().mockResolvedValue({ id: "ver-2" } as never),
        },
      };
      return fn(tx);
    });

    const res = await POST(makePostRequest({ action: "approveInternal" }), {
      params: Promise.resolve({ id: "ans-1" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.item.governanceStatus).toBe("APPROVED_INTERNAL");
  });

  it("returns 403 when actor lacks approve permission", async () => {
    mockBuildContext.mockResolvedValue({
      userId: "approver-1",
      workspaceId: "ws-1",
      membershipId: "mem-2",
      role: "CONTRIBUTOR",
      permissions: [Permission.EDIT_ANSWERS, Permission.VIEW_ANSWERS],
    });

    answerFindFirst.mockResolvedValueOnce({
      ...baseAnswer,
      governanceStatus: "IN_REVIEW",
    } as never);

    const res = await POST(makePostRequest({ action: "approveInternal" }), {
      params: Promise.resolve({ id: "ans-1" }),
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error?.code).toBe("INSUFFICIENT_ROLE");
    expect(answerTransaction).not.toHaveBeenCalled();
  });

  it("returns 403 SELF_APPROVE_NOT_ALLOWED when owner approves own answer and policy is off", async () => {
    mockBuildContext.mockResolvedValue({
      userId: "owner-1",
      workspaceId: "ws-1",
      membershipId: "mem-1",
      role: "EDITOR",
      permissions: [Permission.EDIT_ANSWERS, Permission.APPROVE_ANSWERS],
    });

    answerFindFirst.mockResolvedValueOnce({
      ...baseAnswer,
      ownerId: "owner-1",
      approverId: "owner-1",
      governanceStatus: "IN_REVIEW",
    } as never);

    const res = await POST(makePostRequest({ action: "approveInternal" }), {
      params: Promise.resolve({ id: "ans-1" }),
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe("SELF_APPROVE_NOT_ALLOWED");
    expect(answerTransaction).not.toHaveBeenCalled();
  });
});
