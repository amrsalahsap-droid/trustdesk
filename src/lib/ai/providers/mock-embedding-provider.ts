import { IEmbeddingProvider } from '../embedding-service';

/**
 * D15-EN-03: Mock Embedding Provider for Local Testing.
 * Generates deterministic vectors based on string hashes.
 * Quarantined for development/test environments only.
 */
export class MockEmbeddingProvider implements IEmbeddingProvider {
  name = "mock";
  model = "deterministic-hash";
  version = "1";

  async generateEmbedding(text: string): Promise<number[]> {
    const vector = new Array(384).fill(0);
    const normalized = text.toLowerCase().trim();
    let hash = 0;
    for (let i = 0; i < normalized.length; i++) {
        hash = ((hash << 5) - hash) + normalized.charCodeAt(i);
        hash |= 0; 
    }
    for (let i = 0; i < 384; i++) {
      const val = Math.sin(hash + i) * 10000;
      vector[i] = (val - Math.floor(val)) * 2 - 1;
    }
    return vector;
  }

  async generateBatchEmbeddings(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map(t => this.generateEmbedding(t)));
  }
}
