import type { AnswerGovernanceStatus, AnswerStatus } from "@prisma/client";

/** Supported review cadence lengths (days). */
export const ALLOWED_CADENCE_DAYS = [90, 180, 365] as const;

export type AllowedCadenceDays = (typeof ALLOWED_CADENCE_DAYS)[number];

export function normalizeCadenceDays(value: number | null | undefined, fallback: number): AllowedCadenceDays {
  const v = value ?? fallback;
  if (ALLOWED_CADENCE_DAYS.includes(v as AllowedCadenceDays)) return v as AllowedCadenceDays;
  return (ALLOWED_CADENCE_DAYS.find((d) => d >= v) ?? 90) as AllowedCadenceDays;
}

export function resolveCadenceDays(input: {
  answerOverride: number | null | undefined;
  topicOverride: number | null | undefined;
  workspaceDefault: number | null | undefined;
}): AllowedCadenceDays {
  const ws = normalizeCadenceDays(input.workspaceDefault ?? 90, 90);
  if (input.answerOverride != null) return normalizeCadenceDays(input.answerOverride, ws);
  if (input.topicOverride != null) return normalizeCadenceDays(input.topicOverride, ws);
  return ws;
}

export function computeNextReviewDueAt(anchor: Date, cadenceDays: number): Date {
  const d = new Date(anchor.getTime());
  d.setUTCDate(d.getUTCDate() + cadenceDays);
  return d;
}

export function isPastDue(now: Date, nextReviewDueAt: Date | null | undefined): boolean {
  if (!nextReviewDueAt) return false;
  return nextReviewDueAt.getTime() < now.getTime();
}

export function isDueSoon(
  now: Date,
  nextReviewDueAt: Date | null | undefined,
  windowDays: number,
): boolean {
  if (!nextReviewDueAt || isPastDue(now, nextReviewDueAt)) return false;
  const windowEnd = new Date(now.getTime());
  windowEnd.setUTCDate(windowEnd.getUTCDate() + windowDays);
  return nextReviewDueAt.getTime() <= windowEnd.getTime();
}

export type FreshnessBucket = "fresh" | "due_soon" | "expired_or_past_due";

export function freshnessBucket(
  now: Date,
  item: {
    status: AnswerStatus;
    governanceStatus: AnswerGovernanceStatus;
    nextReviewDueAt: Date | null | undefined;
  },
): FreshnessBucket {
  if (item.status === "ARCHIVED") return "fresh";
  if (item.governanceStatus === "EXPIRED") return "expired_or_past_due";
  const approvedLike =
    item.governanceStatus === "APPROVED_INTERNAL" ||
    item.governanceStatus === "APPROVED_FOR_EXPORT" ||
    (item.status === "APPROVED" && item.governanceStatus === "DRAFT");
  if (approvedLike && isPastDue(now, item.nextReviewDueAt)) {
    return "expired_or_past_due";
  }
  if (approvedLike && isDueSoon(now, item.nextReviewDueAt, 14)) {
    return "due_soon";
  }
  return "fresh";
}

/** Score delta applied in questionnaire matching when reuse is stale or expired. */
export const MATCHER_FRESHNESS_PENALTY = 0.15;

export function matcherFreshnessPenalty(bucket: FreshnessBucket): number {
  return bucket === "expired_or_past_due" ? -MATCHER_FRESHNESS_PENALTY : 0;
}

export function cadenceSourceLabel(input: {
  answerOverride: number | null | undefined;
  topicOverride: number | null | undefined;
}): "answer" | "topic" | "workspace" {
  if (input.answerOverride != null) return "answer";
  if (input.topicOverride != null) return "topic";
  return "workspace";
}
