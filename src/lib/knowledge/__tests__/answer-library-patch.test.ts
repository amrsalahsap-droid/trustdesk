import { describe, it, expect } from "vitest";
import { hasAnswerLibraryPatchChanges, mergeAnswerLibraryPatch } from "../answer-library-patch";

const existing = {
  title: "Access control",
  answer: "Use MFA for all admins.",
  topicId: "topic-1",
  owner: "Sam",
  ownerId: null as string | null,
  approverId: null as string | null,
  status: "APPROVED" as const,
  confidenceScore: 0.9 as number | null,
  subControlKey: null as string | null,
  subControlLabels: [] as string[],
  reviewCadenceDays: null as number | null,
};

describe("mergeAnswerLibraryPatch", () => {
  it("keeps existing values when patch fields are omitted", () => {
    expect(mergeAnswerLibraryPatch(existing, {})).toEqual(existing);
  });

  it("applies overrides when provided", () => {
    expect(
      mergeAnswerLibraryPatch(existing, {
        answer: "Updated guidance.",
        status: "DRAFT",
      }),
    ).toEqual({
      ...existing,
      answer: "Updated guidance.",
      status: "DRAFT",
    });
  });
});

describe("hasAnswerLibraryPatchChanges", () => {
  it("returns false when merged state equals existing", () => {
    const merged = mergeAnswerLibraryPatch(existing, {});
    expect(hasAnswerLibraryPatchChanges(existing, merged)).toBe(false);
  });

  it("returns true when answer text changes", () => {
    const merged = mergeAnswerLibraryPatch(existing, { answer: "New text" });
    expect(hasAnswerLibraryPatchChanges(existing, merged)).toBe(true);
  });

  it("returns false when only changeReason would differ (not in merge)", () => {
    const merged = mergeAnswerLibraryPatch(existing, {});
    expect(hasAnswerLibraryPatchChanges(existing, merged)).toBe(false);
  });

  it("treats null and undefined confidence the same", () => {
    const noScore = { ...existing, confidenceScore: null };
    const merged = mergeAnswerLibraryPatch(noScore, {});
    expect(hasAnswerLibraryPatchChanges(noScore, merged)).toBe(false);
  });
});
