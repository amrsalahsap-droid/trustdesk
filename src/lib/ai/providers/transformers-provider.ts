import { pipeline, env } from '@huggingface/transformers';
import { IEmbeddingProvider } from '../embedding-service';
import { logger } from '@/lib/logging/logger';

// Disable remote models if needed, or configure cache
// For now, we'll let it use the default cache directory
env.allowRemoteModels = true;
env.allowLocalModels = true;

/**
 * Local Embedding Provider using Transformers.js.
 * Uses the all-MiniLM-L6-v2 model (384 dimensions).
 */
export class TransformersEmbeddingProvider implements IEmbeddingProvider {
  private extractor: any = null;
  private readonly modelName = 'Xenova/all-MiniLM-L6-v2';

  /**
   * Initializes the pipeline if not already loaded.
   */
  private async getExtractor() {
    if (this.extractor) return this.extractor;

    try {
      logger.info('ai:embeddings:transformers:loading', { model: this.modelName });
      this.extractor = await pipeline('feature-extraction', this.modelName);
      return this.extractor;
    } catch (err) {
      logger.error('ai:embeddings:transformers:load-failed', { error: String(err) });
      throw err;
    }
  }

  async generateEmbedding(text: string): Promise<number[]> {
    const extractor = await this.getExtractor();
    
    // Generate features
    const output = await extractor(text, {
      pooling: 'mean',
      normalize: true,
    });

    // Extract the vector data
    // The output is a Tensor. We convert it to a regular JS array.
    return Array.from(output.data) as number[];
  }

  async generateBatchEmbeddings(texts: string[]): Promise<number[][]> {
    const extractor = await this.getExtractor();
    
    const results: number[][] = [];
    for (const text of texts) {
      const output = await extractor(text, {
        pooling: 'mean',
        normalize: true,
      });
      results.push(Array.from(output.data) as number[]);
    }
    
    return results;
  }
}
