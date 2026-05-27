import { describe, it, expect } from "vitest";
import {
  decideBackfillForItem,
  type BackfillItemView,
} from "../backfill-imported-answer-core";

function makeItem(overrides: Partial<BackfillItemView> = {}): BackfillItemView {
  return {
    id: "item-1",
    importedAnswer: null,
    importedAnswerSource: null,
    finalAnswer: "",
    suggestedAnswer: "",
    suggestedAnswerId: null,
    reviewed: false,
    verificationStatus: null,
    overrideAt: null,
    provenanceJson: null,
    ...overrides,
  };
}

describe("decideBackfillForItem", () => {
  it("skips items that already have importedAnswer populated (idempotent)", () => {
    const d = decideBackfillForItem(
      makeItem({ importedAnswer: "already here", importedAnswerSource: "raw_import" }),
    );
    expect(d).toEqual({ action: "skip", reason: "already_set" });
  });

  it("recovers from provenanceJson.importedAnswer (highest confidence)", () => {
    const d = decideBackfillForItem(
      makeItem({
        provenanceJson: { importedAnswer: "Uploaded spreadsheet value" },
      }),
    );
    expect(d).toEqual({
      action: "update",
      importedAnswer: "Uploaded spreadsheet value",
      source: "raw_import",
    });
  });

  it("also reads the legacy sourceAnswer key on provenance", () => {
    const d = decideBackfillForItem(
      makeItem({
        provenanceJson: { sourceAnswer: "Legacy key value" },
      }),
    );
    expect(d.action === "update" && d.source).toBe("raw_import");
    expect(d.action === "update" && d.importedAnswer).toBe("Legacy key value");
  });

  it("backfills from finalAnswer only when the row has never been edited/reviewed/overridden", () => {
    const d = decideBackfillForItem(
      makeItem({ finalAnswer: "Original imported answer" }),
    );
    expect(d).toEqual({
      action: "update",
      importedAnswer: "Original imported answer",
      source: "final_answer_legacy",
    });
  });

  it("does NOT use finalAnswer when the row was reviewed — that is an edited value", () => {
    const d = decideBackfillForItem(
      makeItem({
        finalAnswer: "Reviewer-committed value",
        reviewed: true,
      }),
    );
    expect(d).toEqual({
      action: "update",
      importedAnswer: null,
      source: "unknown",
    });
  });

  it("does NOT use finalAnswer when verificationStatus is EDITED or MANUAL_OVERRIDE", () => {
    const edited = decideBackfillForItem(
      makeItem({ finalAnswer: "ed", verificationStatus: "EDITED" }),
    );
    const overriden = decideBackfillForItem(
      makeItem({ finalAnswer: "ov", verificationStatus: "MANUAL_OVERRIDE" }),
    );
    expect(edited.action === "update" && edited.source).toBe("unknown");
    expect(overriden.action === "update" && overriden.source).toBe("unknown");
  });

  it("does NOT use finalAnswer when overrideAt is set — the row was once overridden", () => {
    const d = decideBackfillForItem(
      makeItem({ finalAnswer: "value", overrideAt: new Date() }),
    );
    expect(d.action === "update" && d.source).toBe("unknown");
  });

  it("backfills from suggestedAnswer when there is no AI match (suggestedAnswerId is null)", () => {
    const d = decideBackfillForItem(
      makeItem({
        suggestedAnswer: "Uploaded value stored in legacy suggestedAnswer column",
        suggestedAnswerId: null,
      }),
    );
    expect(d).toEqual({
      action: "update",
      importedAnswer: "Uploaded value stored in legacy suggestedAnswer column",
      source: "suggested_answer_legacy",
    });
  });

  it("does NOT trust suggestedAnswer when suggestedAnswerId is set — that is AI-matched text", () => {
    const d = decideBackfillForItem(
      makeItem({
        suggestedAnswer: "AI-provided suggestion",
        suggestedAnswerId: "ans-library-1",
      }),
    );
    expect(d).toEqual({
      action: "update",
      importedAnswer: null,
      source: "unknown",
    });
  });

  it("falls through to 'unknown' when no confident signal is available", () => {
    const d = decideBackfillForItem(makeItem());
    expect(d).toEqual({
      action: "update",
      importedAnswer: null,
      source: "unknown",
    });
  });

  it("prefers provenance over legacy finalAnswer even when both would match", () => {
    const d = decideBackfillForItem(
      makeItem({
        provenanceJson: { importedAnswer: "from-prov" },
        finalAnswer: "from-final",
      }),
    );
    expect(d.action === "update" && d.source).toBe("raw_import");
  });
});
