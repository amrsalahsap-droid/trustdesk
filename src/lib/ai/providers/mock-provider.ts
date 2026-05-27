import { IAiProvider } from "../provider-interface";
import { AiTask } from "../ai-task";
import { AiResponse } from "../ai-response";
import { logger } from "@/lib/logging/logger";

/**
 * D15-EN-03: Development-only Mock Provider.
 * This provider is isolated and explicitly prefixes all output with [DEVELOPMENT MOCK].
 * It is only intended for plumbing tests and local UI development.
 */
export class MockProvider implements IAiProvider {
  readonly name = 'mock';

  async generateText(prompt: string, task: AiTask): Promise<AiResponse<string>> {
    this.ensureSafeEnvironment();

    const mockContent = `[DEVELOPMENT MOCK] This is a simulated response for query: "${task.context.rowNumber ? 'Row ' + task.context.rowNumber : 'General Query'}". Local evidence reranking successfully passed, but LLM synthesis was redirected to this quarantine engine.`;

    logger.debug("ai:provider:mock:generate", { taskId: task.id, correlationId: task.correlationId });

    return {
      data: mockContent,
      raw: { mock: true },
      usage: {
        promptTokens: prompt.length / 4,
        completionTokens: mockContent.length / 4,
        totalTokens: (prompt.length + mockContent.length) / 4
      },
      model: 'mock-engine-v1',
      provider: this.name,
      cached: false,
      timingMs: 50,
      inputChars: prompt.length,
      outputChars: mockContent.length,
      correlationId: task.correlationId
    };
  }

  async generateObject<T>(prompt: string, task: AiTask): Promise<AiResponse<T>> {
    this.ensureSafeEnvironment();

    let mockData: any = {};

    if (task.id === 'topic_discovery' || task.id === 'gap_discovery') {
      mockData = {
        name: "Mock Security Topic",
        description: "Simulated description from the dev-only mock engine.",
        reason: "Detected by semantic clustering in the offline mock pipeline."
      };
    } else {
        mockData = {
            answer: `[DEVELOPMENT MOCK] Simulated answer extracted from provided context.`,
            concreteFacts: ["Mock Fact 1", "Mock Fact 2"]
        };
    }

    const mockJson = JSON.stringify(mockData);

    return {
      data: mockData as T,
      raw: { mock: true },
      usage: {
        promptTokens: prompt.length / 4,
        completionTokens: mockJson.length / 4,
        totalTokens: (prompt.length + mockJson.length) / 4
      },
      model: 'mock-engine-v1',
      provider: this.name,
      cached: false,
      timingMs: 80,
      inputChars: prompt.length,
      outputChars: mockJson.length,
      correlationId: task.correlationId
    };
  }

  private ensureSafeEnvironment() {
    if (process.env.NODE_ENV === 'production') {
      throw new Error("CRITICAL SECURITY VIOLATION: Mock AI Provider invoked in PRODUCTION environment.");
    }
  }
}
