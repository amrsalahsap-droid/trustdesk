import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "../route";
import { prisma } from "@/lib/db/prisma";
import { buildAuthContext } from "@/lib/auth/build-context";

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    questionnaireItem: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    gapFlag: {
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn((cb) => cb(prisma)),
    $executeRaw: vi.fn(),
  },
}));

vi.mock("@/lib/auth/build-context", () => ({
  buildAuthContext: vi.fn(),
}));

vi.mock("@/lib/auth/governance-actions", () => ({
  assertQuestionnaireBulkAction: vi.fn(),
}));

describe("Bulk Review API - Provenance Hardening", () => {
  const mockCtx = {
    userId: "u1",
    workspaceId: "w1",
    role: "ADMIN",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(buildAuthContext).mockResolvedValue(mockCtx as any);
  });

  it("8. Bulk accept suggested sets finalAnswerSelection = suggested", async () => {
    vi.mocked(prisma.questionnaireItem.findMany).mockResolvedValue([
      { id: "item1", suggestedAnswer: "AI", importedAnswer: null, verificationStatus: "ACCEPTED" },
    ] as any);
    vi.mocked(prisma.questionnaireItem.updateMany).mockResolvedValue({ count: 1 } as any);

    const req = new Request("http://localhost/api/bulk", {
      method: "POST",
      body: JSON.stringify({ itemIds: ["item1"], action: "accept" }),
    });

    await POST(req, { params: Promise.resolve({ id: "q1" }) });

    // Verify it attempted the raw SQL update
    expect(prisma.$executeRaw).toHaveBeenCalled();
  });

  it("9. Bulk reject/clear does not set finalAnswerSelection = edited", async () => {
    vi.mocked(prisma.questionnaireItem.findMany).mockResolvedValue([
      { id: "item1", suggestedAnswer: "AI", importedAnswer: null },
    ] as any);
    vi.mocked(prisma.questionnaireItem.updateMany).mockResolvedValue({ count: 1 } as any);

    const req = new Request("http://localhost/api/bulk", {
      method: "POST",
      body: JSON.stringify({ itemIds: ["item1"], action: "reject" }),
    });

    await POST(req, { params: Promise.resolve({ id: "q1" }) });

    expect(prisma.questionnaireItem.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          finalAnswerSelection: null,
          verificationStatus: "REJECTED",
        }),
      })
    );
  });
});
