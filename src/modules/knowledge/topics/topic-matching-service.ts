import { EmbeddingService } from "@/lib/ai/embedding-service";
import { SimilarityService } from "@/modules/workspaces/search/similarity-service";
import { logger } from "@/lib/logging/logger";
import { prisma, uncheckedPrisma } from "@/lib/db/prisma";

export interface TopicMatchResult {
  topicId: string | null;
  topicName: string | null;
  candidates?: string[]; // For ambiguous matches
  score: number;
  status: 'matched' | 'unresolved' | 'ambiguous';
  reason: string;
}

const TOPIC_CONFIDENCE_THRESHOLD = 0.4;
const AMBIGUITY_THRESHOLD = 0.05;

/**
 * TopicMatchingService centralizes the logic for mapping text to the TrustDesk
 * security topic taxonomy in a stable and explainable way.
 */
export const TopicMatchingService = {
  /**
   * Matches a single text query to the most likely topic.
   */
  async matchTopic(query: string, workspaceId: string): Promise<TopicMatchResult> {
    const results = await this.matchBatch([query], workspaceId);
    return results[0];
  },

  /**
   * Matches multiple texts in batch for efficiency.
   */
  async matchBatch(queries: string[], workspaceId: string): Promise<TopicMatchResult[]> {
    try {
      const vectors = await EmbeddingService.getEmbeddings(queries);
      return this.matchBatchByVectors(vectors, workspaceId);
    } catch (err) {
      logger.error('topic-matching:batch:failed', { error: String(err), workspaceId });
      return queries.map(() => ({
        topicId: null,
        topicName: null,
        score: 0,
        status: 'unresolved',
        reason: 'Internal error during topic matching.'
      }));
    }
  },

  /**
   * Matches multiple vectors in batch for efficiency.
   */
  async matchBatchByVectors(vectors: number[][], workspaceId: string): Promise<TopicMatchResult[]> {
    try {
      const results: TopicMatchResult[] = [];

      // 1. Pre-load all topics in batch (D11-EN-06)
      // Use uncheckedPrisma for the OR-null query to avoid tenant scoping violations
      const [workspaceTopics, globalTopics] = await Promise.all([
        prisma.knowledgeTopic.findMany({
          where: { 
            workspaceId: { in: [workspaceId, "SYSTEM_WORKSPACE"] },
            embedding: { isEmpty: false }
          }
        }),
        uncheckedPrisma.knowledgeTopic.findMany({
          where: { 
            workspaceId: null,
            embedding: { isEmpty: false }
          }
        })
      ]);
      const allTopics = [...workspaceTopics, ...globalTopics];

      for (const vector of vectors) {
        // --- In-memory matching (D11-EN-06) ---
        const matches = allTopics.map(item => ({
          item,
          score: SimilarityService.cosineSimilarity(vector, item.embedding as number[])
        })).sort((a, b) => b.score - a.score);
        
        const best = matches[0];
        const runnerUp = matches[1];

        const score = best?.score || 0;
        const runnerUpScore = runnerUp?.score || 0;

        // 1. Threshold Check
        if (!best || score < TOPIC_CONFIDENCE_THRESHOLD) {
          results.push({
            topicId: null,
            topicName: null,
            score,
            status: 'unresolved',
            reason: `No topic match found with sufficient confidence (highest: ${best?.item.name || 'none'} at ${Math.round(score * 100)}%).`
          });
          continue;
        }

        // 2. Ambiguity Check (Top 2 are too close)
        if (runnerUp && (score - runnerUpScore) < AMBIGUITY_THRESHOLD) {
          results.push({
            topicId: null,
            topicName: null,
            candidates: [best.item.name, runnerUp.item.name],
            score,
            status: 'ambiguous',
            reason: `High ambiguity detected between '${best.item.name}' and '${runnerUp.item.name}' (score difference < ${Math.round(AMBIGUITY_THRESHOLD * 100)}%).`
          });
          continue;
        }

        // 3. Success
        results.push({
          topicId: best.item.id,
          topicName: best.item.name,
          score,
          status: 'matched',
          reason: `Matched to topic '${best.item.name}' with ${Math.round(score * 100)}% similarity.`
        });
      }

      return results;
    } catch (err) {
      logger.error('topic-matching:failed', { error: String(err), workspaceId });
      return vectors.map(() => ({
        topicId: null,
        topicName: null,
        score: 0,
        status: 'unresolved',
        reason: 'Internal error during topic matching.'
      }));
    }
  }
};
