import { IAiProvider } from "../provider-interface";
import { AiTask } from "../ai-task";
import { AiResponse, AiError } from "../ai-response";
import { AI_CONFIG } from "../ai-config";
import { logger } from "@/lib/logging/logger";
import { AiHttpClient } from "../ai-http-client";

/**
 * D10-EN-02: Groq implementation for high-speed AI inference.
 * Uses OpenAI-compatible endpoint: https://api.groq.com/openai/v1
 */
export class GroqProvider implements IAiProvider {
  readonly name = 'groq';

  constructor(private readonly apiKey: string) {}

  async generateText(prompt: string, task: AiTask): Promise<AiResponse<string>> {
    const model = AI_CONFIG.TASK_MODELS[task.id] || AI_CONFIG.TASK_MODELS['answer_synthesis'];
    const correlationId = task.correlationId || `ai-gen-${Date.now()}`;

    logger.info("ai:provider:groq:request", { 
      model, 
      taskId: task.id, 
      correlationId 
    });

    try {
      const data = await AiHttpClient.post<any>('https://api.groq.com/openai/v1/chat/completions', {
        'Authorization': `Bearer ${this.apiKey}`,
      }, {
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: task.options?.temperature ?? 0.2,
        max_tokens: task.options?.maxTokens,
      });

      const content = data.choices[0]?.message?.content?.trim() || "";

      logger.info("ai:provider:usage", { 
        model: data.model || model,
        taskId: task.id,
        correlationId,
        inputChars: prompt.length,
        outputChars: content.length,
        usage: {
          prompt: data.usage?.prompt_tokens,
          completion: data.usage?.completion_tokens,
          total: data.usage?.total_tokens,
        }
      });

      return {
        data: content,
        raw: data,
        usage: {
          promptTokens: data.usage?.prompt_tokens,
          completionTokens: data.usage?.completion_tokens,
          totalTokens: data.usage?.total_tokens,
        },
        model: data.model || model,
        provider: this.name,
        inputChars: prompt.length,
        outputChars: content.length,
        correlationId,
      };
    } catch (err) {
      logger.error("ai:provider:groq:failed", { 
        error: String(err), 
        model, 
        correlationId 
      });
      throw err;
    }
  }

  async generateObject<T>(prompt: string, task: AiTask, schema?: any): Promise<AiResponse<T>> {
    const model = AI_CONFIG.TASK_MODELS[task.id] || AI_CONFIG.TASK_MODELS['answer_synthesis'];
    const correlationId = task.correlationId || `ai-gen-obj-${Date.now()}`;

    logger.info("ai:provider:groq:object-request", { 
      model, 
      taskId: task.id, 
      correlationId 
    });

    try {
      const data = await AiHttpClient.post<any>('https://api.groq.com/openai/v1/chat/completions', {
        'Authorization': `Bearer ${this.apiKey}`,
      }, {
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: task.options?.temperature ?? 0.1,
        response_format: { type: 'json_object' }
      });

      const rawContent = data.choices[0]?.message?.content || "{}";
      
      // Safety: Sometimes LLMs include markdown blocks in JSON mode
      const jsonStart = rawContent.indexOf('{');
      const jsonEnd = rawContent.lastIndexOf('}') + 1;
      const jsonString = rawContent.substring(jsonStart, jsonEnd);
      
      const parsed = JSON.parse(jsonString) as T;

      logger.info("ai:provider:usage", { 
        model: data.model || model,
        taskId: task.id,
        correlationId,
        inputChars: prompt.length,
        outputChars: jsonString.length,
        usage: {
          prompt: data.usage?.prompt_tokens,
          completion: data.usage?.completion_tokens,
          total: data.usage?.total_tokens,
        }
      });

      return {
        data: parsed,
        raw: data,
        usage: {
          promptTokens: data.usage?.prompt_tokens,
          completionTokens: data.usage?.completion_tokens,
          totalTokens: data.usage?.total_tokens,
        },
        model: data.model || model,
        provider: this.name,
        inputChars: prompt.length,
        outputChars: jsonString.length,
        correlationId,
      };
    } catch (err) {
      logger.error("ai:provider:groq:object-failed", { 
        error: String(err), 
        model, 
        correlationId 
      });
      throw err;
    }
  }
}
