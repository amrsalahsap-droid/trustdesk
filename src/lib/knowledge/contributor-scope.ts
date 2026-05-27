/**
 * Canonical Contributor Scope Definition
 * 
 * This module provides a single, unified definition of "contributor-relevant"
 * content for the Answer Library. It defines `my_contributions` semantics once
 * and provides utilities for both topic scoping and answer scoping.
 * 
 * Design principles:
 * - One canonical definition of "contribution" for the entire system
 * - Direct Prisma where clauses (no multi-step ID lookups)
 * - Reusable across topics API, answers API, and any future consumers
 * - Type-safe and testable
 */

import type { Prisma } from "@prisma/client";

/**
 * Contribution signals that define "my_contributions" scope:
 * 
 * 1. Answer versions changed by the user
 *    - User has edited the answer content
 *    - Tracked via AnswerLibraryItemVersion.changedById
 * 
 * 2. Evidence sourced from documents uploaded by the user
 *    - User uploaded a source document
 *    - A chunk from that document is used as evidence
 *    - Traced via: evidence.chunk.sourceDocument.uploadedById
 */
export type ContributionSignal = "version_edit" | "evidence_upload";

/**
 * Build a Prisma where clause for contributor-relevant answers.
 * This is the single source of truth for what "my_contributions" means.
 * 
 * @param userId - The contributor's user ID
 * @returns Prisma where clause matching answers the user has contributed to
 */
export function buildContributorAnswerWhere(
  userId: string
): Prisma.AnswerLibraryItemWhereInput {
  return {
    OR: [
      // Signal 1: User has made version edits to this answer
      {
        versions: {
          some: {
            changedById: userId,
          },
        },
      },
      // Signal 2: User uploaded source documents used as evidence
      {
        evidence: {
          some: {
            chunk: {
              sourceDocument: {
                uploadedById: userId,
              },
            },
          },
        },
      },
    ],
  };
}

/**
 * Build a Prisma where clause for finding contributor-relevant answer IDs.
 * Used by the topics API to first find relevant answers, then extract topic IDs.
 * 
 * @param userId - The contributor's user ID
 * @returns Prisma where clause for AnswerLibraryItem query
 */
export function buildContributorAnswerIdLookupWhere(
  userId: string
): Prisma.AnswerLibraryItemWhereInput {
  // This is the same as buildContributorAnswerWhere but explicitly for ID lookup
  return buildContributorAnswerWhere(userId);
}

/**
 * Extract unique topic IDs from a list of answers.
 * Utility for the topics API scoping flow.
 * 
 * @param answers - Array of answers with topicId
 * @returns Array of unique topic IDs
 */
export function extractUniqueTopicIds(
  answers: Array<{ topicId: string | null }>
): string[] {
  const topicIds = answers
    .map((a) => a.topicId)
    .filter((id): id is string => !!id);
  return [...new Set(topicIds)];
}

/**
 * Check if an answer ID list would match the contributor scope.
 * Utility for testing and validation.
 * 
 * @param answerId - The answer to check
 * @param userId - The contributor's user ID
 * @param prisma - Prisma client instance
 * @returns Promise<boolean> indicating if the answer matches contributor scope
 */
export async function isAnswerInContributorScope(
  answerId: string,
  userId: string,
  prisma: Prisma.TransactionClient
): Promise<boolean> {
  const count = await prisma.answerLibraryItem.count({
    where: {
      id: answerId,
      ...buildContributorAnswerWhere(userId),
    },
  });
  return count > 0;
}

/**
 * Get all answer IDs in contributor scope for a workspace.
 * Useful for bulk operations and testing.
 * 
 * @param workspaceId - The workspace to search
 * @param userId - The contributor's user ID
 * @param prisma - Prisma client instance
 * @returns Promise<string[]> of answer IDs
 */
export async function getContributorAnswerIds(
  workspaceId: string,
  userId: string,
  prisma: Prisma.TransactionClient
): Promise<string[]> {
  const answers = await prisma.answerLibraryItem.findMany({
    where: {
      workspaceId,
      ...buildContributorAnswerWhere(userId),
    },
    select: { id: true },
  });
  return answers.map((a) => a.id);
}

/**
 * Get contributor-scoped counts for a topic.
 * Returns counts of answers relevant to the contributor (not global counts).
 * 
 * @param topicId - The topic to count
 * @param userId - The contributor's user ID
 * @param prisma - Prisma client instance
 * @returns Promise with scoped counts
 */
export async function getContributorTopicCounts(
  topicId: string,
  userId: string,
  prisma: Prisma.TransactionClient
): Promise<{
  totalRelevant: number;
  withVersions: number;
  withEvidence: number;
}> {
  const [totalRelevant, withVersions, withEvidence] = await Promise.all([
    prisma.answerLibraryItem.count({
      where: {
        topicId,
        ...buildContributorAnswerWhere(userId),
      },
    }),
    prisma.answerLibraryItem.count({
      where: {
        topicId,
        versions: { some: { changedById: userId } },
      },
    }),
    prisma.answerLibraryItem.count({
      where: {
        topicId,
        evidence: {
          some: {
            chunk: {
              sourceDocument: { uploadedById: userId },
            },
          },
        },
      },
    }),
  ]);

  return { totalRelevant, withVersions, withEvidence };
}

/**
 * Build a Prisma include/select clause to identify contribution signals
 * in answer results. Useful for UI badges and context-only marking.
 */
export function buildContributionSignalSelect(
  userId: string
): Prisma.AnswerLibraryItemSelect {
  return {
    id: true,
    versions: {
      where: { changedById: userId },
      select: { id: true, versionNumber: true },
      take: 1, // Just need to know if any exist
    },
    evidence: {
      where: {
        chunk: {
          sourceDocument: { uploadedById: userId },
        },
      },
      select: { id: true },
      take: 1, // Just need to know if any exist
    },
  };
}

/**
 * Determine the contribution relationship between a user and an answer.
 * Returns which signals are present for UI indication.
 * 
 * @param answer - Answer data with contribution signals selected
 * @param userId - The contributor's user ID
 * @returns Object indicating contribution relationship
 */
export function getContributionRelationship(
  answer: {
    versions?: Array<{ changedById?: string }>;
    evidence?: Array<{ chunk?: { sourceDocument?: { uploadedById?: string } } }>;
  },
  userId: string
): {
  hasContributed: boolean;
  signals: ContributionSignal[];
} {
  const signals: ContributionSignal[] = [];

  if (answer.versions && answer.versions.length > 0) {
    signals.push("version_edit");
  }

  if (answer.evidence && answer.evidence.length > 0) {
    const hasUserEvidence = answer.evidence.some(
      (e) => e.chunk?.sourceDocument?.uploadedById === userId
    );
    if (hasUserEvidence) {
      signals.push("evidence_upload");
    }
  }

  return {
    hasContributed: signals.length > 0,
    signals,
  };
}
