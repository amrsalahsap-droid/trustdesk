import { SemanticSearchService } from "../search/semantic-search-service";
import { logger } from "@/lib/logging/logger";
import { AiFactory } from "@/lib/ai/ai-factory";
import { AiError } from "@/lib/ai/ai-response";
import { EvidenceReranker } from "../search/evidence-reranker";
import { ScoringService } from "@/lib/ai/scoring-service";
import { getToneModifier } from "@/lib/ai/tones";

export interface SubControlCandidate {
  answerId: string;
  subControlKey: string | null;
  subControlLabel: string | null;
  answer: string;
  cosine: number;
}

export interface ComposeFromSubControlsInput {
  question: string;
  topicName: string | null;
  subControls: SubControlCandidate[];
  workspaceId: string;
  tone?: string;
  profile?: any;
}

export interface GeneratedAnswer {
  answer: string;
  confidenceScore: number;
  sources: { docName: string; chunkId: string }[];
  concreteFacts?: string[]; 
  isLowQuality?: boolean;    
  rejectionReason?: string;
  metrics?: any; // D10-EN-02: Observability
}

/**
 * AnswerGenerationService leverages RAG (Retrieval Augmented Generation)
 * to draft professional security responses based on document evidence.
 */
export const AnswerGenerationService = {
  /**
   * Generates a structural security response for a given query.
   */
  async generate(query: string, workspaceId: string, tone?: string): Promise<GeneratedAnswer> {
    const correlationId = `gen-ans-${Date.now()}`;
    const startTime = performance.now();
    try {
      logger.info("ai:generation:start", { query, workspaceId, correlationId });

      // 1. Retrieve Context from Semantic Search
      const searchResults = await SemanticSearchService.search(query, workspaceId, 8); 
      
      if (searchResults.length === 0) {
        return {
          answer: "I could not find any relevant documentation in the workspace.",
          confidenceScore: 0,
          sources: []
        };
      }

      // 2. Local Reranking (App-Owned)
      const reranked = EvidenceReranker.rerank(searchResults.map(m => ({
        id: m.chunkId,
        content: m.content,
        docName: m.docName,
        score: m.relevanceScore,
        heading: m.heading
      })), query);

      if (reranked.length === 0) {
        return {
          answer: "No high-quality evidence found for this query.",
          confidenceScore: 0,
          sources: [],
          isLowQuality: true,
          rejectionReason: "Local reranker pruned candidates as insufficient/repetitive."
        };
      }

      const context = reranked.map(r => `SOURCE: [${r.docName}]\nCONTENT: ${r.content}`).join("\n\n---\n\n");
      
      const provider = AiFactory.getInstance().getProvider();
      const response = await provider.generateObject<{
        answer: string;
        concreteFacts: string[];
      }>(`
        You are a professional Security Compliance Officer. 
        ${getToneModifier(tone)}
        
        QUESTION: ${query}
        EVIDENCE:
        ${context}
   
        INSTRUCTIONS:
        - Base response STRICTLY on EVIDENCE.
        - BAN ALL FILLER. No "Regarding...", "We take security seriously...", or "This approach aligns...".
        - START IMMEDIATELY with the actionable policy or control.
        - Be concise and operational.
        - Extract 2-3 specific, verifiable concrete facts from the evidence used.

        Return strict JSON: {"answer":"<response>","concreteFacts":["<fact>",...]}
      `, { 
        id: 'answer_synthesis', 
        context: { workspaceId },
        correlationId
      });

      const { answer, concreteFacts } = response.data;

      // 4. Scoring & Gating (App-Owned)
      const scorings = ScoringService.evaluateQuality({
        answerText: answer,
        concreteFacts: concreteFacts || [], 
        sourceRelevanceScore: reranked[0].score,
        topicName: query
      });

      const totalDuration = performance.now() - startTime;
      logger.info("ai:synthesis:trace", {
        workspaceId,
        correlationId,
        task: 'answer_synthesis',
        evidenceCount: reranked.length,
        isQualityPassed: scorings.isQualityPassed,
        confidenceScore: scorings.confidenceScore,
        rejectionReason: scorings.rejectionRationale,
        cached: response.cached,
        durationMs: totalDuration.toFixed(2),
        tokens: response.usage?.totalTokens
      });

      return {
        answer: answer,
        confidenceScore: scorings.confidenceScore,
        sources: reranked.map(r => ({ docName: r.docName, chunkId: r.id })),
        isLowQuality: !scorings.isQualityPassed,
        rejectionReason: scorings.rejectionRationale,
        metrics: scorings.metrics,
        concreteFacts: concreteFacts || []
      };
    } catch (err) {
      if (err instanceof AiError && err.code === 'AI_NOT_CONFIGURED') throw err;
      logger.error("ai:generation:failed", { error: String(err), query });
      throw err;
    }
  },

  /**
   * Compose a question-specific response by folding the top approved
   * sub-control entries under a resolved topic into a single LLM prompt.
   *
   * Called from `matchRows` when no single sub-control cosines cleanly
   * above the clear-winner threshold but several relevant rows exist. The
   * LLM is instructed to draw ONLY from the provided excerpts and to
   * self-gate via `isLowQuality` when the material does not actually cover
   * the question — the downstream answer-fitness verifier then has a
   * second chance to catch mismatches.
   */
  async composeFromSubControls(input: ComposeFromSubControlsInput): Promise<GeneratedAnswer> {
    const correlationId = `compose-${Date.now()}`;
    const startTime = performance.now();
    const { question, topicName, subControls, workspaceId, tone, profile } = input;

    if (subControls.length === 0) {
      return {
        answer: "",
        confidenceScore: 0,
        sources: [],
        isLowQuality: true,
        rejectionReason: "no_subcontrol_candidates",
      };
    }

    const context = subControls
      .map(
        (s) =>
          `SOURCE: [${s.subControlLabel ?? s.subControlKey ?? "subcontrol"} | cos=${s.cosine.toFixed(2)}]\nCONTENT: ${s.answer}`,
      )
      .join("\n\n---\n\n");
    
    let profileContext = "";
    if (profile) {
      const industry = Array.isArray(profile.industry?.value) ? profile.industry.value.join(", ") : profile.industry?.value || "N/A";
      const domain = profile.businessDomain?.value || "N/A";
      const products = Array.isArray(profile.productLines?.value) ? profile.productLines.value.join(", ") : "N/A";
      const caps = Array.isArray(profile.structuredCapabilities?.value) 
        ? profile.structuredCapabilities.value.map((c: any) => c.name).join(", ") 
        : "N/A";
      
      profileContext = `
COMPANY_PROFILE:
- Industry: ${industry}
- Business Domain: ${domain}
- Product Lines: ${products}
- Capabilities: ${caps}
      `;
    }

    const prompt = [
      "You are composing a question-specific security compliance response.",
      profileContext,
      getToneModifier(tone),
      "Pull concrete controls from the provided SUB-CONTROL EXCERPTS; do not fabricate.",
      "If the excerpts do not cover the question, set isLowQuality=true and leave answer empty.",
      "",
      `QUESTION: ${question.trim()}`,
      topicName ? `RESOLVED_TOPIC: ${topicName}` : "",
      "",
      "SUB-CONTROL EXCERPTS:",
      context,
      "",
      'Return strict JSON: {"answer":"<response>","concreteFacts":["<fact>",...],"isLowQuality":false,"rejectionReason":null}',
    ]
      .filter(Boolean)
      .join("\n");

    try {
      const provider = AiFactory.getInstance().getProvider();
      const response = await provider.generateObject<{
        answer: string;
        concreteFacts: string[];
        isLowQuality: boolean;
        rejectionReason: string | null;
      }>(prompt, {
        id: "answer_synthesis",
        context: { workspaceId },
        correlationId,
      });

      const answerText = (response.data?.answer ?? "").trim();
      const concreteFacts = Array.isArray(response.data?.concreteFacts)
        ? response.data.concreteFacts.filter((f): f is string => typeof f === "string")
        : [];
      const lowQuality = !!response.data?.isLowQuality || !answerText;
      const rejection = response.data?.rejectionReason ?? (lowQuality ? "llm_marked_low_quality" : undefined);

      logger.info("ai:compose:trace", {
        workspaceId,
        correlationId,
        candidateCount: subControls.length,
        topCosine: subControls[0]?.cosine ?? null,
        answerLen: answerText.length,
        isLowQuality: lowQuality,
        durationMs: (performance.now() - startTime).toFixed(2),
        cached: response.cached,
      });

      return {
        answer: answerText,
        confidenceScore: lowQuality ? 0 : 0.8,
        sources: subControls.map(s => ({ docName: s.subControlLabel ?? s.subControlKey ?? "subcontrol", chunkId: s.answerId })),
        concreteFacts,
        isLowQuality: lowQuality,
        rejectionReason: rejection,
      };
    } catch (err) {
      if (err instanceof AiError && err.code === "AI_NOT_CONFIGURED") throw err;
      logger.warn("ai:compose:failed", {
        workspaceId,
        correlationId,
        error: err instanceof Error ? err.message : String(err),
      });
      return {
        answer: "",
        confidenceScore: 0,
        sources: [],
        isLowQuality: true,
        rejectionReason: "compose_unavailable",
      };
    }
  },

  /**
   * Synthesizes multiple evidence chunks into a high-quality Answer Library draft.
   */
  async generateFromEvidence(
    topicName: string, 
    chunks: { content: string; docName: string; id: string }[],
    workspaceId: string,
    profile?: any // Use any for now or import CompanyProfile
  ): Promise<GeneratedAnswer> {
    const correlationId = `synth-ans-${Date.now()}`;
    const startTime = performance.now();
    try {
      logger.info("ai:generation:synthesis:start", { topicName, workspaceId, correlationId });

      // 1. Local Reranking (App-Owned)
      const reranked = EvidenceReranker.rerank(chunks.map(c => ({
        id: c.id,
        content: c.content,
        docName: c.docName,
        score: 0.8 // Initial assumption for seeding
      })), topicName);

      if (reranked.length === 0) {
        return {
          answer: "",
          confidenceScore: 0,
          sources: [],
          isLowQuality: true,
          rejectionReason: "Local reranker found no high-signal evidence for this topic."
        };
      }

      const context = reranked.map(c => `SOURCE: [${c.docName}]\nCONTENT: ${c.content}`).join("\n\n---\n\n");
      
      // 1b. Build Profile Context
      let profileContext = "";
      if (profile) {
        const industry = Array.isArray(profile.industry?.value) ? profile.industry.value.join(", ") : profile.industry?.value || "N/A";
        const domain = profile.businessDomain?.value || "N/A";
        const products = Array.isArray(profile.productLines?.value) ? profile.productLines.value.join(", ") : "N/A";
        const caps = Array.isArray(profile.structuredCapabilities?.value) 
          ? profile.structuredCapabilities.value.map((c: any) => c.name).join(", ") 
          : "N/A";
        
        profileContext = `
COMPANY_PROFILE:
- Industry: ${industry}
- Business Domain: ${domain}
- Product Lines: ${products}
- Capabilities: ${caps}
        `;
      }

      // 2. Narrow Synthesis
      const prompt = `
        You are a professional Security Compliance Officer.
        ${profileContext}
        
        Synthesize an OFFICIAL SECURITY RESPONSE for: "${topicName}".
        EVIDENCE: ${context}
        
        INSTRUCTIONS:
        - BAN ALL FILLER. No "Regarding...", "We follow best practices...", etc.
        - START IMMEDIATELY with nouns or actions.
        - EXTRACT 2-3 specific, verifiable controls.
        
        OUTPUT JSON:
        {
          "answer": "Concise draft answer.",
          "concreteFacts": ["Fact 1", "Fact 2"]
        }
      `;

      const provider = AiFactory.getInstance().getProvider();
      const response = await provider.generateObject<{ 
        answer: string, 
        concreteFacts: string[]
      }>(prompt, { 
        id: 'answer_synthesis', 
        context: { workspaceId, topicId: topicName },
        correlationId
      });

      const { answer, concreteFacts } = response.data;
      
      // 3. Local Scoring & Gating (App-Owned)
      const scoring = ScoringService.evaluateQuality({
        answerText: answer,
        concreteFacts,
        sourceRelevanceScore: 0.85,
        topicName
      });

      const totalDuration = performance.now() - startTime;
      logger.info("ai:synthesis:trace", {
        workspaceId,
        correlationId,
        task: 'answer_synthesis',
        evidenceCount: reranked.length,
        isQualityPassed: scoring.isQualityPassed,
        confidenceScore: scoring.confidenceScore,
        rejectionReason: scoring.rejectionRationale,
        cached: response.cached,
        durationMs: totalDuration.toFixed(2),
        tokens: response.usage?.totalTokens
      });

      return {
        answer,
        confidenceScore: scoring.confidenceScore,
        sources: reranked.map(c => ({ docName: c.docName, chunkId: c.id })),
        concreteFacts,
        isLowQuality: !scoring.isQualityPassed,
        rejectionReason: scoring.rejectionRationale,
        metrics: scoring.metrics
      };
    } catch (err) {
      if (err instanceof AiError && err.code === 'AI_NOT_CONFIGURED') throw err;
      logger.error("ai:generation:synthesis:failed", { error: String(err), topicName });
      throw err;
    }
  }
};
