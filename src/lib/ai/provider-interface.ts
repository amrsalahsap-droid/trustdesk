import { AiTask } from "./ai-task";
import { AiResponse } from "./ai-response";

/**
 * Standard interface for all TrustDesk AI providers (OpenRouter, OpenAI, Mocks).
 */
export interface IAiProvider {
  readonly name: string;

  /**
   * Generates a plain text response for the given task.
   */
  generateText(
    prompt: string, 
    task: AiTask
  ): Promise<AiResponse<string>>;

  /**
   * Generates a structured object response using JSON Mode / Schema.
   */
  generateObject<T>(
    prompt: string, 
    task: AiTask, 
    schema?: any
  ): Promise<AiResponse<T>>;
}
