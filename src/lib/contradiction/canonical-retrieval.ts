/**
 * Canonical Answer Retrieval Service
 *
 * Retrieves the latest eligible canonical answer for contradiction detection.
 * This is the foundation layer for the TrustDesk contradiction-detection epic.
 *
 * Responsibilities:
 * - Retrieve canonical answers by workspace + topic (+ optional sub-control)
 * - Apply governance eligibility rules (internal vs export scope)
 * - Return deterministic "best" canonical answer with full metadata
 * - Provide structured "no canonical available" results
 */

import type {
  AnswerGovernanceStatus,
  AnswerApprovalScope,
  AnswerStatus,
} from "@prisma/client";
import { prisma, uncheckedPrisma } from "@/lib/db/prisma";
import {
  isEligibleForInternalReuse,
  isEligibleForExportReuse,
} from "@/lib/knowledge/answer-workflow";

/**
 * Approval scope for canonical retrieval.
 * - "internal": Approved for internal reuse (APPROVED_INTERNAL or legacy approved)
 * - "export": Approved for export (APPROVED_FOR_EXPORT + EXPORT_ALLOWED + exportSafe)
 */
export type CanonicalRetrievalScope = "internal" | "export";

/**
 * Input parameters for canonical answer retrieval.
 */
export interface CanonicalRetrievalInput {
  workspaceId: string;
  /** Either topicId (UUID) or topicKey (string like "access_control") */
  topicId?: string;
  topicKey?: string;
  /** Optional sub-control key for granular matching (e.g., "rbac", "admin_mfa") */
  subControlKey?: string | null;
  /** Desired approval scope for the canonical answer */
  scope: CanonicalRetrievalScope;
  /** Current time for freshness checks (defaults to now) */
  now?: Date;
}

/**
 * Rich metadata about the retrieved canonical answer.
 * Includes everything needed for contradiction comparison and persistence.
 */
export interface CanonicalAnswerMetadata {
  answerId: string;
  title: string;
  answer: string;
  governanceStatus: AnswerGovernanceStatus;
  approvalScope: AnswerApprovalScope;
  exportSafe: boolean;
  status: AnswerStatus;
  approvedAt: Date | null;
  approvedByUserId: string | null;
  nextReviewDueAt: Date | null;
  version: string;
  versionNumber: number;
  topicId: string;
  subControlKey: string | null;
  subControlLabels: string[];
  /** Freshness bucket for downstream freshness penalty application */
  freshness: "fresh" | "due_soon" | "expired_or_past_due";
}

/**
 * Successful result with a canonical answer.
 */
export interface CanonicalRetrievalSuccess {
  kind: "success";
  canonical: CanonicalAnswerMetadata;
  /** How this answer was selected (for debugging/audit) */
  selection: {
    /** Number of candidates evaluated */
    candidatesCount: number;
    /** Matching strategy used */
    strategy: "exact_subcontrol" | "topic_fallback" | "generic_topic";
    /** Whether sub-control match was exact or fuzzy */
    subControlMatch: "exact" | "none";
  };
}

/**
 * Structured result when no eligible canonical answer exists.
 */
export interface CanonicalRetrievalNone {
  kind: "none";
  /** Human-readable explanation */
  reason: string;
  /** Machine-readable code for programmatic handling */
  code:
    | "TOPIC_NOT_FOUND"
    | "NO_ANSWERS_FOR_TOPIC"
    | "NO_ELIGIBLE_ANSWERS"
    | "ALL_ANSWERS_EXPIRED"
    | "ALL_ANSWERS_ARCHIVED"
    | "EXPORT_SAFE_REQUIRED_BUT_UNAVAILABLE"
    | "SUBCONTROL_SPECIFIED_BUT_NO_MATCH"
    /** subControlKey set, no exact match, and no topic-level eligible fallback exists. */
    | "SUBCONTROL_MISMATCH_NO_FALLBACK"
    /** No subControlKey on the row, and every eligible canonical is sub-control-scoped. */
    | "NO_TOPIC_LEVEL_CANONICAL";
  /** Context for debugging */
  context: {
    workspaceId: string;
    topicId?: string;
    topicKey?: string;
    subControlKey?: string | null;
    scope: CanonicalRetrievalScope;
    /** Number of candidates found (if any) */
    candidatesFound: number;
    /** Number of candidates rejected by eligibility rules */
    candidatesRejected: number;
  };
}

/** Union type for all retrieval results. */
export type CanonicalRetrievalResult = CanonicalRetrievalSuccess | CanonicalRetrievalNone;

/** Error for invalid input combinations. */
export class CanonicalRetrievalError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "CanonicalRetrievalError";
  }
}

/**
 * Determines the freshness bucket for a canonical answer.
 */
function determineFreshness(
  now: Date,
  item: {
    status: AnswerStatus;
    governanceStatus: AnswerGovernanceStatus;
    nextReviewDueAt: Date | null;
  },
): "fresh" | "due_soon" | "expired_or_past_due" {
  if (item.status === "ARCHIVED") return "fresh";
  if (item.governanceStatus === "EXPIRED") return "expired_or_past_due";

  const approvedLike =
    item.governanceStatus === "APPROVED_INTERNAL" ||
    item.governanceStatus === "APPROVED_FOR_EXPORT" ||
    (item.status === "APPROVED" && item.governanceStatus === "DRAFT");

  if (approvedLike && item.nextReviewDueAt) {
    if (item.nextReviewDueAt.getTime() < now.getTime()) {
      return "expired_or_past_due";
    }
    const windowEnd = new Date(now.getTime());
    windowEnd.setUTCDate(windowEnd.getUTCDate() + 14);
    if (item.nextReviewDueAt.getTime() <= windowEnd.getTime()) {
      return "due_soon";
    }
  }

  return "fresh";
}

/**
 * Resolves a topic key to a topic ID if needed.
 * Looks up by (workspaceId, key) or falls back to system/global topics.
 */
async function resolveTopic(
  workspaceId: string,
  topicId: string | undefined,
  topicKey: string | undefined,
): Promise<{ id: string; key: string } | null> {
  if (topicId) {
    // Tenant middleware rejects OR branches with workspaceId: null; use `in` + legacy unchecked read.
    let topic = await prisma.knowledgeTopic.findFirst({
      where: {
        id: topicId,
        workspaceId: { in: [workspaceId, "SYSTEM_WORKSPACE"] },
      },
      select: { id: true, key: true },
    });
    if (!topic) {
      topic = await uncheckedPrisma.knowledgeTopic.findFirst({
        where: { id: topicId, workspaceId: null },
        select: { id: true, key: true },
      });
    }
    return topic;
  }

  if (topicKey) {
    // Try workspace-specific topic first
    let topic = await prisma.knowledgeTopic.findUnique({
      where: { workspaceId_key: { workspaceId, key: topicKey } },
      select: { id: true, key: true },
    });

    // Fall back to system workspace
    if (!topic) {
      topic = await prisma.knowledgeTopic.findUnique({
        where: { workspaceId_key: { workspaceId: "SYSTEM_WORKSPACE", key: topicKey } },
        select: { id: true, key: true },
      });
    }

    // Fall back to global topics (workspaceId is null) — extended client cannot scope null.
    if (!topic) {
      topic = await uncheckedPrisma.knowledgeTopic.findFirst({
        where: { workspaceId: null, key: topicKey },
        select: { id: true, key: true },
      });
    }

    return topic;
  }

  return null;
}

/**
 * Retrieves the best eligible canonical answer for contradiction comparison.
 *
 * Selection algorithm (deterministic):
 * 1. Fetch all answers for the topic (not archived)
 * 2. Filter by eligibility based on scope (internal vs export)
 * 3. Prioritize exact subControlKey match over topic-level answers
 * 4. Among matches at same priority level, select by:
 *    - exportSafe = true (if scope = export)
 *    - higher versionNumber
 *    - later approvedAt
 *    - createdAt as tiebreaker
 *
 * @param input Retrieval parameters
 * @returns Success with canonical metadata, or structured "none" result
 * @throws CanonicalRetrievalError for invalid input
 */
export async function retrieveCanonicalAnswer(
  input: CanonicalRetrievalInput,
): Promise<CanonicalRetrievalResult> {
  const { workspaceId, topicId, topicKey, subControlKey, scope, now = new Date() } = input;

  // Validate input
  if (!topicId && !topicKey) {
    throw new CanonicalRetrievalError(
      "Must provide either topicId or topicKey",
      "MISSING_TOPIC_IDENTIFIER",
    );
  }

  // Resolve topic
  const topic = await resolveTopic(workspaceId, topicId, topicKey);
  if (!topic) {
    return {
      kind: "none",
      reason: `Topic not found for identifier: ${topicId ?? topicKey}`,
      code: "TOPIC_NOT_FOUND",
      context: {
        workspaceId,
        topicId,
        topicKey,
        subControlKey,
        scope,
        candidatesFound: 0,
        candidatesRejected: 0,
      },
    };
  }

  // Fetch all candidate answers for this topic (and sub-controls if specified)
  // We fetch both exact sub-control matches and topic-level answers
  const candidates = await prisma.answerLibraryItem.findMany({
    where: {
      workspaceId,
      status: { not: "ARCHIVED" },
      OR: [
        // Topic-level answers (no sub-control or sub-control doesn't match)
        { topicId: topic.id },
        // If subControlKey provided, also look for exact matches
        ...(subControlKey
          ? [
              {
                topicId: topic.id,
                subControlKey,
              },
            ]
          : []),
      ],
    },
    select: {
      id: true,
      title: true,
      answer: true,
      status: true,
      governanceStatus: true,
      approvalScope: true,
      exportSafe: true,
      approvedAt: true,
      approvedByUserId: true,
      nextReviewDueAt: true,
      version: true,
      versionNumber: true,
      topicId: true,
      subControlKey: true,
      subControlLabels: true,
      createdAt: true,
    },
    orderBy: [{ versionNumber: "desc" }, { approvedAt: "desc" }, { createdAt: "desc" }],
  });

  if (candidates.length === 0) {
    return {
      kind: "none",
      reason: `No canonical answers exist for topic "${topic.key}"`,
      code: "NO_ANSWERS_FOR_TOPIC",
      context: {
        workspaceId,
        topicId: topic.id,
        topicKey: topic.key,
        subControlKey,
        scope,
        candidatesFound: 0,
        candidatesRejected: 0,
      },
    };
  }

  // Filter by eligibility based on scope
  let eligibleCandidates = candidates.filter((c) => {
    if (scope === "internal") {
      return isEligibleForInternalReuse({
        status: c.status,
        governanceStatus: c.governanceStatus,
      });
    } else {
      return isEligibleForExportReuse({
        status: c.status,
        governanceStatus: c.governanceStatus,
        approvalScope: c.approvalScope,
        exportSafe: c.exportSafe,
        nextReviewDueAt: c.nextReviewDueAt,
      }, now);
    }
  });

  // Track why we might return none
  const rejectedCount = candidates.length - eligibleCandidates.length;

  if (eligibleCandidates.length === 0) {
    // Determine the most specific reason
    const hasExpired = candidates.some((c) => c.governanceStatus === "EXPIRED");
    const allArchived = candidates.every((c) => c.status === "ARCHIVED");
    const needsExportSafe = scope === "export" && candidates.some((c) => !c.exportSafe);

    let code: CanonicalRetrievalNone["code"] = "NO_ELIGIBLE_ANSWERS";
    let reason = `No eligible canonical answers for topic "${topic.key}" with scope "${scope}"`;

    if (allArchived) {
      code = "ALL_ANSWERS_ARCHIVED";
      reason = `All canonical answers for topic "${topic.key}" are archived`;
    } else if (hasExpired) {
      code = "ALL_ANSWERS_EXPIRED";
      reason = `All canonical answers for topic "${topic.key}" have expired`;
    } else if (needsExportSafe) {
      code = "EXPORT_SAFE_REQUIRED_BUT_UNAVAILABLE";
      reason = `No export-safe canonical answers available for topic "${topic.key}"`;
    }

    return {
      kind: "none",
      reason,
      code,
      context: {
        workspaceId,
        topicId: topic.id,
        topicKey: topic.key,
        subControlKey,
        scope,
        candidatesFound: candidates.length,
        candidatesRejected: rejectedCount,
      },
    };
  }

  // Prioritize by sub-control match if specified
  let selected: typeof eligibleCandidates[0];
  let strategy: CanonicalRetrievalSuccess["selection"]["strategy"];
  let subControlMatch: CanonicalRetrievalSuccess["selection"]["subControlMatch"];

  if (subControlKey) {
    const exactMatch = eligibleCandidates.find((c) => c.subControlKey === subControlKey);
    if (exactMatch) {
      selected = exactMatch;
      strategy = "exact_subcontrol";
      subControlMatch = "exact";
    } else {
      // No exact sub-control match — fall back to a generic topic-level answer only.
      // Returning an arbitrary other sub-control's canonical here is what produced the
      // offboarding-vs-admin_mfa false positive; refuse rather than guess.
      const topicLevel = eligibleCandidates.find((c) => !c.subControlKey);
      if (topicLevel) {
        selected = topicLevel;
        strategy = "topic_fallback";
        subControlMatch = "none";
      } else {
        return {
          kind: "none",
          reason: `No canonical with subControlKey "${subControlKey}" for topic "${topic.key}", and no topic-level fallback answer is available.`,
          code: "SUBCONTROL_MISMATCH_NO_FALLBACK",
          context: {
            workspaceId,
            topicId: topic.id,
            topicKey: topic.key,
            subControlKey,
            scope,
            candidatesFound: candidates.length,
            candidatesRejected: rejectedCount,
          },
        };
      }
    }
  } else {
    const topicLevel = eligibleCandidates.find((c) => !c.subControlKey);
    if (topicLevel) {
      selected = topicLevel;
      strategy = "generic_topic";
      subControlMatch = "none";
    } else {
      // Row has no sub-control context and every eligible answer is sub-control-scoped.
      // Picking `eligibleCandidates[0]` would compare the row against a canonical from an
      // unrelated sub-control (the original bug); return a structured none result instead.
      return {
        kind: "none",
        reason: `No topic-level canonical for topic "${topic.key}"; every eligible answer is scoped to a sub-control, and the row does not specify one.`,
        code: "NO_TOPIC_LEVEL_CANONICAL",
        context: {
          workspaceId,
          topicId: topic.id,
          topicKey: topic.key,
          subControlKey: null,
          scope,
          candidatesFound: candidates.length,
          candidatesRejected: rejectedCount,
        },
      };
    }
  }

  // Build result
  const freshness = determineFreshness(now, {
    status: selected.status,
    governanceStatus: selected.governanceStatus,
    nextReviewDueAt: selected.nextReviewDueAt,
  });

  return {
    kind: "success",
    canonical: {
      answerId: selected.id,
      title: selected.title,
      answer: selected.answer ?? "",
      governanceStatus: selected.governanceStatus,
      approvalScope: selected.approvalScope,
      exportSafe: selected.exportSafe,
      status: selected.status,
      approvedAt: selected.approvedAt,
      approvedByUserId: selected.approvedByUserId,
      nextReviewDueAt: selected.nextReviewDueAt,
      version: selected.version,
      versionNumber: selected.versionNumber,
      topicId: selected.topicId ?? topic.id,
      subControlKey: selected.subControlKey,
      subControlLabels: selected.subControlLabels,
      freshness,
    },
    selection: {
      candidatesCount: candidates.length,
      strategy,
      subControlMatch,
    },
  };
}

/**
 * Convenience method for retrieving the export-safe canonical answer.
 * Returns none if no export-safe answer exists (even if internal-approved exists).
 */
export async function retrieveExportCanonical(
  workspaceId: string,
  topicIdOrKey: { topicId: string } | { topicKey: string },
  subControlKey?: string | null,
  now?: Date,
): Promise<CanonicalRetrievalResult> {
  const input: CanonicalRetrievalInput = {
    workspaceId,
    ...topicIdOrKey,
    subControlKey,
    scope: "export",
    now,
  };
  return retrieveCanonicalAnswer(input);
}

/**
 * Convenience method for retrieving the internal-use canonical answer.
 * Less strict than export - accepts APPROVED_INTERNAL scope.
 */
export async function retrieveInternalCanonical(
  workspaceId: string,
  topicIdOrKey: { topicId: string } | { topicKey: string },
  subControlKey?: string | null,
  now?: Date,
): Promise<CanonicalRetrievalResult> {
  const input: CanonicalRetrievalInput = {
    workspaceId,
    ...topicIdOrKey,
    subControlKey,
    scope: "internal",
    now,
  };
  return retrieveCanonicalAnswer(input);
}
