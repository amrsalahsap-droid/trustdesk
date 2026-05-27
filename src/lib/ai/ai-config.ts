import { aiConfig } from "./ai-config-service";

/**
 * D10-EN-02: Shared AI Configuration Surface.
 * Now a thin wrapper around the validated AiConfigService.
 */
export const AI_CONFIG = {
  PROVIDERS: {
    OPEN_ROUTER: {
      name: 'openrouter',
      baseUrl: 'https://openrouter.ai/api/v1',
      siteUrl: 'https://trustdesk.security',
      siteName: 'TrustDesk',
    },
    GROQ: {
      name: 'groq',
      baseUrl: 'https://api.groq.com/openai/v1',
    },
    EMBEDDINGS: {
      // TEMPORARY: Default to mock provider to avoid memory exhaustion from transformers.js ONNX model loading
      // To use OpenAI embeddings: set USE_OPENAI_EMBEDDINGS=true and OPENAI_API_KEY=your_key
      // To use local transformers (memory-heavy): set USE_TRANSFORMERS_EMBEDDINGS=true
      provider: (process.env.USE_OPENAI_EMBEDDINGS === 'true' ? 'openai' :
                 process.env.USE_TRANSFORMERS_EMBEDDINGS === 'true' ? 'transformers' : 'mock') as 'openai' | 'transformers' | 'mock',
      model: process.env.USE_OPENAI_EMBEDDINGS === 'true' ? 'text-embedding-3-small' : 'mock-384',
    }
  },

  /**
   * Task-to-Model Mapping retrieved from validated config.
   */
  TASK_MODELS: aiConfig.taskModels,

  /**
   * Fail-Closed Policy: Always enabled in TrustDesk.
   */
  FAIL_CLOSED: true,

  /**
   * Analysis resilience configuration.
   */
  analysis: {
    strictJsonRetry: true,
    schemaRepair: true,
    deterministicFallback: true,
  },
};
