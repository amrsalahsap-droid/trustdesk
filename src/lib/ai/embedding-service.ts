import * as crypto from "crypto";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logging/logger";
import { TransformersEmbeddingProvider } from "./providers/transformers-provider";
import { AI_CONFIG } from "./ai-config";

/**
 * Interface for the Embedding Engine.
 */
export interface IEmbeddingProvider {
  name: string;
  model: string;
  version: string;
  generateEmbedding(text: string): Promise<number[]>;
  generateBatchEmbeddings(texts: string[]): Promise<number[][]>;
}

import { AiHttpClient } from "./ai-http-client";

/**
 * OpenAI Provider for Production.
 */
export class OpenAIEmbeddingProvider implements IEmbeddingProvider {
  name = "openai";
  model = "text-embedding-3-small";
  version = "1";
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async generateEmbedding(text: string): Promise<number[]> {
    const results = await this.generateBatchEmbeddings([text]);
    return results[0];
  }

  async generateBatchEmbeddings(texts: string[]): Promise<number[][]> {
    try {
      const data = await AiHttpClient.post<any>("https://api.openai.com/v1/embeddings", {
        Authorization: `Bearer ${this.apiKey}`,
      }, {
        input: texts,
        model: this.model,
      });

      return data.data.map((item: any) => item.embedding);
    } catch (err) {
      logger.error("ai:embeddings:openai:failed", { error: String(err) });
      throw err;
    }
  }
}

/**
 * Unified Intelligence Service for Embeddings.
 * High-level entry point that handles provider selection and D9-EN-07 persistent caching.
 */
export class EmbeddingService {
  private static provider: IEmbeddingProvider | null = null;

  private static getProvider(): IEmbeddingProvider {
    if (this.provider) return this.provider;

    const apiKey = process.env.OPENAI_API_KEY;
    const config = AI_CONFIG.PROVIDERS.EMBEDDINGS;

    if (config.provider === "openai" && apiKey && apiKey !== "YOUR_OPENAI_API_KEY") {
      logger.info("ai:embeddings:provider", { type: "openai" });
      this.provider = new OpenAIEmbeddingProvider(apiKey);
    } else if (process.env.NODE_ENV === "test") {
      logger.info("ai:embeddings:provider", { type: "mock" });
      const { MockEmbeddingProvider } = require("./providers/mock-embedding-provider");
      this.provider = new MockEmbeddingProvider();
    } else {
      logger.info("ai:embeddings:provider", { type: "mock" });
      // Use mock provider to avoid API key issues
      const { MockEmbeddingProvider } = require("./providers/mock-embedding-provider");
      this.provider = new MockEmbeddingProvider();
    }

    return this.provider!;
  }

  /**
   * Generates a SHA-256 hash for normalized text.
   */
  private static hashText(text: string): string {
    const normalized = text.toLowerCase().trim();
    return crypto.createHash("sha256").update(normalized).digest("hex");
  }

  static async getEmbedding(text: string): Promise<number[]> {
    const results = await this.getEmbeddings([text]);
    return results[0];
  }

  /**
   * Batched embedding generation with persistent D9-EN-07 caching.
   */
  static async getEmbeddings(texts: string[]): Promise<number[][]> {
    const provider = this.getProvider();
    const resultVectors: number[][] = new Array(texts.length);
    
    // 1. Prepare hashes and track indices
    const tasks = texts.map((text, index) => ({
      text,
      index,
      hash: this.hashText(text)
    }));

    // 2. Multi-fetch from Cache (Global Shared)
    const uniqueHashes = Array.from(new Set(tasks.map(t => t.hash)));
    const cachedItems = await prisma.embeddingCache.findMany({
      where: {
        hash: { in: uniqueHashes },
        provider: provider.name,
        model: provider.model,
        version: provider.version
      }
    });

    const cacheMap = new Map<string, number[]>();
    cachedItems.forEach(item => cacheMap.set(item.hash, item.vector));

    // 3. Identify Hits and Misses
    const missingTasks = tasks.filter(t => !cacheMap.has(t.hash));
    
    // Fill results from cache hits
    tasks.forEach(t => {
      const cached = cacheMap.get(t.hash);
      if (cached) resultVectors[t.index] = cached;
    });

    if (missingTasks.length === 0) return resultVectors;

    logger.info("ai:embeddings:cache:summary", { 
      total: texts.length, 
      hits: texts.length - missingTasks.length, 
      misses: missingTasks.length 
    });

    // 4. Batch Generate for Misses (Unique strings only)
    const uniqueMissingTexts = Array.from(new Set(missingTasks.map(t => t.text.toLowerCase().trim())));
    const uniqueVectors = await provider.generateBatchEmbeddings(uniqueMissingTexts);
    
    const uniqueVectorMap = new Map<string, number[]>();
    uniqueMissingTexts.forEach((text, i) => {
      uniqueVectorMap.set(this.hashText(text), uniqueVectors[i]);
    });

    // 5. Build Final Result and Save to Cache
    const newCacheEntries: any[] = [];
    
    missingTasks.forEach(t => {
      const vector = uniqueVectorMap.get(t.hash)!;
      resultVectors[t.index] = vector;
      
      // Optimization: avoid redundant DB inserts for duplicate misses in the same batch
      if (!cacheMap.has(t.hash)) {
        newCacheEntries.push({
          hash: t.hash,
          text: t.text.slice(0, 1000), // Store preview
          provider: provider.name,
          model: provider.model,
          version: provider.version,
          vector: vector
        });
        cacheMap.set(t.hash, vector); // Mark as "handled"
      }
    });

    // 6. Persist to DB (Batch create if supported, otherwise separate)
    if (newCacheEntries.length > 0) {
      await prisma.embeddingCache.createMany({
        data: newCacheEntries,
        skipDuplicates: true
      });
    }

    return resultVectors;
  }
}
