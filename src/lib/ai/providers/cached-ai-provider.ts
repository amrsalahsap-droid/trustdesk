import { IAiProvider } from "../provider-interface";
import { AiTask } from "../ai-task";
import { AiResponse } from "../ai-response";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logging/logger";
import { createHash } from "crypto";

/**
 * D15-EN-01: Persistent Generation Cache.
 * Wraps an IAiProvider to deduplicate identical requests using a database cache.
 * Enhanced in Turn 33 with observability metrics.
 */
export class CachedAiProvider implements IAiProvider {
  constructor(private delegate: IAiProvider) {}

  get name(): string {
    return `${this.delegate.name} (cached)`;
  }

  private generateHash(prompt: string, task: AiTask): string {
    const data = JSON.stringify({
      prompt,
      taskId: task.id,
      options: task.options
    });
    return createHash("sha256").update(data).digest("hex");
  }

  async generateText(prompt: string, task: AiTask): Promise<AiResponse<string>> {
    const start = Date.now();
    const hash = this.generateHash(prompt, task);

    try {
      const hit = await prisma.aiGenerationCache.findUnique({
        where: { hash }
      });

      if (hit && hit.responseText) {
        const duration = Date.now() - start;
        logger.info("ai:cache:hit", { 
            taskId: task.id, 
            hash, 
            context: task.context, 
            timingMs: duration 
        });
        return {
          data: hit.responseText,
          usage: hit.usage as any || undefined,
          cached: true,
          timingMs: duration,
          inputChars: prompt.length,
          outputChars: hit.responseText.length,
          model: "cache",
          provider: "local",
          correlationId: task.correlationId
        };
      }
    } catch (err) {
      logger.warn("ai:cache:error", { taskId: task.id, error: String(err) });
    }

    const response = await this.delegate.generateText(prompt, task);

    try {
      await prisma.aiGenerationCache.upsert({
        where: { hash },
        create: {
          hash,
          taskType: task.id,
          responseText: response.data,
          usage: response.usage as any
        },
        update: {} 
      });
    } catch (err) {
      logger.error("ai:cache:save:failed", { taskId: task.id, error: String(err) });
    }

    return response;
  }

  async generateObject<T>(prompt: string, task: AiTask): Promise<AiResponse<T>> {
    const start = Date.now();
    const hash = this.generateHash(prompt, task);

    try {
      const hit = await prisma.aiGenerationCache.findUnique({
        where: { hash }
      });

      if (hit && hit.responseJson) {
        const duration = Date.now() - start;
        logger.info("ai:cache:hit", { 
            taskId: task.id, 
            hash, 
            context: task.context, 
            timingMs: duration 
        });
        return {
          data: hit.responseJson as T,
          usage: hit.usage as any || undefined,
          cached: true,
          timingMs: duration,
          inputChars: prompt.length,
          outputChars: JSON.stringify(hit.responseJson).length,
          model: "cache",
          provider: "local",
          correlationId: task.correlationId
        };
      }
    } catch (err) {
      logger.warn("ai:cache:error", { taskId: task.id, error: String(err) });
    }

    const response = await this.delegate.generateObject<T>(prompt, task);

    try {
      await prisma.aiGenerationCache.upsert({
        where: { hash },
        create: {
          hash,
          taskType: task.id,
          responseJson: response.data as any,
          usage: response.usage as any
        },
        update: {}
      });
    } catch (err) {
      logger.error("ai:cache:save:failed", { taskId: task.id, error: String(err) });
    }

    return response;
  }
}
