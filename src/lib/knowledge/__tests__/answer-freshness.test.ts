import { describe, it, expect } from "vitest";
import {
  ALLOWED_CADENCE_DAYS,
  computeNextReviewDueAt,
  freshnessBucket,
  isDueSoon,
  isPastDue,
  matcherFreshnessPenalty,
  normalizeCadenceDays,
  resolveCadenceDays,
} from "../answer-freshness";

describe("resolveCadenceDays", () => {
  it("prefers answer override, then topic, then workspace", () => {
    expect(
      resolveCadenceDays({
        answerOverride: 365,
        topicOverride: 180,
        workspaceDefault: 90,
      }),
    ).toBe(365);
    expect(
      resolveCadenceDays({
        answerOverride: null,
        topicOverride: 180,
        workspaceDefault: 90,
      }),
    ).toBe(180);
    expect(
      resolveCadenceDays({
        answerOverride: null,
        topicOverride: null,
        workspaceDefault: 90,
      }),
    ).toBe(90);
  });
});

describe("normalizeCadenceDays", () => {
  it("snaps to allowed values", () => {
    expect(normalizeCadenceDays(120, 90)).toBe(180);
    expect(ALLOWED_CADENCE_DAYS.includes(normalizeCadenceDays(90, 90))).toBe(true);
  });
});

describe("computeNextReviewDueAt", () => {
  it("adds UTC days", () => {
    const anchor = new Date(Date.UTC(2026, 0, 1, 12, 0, 0));
    const due = computeNextReviewDueAt(anchor, 90);
    expect(due.getUTCMonth()).toBe(3);
    expect(due.getUTCDate()).toBe(1);
  });
});

describe("freshnessBucket", () => {
  const now = new Date(Date.UTC(2026, 6, 1));

  it("marks EXPIRED governance as expired_or_past_due", () => {
    expect(
      freshnessBucket(now, {
        status: "APPROVED",
        governanceStatus: "EXPIRED",
        nextReviewDueAt: null,
      }),
    ).toBe("expired_or_past_due");
  });

  it("marks approved with past nextReviewDueAt", () => {
    expect(
      freshnessBucket(now, {
        status: "APPROVED",
        governanceStatus: "APPROVED_INTERNAL",
        nextReviewDueAt: new Date(Date.UTC(2026, 0, 1)),
      }),
    ).toBe("expired_or_past_due");
  });

  it("marks due soon within 14 days", () => {
    const due = new Date(now.getTime());
    due.setUTCDate(due.getUTCDate() + 7);
    expect(
      freshnessBucket(now, {
        status: "APPROVED",
        governanceStatus: "APPROVED_INTERNAL",
        nextReviewDueAt: due,
      }),
    ).toBe("due_soon");
  });
});

describe("matcherFreshnessPenalty", () => {
  it("applies penalty only for expired_or_past_due", () => {
    expect(matcherFreshnessPenalty("fresh")).toBe(0);
    expect(matcherFreshnessPenalty("due_soon")).toBe(0);
    expect(matcherFreshnessPenalty("expired_or_past_due")).toBeLessThan(0);
  });
});

describe("isPastDue / isDueSoon", () => {
  const now = new Date(Date.UTC(2026, 6, 1));
  it("detects past due", () => {
    expect(isPastDue(now, new Date(Date.UTC(2026, 5, 1)))).toBe(true);
    expect(isPastDue(now, new Date(Date.UTC(2026, 7, 1)))).toBe(false);
  });
  it("detects due soon window", () => {
    const soon = new Date(now.getTime());
    soon.setUTCDate(soon.getUTCDate() + 5);
    expect(isDueSoon(now, soon, 14)).toBe(true);
  });
});
