import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { QuestionnaireExportService } from "../questionnaire-export-service";

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    questionnaire: {
      findFirst: vi.fn(),
    },
    workspace: {
      findUnique: vi.fn(),
    },
    answerLibraryItem: {
      findMany: vi.fn(),
    },
  },
}));

const mockFindFirst = prisma.questionnaire.findFirst as unknown as ReturnType<typeof vi.fn>;
const mockWorkspaceFindUnique = prisma.workspace.findUnique as unknown as ReturnType<typeof vi.fn>;
const mockAnswerFindMany = prisma.answerLibraryItem.findMany as unknown as ReturnType<typeof vi.fn>;

function itemFixture(overrides: any = {}) {
  return {
    id: "item-1",
    type: "question_row",
    rowNumber: 1,
    question: "Test?",
    reviewed: false,
    finalAnswer: null,
    suggestedAnswer: null,
    importedAnswer: null,
    finalAnswerSelection: null,
    contradictionResult: null,
    ...overrides,
  };
}

function questionnaireFixture(items: any[] = []) {
  return {
    id: "qn-1",
    workspaceId: "ws-1",
    title: "Test QN",
    jobs: [
      {
        id: "job-1",
        selectedSheetName: "Responses",
        headerRowIndex: 0,
        questionColIndex: 0,
        answerColIndex: 1,
        fileBytes: Buffer.from("dummy"),
      },
    ],
    items,
  };
}

describe("Export Readiness Integrity", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockWorkspaceFindUnique.mockResolvedValue({
      questionnaireExportUnansweredPolicy: "BLOCK",
      questionnaireExportContradictionMediumPolicy: "WARN",
    });
    mockAnswerFindMany.mockResolvedValue([]);
  });

  it("Scenario 1: no issues -> ready and canExport true", async () => {
    mockFindFirst.mockResolvedValue(questionnaireFixture([
      itemFixture({ reviewed: true, finalAnswer: "Yes", finalAnswerSelection: "suggested" })
    ]));
    
    const res = await QuestionnaireExportService.getReadiness("qn-1", "ws-1");
    expect(res.readinessLabel).toBe("ready");
    expect(res.canExport).toBe(true);
    expect(res.readyQuestions).toBe(1);
    expect(res.answeredReadyQuestions).toBe(1);
  });

  it("Scenario 2: warnings only -> ready_with_warnings and canExport true", async () => {
    mockFindFirst.mockResolvedValue(questionnaireFixture([
      itemFixture({ 
        reviewed: true, 
        finalAnswer: "Yes", 
        finalAnswerSelection: "suggested",
        contradictionResult: { contradictionFound: true, severity: "low", resolutionStatus: "PENDING" }
      })
    ]));
    
    const res = await QuestionnaireExportService.getReadiness("qn-1", "ws-1");
    expect(res.readinessLabel).toBe("ready_with_warnings");
    expect(res.canExport).toBe(true);
    expect(res.warningQuestions).toBeGreaterThan(0);
  });

  it("Scenario 3: unanswered required rows -> incomplete and canExport false", async () => {
    mockFindFirst.mockResolvedValue(questionnaireFixture([
      itemFixture({ reviewed: false, finalAnswer: null })
    ]));
    
    const res = await QuestionnaireExportService.getReadiness("qn-1", "ws-1");
    expect(res.readinessLabel).toBe("incomplete");
    expect(res.canExport).toBe(false);
    expect(res.unansweredQuestions).toBe(1);
  });

  it("Scenario 4: blocker exists -> blocked and canExport false", async () => {
    mockFindFirst.mockResolvedValue(questionnaireFixture([
      itemFixture({ 
        reviewed: true, 
        finalAnswer: "Yes", 
        finalAnswerSelection: "suggested",
        contradictionResult: { contradictionFound: true, severity: "high", resolutionStatus: "PENDING" }
      })
    ]));
    
    const res = await QuestionnaireExportService.getReadiness("qn-1", "ws-1");
    expect(res.readinessLabel).toBe("blocked");
    expect(res.canExport).toBe(false);
  });

  it("Scenario 5: suggested-but-unconfirmed rows -> needs_review and canExport false", async () => {
    mockFindFirst.mockResolvedValue(questionnaireFixture([
      itemFixture({ reviewed: false, suggestedAnswer: "AI says yes" })
    ]));
    
    const res = await QuestionnaireExportService.getReadiness("qn-1", "ws-1");
    expect(res.readinessLabel).toBe("needs_review");
    expect(res.canExport).toBe(false);
    expect(res.suggestedButUnconfirmedQuestions).toBe(1);
  });

  it("Scenario 6: verified-empty rows are counted separately and disclosed", async () => {
    mockFindFirst.mockResolvedValue(questionnaireFixture([
      itemFixture({ reviewed: true, finalAnswer: "" }) // verified_empty
    ]));
    
    const res = await QuestionnaireExportService.getReadiness("qn-1", "ws-1");
    expect(res.readyQuestions).toBe(1);
    expect(res.verifiedEmptyQuestions).toBe(1);
    expect(res.answeredReadyQuestions).toBe(0);
    expect(res.blockers.some(b => b.kind === "verified_empty")).toBe(true);
  });

  it("Scenario 7: completeness percentage is accurate", async () => {
    mockFindFirst.mockResolvedValue(questionnaireFixture([
      itemFixture({ reviewed: true, finalAnswer: "Yes", finalAnswerSelection: "suggested" }),
      itemFixture({ reviewed: false })
    ]));
    
    const res = await QuestionnaireExportService.getReadiness("qn-1", "ws-1");
    expect(res.completenessPercentage).toBe(50);
  });

  it("Scenario 9: suggestedAnswer alone does not count as final/ready", async () => {
    mockFindFirst.mockResolvedValue(questionnaireFixture([
      itemFixture({ reviewed: false, suggestedAnswer: "Yes" })
    ]));
    
    const res = await QuestionnaireExportService.getReadiness("qn-1", "ws-1");
    expect(res.readyQuestions).toBe(0);
    expect(res.answeredReadyQuestions).toBe(0);
    expect(res.suggestedButUnconfirmedQuestions).toBe(1);
  });

  it("Scenario 10: finalAnswer without finalAnswerSelection is flagged as warning", async () => {
    mockFindFirst.mockResolvedValue(questionnaireFixture([
      itemFixture({ reviewed: true, finalAnswer: "Yes", finalAnswerSelection: null })
    ]));
    
    const res = await QuestionnaireExportService.getReadiness("qn-1", "ws-1");
    expect(res.readyQuestions).toBe(1);
    expect(res.answeredReadyQuestions).toBe(0);
    expect(res.warningQuestions).toBeGreaterThan(0);
    expect(res.blockers.some(b => b.kind === "missing_selection_source")).toBe(true);
  });

  it("Scenario 11: contradiction detection skips blank_unanswered", async () => {
    mockFindFirst.mockResolvedValue(questionnaireFixture([
      itemFixture({ 
        reviewed: false, 
        finalAnswer: null,
        contradictionResult: { contradictionFound: true, severity: "high", resolutionStatus: "PENDING" }
      })
    ]));
    
    const res = await QuestionnaireExportService.getReadiness("qn-1", "ws-1");
    // Should be incomplete (due to unanswered) but NOT blocked by contradiction
    expect(res.readinessLabel).toBe("incomplete");
    expect(res.blockers.some(b => b.kind === "contradiction" && b.gating === "block")).toBe(false);
  });

  it("Scenario 12: contradiction detection skips verified-empty", async () => {
    mockFindFirst.mockResolvedValue(questionnaireFixture([
      itemFixture({ 
        reviewed: true, 
        finalAnswer: "",
        contradictionResult: { contradictionFound: true, severity: "high", resolutionStatus: "PENDING" }
      })
    ]));
    
    const res = await QuestionnaireExportService.getReadiness("qn-1", "ws-1");
    // Should be ready_with_warnings (due to verified_empty) but NOT blocked by contradiction
    expect(res.readinessLabel).toBe("ready_with_warnings");
    expect(res.blockers.some(b => b.kind === "contradiction" && b.gating === "block")).toBe(false);
  });

  it("Scenario 14: label precedence works (blocked > incomplete > needs_review)", async () => {
    mockFindFirst.mockResolvedValue(questionnaireFixture([
      itemFixture({ 
        reviewed: true, 
        finalAnswer: "Yes", 
        finalAnswerSelection: "suggested",
        contradictionResult: { contradictionFound: true, severity: "high", resolutionStatus: "PENDING" }
      }),
      itemFixture({ reviewed: false, finalAnswer: null }), // incomplete
      itemFixture({ reviewed: false, suggestedAnswer: "Draft" }) // needs_review
    ]));
    
    const res = await QuestionnaireExportService.getReadiness("qn-1", "ws-1");
    expect(res.readinessLabel).toBe("blocked");
  });
});
