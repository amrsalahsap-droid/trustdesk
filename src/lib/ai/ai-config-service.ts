import { AiTaskType } from "./ai-task";
import { logger } from "@/lib/logging/logger";

/**
 * D15-EN-02: Centralized AI Configuration Service.
 * Single source of truth for environment variables and feature gates.
 */
export class AiConfigService {
  private static instance: AiConfigService;

  readonly provider: string;
  readonly openRouterKey: string | null;
  readonly groqKey: string | null;
  readonly isProduction: boolean;
  readonly proxyUrl: string | null;
  readonly caBundlePath: string | null;
  readonly allowInsecureTls: boolean;
  readonly taskModels: Record<AiTaskType, string>;

  private constructor() {
    this.provider = process.env.AI_PROVIDER || 'openrouter';
    this.openRouterKey = process.env.OPENROUTER_API_KEY || null;
    this.groqKey = process.env.GROQ_API_KEY || null;
    
    // Feature Flags - Default to false if config is missing
    this.isProduction = process.env.NODE_ENV === 'production';
    this.isMockEnabled = process.env.USE_MOCK_AI === 'true' && !this.isProduction;

    const genEnabled = process.env.AI_GENERATION_ENABLED === 'true';
    const discEnabled = process.env.AI_DISCOVERY_ENABLED === 'true';

    const hasKey = this.provider === 'groq' ? !!this.groqKey : !!this.openRouterKey;

    this.isGenerationEnabled = !!(genEnabled && hasKey);
    this.isDiscoveryEnabled = !!(discEnabled && hasKey);

    this.proxyUrl = process.env.AI_PROXY_URL || null;
    this.caBundlePath = process.env.AI_CA_BUNDLE_PATH || null;
    this.allowInsecureTls = process.env.AI_INSECURE_TLS === 'true' && !this.isProduction;

    // Task Model Routing
    if (this.provider === 'groq') {
      this.taskModels = {
        answer_synthesis: process.env.AI_MODEL_SYNTHESIS || 'llama-3.3-70b-versatile',
        answer_fitness: process.env.AI_MODEL_SYNTHESIS || 'llama-3.3-70b-versatile',
        contradiction_semantic_judge:
          process.env.AI_MODEL_CONTRADICTION_JUDGE || 'llama-3.3-70b-versatile',
        topic_discovery: process.env.AI_MODEL_DISCOVERY || 'llama-3.1-8b-instant',
        gap_discovery: process.env.AI_MODEL_GAP_DISCOVERY || 'llama-3.1-8b-instant',
        ambiguity_resolution: process.env.AI_MODEL_AMBIGUITY || 'llama-3.1-8b-instant',
        onboarding_inference: process.env.AI_MODEL_INFERENCE || 'llama-3.3-70b-versatile',
        onboarding_deep_inference: process.env.AI_MODEL_INFERENCE || 'llama-3.3-70b-versatile',
        document_briefing: process.env.AI_MODEL_INFERENCE || 'llama-3.3-70b-versatile',
        template_generation: process.env.AI_MODEL_SYNTHESIS || 'llama-3.3-70b-versatile',
      };
    } else {
      this.taskModels = {
        answer_synthesis: process.env.AI_MODEL_SYNTHESIS || 'openai/gpt-4o',
        answer_fitness: process.env.AI_MODEL_SYNTHESIS || 'openai/gpt-4o',
        contradiction_semantic_judge:
          process.env.AI_MODEL_CONTRADICTION_JUDGE || 'openai/gpt-4o-mini',
        topic_discovery: process.env.AI_MODEL_DISCOVERY || 'anthropic/claude-3-haiku',
        gap_discovery: process.env.AI_MODEL_GAP_DISCOVERY || 'anthropic/claude-3-haiku',
        ambiguity_resolution: process.env.AI_MODEL_AMBIGUITY || 'anthropic/claude-3-haiku',
        onboarding_inference: process.env.AI_MODEL_INFERENCE || 'openai/gpt-4o',
        onboarding_deep_inference: process.env.AI_MODEL_INFERENCE || 'openai/gpt-4o',
        document_briefing: process.env.AI_MODEL_INFERENCE || 'openai/gpt-4o',
        template_generation: process.env.AI_MODEL_SYNTHESIS || 'openai/gpt-4o',
      };
    }

    this.validate();
  }

  static getInstance(): AiConfigService {
    if (!AiConfigService.instance) {
      AiConfigService.instance = new AiConfigService();
    }
    return AiConfigService.instance;
  }

  /**
   * Validates the configuration and logs warnings/errors.
   */
  private validate() {
    const hasKey = this.provider === 'groq' ? !!this.groqKey : !!this.openRouterKey;

    if (this.isGenerationEnabled) {
      logger.info("ai:config:valid", { 
        provider: this.provider,
        generation: "ENABLED",
        discovery: this.isDiscoveryEnabled ? "ENABLED" : "DISABLED"
      });
    } else {
      logger.warn("ai:config:incomplete", { 
        reason: !hasKey ? `Missing API Key for provider: ${this.provider}` : "AI_GENERATION_ENABLED=false",
        status: this.isMockEnabled ? "DEVELOPMENT-MOCK (Dev only)" : "FAIL-CLOSED (All synthesis disabled)"
      });
      
      if (this.isMockEnabled) {
          logger.warn("ai:config:mock-active", { 
              priority: "SEVERE", 
              message: "TrustDesk is running in MOCK mode. All synthesis is simulated and should NOT be trusted for production security decisions." 
          });
      }
    }
  }

  /**
   * Helper to check if a specific feature is usable.
   */
  canRun(feature: 'generation' | 'discovery'): boolean {
    if (feature === 'generation') return this.isGenerationEnabled;
    if (feature === 'discovery') return this.isDiscoveryEnabled;
    return false;
  }
}

// Export a singleton instance
export const aiConfig = AiConfigService.getInstance();
