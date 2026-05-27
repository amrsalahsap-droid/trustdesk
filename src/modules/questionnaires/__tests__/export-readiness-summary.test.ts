import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    questionnaire: {
      findFirst: vi.fn(),
    },
    answerLibraryItem: {
      findMany: vi.fn(),
    },
    workspace: {
      findUnique: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/db/prisma";
import { QuestionnaireExportService } from "../questionnaire-export-service";

const mockFindFirst = prisma.questionnaire.findFirst as unknown as ReturnType<typeof vi.fn>;
const mockWorkspaceFindUnique = prisma.workspace.findUnique as unknown as ReturnType<typeof vi.fn>;

describe("Export Readiness Summary", () => {
  function readinessFixture(overrides: any = {}) {
    return {
      id: "qn-1",
      workspaceId: "ws-1",
      jobs: [
        {
          originalName: "acme.xlsx",
          mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          fileBytes: Buffer.from("abc"),
          selectedSheetName: "Responses",
          headerRowIndex: 0,
          answerColIndex: 1,
        },
      ],
      items: overrides.items ?? [
        { type: "question_row", reviewed: true, suggestedAnswerId: null, contradictionResult: null },
      ],
    };
  }

  beforeEach(() => {
    mockFindFirst.mockReset();
    mockWorkspaceFindUnique.mockReset();
    mockWorkspaceFindUnique.mockResolvedValue({
      questionnaireExportUnansweredPolicy: "IGNORE",
    });
  });

  it("verdict=ready when all rows are reviewed and no blockers exist", async () => {
    mockFindFirst.mockResolvedValueOnce(readinessFixture({
      items: [{ type: "question_row", reviewed: true, contradictionResult: null }]
    }));
    const readiness = await QuestionnaireExportService.getReadiness("qn-1", "ws-1");
    expect(readiness.summary.verdict).toBe("ready");
    expect(readiness.summary.title).toBe("Ready to export");
  });

  it("verdict=incomplete when unreviewed rows exist but no hard blockers", async () => {
    mockFindFirst.mockResolvedValueOnce(readinessFixture({
      items: [
        { type: "question_row", reviewed: true, contradictionResult: null },
        { type: "question_row", reviewed: false, contradictionResult: null },
      ]
    }));
    const readiness = await QuestionnaireExportService.getReadiness("qn-1", "ws-1");
    expect(readiness.summary.verdict).toBe("incomplete");
    expect(readiness.summary.title).toBe("Review in progress");
    expect(readiness.summary.message).toContain("1 rows have not been verified yet");
  });

  it("verdict=blocked when contradiction policy is BLOCK and contradiction exists", async () => {
    mockWorkspaceFindUnique.mockResolvedValue({
      questionnaireExportContradictionMediumPolicy: "BLOCK",
    });
    mockFindFirst.mockResolvedValueOnce(readinessFixture({
      items: [
        {
          type: "question_row",
          reviewed: true,
          contradictionResult: {
            contradictionFound: true,
            severity: "medium",
            resolutionStatus: "PENDING",
          },
        },
      ]
    }));
    const readiness = await QuestionnaireExportService.getReadiness("qn-1", "ws-1");
    expect(readiness.summary.verdict).toBe("blocked");
    expect(readiness.summary.title).toBe("Export blocked");
    expect(readiness.summary.blockerCount).toBe(1);
  });

  it("verdict=warning when non-blocking contradictions exist", async () => {
    mockWorkspaceFindUnique.mockResolvedValue({
      questionnaireExportContradictionMediumPolicy: "WARN",
    });
    mockFindFirst.mockResolvedValueOnce(readinessFixture({
      items: [
        {
          type: "question_row",
          reviewed: true,
          contradictionResult: {
            contradictionFound: true,
            severity: "medium",
            resolutionStatus: "PENDING",
          },
        },
      ]
    }));
    const readiness = await QuestionnaireExportService.getReadiness("qn-1", "ws-1");
    expect(readiness.summary.verdict).toBe("warning");
    expect(readiness.summary.title).toBe("Review recommended");
    expect(readiness.summary.warningCount).toBe(1);
  });

  it("verdict=blocked when completeness policy is BLOCK and rows are unanswered", async () => {
    mockWorkspaceFindUnique.mockResolvedValue({
      questionnaireExportUnansweredPolicy: "BLOCK",
    });
    mockFindFirst.mockResolvedValueOnce(readinessFixture({
      items: [
        { type: "question_row", reviewed: false, contradictionResult: null },
      ]
    }));
    const readiness = await QuestionnaireExportService.getReadiness("qn-1", "ws-1");
    expect(readiness.summary.verdict).toBe("blocked");
    expect(readiness.summary.blockerCount).toBe(1); // unanswered_row category
  });
});
