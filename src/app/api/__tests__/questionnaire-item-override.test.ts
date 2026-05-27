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

import { prisma, uncheckedPrisma } from "@/lib/db/prisma";
import { buildAuthContext } from "@/lib/auth/build-context";
import { PATCH } from "@/app/api/questionnaires/[id]/items/[itemId]/route";

const mockBuildContext = vi.mocked(buildAuthContext);

const questionnaireItemFindFirst = uncheckedPrisma.questionnaireItem.findFirst as unknown as Mock;
const prismaTransaction = prisma.$transaction as unknown as Mock;

const ctx = {
  userId: "user-1",
  workspaceId: "ws-1",
  membershipId: "mem-1",
  role: "EDITOR" as const,
  permissions: [] as const,
};

const baseItem = {
  id: "item-1",
  workspaceId: "ws-1",
  questionnaireId: "qn-1",
  finalAnswer: "",
  suggestedAnswer: "Official suggested line",
  reviewed: false,
  reviewStatus: "ok",
  verificationStatus: "SUGGESTED" as const,
  conflictNote: null,
  topicId: null,
  suggestedAnswerId: null,
  suggestionStatus: null,
  candidatesJson: null,
};

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/questionnaires/qn-1/items/item-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "x-workspace-id": "ws-1" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/questionnaires/[id]/items/[itemId] override rationale", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBuildContext.mockResolvedValue(ctx as never);
    questionnaireItemFindFirst.mockReset();
    prismaTransaction.mockReset();
  });

  it("returns 400 when final answer deviates without override fields", async () => {
    questionnaireItemFindFirst.mockResolvedValue(baseItem as never);
    const res = await PATCH(makeRequest({ finalAnswer: "Different answer", reviewed: true }), {
      params: Promise.resolve({ id: "qn-1", itemId: "item-1" }),
    });

    expect(res.status).toBe(400);
    expect(prismaTransaction).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body.error?.code).toBe("OVERRIDE_REQUIRED");
  });

  it("returns 200 and persists override when payload is valid", async () => {
    questionnaireItemFindFirst.mockResolvedValue(baseItem as never);
    const updated = {
      ...baseItem,
      finalAnswer: "Different answer",
      reviewed: true,
      verificationStatus: "MANUAL_OVERRIDE",
      overrideReasonCategory: "WORDING_CLARIFICATION",
      overrideComment: null,
      overrideScope: "QUESTIONNAIRE_ONLY",
      overrideAt: new Date(),
      overrideByUserId: "user-1",
    };
    prismaTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      return fn({
        gapFlag: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
        questionnaireItem: {
          update: vi.fn().mockResolvedValue(updated),
        },
      });
    });

    const res = await PATCH(
      makeRequest({
        finalAnswer: "Different answer",
        reviewed: true,
        overrideReasonCategory: "WORDING_CLARIFICATION",
        overrideScope: "QUESTIONNAIRE_ONLY",
        overrideComment: null,
      }),
      { params: Promise.resolve({ id: "qn-1", itemId: "item-1" }) },
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.item.finalAnswer).toBe("Different answer");
    expect(body.item.overrideReasonCategory).toBe("WORDING_CLARIFICATION");
  });
});
