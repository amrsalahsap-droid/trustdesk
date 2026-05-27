import { IAiProvider } from "../provider-interface";
import { AiTask } from "../ai-task";
import { AiResponse, AiError } from "../ai-response";
import { AI_CONFIG } from "../ai-config";
import { logger } from "@/lib/logging/logger";
import { AiHttpClient } from "../ai-http-client";

/**
 * D10-EN-02: OpenRouter implementation for provider-agnostic AI.
 */
export class OpenRouterProvider implements IAiProvider {
  readonly name = 'openrouter';

  constructor(private readonly apiKey: string) {}

  async generateText(prompt: string, task: AiTask): Promise<AiResponse<string>> {
    const model = AI_CONFIG.TASK_MODELS[task.id] || AI_CONFIG.TASK_MODELS['answer_synthesis'];
    const correlationId = task.correlationId || `ai-gen-${Date.now()}`;

    logger.info("ai:provider:openrouter:request", { 
      model, 
      taskId: task.id, 
      correlationId,
      context: task.context
    });

    try {
      const data = await AiHttpClient.post<any>(AI_CONFIG.PROVIDERS.OPEN_ROUTER.baseUrl + '/chat/completions', {
        'Authorization': `Bearer ${this.apiKey}`,
        'HTTP-Referer': AI_CONFIG.PROVIDERS.OPEN_ROUTER.siteUrl,
        'X-Title': AI_CONFIG.PROVIDERS.OPEN_ROUTER.siteName,
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
        context: task.context,
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
      logger.error("ai:provider:openrouter:failed", { 
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

    logger.info("ai:provider:openrouter:object-request", { 
      model, 
      taskId: task.id, 
      correlationId,
      context: task.context
    });

    try {
      const body: any = {
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: task.options?.temperature ?? 0.1,
      };

      const supportsJsonMode = 
        model.includes('gpt-4') || 
        model.includes('gpt-3.5-turbo-0125') ||
        model.includes('claude-3') ||
        model.includes('gemini-pro-1.5');

      if (supportsJsonMode) {
        body.response_format = { type: 'json_object' };
      }

      const data = await AiHttpClient.post<any>(AI_CONFIG.PROVIDERS.OPEN_ROUTER.baseUrl + '/chat/completions', {
        'Authorization': `Bearer ${this.apiKey}`,
        'HTTP-Referer': AI_CONFIG.PROVIDERS.OPEN_ROUTER.siteUrl,
        'X-Title': AI_CONFIG.PROVIDERS.OPEN_ROUTER.siteName,
      }, body);

      const rawContent = data.choices[0]?.message?.content || "{}";
      
      const jsonStart = rawContent.indexOf('{');
      const jsonEnd = rawContent.lastIndexOf('}') + 1;
      const jsonString = rawContent.substring(jsonStart, jsonEnd);
      
      const parsed = JSON.parse(jsonString) as T;

      logger.info("ai:provider:usage", { 
        model: data.model || model,
        taskId: task.id,
        correlationId,
        context: task.context,
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
      logger.error("ai:provider:openrouter:object-failed", { 
        error: String(err), 
        model, 
        correlationId 
      });
      throw err;
    }
  }
}
