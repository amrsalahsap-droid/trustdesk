import { describe, it, expect } from "vitest";
import {
  buildGovernedFieldDiff,
  classifyApprovalResetFromDiff,
  governanceCompareFromItem,
  inferChangeKind,
  sortedEvidenceChunkIds,
  VERSION_CHANGE_KIND,
} from "@/lib/knowledge/answer-version-record";

const baseItem = {
  title: "T",
  answer: "A",
  governanceStatus: "APPROVED_INTERNAL" as const,
  approvalScope: "INTERNAL_ONLY" as const,
  exportSafe: false,
  ownerId: "o1" as string | null,
  approverId: "a1" as string | null,
  topicId: "t1" as string | null,
  subControlKey: null as string | null,
  subControlLabels: [] as string[],
  confidenceScore: null as number | null,
  reviewCadenceDays: null as number | null,
};

describe("answer-version-record", () => {
  it("buildGovernedFieldDiff detects answer and evidence changes", () => {
    const before = governanceCompareFromItem(baseItem, ["c1"]);
    const after = governanceCompareFromItem({ ...baseItem, answer: "B" }, ["c1", "c2"]);
    const diff = buildGovernedFieldDiff(before, after);
    const fields = new Set(diff.map((d) => d.field));
    expect(fields.has("answer")).toBe(true);
    expect(fields.has("evidenceChunkIds")).toBe(true);
  });

  it("classifyApprovalResetFromDiff respects body opt-out", () => {
    const bodyDiff = buildGovernedFieldDiff(
      governanceCompareFromItem(baseItem, []),
      governanceCompareFromItem({ ...baseItem, answer: "X" }, []),
    );
    expect(classifyApprovalResetFromDiff(bodyDiff, { allowBodyEditWithoutReapproval: false })).toBe(true);
    expect(classifyApprovalResetFromDiff(bodyDiff, { allowBodyEditWithoutReapproval: true })).toBe(false);
  });

  it("owner reassignment alone does not require approval reset", () => {
    const diff = buildGovernedFieldDiff(
      governanceCompareFromItem(baseItem, []),
      governanceCompareFromItem({ ...baseItem, ownerId: "o2" }, []),
    );
    expect(classifyApprovalResetFromDiff(diff, { allowBodyEditWithoutReapproval: false })).toBe(false);
  });

  it("sortedEvidenceChunkIds dedupes and sorts", () => {
    expect(sortedEvidenceChunkIds([{ chunkId: "b" }, { chunkId: "a" }, { chunkId: "b" }])).toEqual(["a", "b"]);
  });

  it("inferChangeKind honors explicit", () => {
    expect(
      inferChangeKind({
        explicit: VERSION_CHANGE_KIND.SYSTEM,
        diff: [],
        resetApprovalRequired: false,
      }),
    ).toBe(VERSION_CHANGE_KIND.SYSTEM);
  });
});
