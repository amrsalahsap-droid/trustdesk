import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logging/logger";
import { EmbeddingService } from "@/lib/ai/embedding-service";
import { SourceDocumentChunk } from "@prisma/client";


/**
 * ChunkingService handles breaking down extracted document text into
 * manageable, context-aware segments for downstream processing.
 */
export const ChunkingService = {
  /**
   * Runs the chunking pipeline for a specific document.
   * Cleans up existing chunks for idempotency.
   * Now includes Vector Embedding generation (Story D5-AI-01).
   */
  async runChunking(workspaceId: string, sourceDocumentId: string): Promise<SourceDocumentChunk[]> {

    // 1. Fetch text content
    const content = await prisma.sourceDocumentContent.findUnique({
      where: { sourceDocumentId, workspaceId },


      include: {
        sourceDocument: {
          select: { workspaceId: true }
        }
      }
    });

    if (!content) {
      throw new Error(`No extracted content found for document ${sourceDocumentId}`);
    }

    const fullText = content.fullText;


    // 2. Split into raw paragraphs
    const rawParagraphs = fullText.split(/\n\s*\n|\r\n\s*\r\n/);

    const chunkData: Array<{
      content: string;
      heading: string | null;
      chunkIndex: number;
    }> = [];

    let currentHeading: string | null = null;
    let chunkCounter = 0;

    for (const raw of rawParagraphs) {
      const text = raw.trim();
      if (!text || text.length < 10) continue;
      if (/^[=_\-*#\s]{3,}$/.test(text)) continue;

      const isHeading = 
        text.length < 120 && 
        !text.endsWith(".") && 
        !text.endsWith(",") && 
        (/^[0-9]+(\.[0-9]+)*\s+[A-Z]/.test(text) || /^(Section|Chapter|Article|Policy|Part)\s/i.test(text) || (text === text.toUpperCase() && text.length > 5));

      if (isHeading) {
        currentHeading = text;
      }

      chunkData.push({
        content: text,
        heading: currentHeading,
        chunkIndex: chunkCounter++,
      });
    }

    // 3. GENERATE EMBEDDINGS (D5-AI-01)
    logger.info("chunking:generating-embeddings", { sourceDocumentId, count: chunkData.length });
    const textsToEmbed = chunkData.map(c => `${c.heading ? c.heading + ": " : ""}${c.content}`);
    const embeddings = await EmbeddingService.getEmbeddings(textsToEmbed);

    // 4. Persist Chunks (Transaction for atomicity)
    const createdChunks = await prisma.$transaction(async (tx) => {
      // Clean up existing chunks for idempotency within the same transaction
      await tx.sourceDocumentChunk.deleteMany({
        where: { workspaceId, sourceDocumentId }
      });

      const chunks: SourceDocumentChunk[] = [];
      for (const [i, data] of chunkData.entries()) {
        const chunk = await tx.sourceDocumentChunk.create({
          data: {
            workspaceId,
            sourceDocumentId,
            chunkIndex: data.chunkIndex,
            content: data.content,
            heading: data.heading,
            embedding: embeddings[i],
          }
        });
        chunks.push(chunk);
      }
      return chunks;
    });

    logger.info("chunking:completed", { sourceDocumentId, chunkCount: createdChunks.length });
    return createdChunks;
  }
};
