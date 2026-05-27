import { prisma } from "@/lib/db/prisma";
import { EmbeddingService } from "@/lib/ai/embedding-service";
import { logger } from "@/lib/logging/logger";
import { TopicsService } from "@/modules/knowledge/topics/topics-service";

export interface SimilarityMatch<T> {
  item: T;
  score: number;
}

/**
 * SimilarityService provides high-level APIs for finding related content
 * using vector embeddings and JS-side cosine similarity.
 */
export const SimilarityService = {
  /**
   * Calculates cosine similarity between two vectors.
   * Formula: (A . B) / (||A|| * ||B||)
   */
  cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }
    
    const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
    if (magnitude === 0) return 0;
    
    return dotProduct / magnitude;
  },

  /**
   * Finds the most similar Answer Library Items for a given query vector.
   */
  async findSimilarAnswersByVector(
    workspaceId: string,
    queryVector: number[],
    limit: number = 5,
    options?: { boostTopicId?: string; boostApproved?: boolean }
  ): Promise<SimilarityMatch<any>[]> {
    try {
      const items = await prisma.answerLibraryItem.findMany({
        where: { 
          workspaceId,
          embedding: { isEmpty: false },
          status: { not: "ARCHIVED" } // D10-EN-04: Exclude rejected/archived content
        },
        include: {
            topic: true
        }
      });
      
      const boostTopicId = options?.boostTopicId;
      const boostApproved = options?.boostApproved ?? true; // Default to boosting approved

      const matches = items.map(item => {
        let score = this.cosineSimilarity(queryVector, item.embedding as number[]);
        
        // Boosting Logic
        if (boostTopicId && item.topicId === boostTopicId) {
            score += 0.05;
        }
        if (boostApproved && item.status === 'APPROVED') {
            score += 0.15; // D10-EN-04: Increased from 0.05 for stronger Trust differentiation
        }

        return { item, score };
      });

      return matches
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
    } catch (err) {
      logger.error('similarity:answers:failed', { error: String(err), workspaceId });
      return [];
    }
  },

  /**
   * Finds the most similar Knowledge Topics for a given query vector.
   * D10-EN-01: Uses the Mixed View resolution (Workspace > Global).
   */
  async findSimilarTopicsByVector(
    workspaceId: string,
    queryVector: number[],
    limit: number = 5
  ): Promise<SimilarityMatch<any>[]> {
    try {
      // 1. Resolve authorized topics (Active/Draft, Workspace overrides Global)
      const items = await TopicsService.resolveWorkspaceTopics(workspaceId);

      // 2. Map and calculate similarity
      const matches = items
        .filter(item => Array.isArray(item.embedding) && item.embedding.length > 0)
        .map(item => ({
          item,
          score: this.cosineSimilarity(queryVector, item.embedding as number[])
        }));

      return matches
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
    } catch (err) {
      logger.error('similarity:topics:failed', { error: String(err), workspaceId });
      return [];
    }
  },

  /**
   * Finds the most similar Document Chunks for a given query text (RAG).
   */
  async searchChunks(
    workspaceId: string,
    queryText: string,
    limit: number = 5
  ): Promise<SimilarityMatch<any>[]> {
    try {
      const queryVector = await EmbeddingService.getEmbedding(queryText);
      
      const items = await prisma.sourceDocumentChunk.findMany({
        where: { 
          workspaceId,
          embedding: { isEmpty: false },
          sourceDocument: { isLatest: true }
        },
        include: {
            sourceDocument: {
                select: { fileName: true }
            }
        }
      });

      const matches = items.map(item => ({
        item,
        score: this.cosineSimilarity(queryVector, item.embedding as number[])
      }));

      return matches
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
    } catch (err) {
      logger.error('similarity:chunks:failed', { error: String(err), workspaceId });
      return [];
    }
  }
};
