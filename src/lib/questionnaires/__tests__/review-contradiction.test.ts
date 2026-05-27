import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  runRowCanonicalContradictionCheck,
  subControlKeyFromProvenance,
} from "../review-contradiction";
import type { CanonicalAnswerMetadata } from "@/lib/contradiction/canonical-retrieval";
import type { ContradictionRulePack } from "@/lib/contradiction/rule-types";
import { SEMANTIC_CONTRADICTION_RULE_ID } from "@/lib/contradiction/semantic-contradiction-judge";

function minimalCanonical(answer: string): CanonicalAnswerMetadata {
  return {
    answerId: "ans-1",
    title: "Policy",
    answer,
    governanceStatus: "APPROVED_FOR_EXPORT",
    approvalScope: "EXPORT_ALLOWED",
    exportSafe: true,
    status: "APPROVED",
    approvedAt: new Date(),
    approvedByUserId: null,
    nextReviewDueAt: null,
    version: "v1",
    versionNumber: 1,
    topicId: "top-1",
    subControlKey: "rbac",
    subControlLabels: [],
    freshness: "fresh",
  };
}

const minimalPack: ContradictionRulePack = {
  topicKey: "access_control",
  topicName: "Access Control",
  version: "1.0.0",
  rules: [
    {
      id: "test_polarity",
      description: "Test",
      topicKey: "access_control",
      subControlKey: "rbac",
      severity: "high",
      rowField: "finalAnswer",
      canonicalField: "answer",
      config: {
        type: "boolean_polarity",
        strictPolarity: true,
        positiveIndicators: ["yes"],
        negativeIndicators: ["no"],
      },
      messageTemplate: "Mismatch",
    },
  ],
};

const baseInput = {
  workspaceId: "ws-1",
  questionnaireId: "qn-1",
  questionnaireItemId: "item-1",
  question: "Is RBAC enforced?",
  finalAnswer: "No",
  suggestedAnswer: "",
  topicForRetrieve: { topicKey: "access_control" } as const,
  topicKeyForRules: "access_control",
  subControlKey: "rbac" as string | null,
};

describe("runRowCanonicalContradictionCheck", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns skipped when row answer is empty", async () => {
    const r = await runRowCanonicalContradictionCheck({
      ...baseInput,
      finalAnswer: "",
      suggestedAnswer: "   ",
    });
    expect(r).toEqual({ status: "skipped", reason: "empty_row_answer" });
  });

  it("returns skipped when topic is missing", async () => {
    const r = await runRowCanonicalContradictionCheck({
      ...baseInput,
      topicForRetrieve: null,
    });
    expect(r).toEqual({ status: "skipped", reason: "missing_topic" });
  });

  it("returns skipped when topic key for rules is missing", async () => {
    const r = await runRowCanonicalContradictionCheck({
      ...baseInput,
      topicKeyForRules: null,
    });
    expect(r).toEqual({ status: "skipped", reason: "missing_topic_key_for_rules" });
  });

  it("returns no_rule_pack when loadRulePackSafe fails", async () => {
    const r = await runRowCanonicalContradictionCheck({
      ...baseInput,
      topicKeyForRules: "__definitely_missing_topic_pack__",
      deps: {
        loadRulePackSafe: vi.fn().mockReturnValue({ success: false, errors: ["not found"] }),
      },
    });
    expect(r).toEqual({ status: "no_rule_pack" });
  });

  it("returns no_canonical when retrieval returns none", async () => {
    const r = await runRowCanonicalContradictionCheck({
      ...baseInput,
      deps: {
        loadRulePackSafe: vi.fn().mockReturnValue({ success: true, pack: minimalPack }),
        retrieveInternalCanonical: vi.fn().mockResolvedValue({
          kind: "none",
          reason: "No answers",
          code: "NO_ANSWERS_FOR_TOPIC",
          context: {
            workspaceId: "ws-1",
            topicKey: "access_control",
            subControlKey: "rbac",
            scope: "internal",
            candidatesFound: 0,
            candidatesRejected: 0,
          },
        }),
      },
    });
    expect(r).toMatchObject({ status: "no_canonical", code: "NO_ANSWERS_FOR_TOPIC" });
  });

  it("returns checked with contradiction when detect finds one", async () => {
    const r = await runRowCanonicalContradictionCheck({
      ...baseInput,
      deps: {
        loadRulePackSafe: vi.fn().mockReturnValue({ success: true, pack: minimalPack }),
        retrieveInternalCanonical: vi.fn().mockResolvedValue({
          kind: "success",
          canonical: minimalCanonical("Yes, RBAC is enforced."),
          selection: { candidatesCount: 1, strategy: "generic_topic", subControlMatch: "none" },
        }),
        detect: vi.fn().mockReturnValue({
          contradictionFound: true,
          severity: "high",
          contradictionType: "boolean_polarity",
          message: "Mismatch",
          reason: "Polarity",
          rowExcerpt: "No",
          canonicalExcerpt: "Yes",
          hits: [
            {
              ruleId: "test_polarity",
              ruleDescription: "Test",
              contradictionType: "boolean_polarity",
              severity: "high",
              message: "Mismatch",
              reason: "Polarity",
              rowExcerpt: "No",
              canonicalExcerpt: "Yes",
              confidence: 1,
            },
          ],
          rulesEvaluated: 1,
          canonical: minimalCanonical("Yes, RBAC is enforced."),
          detectionMeta: {
            detectedAt: new Date(),
            detectorVersion: "1.0.0",
            rulePackVersion: "1.0.0",
            mode: "internal",
          },
        }),
      },
    });

    expect(r.status).toBe("checked");
    if (r.status !== "checked") throw new Error("expected checked");
    expect(r.contradictionFound).toBe(true);
    expect(r.hits).toHaveLength(1);
    expect(r.canonicalAnswerId).toBe("ans-1");
  });

  it("does not call semantic judge when deterministic hits exist", async () => {
    const runSemanticContradictionJudge = vi.fn();
    await runRowCanonicalContradictionCheck({
      ...baseInput,
      deps: {
        loadRulePackSafe: vi.fn().mockReturnValue({ success: true, pack: minimalPack }),
        retrieveInternalCanonical: vi.fn().mockResolvedValue({
          kind: "success",
          canonical: minimalCanonical("Yes, RBAC is enforced."),
          selection: { candidatesCount: 1, strategy: "generic_topic", subControlMatch: "none" },
        }),
        detect: vi.fn().mockReturnValue({
          contradictionFound: true,
          severity: "high",
          contradictionType: "boolean_polarity",
          message: "Mismatch",
          reason: "Polarity",
          rowExcerpt: "No",
          canonicalExcerpt: "Yes",
          hits: [
            {
              ruleId: "test_polarity",
              ruleDescription: "Test",
              contradictionType: "boolean_polarity",
              severity: "high",
              message: "Mismatch",
              reason: "Polarity",
              rowExcerpt: "No",
              canonicalExcerpt: "Yes",
              confidence: 1,
            },
          ],
          rulesEvaluated: 1,
          canonical: minimalCanonical("Yes, RBAC is enforced."),
          detectionMeta: {
            detectedAt: new Date(),
            detectorVersion: "1.0.0",
            rulePackVersion: "1.0.0",
            mode: "internal",
          },
        }),
        loadSemanticAssistEnabledForTopic: vi.fn().mockResolvedValue(true),
        runSemanticContradictionJudge,
      },
    });
    expect(runSemanticContradictionJudge).not.toHaveBeenCalled();
  });

  it("returns checked with no contradiction when detect finds none", async () => {
    const r = await runRowCanonicalContradictionCheck({
      ...baseInput,
      finalAnswer: "Yes, RBAC is enforced.",
      deps: {
        loadRulePackSafe: vi.fn().mockReturnValue({ success: true, pack: minimalPack }),
        retrieveInternalCanonical: vi.fn().mockResolvedValue({
          kind: "success",
          canonical: minimalCanonical("Yes, RBAC is enforced."),
          selection: { candidatesCount: 1, strategy: "generic_topic", subControlMatch: "none" },
        }),
        detect: vi.fn().mockReturnValue({
          contradictionFound: false,
          severity: null,
          contradictionType: null,
          message: "No canonical contradiction detected",
          reason: null,
          rowExcerpt: "",
          canonicalExcerpt: "",
          hits: [],
          rulesEvaluated: 1,
          canonical: minimalCanonical("Yes, RBAC is enforced."),
          detectionMeta: {
            detectedAt: new Date(),
            detectorVersion: "1.0.0",
            rulePackVersion: "1.0.0",
            mode: "internal",
          },
        }),
        loadSemanticAssistEnabledForTopic: vi.fn().mockResolvedValue(false),
      },
    });

    expect(r.status).toBe("checked");
    if (r.status !== "checked") throw new Error("expected checked");
    expect(r.contradictionFound).toBe(false);
    expect(r.hits).toHaveLength(0);
  });

  it("returns error when detect throws", async () => {
    const r = await runRowCanonicalContradictionCheck({
      ...baseInput,
      deps: {
        loadRulePackSafe: vi.fn().mockReturnValue({ success: true, pack: minimalPack }),
        retrieveInternalCanonical: vi.fn().mockResolvedValue({
          kind: "success",
          canonical: minimalCanonical("Yes."),
          selection: { candidatesCount: 1, strategy: "generic_topic", subControlMatch: "none" },
        }),
        detect: vi.fn().mockImplementation(() => {
          throw new Error("detect boom");
        }),
      },
    });

    expect(r.status).toBe("error");
    if (r.status !== "error") throw new Error("expected error");
    expect(r.message).toContain("detect boom");
  });

  it("returns error when retrieve throws", async () => {
    const r = await runRowCanonicalContradictionCheck({
      ...baseInput,
      deps: {
        loadRulePackSafe: vi.fn().mockReturnValue({ success: true, pack: minimalPack }),
        retrieveInternalCanonical: vi.fn().mockRejectedValue(new Error("db down")),
      },
    });

    expect(r.status).toBe("error");
    if (r.status !== "error") throw new Error("expected error");
    expect(r.message).toBe("Canonical retrieval failed");
  });

  it("skips semantic judge when topic flag is off", async () => {
    const runSemanticContradictionJudge = vi.fn();
    const row = "A".repeat(60);
    const canon = "B".repeat(60);
    const r = await runRowCanonicalContradictionCheck({
      ...baseInput,
      finalAnswer: row,
      deps: {
        loadRulePackSafe: vi.fn().mockReturnValue({ success: true, pack: minimalPack }),
        retrieveInternalCanonical: vi.fn().mockResolvedValue({
          kind: "success",
          canonical: minimalCanonical(canon),
          selection: { candidatesCount: 1, strategy: "generic_topic", subControlMatch: "none" },
        }),
        detect: vi.fn().mockReturnValue({
          contradictionFound: false,
          severity: null,
          contradictionType: null,
          message: "ok",
          reason: null,
          rowExcerpt: "",
          canonicalExcerpt: "",
          hits: [],
          rulesEvaluated: 1,
          canonical: minimalCanonical(canon),
          detectionMeta: {
            detectedAt: new Date(),
            detectorVersion: "1.0.0",
            rulePackVersion: "1.0.0",
            mode: "internal",
          },
        }),
        loadSemanticAssistEnabledForTopic: vi.fn().mockResolvedValue(false),
        runSemanticContradictionJudge,
      },
    });
    expect(runSemanticContradictionJudge).not.toHaveBeenCalled();
    expect(r.status).toBe("checked");
    if (r.status !== "checked") throw new Error("expected checked");
    expect(r.semanticJudge).toBeUndefined();
  });

  it("skips semantic judge when text gate fails despite flag on", async () => {
    const runSemanticContradictionJudge = vi.fn();
    const r = await runRowCanonicalContradictionCheck({
      ...baseInput,
      finalAnswer: "short",
      deps: {
        loadRulePackSafe: vi.fn().mockReturnValue({ success: true, pack: minimalPack }),
        retrieveInternalCanonical: vi.fn().mockResolvedValue({
          kind: "success",
          canonical: minimalCanonical("also-short"),
          selection: { candidatesCount: 1, strategy: "generic_topic", subControlMatch: "none" },
        }),
        detect: vi.fn().mockReturnValue({
          contradictionFound: false,
          severity: null,
          contradictionType: null,
          message: "ok",
          reason: null,
          rowExcerpt: "",
          canonicalExcerpt: "",
          hits: [],
          rulesEvaluated: 1,
          canonical: minimalCanonical("also-short"),
          detectionMeta: {
            detectedAt: new Date(),
            detectorVersion: "1.0.0",
            rulePackVersion: "1.0.0",
            mode: "internal",
          },
        }),
        loadSemanticAssistEnabledForTopic: vi.fn().mockResolvedValue(true),
        runSemanticContradictionJudge,
      },
    });
    expect(runSemanticContradictionJudge).not.toHaveBeenCalled();
    expect(r.status).toBe("checked");
  });

  it("skips semantic judge when rulesEvaluated is zero", async () => {
    const runSemanticContradictionJudge = vi.fn();
    const row = "A".repeat(60);
    const canon = "B".repeat(60);
    await runRowCanonicalContradictionCheck({
      ...baseInput,
      finalAnswer: row,
      deps: {
        loadRulePackSafe: vi.fn().mockReturnValue({ success: true, pack: minimalPack }),
        retrieveInternalCanonical: vi.fn().mockResolvedValue({
          kind: "success",
          canonical: minimalCanonical(canon),
          selection: { candidatesCount: 1, strategy: "generic_topic", subControlMatch: "none" },
        }),
        detect: vi.fn().mockReturnValue({
          contradictionFound: false,
          severity: null,
          contradictionType: null,
          message: "ok",
          reason: null,
          rowExcerpt: "",
          canonicalExcerpt: "",
          hits: [],
          rulesEvaluated: 0,
          canonical: minimalCanonical(canon),
          detectionMeta: {
            detectedAt: new Date(),
            detectorVersion: "1.0.0",
            rulePackVersion: "1.0.0",
            mode: "internal",
          },
        }),
        loadSemanticAssistEnabledForTopic: vi.fn().mockResolvedValue(true),
        runSemanticContradictionJudge,
      },
    });
    expect(runSemanticContradictionJudge).not.toHaveBeenCalled();
  });

  it("when semantic judge finds likely contradiction, returns synthetic hit and semanticJudge", async () => {
    const row = "A".repeat(60);
    const canon = "B".repeat(60);
    const runSemanticContradictionJudge = vi.fn().mockResolvedValue({
      contradictionLikely: true,
      confidence: 0.9,
      reason: "Row denies MFA; canonical requires MFA.",
      supportingExcerpts: [
        { source: "row" as const, text: "We do not use MFA." },
        { source: "canonical" as const, text: "MFA is mandatory." },
      ],
    });
    const r = await runRowCanonicalContradictionCheck({
      ...baseInput,
      finalAnswer: row,
      deps: {
        loadRulePackSafe: vi.fn().mockReturnValue({ success: true, pack: minimalPack }),
        retrieveInternalCanonical: vi.fn().mockResolvedValue({
          kind: "success",
          canonical: minimalCanonical(canon),
          selection: { candidatesCount: 1, strategy: "generic_topic", subControlMatch: "none" },
        }),
        detect: vi.fn().mockReturnValue({
          contradictionFound: false,
          severity: null,
          contradictionType: null,
          message: "ok",
          reason: null,
          rowExcerpt: "",
          canonicalExcerpt: "",
          hits: [],
          rulesEvaluated: 1,
          canonical: minimalCanonical(canon),
          detectionMeta: {
            detectedAt: new Date(),
            detectorVersion: "1.0.0",
            rulePackVersion: "1.0.0",
            mode: "internal",
          },
        }),
        loadSemanticAssistEnabledForTopic: vi.fn().mockResolvedValue(true),
        runSemanticContradictionJudge,
      },
    });
    expect(runSemanticContradictionJudge).toHaveBeenCalledOnce();
    expect(r.status).toBe("checked");
    if (r.status !== "checked") throw new Error("expected checked");
    expect(r.contradictionFound).toBe(true);
    expect(r.contradictionType).toBe("semantic_assist");
    expect(r.severity).toBe("medium");
    expect(r.hits).toHaveLength(1);
    expect(r.hits[0]?.ruleId).toBe(SEMANTIC_CONTRADICTION_RULE_ID);
    expect(r.semanticJudge?.contradictionLikely).toBe(true);
  });

  describe("row answer commitment gate", () => {
    const committedBase = {
      ...baseInput,
      finalAnswer: "",
      suggestedAnswer: "We enforce RBAC for all production systems.",
      subControlKey: "rbac" as string | null,
    };

    it("skips detection when an unreviewed AI suggestion is the only row content", async () => {
      const detect = vi.fn();
      const r = await runRowCanonicalContradictionCheck({
        ...committedBase,
        suggestedAnswerId: "ans-1",
        verificationStatus: "SUGGESTED",
        deps: {
          detect,
          loadRulePackSafe: vi.fn().mockReturnValue({ success: true, pack: minimalPack }),
          retrieveInternalCanonical: vi.fn().mockResolvedValue({
            kind: "success",
            canonical: minimalCanonical("RBAC is enforced."),
            selection: {
              strategy: "exact_subcontrol",
              subControlMatch: "exact",
              candidatesFound: 1,
              candidatesRejected: 0,
            },
          }),
        },
      });
      expect(r).toEqual({ status: "skipped", reason: "empty_row_answer" });
      expect(detect).not.toHaveBeenCalled();
    });

    it("runs detection when the user has ACCEPTED the suggestion (suggestion becomes the row answer)", async () => {
      const detect = vi.fn().mockReturnValue({
        contradictionFound: false,
        severity: null,
        contradictionType: null,
        message: "",
        reason: "",
        rowExcerpt: "",
        canonicalExcerpt: "",
        hits: [],
        rulesEvaluated: 1,
        canonical: minimalCanonical("RBAC is enforced."),
        detectionMeta: {
          detectedAt: new Date(),
          detectorVersion: "1.0.0",
          rulePackVersion: "1.0.0",
          mode: "internal",
        },
      });
      const r = await runRowCanonicalContradictionCheck({
        ...committedBase,
        suggestedAnswerId: "ans-1",
        verificationStatus: "ACCEPTED",
        deps: {
          detect,
          loadRulePackSafe: vi.fn().mockReturnValue({ success: true, pack: minimalPack }),
          retrieveInternalCanonical: vi.fn().mockResolvedValue({
            kind: "success",
            canonical: minimalCanonical("RBAC is enforced."),
            selection: {
              strategy: "exact_subcontrol",
              subControlMatch: "exact",
              candidatesFound: 1,
              candidatesRejected: 0,
            },
          }),
        },
      });
      expect(detect).toHaveBeenCalledOnce();
      expect(r.status).toBe("checked");
    });

    it("runs detection whenever finalAnswer is non-empty regardless of verificationStatus", async () => {
      const detect = vi.fn().mockReturnValue({
        contradictionFound: false,
        severity: null,
        contradictionType: null,
        message: "",
        reason: "",
        rowExcerpt: "",
        canonicalExcerpt: "",
        hits: [],
        rulesEvaluated: 1,
        canonical: minimalCanonical("RBAC is enforced."),
        detectionMeta: {
          detectedAt: new Date(),
          detectorVersion: "1.0.0",
          rulePackVersion: "1.0.0",
          mode: "internal",
        },
      });
      const r = await runRowCanonicalContradictionCheck({
        ...committedBase,
        finalAnswer: "We use RBAC everywhere.",
        suggestedAnswerId: null,
        verificationStatus: "SUGGESTED",
        deps: {
          detect,
          loadRulePackSafe: vi.fn().mockReturnValue({ success: true, pack: minimalPack }),
          retrieveInternalCanonical: vi.fn().mockResolvedValue({
            kind: "success",
            canonical: minimalCanonical("RBAC is enforced."),
            selection: {
              strategy: "exact_subcontrol",
              subControlMatch: "exact",
              candidatesFound: 1,
              candidatesRejected: 0,
            },
          }),
        },
      });
      expect(detect).toHaveBeenCalledOnce();
      expect(r.status).toBe("checked");
    });

    it("treats a suggestion with no suggestedAnswerId as uncommitted (library-less AI draft)", async () => {
      const detect = vi.fn();
      const r = await runRowCanonicalContradictionCheck({
        ...committedBase,
        suggestedAnswerId: null,
        verificationStatus: "ACCEPTED",
        deps: {
          detect,
          loadRulePackSafe: vi.fn().mockReturnValue({ success: true, pack: minimalPack }),
          retrieveInternalCanonical: vi.fn().mockResolvedValue({
            kind: "success",
            canonical: minimalCanonical("RBAC is enforced."),
            selection: {
              strategy: "exact_subcontrol",
              subControlMatch: "exact",
              candidatesFound: 1,
              candidatesRejected: 0,
            },
          }),
        },
      });
      expect(r).toEqual({ status: "skipped", reason: "empty_row_answer" });
      expect(detect).not.toHaveBeenCalled();
    });
  });

  describe("imported answer in the precedence chain", () => {
    const precedenceBase = {
      ...baseInput,
      finalAnswer: "",
      suggestedAnswer: "We encrypt everything at rest with AES-256.",
      subControlKey: "rbac" as string | null,
    };

    function mkDeps(detect: ReturnType<typeof vi.fn>) {
      return {
        detect,
        loadRulePackSafe: vi.fn().mockReturnValue({ success: true, pack: minimalPack }),
        retrieveInternalCanonical: vi.fn().mockResolvedValue({
          kind: "success",
          canonical: minimalCanonical("RBAC is enforced with AES-256 only on databases."),
          selection: {
            strategy: "exact_subcontrol",
            subControlMatch: "exact",
            candidatesFound: 1,
            candidatesRejected: 0,
          },
        }),
      };
    }

    it("feeds importedAnswer into detect when finalAnswer is empty and suggestion is uncommitted", async () => {
      const detect = vi.fn().mockReturnValue({
        contradictionFound: true,
        severity: "high",
        contradictionType: "boolean_polarity",
        message: "polarity mismatch",
        reason: "imported says no, canonical says yes",
        rowExcerpt: "",
        canonicalExcerpt: "",
        hits: [
          {
            ruleId: "rbac_polarity",
            ruleDescription: "RBAC polarity",
            contradictionType: "boolean_polarity",
            severity: "high",
            message: "m",
            reason: "r",
            rowExcerpt: "",
            canonicalExcerpt: "",
            confidence: 1,
          },
        ],
        rulesEvaluated: 1,
        canonical: minimalCanonical("c"),
        detectionMeta: {
          detectedAt: new Date(),
          detectorVersion: "1.0.0",
          rulePackVersion: "1.0.0",
          mode: "internal",
        },
      });
      const r = await runRowCanonicalContradictionCheck({
        ...precedenceBase,
        importedAnswer: "We do not enforce RBAC.",
        verificationStatus: "SUGGESTED", // AI draft not committed
        suggestedAnswerId: "ans-1",
        deps: mkDeps(detect),
      });

      expect(detect).toHaveBeenCalled();
      // The `row.finalAnswer` passed to detect() must be the imported text
      // because the user did not commit to the AI suggestion yet.
      const rowArg = detect.mock.calls[0]![0] as { finalAnswer: string; suggestedAnswer: string };
      expect(rowArg.finalAnswer).toBe("We do not enforce RBAC.");
      expect(rowArg.suggestedAnswer).toBe("");
      expect(r.status).toBe("checked");
    });

    it("prefers finalAnswer over importedAnswer when finalAnswer exists", async () => {
      const detect = vi.fn().mockReturnValue({
        contradictionFound: false,
        severity: null,
        contradictionType: null,
        message: "",
        reason: "",
        rowExcerpt: "",
        canonicalExcerpt: "",
        hits: [],
        rulesEvaluated: 1,
        canonical: minimalCanonical("c"),
        detectionMeta: {
          detectedAt: new Date(),
          detectorVersion: "1.0.0",
          rulePackVersion: "1.0.0",
          mode: "internal",
        },
      });
      await runRowCanonicalContradictionCheck({
        ...precedenceBase,
        finalAnswer: "Yes, RBAC is enforced.",
        importedAnswer: "We do not enforce RBAC.",
        verificationStatus: "ACCEPTED",
        suggestedAnswerId: "ans-1",
        deps: mkDeps(detect),
      });
      const rowArg = detect.mock.calls[0]![0] as { finalAnswer: string };
      expect(rowArg.finalAnswer).toBe("Yes, RBAC is enforced.");
    });

    it("uses imported over uncommitted suggestion even when both are non-empty", async () => {
      const detect = vi.fn().mockReturnValue({
        contradictionFound: false,
        severity: null,
        contradictionType: null,
        message: "",
        reason: "",
        rowExcerpt: "",
        canonicalExcerpt: "",
        hits: [],
        rulesEvaluated: 1,
        canonical: minimalCanonical("c"),
        detectionMeta: {
          detectedAt: new Date(),
          detectorVersion: "1.0.0",
          rulePackVersion: "1.0.0",
          mode: "internal",
        },
      });
      await runRowCanonicalContradictionCheck({
        ...precedenceBase,
        importedAnswer: "Imported manual answer",
        verificationStatus: "SUGGESTED",
        suggestedAnswerId: "ans-1",
        deps: mkDeps(detect),
      });
      const rowArg = detect.mock.calls[0]![0] as { finalAnswer: string };
      expect(rowArg.finalAnswer).toBe("Imported manual answer");
    });

    it("falls back to committed suggestion when only suggestion is provided", async () => {
      const detect = vi.fn().mockReturnValue({
        contradictionFound: false,
        severity: null,
        contradictionType: null,
        message: "",
        reason: "",
        rowExcerpt: "",
        canonicalExcerpt: "",
        hits: [],
        rulesEvaluated: 1,
        canonical: minimalCanonical("c"),
        detectionMeta: {
          detectedAt: new Date(),
          detectorVersion: "1.0.0",
          rulePackVersion: "1.0.0",
          mode: "internal",
        },
      });
      await runRowCanonicalContradictionCheck({
        ...precedenceBase,
        importedAnswer: null,
        verificationStatus: "ACCEPTED",
        suggestedAnswerId: "ans-1",
        deps: mkDeps(detect),
      });
      const rowArg = detect.mock.calls[0]![0] as { finalAnswer: string };
      expect(rowArg.finalAnswer).toBe(
        "We encrypt everything at rest with AES-256.",
      );
    });
  });
});

describe("subControlKeyFromProvenance", () => {
  it("returns first sourceSubControlKeys entry", () => {
    expect(
      subControlKeyFromProvenance({ sourceSubControlKeys: ["privileged_access", "rbac"] }),
    ).toBe("privileged_access");
  });

  it("returns null when missing", () => {
    expect(subControlKeyFromProvenance(null)).toBeNull();
    expect(subControlKeyFromProvenance({})).toBeNull();
  });
});
