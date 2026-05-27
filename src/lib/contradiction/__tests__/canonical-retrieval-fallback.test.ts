/**
 * Unit tests for the sub-control fallback semantics of retrieveCanonicalAnswer.
 *
 * The existing canonical-retrieval.test.ts drives a real database and is out of scope
 * here. These tests mock the Prisma client so we can exercise the new "none" codes
 * (`NO_TOPIC_LEVEL_CANONICAL`, `SUBCONTROL_MISMATCH_NO_FALLBACK`) without requiring
 * infra changes, and guard against the offboarding-vs-admin_mfa false positive.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    knowledgeTopic: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
    },
    answerLibraryItem: {
      findMany: vi.fn(),
    },
  },
  uncheckedPrisma: {
    knowledgeTopic: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
  },
}));

import { prisma } from "@/lib/db/prisma";
import { retrieveInternalCanonical } from "../canonical-retrieval";

const findFirstTopic = prisma.knowledgeTopic.findFirst as unknown as ReturnType<typeof vi.fn>;
const findManyAnswers = prisma.answerLibraryItem.findMany as unknown as ReturnType<typeof vi.fn>;

// Minimal shape returned by `findMany` with the fields the retrieval code selects.
function buildCandidate(overrides: Record<string, unknown> = {}) {
  return {
    id: "ans-admin_mfa",
    title: "Admin MFA policy",
    answer: "MFA is required for all administrative access; must be enforced.",
    status: "APPROVED",
    governanceStatus: "APPROVED_INTERNAL",
    approvalScope: "INTERNAL_ONLY",
    exportSafe: false,
    approvedAt: new Date("2026-01-01"),
    approvedByUserId: null,
    nextReviewDueAt: null,
    version: "v1",
    versionNumber: 1,
    topicId: "topic-ac",
    subControlKey: "admin_mfa",
    subControlLabels: [],
    createdAt: new Date("2026-01-01"),
    ...overrides,
  };
}

describe("retrieveInternalCanonical — sub-control safety", () => {
  beforeEach(() => {
    findFirstTopic.mockReset();
    findManyAnswers.mockReset();
    findFirstTopic.mockResolvedValue({ id: "topic-ac", key: "access_control" });
  });

  it("returns NO_TOPIC_LEVEL_CANONICAL when row has no sub-control and every answer is sub-control-scoped", async () => {
    findManyAnswers.mockResolvedValueOnce([
      buildCandidate({ id: "ans-admin_mfa", subControlKey: "admin_mfa" }),
      buildCandidate({ id: "ans-rbac", subControlKey: "rbac", versionNumber: 2 }),
    ]);

    const result = await retrieveInternalCanonical(
      "ws-1",
      { topicId: "topic-ac" },
      null,
    );

    expect(result.kind).toBe("none");
    if (result.kind === "none") {
      expect(result.code).toBe("NO_TOPIC_LEVEL_CANONICAL");
      expect(result.context.topicKey).toBe("access_control");
    }
  });

  it("returns SUBCONTROL_MISMATCH_NO_FALLBACK when a specific sub-control is requested but only other sub-controls exist", async () => {
    findManyAnswers.mockResolvedValueOnce([
      buildCandidate({ id: "ans-admin_mfa", subControlKey: "admin_mfa" }),
    ]);

    const result = await retrieveInternalCanonical(
      "ws-1",
      { topicId: "topic-ac" },
      "offboarding",
    );

    expect(result.kind).toBe("none");
    if (result.kind === "none") {
      expect(result.code).toBe("SUBCONTROL_MISMATCH_NO_FALLBACK");
      expect(result.context.subControlKey).toBe("offboarding");
    }
  });

  it("returns success when a topic-level (null subControlKey) eligible answer exists and no sub-control is requested", async () => {
    findManyAnswers.mockResolvedValueOnce([
      buildCandidate({
        id: "ans-generic",
        subControlKey: null,
        answer: "Access control policy applies broadly.",
      }),
      buildCandidate({ id: "ans-admin_mfa", subControlKey: "admin_mfa" }),
    ]);

    const result = await retrieveInternalCanonical(
      "ws-1",
      { topicId: "topic-ac" },
      null,
    );

    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.canonical.answerId).toBe("ans-generic");
      expect(result.selection.strategy).toBe("generic_topic");
    }
  });

  it("returns the exact sub-control canonical when one is eligible", async () => {
    findManyAnswers.mockResolvedValueOnce([
      buildCandidate({ id: "ans-admin_mfa", subControlKey: "admin_mfa" }),
      buildCandidate({
        id: "ans-offboarding",
        subControlKey: "offboarding",
        answer: "Offboarding must be automated within 24 hours.",
      }),
    ]);

    const result = await retrieveInternalCanonical(
      "ws-1",
      { topicId: "topic-ac" },
      "offboarding",
    );

    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.canonical.answerId).toBe("ans-offboarding");
      expect(result.selection.strategy).toBe("exact_subcontrol");
    }
  });

  it("falls back to topic-level canonical when sub-control requested but no exact match AND topic-level answer exists", async () => {
    findManyAnswers.mockResolvedValueOnce([
      buildCandidate({
        id: "ans-generic",
        subControlKey: null,
        answer: "Access control governance overview.",
      }),
      buildCandidate({ id: "ans-admin_mfa", subControlKey: "admin_mfa" }),
    ]);

    const result = await retrieveInternalCanonical(
      "ws-1",
      { topicId: "topic-ac" },
      "offboarding",
    );

    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.canonical.answerId).toBe("ans-generic");
      expect(result.selection.strategy).toBe("topic_fallback");
    }
  });
});
