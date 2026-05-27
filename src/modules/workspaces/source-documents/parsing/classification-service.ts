import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logging/logger";
import { SimilarityService } from "@/modules/workspaces/search/similarity-service";

/**
 * D10-EN-01: Topic Classification Service
 * Evaluates document chunks against the topic taxonomy to identify
 * high-quality source material for drafting answers.
 */
export class ClassificationService {
  // Top-K per-chunk assignment replaces the earlier single-threshold strategy.
  // Recall was dominated by the 0.65 floor: diagnostic on real seller packs
  // showed 95% of chunks orphaned because typical policy paragraphs cosine
  // around 0.40-0.55 against the short topic "name: description" embeddings.
  // Precision downstream is already protected by strict topic gating in the
  // matcher and the LLM fitness verifier, so we can afford a weaker floor
  // here and rely on top-K to spread each chunk across its likeliest topics.
  private static TOP_K = 3;
  private static MIN_SCORE = 0.35;

  /**
   * Semantically classifies all chunks in a workspace against the taxonomy.
   */
  static async classifyWorkspaceChunks(workspaceId: string): Promise<number> {
    logger.info("classification:workspace:start", { workspaceId });

    // 1. Fetch chunks for the workspace that have embeddings
    const chunks = await prisma.sourceDocumentChunk.findMany({
      where: { 
        workspaceId,
        embedding: { isEmpty: false }
      }
    });

    if (chunks.length === 0) {
      logger.warn("classification:workspace:no_chunks", { workspaceId });
      return 0;
    }

    // 2. Perform semantic classification
    return this.processClassificationBatch(workspaceId, chunks);
  }

  /**
   * Semantically classifies chunks for a specific document.
   * D10-EN-01: Wipe and rebuild prior matches for that specific document on re-run.
   */
  static async classifyDocumentChunks(workspaceId: string, documentId: string): Promise<number> {
    logger.info("classification:document:start", { workspaceId, documentId });

    // 1. Wipe existing matches for this document's chunks
    await prisma.sourceChunkTopic.deleteMany({
      where: {
        workspaceId,
        chunk: { sourceDocumentId: documentId }
      }
    });


    // 2. Fetch chunks for this document
    const chunks = await prisma.sourceDocumentChunk.findMany({
      where: { 
        workspaceId,
        sourceDocumentId: documentId,
        embedding: { isEmpty: false }
      }
    });


    if (chunks.length === 0) return 0;

    // 3. Process
    return this.processClassificationBatch(workspaceId, chunks);
  }

  /**
   * Internal loop to match chunks against topics and persist results using
   * a top-K-per-chunk strategy. Each chunk records up to TOP_K topic links
   * (if the similarity clears MIN_SCORE), so semantically borderline chunks
   * land on multiple candidate topics instead of being silently orphaned.
   */
  private static async processClassificationBatch(workspaceId: string, chunks: any[]): Promise<number> {
    let matchCount = 0;
    let chunksWithAtLeastOneTopic = 0;
    let chunksStillOrphan = 0;
    const topKHistogram: Record<string, number> = { "0": 0, "1": 0, "2": 0, "3": 0 };

    for (const chunk of chunks) {
      // Fetch more than TOP_K so MIN_SCORE filtering still yields TOP_K when
      // the chunk's embedding sits in a dense neighbourhood.
      const topicMatches = await SimilarityService.findSimilarTopicsByVector(
        workspaceId,
        chunk.embedding,
        Math.max(this.TOP_K * 2, 5),
      );

      const likelyTopics = topicMatches
        .filter((m) => m.score >= this.MIN_SCORE)
        .slice(0, this.TOP_K);

      const assignedCount = Math.min(likelyTopics.length, this.TOP_K);
      topKHistogram[String(assignedCount)] = (topKHistogram[String(assignedCount)] ?? 0) + 1;
      if (assignedCount > 0) chunksWithAtLeastOneTopic++;
      else chunksStillOrphan++;

      for (const match of likelyTopics) {
        await prisma.sourceChunkTopic.upsert({
          where: {
            chunkId_topicId: {
              chunkId: chunk.id,
              topicId: match.item.id,
            },
            workspaceId,
          },
          update: { score: match.score },
          create: {
            workspaceId,
            chunkId: chunk.id,
            topicId: match.item.id,
            score: match.score,
          },
        });
        matchCount++;
      }
    }

    logger.info("classification:batch:complete", {
      workspaceId,
      processedChunks: chunks.length,
      associationsCreated: matchCount,
      chunksWithAtLeastOneTopic,
      chunksStillOrphan,
      orphanRate:
        chunks.length > 0
          ? Number((chunksStillOrphan / chunks.length).toFixed(4))
          : 0,
      topKHistogram,
      minScore: this.MIN_SCORE,
      topK: this.TOP_K,
    });

    return matchCount;
  }
}
