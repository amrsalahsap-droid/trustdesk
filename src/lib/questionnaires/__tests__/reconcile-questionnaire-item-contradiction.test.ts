import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    questionnaireItem: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    knowledgeTopic: { findFirst: vi.fn() },
    answerLibraryItem: { findFirst: vi.fn() },
    contradictionResult: { findMany: vi.fn() },
  },
  uncheckedPrisma: {
    knowledgeTopic: { findFirst: vi.fn().mockResolvedValue(null) },
  },
}));

vi.mock("@/lib/questionnaires/review-contradiction", () => ({
  runRowCanonicalContradictionCheck: vi.fn(),
  subControlKeyFromProvenance: vi.fn(() => null),
}));

vi.mock("@/lib/contradiction/persistence-service", () => ({
  getContradictionForItem: vi.fn(),
  upsertContradictionDetection: vi.fn(),
  saveNoContradiction: vi.fn(),
}));

import { prisma } from "@/lib/db/prisma";
import { runRowCanonicalContradictionCheck } from "@/lib/questionnaires/review-contradiction";
import {
  getContradictionForItem,
  saveNoContradiction,
  upsertContradictionDetection,
} from "@/lib/contradiction/persistence-service";
import {
  reconcileContradictionsForCanonicalAnswer,
  reconcileQuestionnaireItemContradiction,
} from "../reconcile-questionnaire-item-contradiction";

describe("reconcileQuestionnaireItemContradiction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns skipped when item is not a question_row", async () => {
    vi.mocked(prisma.questionnaireItem.findFirst).mockResolvedValue({
      id: "i1",
      type: "header_row",
      question: "",
      finalAnswer: "",
      suggestedAnswer: "",
      topicId: null,
      topicKey: null,
      provenanceJson: null,
      suggestedAnswerId: null,
    } as never);

    const r = await reconcileQuestionnaireItemContradiction({
      workspaceId: "ws-1",
      questionnaireId: "qn-1",
      questionnaireItemId: "i1",
    });

    expect(r).toEqual({ status: "skipped", reason: "not_question_row" });
    expect(runRowCanonicalContradictionCheck).not.toHaveBeenCalled();
  });

  it("clears a lingering unresolved ContradictionResult when reconcile skips due to empty_row_answer", async () => {
    vi.mocked(prisma.questionnaireItem.findFirst).mockResolvedValue({
      id: "item-1",
      type: "question_row",
      question: "Q",
      finalAnswer: "",
      suggestedAnswer: "",
      topicId: "topic-1",
      topicKey: "mfa",
      provenanceJson: null,
      suggestedAnswerId: null,
    } as never);
    vi.mocked(runRowCanonicalContradictionCheck).mockResolvedValue({
      status: "skipped",
      reason: "empty_row_answer",
    } as never);
    vi.mocked(getContradictionForItem).mockResolvedValue({
      id: "cr-1",
      contradictionFound: true,
      resolutionStatus: "PENDING",
      canonicalAnswerId: "ans-1",
      canonicalVersionNumber: 3,
      topicId: "topic-1",
      topicKey: "mfa",
    } as never);
    vi.mocked(saveNoContradiction).mockResolvedValue({ id: "cr-1" } as never);

    await reconcileQuestionnaireItemContradiction({
      workspaceId: "ws-1",
      questionnaireId: "qn-1",
      questionnaireItemId: "item-1",
    });

    expect(saveNoContradiction).toHaveBeenCalledTimes(1);
    expect(saveNoContradiction).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        questionnaireId: "qn-1",
        questionnaireItemId: "item-1",
        canonicalAnswerId: "ans-1",
        canonicalVersionNumber: 3,
      }),
    );
    expect(upsertContradictionDetection).not.toHaveBeenCalled();
  });

  it("clears a lingering unresolved ContradictionResult when reconcile returns checked without canonicalAnswerId", async () => {
    vi.mocked(prisma.questionnaireItem.findFirst).mockResolvedValue({
      id: "item-2",
      type: "question_row",
      question: "Q",
      finalAnswer: "Yes",
      suggestedAnswer: "",
      topicId: null,
      topicKey: null,
      provenanceJson: null,
      suggestedAnswerId: null,
    } as never);
    // checked but without canonicalAnswerId -> buildSaveContradictionInputFromReviewRow returns null
    vi.mocked(runRowCanonicalContradictionCheck).mockResolvedValue({
      status: "checked",
      contradictionFound: false,
      severity: null,
      contradictionType: null,
      message: null,
      reason: null,
      hits: [],
      rulesEvaluated: 0,
      rulePackVersion: "1.0.0",
      detectorVersion: "1.0.0",
    } as never);
    vi.mocked(getContradictionForItem).mockResolvedValue({
      id: "cr-2",
      contradictionFound: true,
      resolutionStatus: "STALE",
      canonicalAnswerId: "ans-9",
      canonicalVersionNumber: 1,
      topicId: null,
      topicKey: null,
    } as never);

    await reconcileQuestionnaireItemContradiction({
      workspaceId: "ws-1",
      questionnaireId: "qn-1",
      questionnaireItemId: "item-2",
    });

    expect(saveNoContradiction).toHaveBeenCalledTimes(1);
    expect(saveNoContradiction).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        questionnaireItemId: "item-2",
        canonicalAnswerId: "ans-9",
        canonicalVersionNumber: 1,
      }),
    );
  });

  it("leaves terminal resolutions (ACKNOWLEDGED) alone when reconcile skips", async () => {
    vi.mocked(prisma.questionnaireItem.findFirst).mockResolvedValue({
      id: "item-3",
      type: "question_row",
      question: "Q",
      finalAnswer: "",
      suggestedAnswer: "",
      topicId: null,
      topicKey: null,
      provenanceJson: null,
      suggestedAnswerId: null,
    } as never);
    vi.mocked(runRowCanonicalContradictionCheck).mockResolvedValue({
      status: "skipped",
      reason: "empty_row_answer",
    } as never);
    vi.mocked(getContradictionForItem).mockResolvedValue({
      id: "cr-3",
      contradictionFound: true,
      resolutionStatus: "ACKNOWLEDGED",
      canonicalAnswerId: "ans-1",
      canonicalVersionNumber: 2,
      topicId: null,
      topicKey: null,
    } as never);

    await reconcileQuestionnaireItemContradiction({
      workspaceId: "ws-1",
      questionnaireId: "qn-1",
      questionnaireItemId: "item-3",
    });

    expect(saveNoContradiction).not.toHaveBeenCalled();
  });

  it("does not clear when there is no prior ContradictionResult", async () => {
    vi.mocked(prisma.questionnaireItem.findFirst).mockResolvedValue({
      id: "item-4",
      type: "question_row",
      question: "Q",
      finalAnswer: "",
      suggestedAnswer: "",
      topicId: null,
      topicKey: null,
      provenanceJson: null,
      suggestedAnswerId: null,
    } as never);
    vi.mocked(runRowCanonicalContradictionCheck).mockResolvedValue({
      status: "skipped",
      reason: "empty_row_answer",
    } as never);
    vi.mocked(getContradictionForItem).mockResolvedValue(null);

    await reconcileQuestionnaireItemContradiction({
      workspaceId: "ws-1",
      questionnaireId: "qn-1",
      questionnaireItemId: "item-4",
    });

    expect(saveNoContradiction).not.toHaveBeenCalled();
  });

  it("threads verificationStatus + suggestedAnswerId into the contradiction check", async () => {
    // Regression guard for the plan: reconcile must forward these fields so
    // runRowCanonicalContradictionCheck can apply its commitment gate.
    vi.mocked(prisma.questionnaireItem.findFirst).mockResolvedValue({
      id: "item-5",
      type: "question_row",
      question: "How do you manage offboarding?",
      finalAnswer: "",
      suggestedAnswer: "We offboard users within 24 hours.",
      topicId: "topic-ac",
      topicKey: "access_control",
      provenanceJson: null,
      suggestedAnswerId: "ans-offboarding",
      verificationStatus: "SUGGESTED",
    } as never);
    vi.mocked(runRowCanonicalContradictionCheck).mockResolvedValue({
      status: "skipped",
      reason: "empty_row_answer",
    } as never);
    vi.mocked(getContradictionForItem).mockResolvedValue(null);

    await reconcileQuestionnaireItemContradiction({
      workspaceId: "ws-1",
      questionnaireId: "qn-1",
      questionnaireItemId: "item-5",
    });

    expect(runRowCanonicalContradictionCheck).toHaveBeenCalledWith(
      expect.objectContaining({
        questionnaireItemId: "item-5",
        suggestedAnswerId: "ans-offboarding",
        verificationStatus: "SUGGESTED",
      }),
    );
  });

  it("does not produce a contradiction when reconcile returns no_canonical (offboarding row under access_control)", async () => {
    // End-to-end regression: an offboarding row under access_control whose workspace
    // has only an admin_mfa canonical should resolve to `no_canonical` (SUBCONTROL_
    // MISMATCH_NO_FALLBACK) and upsert no detection row.
    vi.mocked(prisma.questionnaireItem.findFirst).mockResolvedValue({
      id: "item-offboarding",
      type: "question_row",
      question: "Describe your access offboarding process.",
      finalAnswer: "We deprovision offboarded users within 24 hours.",
      suggestedAnswer: "",
      topicId: "topic-ac",
      topicKey: "access_control",
      provenanceJson: { sourceSubControlKeys: ["offboarding"] },
      suggestedAnswerId: null,
      verificationStatus: "NEEDS_REVIEW",
    } as never);
    vi.mocked(runRowCanonicalContradictionCheck).mockResolvedValue({
      status: "no_canonical",
      reason: "SUBCONTROL_MISMATCH_NO_FALLBACK",
    } as never);
    vi.mocked(getContradictionForItem).mockResolvedValue(null);

    await reconcileQuestionnaireItemContradiction({
      workspaceId: "ws-1",
      questionnaireId: "qn-1",
      questionnaireItemId: "item-offboarding",
    });

    expect(upsertContradictionDetection).not.toHaveBeenCalled();
    // No prior result exists → no cleanup write either.
    expect(saveNoContradiction).not.toHaveBeenCalled();
  });

  it("clears a stale admin_mfa ContradictionResult when reconcile now resolves to no_canonical", async () => {
    // Continuation of the above: if the workspace previously had a cross-sub-control
    // contradiction persisted (e.g. from an earlier buggy run), reconcile must clear it
    // so the export blocker does not linger after the fix deploys.
    vi.mocked(prisma.questionnaireItem.findFirst).mockResolvedValue({
      id: "item-offboarding-2",
      type: "question_row",
      question: "Describe your access offboarding process.",
      finalAnswer: "We deprovision offboarded users within 24 hours.",
      suggestedAnswer: "",
      topicId: "topic-ac",
      topicKey: "access_control",
      provenanceJson: { sourceSubControlKeys: ["offboarding"] },
      suggestedAnswerId: null,
      verificationStatus: "NEEDS_REVIEW",
    } as never);
    vi.mocked(runRowCanonicalContradictionCheck).mockResolvedValue({
      status: "no_canonical",
      reason: "SUBCONTROL_MISMATCH_NO_FALLBACK",
    } as never);
    vi.mocked(getContradictionForItem).mockResolvedValue({
      id: "cr-admin_mfa",
      contradictionFound: true,
      resolutionStatus: "PENDING",
      canonicalAnswerId: "ans-admin_mfa",
      canonicalVersionNumber: 1,
      topicId: "topic-ac",
      topicKey: "access_control",
    } as never);

    await reconcileQuestionnaireItemContradiction({
      workspaceId: "ws-1",
      questionnaireId: "qn-1",
      questionnaireItemId: "item-offboarding-2",
    });

    expect(upsertContradictionDetection).not.toHaveBeenCalled();
    expect(saveNoContradiction).toHaveBeenCalledTimes(1);
    expect(saveNoContradiction).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        questionnaireItemId: "item-offboarding-2",
        canonicalAnswerId: "ans-admin_mfa",
      }),
    );
  });
});

describe("reconcileContradictionsForCanonicalAnswer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(runRowCanonicalContradictionCheck).mockResolvedValue({
      status: "skipped",
      reason: "missing_topic",
    } as never);
  });

  it("dedupes questionnaire items and reconciles each once", async () => {
    vi.mocked(prisma.contradictionResult.findMany).mockResolvedValue([
      { questionnaireItemId: "qi-same", questionnaireId: "qn-1" },
      { questionnaireItemId: "qi-same", questionnaireId: "qn-1" },
    ] as never);
    vi.mocked(prisma.questionnaireItem.findMany).mockResolvedValue([
      { id: "qi-other", questionnaireId: "qn-2" },
    ] as never);

    vi.mocked(prisma.questionnaireItem.findFirst).mockImplementation(async (args: { where: { id: string } }) => {
      return {
        id: args.where.id,
        type: "question_row",
        question: "Q",
        finalAnswer: "A",
        suggestedAnswer: "",
        topicId: null,
        topicKey: null,
        provenanceJson: null,
        suggestedAnswerId: null,
      } as never;
    });

    await reconcileContradictionsForCanonicalAnswer({
      workspaceId: "ws-1",
      answerId: "ans-1",
    });

    expect(prisma.questionnaireItem.findFirst).toHaveBeenCalledTimes(2);
    const ids = vi.mocked(prisma.questionnaireItem.findFirst).mock.calls.map((c) => c[0].where.id);
    expect(ids).toContain("qi-same");
    expect(ids).toContain("qi-other");
  });
});
