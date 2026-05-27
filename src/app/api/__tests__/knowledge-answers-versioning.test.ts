import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { Prisma } from "@prisma/client";

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

import { prisma, uncheckedPrisma } from "@/lib/db/prisma";
import { buildAuthContext } from "@/lib/auth/build-context";
import { Permission } from "@/lib/auth/permissions";
import { recordAuditEventSafe, AUDIT_EVENT_TYPES } from "@/lib/audit";
import { PATCH } from "@/app/api/knowledge/answers/[id]/route";

const mockRecordAudit = vi.mocked(recordAuditEventSafe);

const mockBuildContext = vi.mocked(buildAuthContext);

const answerFindFirst = prisma.answerLibraryItem.findFirst as unknown as Mock;
const answerTransaction = prisma.$transaction as unknown as Mock;

const workspaceFindUnique = uncheckedPrisma.workspace.findUnique as unknown as Mock;
const answerEvidenceFindMany = uncheckedPrisma.answerEvidence.findMany as unknown as Mock;

const ctx = {
  userId: "user-1",
  workspaceId: "ws-1",
  membershipId: "mem-1",
  role: "EDITOR" as const,
  permissions: [
    Permission.EDIT_ANSWERS,
    Permission.VIEW_ANSWERS,
    Permission.SUBMIT_FOR_APPROVAL,
    Permission.APPROVE_ANSWERS,
  ],
};

const existingRow = {
  id: "ans-1",
  workspaceId: "ws-1",
  title: "Title",
  answer: "Body",
  topicId: "topic-1",
  owner: "Owner",
  ownerId: "user-1" as string | null,
  approverId: null as string | null,
  status: "DRAFT" as const,
  governanceStatus: "DRAFT" as const,
  approvalScope: "INTERNAL_ONLY" as const,
  exportSafe: false,
  reviewCadenceDays: null as number | null,
  confidenceScore: null as number | null,
  currentVersion: 1,
  subControlKey: null as string | null,
  subControlLabels: [] as string[],
  evidenceRequired: false,
  approvedAt: null as Date | null,
  approvedByUserId: null as string | null,
  lastReviewedAt: null as Date | null,
  nextReviewDueAt: null as Date | null,
  expiresAt: null as Date | null,
  overrideReasonCategory: null as string | null,
  overrideComment: null as string | null,
  overrideScope: null as string | null,
  overrideAt: null as Date | null,
  overrideByUserId: null as string | null,
};

function makePatchRequest(body: unknown): Request {
  return new Request("http://localhost/api/knowledge/answers/ans-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "x-workspace-id": "ws-1" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockBuildContext.mockReset();
  mockBuildContext.mockResolvedValue(ctx);
  answerFindFirst.mockReset();
  answerFindFirst.mockResolvedValue(null);
  workspaceFindUnique.mockReset();
  workspaceFindUnique.mockResolvedValue({
    defaultAnswerReviewCadenceDays: 90,
    allowApprovedAnswerBodyEditWithoutReapproval: false,
  } as never);
  answerEvidenceFindMany.mockReset();
  answerEvidenceFindMany.mockResolvedValue([] as never);
});

describe("PATCH /api/knowledge/answers/[id] versioning", () => {
  it("does not call $transaction when payload matches existing (no-op save)", async () => {
    const detailPayload = {
      ...existingRow,
      topic: { id: "topic-1", name: "T", key: "t" },
      ownerUser: null,
      versions: [],
      evidence: [],
    };

    let findFirstCalls = 0;
    answerFindFirst.mockImplementation(() => {
      findFirstCalls += 1;
      if (findFirstCalls === 1) {
        return Promise.resolve({ ...existingRow } as never);
      }
      return Promise.resolve(detailPayload as never);
    });

    const res = await PATCH(
      makePatchRequest({
        title: existingRow.title,
        answer: existingRow.answer,
        topicId: existingRow.topicId,
        owner: existingRow.owner,
        status: existingRow.status,
      }),
      { params: Promise.resolve({ id: "ans-1" }) },
    );

    expect(res.status).toBe(200);
    expect(answerTransaction).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body.item).toEqual(detailPayload);
  });

  it("bumps currentVersion and runs transaction when answer text changes", async () => {
    answerFindFirst
      .mockResolvedValueOnce({ ...existingRow } as never)
      .mockResolvedValueOnce({
        ...existingRow,
        answer: "New body",
        currentVersion: 2,
        topic: { id: "topic-1", name: "T", key: "t" },
        ownerUser: null,
        versions: [
          {
            id: "v2",
            versionNumber: 2,
            answerText: "New body",
            status: "DRAFT",
            changeReason: "User update",
            createdAt: new Date().toISOString(),
            changedBy: { name: "U", email: "u@x" },
          },
        ],
        evidence: [],
      } as never);

    answerTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        workspace: {
          findUnique: vi.fn().mockResolvedValue({
            defaultAnswerReviewCadenceDays: 90,
            allowApprovedAnswerBodyEditWithoutReapproval: false,
          } as never),
        },
        knowledgeTopic: {
          findUnique: vi.fn().mockResolvedValue({ reviewCadenceDays: null } as never),
        },
        answerEvidence: {
          findMany: vi.fn().mockResolvedValue([] as never),
        },
        answerLibraryItem: {
          findFirst: vi.fn().mockResolvedValue({ ...existingRow } as never),
          update: vi.fn().mockResolvedValue({
            ...existingRow,
            answer: "New body",
            currentVersion: 2,
            overrideReasonCategory: null,
            overrideComment: null,
            overrideScope: null,
            overrideAt: null,
            overrideByUserId: null,
            topic: { id: "topic-1", name: "T", key: "t" },
            ownerUser: null,
          } as never),
        },
        answerLibraryItemVersion: {
          create: vi.fn().mockResolvedValue({ id: "ver-2" } as never),
        },
      };
      return fn(tx);
    });

    const res = await PATCH(
      makePatchRequest({
        title: existingRow.title,
        answer: "New body",
        topicId: existingRow.topicId,
        owner: existingRow.owner,
        status: existingRow.status,
      }),
      { params: Promise.resolve({ id: "ans-1" }) },
    );

    expect(res.status).toBe(200);
    expect(answerTransaction).toHaveBeenCalledTimes(1);
    const body = await res.json();
    expect(body.item.currentVersion).toBe(2);
    expect(body.item.answer).toBe("New body");
  });

  it("retries once on P2002 unique violation then succeeds", async () => {
    answerFindFirst
      .mockResolvedValueOnce({ ...existingRow } as never)
      .mockResolvedValueOnce({
        ...existingRow,
        answer: "New body",
        currentVersion: 2,
        topic: { id: "topic-1", name: "T", key: "t" },
        ownerUser: null,
        versions: [],
        evidence: [],
      } as never);

    const p2002 = new Prisma.PrismaClientKnownRequestError("Unique", {
      code: "P2002",
      clientVersion: "test",
      meta: { modelName: "AnswerLibraryItemVersion", target: ["answerId", "versionNumber"] },
    });

    let versionCreateAttempts = 0;
    answerTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        workspace: {
          findUnique: vi.fn().mockResolvedValue({
            defaultAnswerReviewCadenceDays: 90,
            allowApprovedAnswerBodyEditWithoutReapproval: false,
          } as never),
        },
        knowledgeTopic: {
          findUnique: vi.fn().mockResolvedValue({ reviewCadenceDays: null } as never),
        },
        answerEvidence: {
          findMany: vi.fn().mockResolvedValue([] as never),
        },
        answerLibraryItem: {
          findFirst: vi.fn().mockResolvedValue({ ...existingRow, currentVersion: 1 } as never),
          update: vi.fn().mockResolvedValue({
            ...existingRow,
            answer: "New body",
            currentVersion: 2,
            overrideReasonCategory: null,
            overrideComment: null,
            overrideScope: null,
            overrideAt: null,
            overrideByUserId: null,
            topic: { id: "topic-1", name: "T", key: "t" },
            ownerUser: null,
          } as never),
        },
        answerLibraryItemVersion: {
          create: vi.fn(() => {
            versionCreateAttempts += 1;
            if (versionCreateAttempts === 1) {
              return Promise.reject(p2002);
            }
            return Promise.resolve({ id: "ver-ok" } as never);
          }),
        },
      };
      return fn(tx);
    });

    const res = await PATCH(
      makePatchRequest({
        title: existingRow.title,
        answer: "New body",
        topicId: existingRow.topicId,
        owner: existingRow.owner,
        status: existingRow.status,
      }),
      { params: Promise.resolve({ id: "ans-1" }) },
    );

    expect(res.status).toBe(200);
    expect(answerTransaction).toHaveBeenCalledTimes(2);
  });

  it("returns 400 OVERRIDE_REQUIRED when APPROVED_INTERNAL body changes without override", async () => {
    const approved = {
      ...existingRow,
      status: "APPROVED" as const,
      governanceStatus: "APPROVED_INTERNAL" as const,
    };
    answerFindFirst.mockResolvedValueOnce(approved as never);

    const res = await PATCH(
      makePatchRequest({
        title: approved.title,
        answer: "New body",
        topicId: approved.topicId,
        owner: approved.owner,
        status: approved.status,
      }),
      { params: Promise.resolve({ id: "ans-1" }) },
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("OVERRIDE_REQUIRED");
    expect(answerTransaction).not.toHaveBeenCalled();
  });

  it("downgrades APPROVED_INTERNAL to REVISION_REQUIRED when answer body changes with valid override", async () => {
    const approved = {
      ...existingRow,
      status: "APPROVED" as const,
      governanceStatus: "APPROVED_INTERNAL" as const,
    };
    answerFindFirst
      .mockResolvedValueOnce(approved as never)
      .mockResolvedValueOnce({
        ...approved,
        answer: "New body",
        governanceStatus: "REVISION_REQUIRED",
        status: "DRAFT",
        currentVersion: 2,
        topic: { id: "topic-1", name: "T", key: "t" },
        ownerUser: null,
        versions: [],
        evidence: [],
      } as never);

    const updateSpy = vi.fn().mockResolvedValue({
      ...approved,
      answer: "New body",
      governanceStatus: "REVISION_REQUIRED",
      status: "DRAFT",
      currentVersion: 2,
      overrideReasonCategory: "WORDING_CLARIFICATION",
      overrideComment: null,
      overrideScope: "QUESTIONNAIRE_ONLY",
      overrideAt: new Date(),
      overrideByUserId: "user-1",
    } as never);

    answerTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        workspace: {
          findUnique: vi.fn().mockResolvedValue({
            defaultAnswerReviewCadenceDays: 90,
            allowApprovedAnswerBodyEditWithoutReapproval: false,
          } as never),
        },
        knowledgeTopic: {
          findUnique: vi.fn().mockResolvedValue({ reviewCadenceDays: null } as never),
        },
        answerEvidence: {
          findMany: vi.fn().mockResolvedValue([] as never),
        },
        answerLibraryItem: {
          findFirst: vi.fn().mockResolvedValue(approved as never),
          update: updateSpy,
        },
        answerLibraryItemVersion: {
          create: vi.fn().mockResolvedValue({ id: "ver-2" } as never),
        },
      };
      return fn(tx);
    });

    const res = await PATCH(
      makePatchRequest({
        title: approved.title,
        answer: "New body",
        topicId: approved.topicId,
        owner: approved.owner,
        status: approved.status,
        overrideReasonCategory: "WORDING_CLARIFICATION",
        overrideScope: "QUESTIONNAIRE_ONLY",
        overrideComment: null,
      }),
      { params: Promise.resolve({ id: "ans-1" }) },
    );

    expect(res.status).toBe(200);
    expect(updateSpy).toHaveBeenCalled();
    const updateArg = updateSpy.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(updateArg.data.governanceStatus).toBe("REVISION_REQUIRED");
    expect(updateArg.data.status).toBe("DRAFT");
    expect(updateArg.data.overrideReasonCategory).toBe("WORDING_CLARIFICATION");
  });

  it("returns 401 when buildAuthContext fails with authentication", async () => {
    const { AuthenticationError } = await import("@/lib/auth/errors");
    mockBuildContext.mockRejectedValueOnce(new AuthenticationError());

    const res = await PATCH(
      makePatchRequest({ title: "x", answer: "y", topicId: "t", owner: "", status: "DRAFT" }),
      { params: Promise.resolve({ id: "ans-1" }) },
    );

    expect(res.status).toBe(401);
  });

  it("returns 500 when transaction fails without P2002 (no partial success returned)", async () => {
    answerFindFirst.mockResolvedValueOnce({ ...existingRow } as never);
    answerTransaction.mockRejectedValueOnce(new Error("database unavailable"));

    const res = await PATCH(
      makePatchRequest({
        title: existingRow.title,
        answer: "Changed",
        topicId: existingRow.topicId,
        owner: existingRow.owner,
        status: existingRow.status,
      }),
      { params: Promise.resolve({ id: "ans-1" }) },
    );

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe("INTERNAL_ERROR");
  });

  it("records ANSWER_REVIEW_SCHEDULE_CHANGED when reviewCadenceDays changes on an approved answer", async () => {
    const approved = {
      ...existingRow,
      governanceStatus: "APPROVED_INTERNAL" as const,
      status: "APPROVED" as const,
      reviewCadenceDays: 90,
      lastReviewedAt: new Date("2024-06-01T00:00:00.000Z"),
      nextReviewDueAt: new Date("2024-09-01T00:00:00.000Z"),
    };

    answerFindFirst
      .mockResolvedValueOnce(approved as never)
      .mockResolvedValueOnce({
        ...approved,
        reviewCadenceDays: 180,
        nextReviewDueAt: new Date("2025-01-01T00:00:00.000Z"),
        currentVersion: 2,
        topic: { id: "topic-1", name: "T", key: "t" },
        ownerUser: null,
        versions: [],
        evidence: [],
      } as never);

    answerTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        workspace: {
          findUnique: vi.fn().mockResolvedValue({
            defaultAnswerReviewCadenceDays: 90,
            allowApprovedAnswerBodyEditWithoutReapproval: false,
          } as never),
        },
        knowledgeTopic: {
          findUnique: vi.fn().mockResolvedValue({ reviewCadenceDays: null } as never),
        },
        answerEvidence: {
          findMany: vi.fn().mockResolvedValue([] as never),
        },
        answerLibraryItem: {
          findFirst: vi.fn().mockResolvedValue({ ...approved } as never),
          update: vi.fn().mockResolvedValue({
            ...approved,
            reviewCadenceDays: 180,
            nextReviewDueAt: new Date("2025-01-01T00:00:00.000Z"),
            currentVersion: 2,
            topic: { id: "topic-1", name: "T", key: "t" },
            ownerUser: null,
          } as never),
        },
        answerLibraryItemVersion: {
          create: vi.fn().mockResolvedValue({ id: "ver-2" } as never),
        },
      };
      return fn(tx);
    });

    const res = await PATCH(
      makePatchRequest({
        title: approved.title,
        answer: approved.answer,
        topicId: approved.topicId,
        owner: approved.owner,
        status: approved.status,
        reviewCadenceDays: 180,
      }),
      { params: Promise.resolve({ id: "ans-1" }) },
    );

    expect(res.status).toBe(200);
    const scheduleCall = mockRecordAudit.mock.calls.find(
      (c) => c[0].eventType === AUDIT_EVENT_TYPES.ANSWER_REVIEW_SCHEDULE_CHANGED,
    );
    expect(scheduleCall).toBeDefined();
    expect(scheduleCall?.[0].metadata).toMatchObject({
      before_reviewCadenceDays: 90,
      after_reviewCadenceDays: 180,
    });
  });

  it("returns 409 USE_WORKFLOW when setting APPROVED while governance is IN_REVIEW", async () => {
    answerFindFirst.mockResolvedValueOnce({
      ...existingRow,
      governanceStatus: "IN_REVIEW",
      approverId: "approver-1",
    } as never);

    const res = await PATCH(
      makePatchRequest({
        status: "APPROVED",
        changeReason: "Bypass",
      }),
      { params: Promise.resolve({ id: "ans-1" }) },
    );

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("USE_WORKFLOW");
    expect(body.error).toContain("workflow");
  });
});
