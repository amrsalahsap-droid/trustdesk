/**
 * D10-EN-02: Standardized AI tasks for routing and model selection.
 */
export type AiTaskType =
  | 'answer_synthesis'
  | 'answer_fitness'
  | 'contradiction_semantic_judge'
  | 'topic_discovery'
  | 'gap_discovery'
  | 'ambiguity_resolution'
  | 'onboarding_inference'
  | 'onboarding_deep_inference'
  | 'document_briefing'
  | 'template_generation';

export interface AiContext {
  workspaceId: string;
  topicId?: string;
  sourceDocumentId?: string;
  questionnaireId?: string;
  /** Row id for contradiction / review assists. */
  questionnaireItemId?: string;
  rowNumber?: number;
  /** Populated by `answer_fitness` tasks so downstream cache hits key off the
   *  (answer, question) pair rather than just the prompt hash. */
  answerId?: string;
}

export interface AiTask {
  id: AiTaskType;
  context: AiContext;
  correlationId?: string;
  options?: Record<string, any>;
}
