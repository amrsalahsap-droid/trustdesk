import { IAiProvider } from "./provider-interface";
import { OpenRouterProvider } from "./providers/openrouter-provider";
import { GroqProvider } from "./providers/groq-provider";
import { FailClosedProvider } from "./providers/fail-closed-provider";
import { logger } from "@/lib/logging/logger";

/**
 * D10-EN-02: Centralized AI Factory.
 * Resolves the appropriate provider based on environment and task.
 */
export class AiFactory {
  private static instance: AiFactory;
  private provider: IAiProvider | null = null;

  private constructor() {}

  static getInstance(): AiFactory {
    if (!AiFactory.instance) {
      AiFactory.instance = new AiFactory();
    }
    return AiFactory.instance;
  }

  /**
   * Resolves the configured provider.
   * Fallback logic: OpenRouter (if enabled) -> FailClosed (Safety).
   */
  getProvider(): IAiProvider {
    if (this.provider) return this.provider;

    const { aiConfig } = require("./ai-config-service");
    
    // Priority 1: High Fidelity Providers
    if (aiConfig.isGenerationEnabled) {
      const { CachedAiProvider } = require("./providers/cached-ai-provider");
      
      if (aiConfig.provider === 'groq' && aiConfig.groqKey) {
        logger.info("ai:factory:provider:resolved", { type: 'groq' });
        const rawProvider = new GroqProvider(aiConfig.groqKey);
        this.provider = new CachedAiProvider(rawProvider);
      } else if (aiConfig.openRouterKey) {
        logger.info("ai:factory:provider:resolved", { type: 'openrouter' });
        const rawProvider = new OpenRouterProvider(aiConfig.openRouterKey);
        this.provider = new CachedAiProvider(rawProvider);
      }
    } 
    // Priority 2: Quarantined Mock (Development Only)
    else if (aiConfig.isMockEnabled) {
      logger.info("ai:factory:provider:resolved", { type: "MOCK-QUARANTINE" });
      const { MockProvider } = require("./providers/mock-provider");
      this.provider = new MockProvider();
    }
    // Priority 3: Fail-Closed (Safety)
    else {
      logger.warn("ai:factory:provider:fail-closed", { reason: "Config incomplete or generation disabled" });
      this.provider = new FailClosedProvider();
    }

    return this.provider;
  }
}
