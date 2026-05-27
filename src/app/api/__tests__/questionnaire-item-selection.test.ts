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

vi.mock("@/lib/questionnaires/reconcile-questionnaire-item-contradiction", () => ({
  reconcileQuestionnaireItemContradiction: vi.fn().mockResolvedValue(undefined),
}));

import { prisma, uncheckedPrisma } from "@/lib/db/prisma";
import { buildAuthContext } from "@/lib/auth/build-context";
import { recordAuditEventSafe, AUDIT_EVENT_TYPES } from "@/lib/audit";
import { Permission } from "@/lib/auth/permissions";
import { PATCH } from "@/app/api/questionnaires/[id]/items/[itemId]/route";

const mockBuildContext = vi.mocked(buildAuthContext);
const mockAudit = vi.mocked(recordAuditEventSafe);

const questionnaireItemFindFirst = uncheckedPrisma.questionnaireItem.findFirst as unknown as Mock;
const prismaTransaction = prisma.$transaction as unknown as Mock;

const ctx = {
  userId: "user-1",
  workspaceId: "ws-1",
  membershipId: "mem-1",
  role: "ADMIN" as const,
  permissions: [
    Permission.REVIEW_ROWS,
    Permission.EDIT_ANSWERS,
    Permission.ASSIGN_ROWS,
  ] as const,
};

function baseItem(overrides: Record<string, unknown> = {}) {
  return {
    id: "item-1",
    workspaceId: "ws-1",
    questionnaireId: "qn-1",
    type: "question_row",
    finalAnswer: "",
    suggestedAnswer: "AI-drafted answer",
    importedAnswer: "We use AES-256 only on databases.",
    importedAnswerSource: "raw_import",
    finalAnswerSelection: null,
    reviewed: false,
    reviewStatus: "ok",
    verificationStatus: "SUGGESTED" as const,
    conflictNote: null,
    topicId: null,
    suggestedAnswerId: null,
    suggestionStatus: null,
    candidatesJson: null,
    ...overrides,
  };
}

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/questionnaires/qn-1/items/item-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "x-workspace-id": "ws-1" },
    body: JSON.stringify(body),
  });
}

function stubTxUpdate(nextItem: Record<string, unknown>) {
  prismaTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
    return fn({
      gapFlag: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
      questionnaireItem: {
        update: vi.fn().mockResolvedValue(nextItem),
      },
    });
  });
}

describe("PATCH /api/questionnaires/[id]/items/[itemId] finalAnswerSelection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBuildContext.mockResolvedValue(ctx as never);
    questionnaireItemFindFirst.mockReset();
    prismaTransaction.mockReset();
  });

  it("accepts finalAnswerSelection='imported' when finalAnswer matches importedAnswer and records audit", async () => {
    const item = baseItem();
    questionnaireItemFindFirst.mockResolvedValue(item as never);
    stubTxUpdate({
      ...item,
      finalAnswer: item.importedAnswer,
      finalAnswerSelection: "imported",
      reviewed: true,
    });

    const res = await PATCH(
      makeRequest({
        finalAnswer: item.importedAnswer,
        finalAnswerSelection: "imported",
        reviewed: true,
        verificationStatus: "ACCEPTED",
      }),
      { params: Promise.resolve({ id: "qn-1", itemId: "item-1" }) },
    );

    expect(res.status).toBe(200);
    expect(mockAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: AUDIT_EVENT_TYPES.QUESTIONNAIRE_ITEM_FINAL_ANSWER_SELECTED,
      }),
    );
  });

  it("rejects finalAnswerSelection='imported' with 422 when the row has no importedAnswer", async () => {
    questionnaireItemFindFirst.mockResolvedValue(
      baseItem({ importedAnswer: null, importedAnswerSource: null }) as never,
    );

    const res = await PATCH(
      makeRequest({
        finalAnswer: "Anything",
        finalAnswerSelection: "imported",
        reviewed: true,
      }),
      { params: Promise.resolve({ id: "qn-1", itemId: "item-1" }) },
    );

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error?.code).toBe("INVALID_SELECTION");
    expect(prismaTransaction).not.toHaveBeenCalled();
  });

  it("rejects finalAnswerSelection='imported' with 422 when finalAnswer disagrees with importedAnswer", async () => {
    const item = baseItem();
    questionnaireItemFindFirst.mockResolvedValue(item as never);

    const res = await PATCH(
      makeRequest({
        finalAnswer: "Something else entirely",
        finalAnswerSelection: "imported",
        reviewed: true,
      }),
      { params: Promise.resolve({ id: "qn-1", itemId: "item-1" }) },
    );

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error?.code).toBe("INVALID_SELECTION");
  });

  it("rejects finalAnswerSelection='suggested' with 422 when the row has no suggestedAnswer", async () => {
    questionnaireItemFindFirst.mockResolvedValue(
      baseItem({ suggestedAnswer: "" }) as never,
    );

    const res = await PATCH(
      makeRequest({
        finalAnswer: "",
        finalAnswerSelection: "suggested",
        reviewed: true,
      }),
      { params: Promise.resolve({ id: "qn-1", itemId: "item-1" }) },
    );

    expect(res.status).toBe(422);
  });

  it("rejects reviewed=true without an explicit finalAnswerSelection", async () => {
    questionnaireItemFindFirst.mockResolvedValue(baseItem() as never);

    const res = await PATCH(
      makeRequest({
        reviewed: true,
      }),
      { params: Promise.resolve({ id: "qn-1", itemId: "item-1" }) },
    );

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error?.code).toBe("REVIEW_REQUIRES_SELECTION");
  });

  it("grandfathers in already-reviewed rows without forcing a re-pick", async () => {
    const item = baseItem({ reviewed: true, finalAnswerSelection: "suggested" });
    questionnaireItemFindFirst.mockResolvedValue(item as never);
    stubTxUpdate(item);

    const res = await PATCH(
      makeRequest({
        // Just updating a non-answer field; selection was set before.
        suggestionStatus: "approved",
      }),
      { params: Promise.resolve({ id: "qn-1", itemId: "item-1" }) },
    );

    expect(res.status).toBe(200);
  });
});
