import { AiFactory } from "@/lib/ai/ai-factory";
import { AiError } from "@/lib/ai/ai-response";
import { logger } from "@/lib/logging/logger";

/**
 * AnswerFitnessService: a question-aware judge that decides whether a library
 * answer actually addresses a questionnaire question. Consumed by the
 * matcher AFTER topic gating and cosine ranking to stop approved-but-wrong
 * reuse (generic Access Control answer returned for a Logging question, etc.).
 *
 * Caching is delegated to the underlying AI provider pipeline — the cached
 * provider hashes the prompt deterministically, so a repeated (question,
 * answer) pair is free on the second and subsequent calls.
 *
 * Fail-open: provider errors return `{ verdict: "pass" }` so a transient AI
 * outage never blocks the matcher pipeline. The fitness gate is a
 * correctness assist, not a hard dependency.
 */

export interface FitnessVerifyInput {
  question: string;
  answer: string;
  topicKey?: string | null;
  answerId: string;
  workspaceId: string;
}

export interface FitnessVerdict {
  verdict: "pass" | "fail";
  rationale?: string;
  missing?: string[];
  cached?: boolean;
}

function buildPrompt(input: FitnessVerifyInput): string {
  const lines = [
    "You are evaluating whether a library answer actually addresses a security questionnaire question.",
    "Ignore writing style. Focus on whether the answer's topic and specific controls match the question's intent.",
    "",
    `QUESTION: ${input.question.trim()}`,
    `ANSWER: ${input.answer.trim()}`,
  ];
  if (input.topicKey) {
    lines.push(`RESOLVED_TOPIC: ${input.topicKey}`);
  }
  lines.push(
    "",
    'Return strict JSON: {"verdict":"pass"|"fail","rationale":"<one sentence>","missing":["<sub-control>",...]}',
    'Rule: verdict=pass ONLY if the answer meaningfully addresses the question\'s control family and the specific sub-controls it requests. If the answer is about a different control family, return fail.',
  );
  return lines.join("\n");
}

export const AnswerFitnessService = {
  async verify(input: FitnessVerifyInput): Promise<FitnessVerdict> {
    const prompt = buildPrompt(input);

    try {
      const provider = AiFactory.getInstance().getProvider();
      const response = await provider.generateObject<FitnessVerdict>(prompt, {
        id: "answer_fitness",
        context: { workspaceId: input.workspaceId, answerId: input.answerId },
        correlationId: `fit-${input.answerId}`,
      });

      const data = response.data ?? ({} as Partial<FitnessVerdict>);
      const verdict: "pass" | "fail" = data.verdict === "pass" ? "pass" : "fail";
      const rationale = typeof data.rationale === "string" ? data.rationale : undefined;
      const missing = Array.isArray(data.missing)
        ? data.missing.filter((m): m is string => typeof m === "string")
        : undefined;

      return { verdict, rationale, missing, cached: response.cached };
    } catch (err) {
      // Fail-open: a provider outage or parse error must not block the
      // matcher. Log once with enough context to investigate.
      const message = err instanceof AiError || err instanceof Error ? err.message : String(err);
      logger.warn("answer-fitness:unavailable", {
        workspaceId: input.workspaceId,
        answerId: input.answerId,
        error: message,
      });
      return { verdict: "pass", rationale: "verifier_unavailable" };
    }
  },
};
