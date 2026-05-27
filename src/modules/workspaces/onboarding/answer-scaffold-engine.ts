import { TrustTopicRecommendation, AnswerScaffoldArea } from "./vendor-intelligence-types";
import { TRUST_TOPIC_REGISTRY } from "./trust-topic-registry";
import { TopicResolutionEngine } from "./topic-resolution/topic-resolution-engine";

/**
 * Global Answer Scaffold Generator
 * 
 * Logic to transform inferred trust topics into actionable 
 * Answer Library placeholders with questions and evidence needs.
 */
export class AnswerScaffoldEngine {
  
  /**
   * Generate scaffolds from recommended topics
   */
  static generateScaffolds(topics: TrustTopicRecommendation[]): AnswerScaffoldArea[] {
    const scaffolds: AnswerScaffoldArea[] = [];

    for (const topic of topics) {
      const resolved = TopicResolutionEngine.resolve(topic.key);
      const targetKey = resolved.canonicalKey || topic.key;
      const definition = TRUST_TOPIC_REGISTRY.find(d => d.key === targetKey);
      if (!definition) continue;

      // Status logic: ready_for_review only if topic is auto_ready and has strong evidence
      const status = (topic.status === "auto_ready" && topic.confidence >= 0.8) 
        ? "ready_for_review" 
        : "needs_evidence";

      scaffolds.push({
        topicKey: topic.key,
        title: topic.title,
        placeholderQuestions: definition.placeholderQuestions || [],
        evidenceNeeded: definition.evidenceNeeded || [],
        status: status,
        source: "onboarding",
        generatedFromSignals: topic.triggeredBy || [],
        confidence: topic.confidence,
      });
    }

    return scaffolds;
  }
}
