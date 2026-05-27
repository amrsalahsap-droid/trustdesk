import { IAiProvider } from "../provider-interface";
import { AiTask } from "../ai-task";
import { AiResponse, AiError } from "../ai-response";

/**
 * D10-EN-02: Safety provider that throws if no real provider is available.
 * Prevents "garbage placeholders" from polluting the knowledge graph.
 */
export class FailClosedProvider implements IAiProvider {
  readonly name = 'fail-closed';

  async generateText(_prompt: string, task: AiTask): Promise<AiResponse<string>> {
    throw new AiError(
      `AI requested for task ${task.id} but no provider is configured.`,
      'AI_NOT_CONFIGURED',
      503
    );
  }

  async generateObject<T>(_prompt: string, task: AiTask): Promise<AiResponse<T>> {
    throw new AiError(
      `AI requested for task ${task.id} but no provider is configured.`,
      'AI_NOT_CONFIGURED',
      503
    );
  }
}
