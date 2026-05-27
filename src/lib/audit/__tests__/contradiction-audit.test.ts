import { describe, it, expect } from "vitest";
import { shouldEmitMaterialContradictionDetected } from "@/lib/audit/contradiction-audit";
import type { ContradictionResultDTO } from "@/lib/contradiction/persistence-types";

function dto(partial: Partial<ContradictionResultDTO>): ContradictionResultDTO {
  return {
    id: "cr-1",
    workspaceId: "ws-1",
    questionnaireId: "qn-1",
    questionnaireItemId: "item-1",
    contradictionFound: false,
    contradictionType: null,
    severity: null,
    message: null,
    reason: null,
    rowAnswerExcerpt: null,
    canonicalAnswerId: "a1",
    canonicalAnswerExcerpt: null,
    canonicalVersionNumber: 1,
    canonicalApprovedAt: null,
    canonicalGovernanceStatus: null,
    topicId: null,
    topicKey: null,
    subControlKey: null,
    detectedAt: new Date(),
    detectorVersion: "1",
    ruleId: null,
    rulePackVersion: null,
    resolutionStatus: "PENDING",
    resolvedAt: null,
    resolvedByUserId: null,
    resolutionNote: null,
    resolutionAction: null,
    previousResultId: null,
    isStale: false,
    semanticJudgeJson: null,
    ...partial,
  };
}

describe("shouldEmitMaterialContradictionDetected", () => {
  it("returns true when there is no prior row", () => {
    expect(shouldEmitMaterialContradictionDetected(null, dto({ contradictionFound: true }))).toBe(true);
  });

  it("returns false when persisted has no contradiction", () => {
    expect(shouldEmitMaterialContradictionDetected(dto({ contradictionFound: true }), dto({ contradictionFound: false }))).toBe(
      false,
    );
  });

  it("returns true when prior had no contradiction and persisted does", () => {
    expect(shouldEmitMaterialContradictionDetected(dto({ contradictionFound: false }), dto({ contradictionFound: true }))).toBe(
      true,
    );
  });

  it("returns false when both PENDING with contradiction (routine refresh)", () => {
    expect(
      shouldEmitMaterialContradictionDetected(
        dto({ contradictionFound: true, resolutionStatus: "PENDING" }),
        dto({ contradictionFound: true, resolutionStatus: "PENDING" }),
      ),
    ).toBe(false);
  });

  it("returns true when re-opened to PENDING with contradiction from non-PENDING", () => {
    expect(
      shouldEmitMaterialContradictionDetected(
        dto({ contradictionFound: true, resolutionStatus: "ACKNOWLEDGED" }),
        dto({ contradictionFound: true, resolutionStatus: "PENDING" }),
      ),
    ).toBe(true);
  });
});
