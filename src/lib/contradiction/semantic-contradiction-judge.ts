/**
 * Optional LLM layer after deterministic contradiction rules find no hit.
 * Deterministic rules own critical/high; semantic assist is capped at medium/low only.
 */

import { AiFactory } from "@/lib/ai/ai-factory";
import { AiError } from "@/lib/ai/ai-response";
import { logger } from "@/lib/logging/logger";

/** Minimum trimmed length for both row and canonical text before invoking the judge. */
export const SEMANTIC_JUDGE_MIN_TEXT_CHARS = 56;

/** Minimum model confidence to treat as a contradiction signal. */
export const SEMANTIC_JUDGE_LIKELY_THRESHOLD = 0.65;

export const SEMANTIC_CONTRADICTION_RULE_ID = "semantic_assist_v1";

const MAX_QUESTION_CHARS = 2_000;
const MAX_ANSWER_CHARS = 4_000;
const MAX_SUPPORTING_EXCERPTS = 4;
const MAX_EXCERPT_ITEM_CHARS = 400;

export interface SemanticContradictionJudgeSupportingExcerpt {
  source: "row" | "canonical";
  text: string;
}

export interface SemanticContradictionJudgeResult {
  contradictionLikely: boolean;
  confidence: number;
  reason: string;
  supportingExcerpts: SemanticContradictionJudgeSupportingExcerpt[];
}

export interface SemanticContradictionJudgeInput {
  workspaceId: string;
  questionnaireItemId: string;
  question: string;
  rowAnswer: string;
  canonicalAnswer: string;
  topicKey: string;
  correlationId?: string;
}

function clip(s: string, max: number): string {
  const t = s.trim();
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

function normalizeSupporting(
  raw: unknown,
): SemanticContradictionJudgeSupportingExcerpt[] {
  if (!Array.isArray(raw)) return [];
  const out: SemanticContradictionJudgeSupportingExcerpt[] = [];
  for (const item of raw) {
    if (out.length >= MAX_SUPPORTING_EXCERPTS) break;
    if (!item || typeof item !== "object") continue;
    const src = (item as { source?: unknown }).source;
    const text = (item as { text?: unknown }).text;
    if (src !== "row" && src !== "canonical") continue;
    if (typeof text !== "string" || !text.trim()) continue;
    out.push({ source: src, text: clip(text, MAX_EXCERPT_ITEM_CHARS) });
  }
  return out;
}

function buildPrompt(input: SemanticContradictionJudgeInput): string {
  return [
    "You compare a questionnaire row answer to an approved internal canonical security answer.",
    "Decide if they are materially contradictory (opposing claims, incompatible policies), not merely different wording or level of detail.",
    "",
    `TOPIC_KEY: ${input.topicKey}`,
    `QUESTION: ${clip(input.question, MAX_QUESTION_CHARS)}`,
    `ROW_ANSWER: ${clip(input.rowAnswer, MAX_ANSWER_CHARS)}`,
    `CANONICAL_ANSWER: ${clip(input.canonicalAnswer, MAX_ANSWER_CHARS)}`,
    "",
    "Return strict JSON only:",
    '{"contradictionLikely":boolean,"confidence":number,"reason":"<short>","supportingExcerpts":[{"source":"row"|"canonical","text":"<short excerpt>"}]}',
    "confidence is 0..1. supportingExcerpts: at most 4 items, short quotes only.",
  ].join("\n");
}

export function passesSemanticJudgeTextGate(rowAnswer: string, canonicalAnswer: string): boolean {
  const row = rowAnswer.trim();
  const canon = canonicalAnswer.trim();
  return row.length >= SEMANTIC_JUDGE_MIN_TEXT_CHARS && canon.length >= SEMANTIC_JUDGE_MIN_TEXT_CHARS;
}

/** Map judge confidence to severity; semantic path never returns critical/high. */
export function semanticConfidenceToSeverity(confidence: number): "medium" | "low" {
  return confidence >= 0.85 ? "medium" : "low";
}

export async function runSemanticContradictionJudge(
  input: SemanticContradictionJudgeInput,
): Promise<SemanticContradictionJudgeResult> {
  const prompt = buildPrompt(input);
  const correlationId =
    input.correlationId ?? `sem-contradict-${input.questionnaireItemId}`;

  try {
    const provider = AiFactory.getInstance().getProvider();
      const response = await provider.generateObject<SemanticContradictionJudgeResult>(prompt, {
        id: "contradiction_semantic_judge",
        context: {
          workspaceId: input.workspaceId,
          questionnaireItemId: input.questionnaireItemId,
        },
        correlationId,
      });

    const data = response.data ?? ({} as Partial<SemanticContradictionJudgeResult>);
    const contradictionLikely = data.contradictionLikely === true;
    let confidence =
      typeof data.confidence === "number" && Number.isFinite(data.confidence)
        ? Math.min(1, Math.max(0, data.confidence))
        : 0;
    const reason = typeof data.reason === "string" && data.reason.trim() ? data.reason.trim() : "unspecified";
    const supportingExcerpts = normalizeSupporting(data.supportingExcerpts);

    return {
      contradictionLikely,
      confidence,
      reason,
      supportingExcerpts,
    };
  } catch (err) {
    const message = err instanceof AiError || err instanceof Error ? err.message : String(err);
    logger.warn("semantic-contradiction-judge:unavailable", {
      workspaceId: input.workspaceId,
      questionnaireItemId: input.questionnaireItemId,
      error: message,
    });
    return {
      contradictionLikely: false,
      confidence: 0,
      reason: "judge_unavailable",
      supportingExcerpts: [],
    };
  }
}
