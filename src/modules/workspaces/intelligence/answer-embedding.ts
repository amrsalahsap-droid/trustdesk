import { EmbeddingService } from "@/lib/ai/embedding-service";

/**
 * Shared helper: build the canonical embedding input for an AnswerLibraryItem
 * and obtain its vector. Kept separate from any DB client so it is safe to
 * call from write paths (seeding, manual API) and from the backfill script
 * without dragging in Prisma side-effects.
 *
 * The embedding input is deliberately `title + answer` — matcher questions
 * typically probe for both the topic label (handled by KnowledgeTopic
 * embeddings) and the actual policy text, so concatenating gives the answer
 * library item a more representative semantic footprint than either field
 * alone.
 */

export interface AnswerEmbeddingExtras {
  /** Canonical sub-control label prepended to the embedding input so a row
   *  like "access_control / Access Reviews" cosines differently from
   *  "access_control / Offboarding" even when the body is similar. */
  subControlLabel?: string | null;
  /** Short keyword list folded into the embedding input for lexical nudging
   *  during matcher cosine scoring. */
  subControlKeywords?: string[] | null;
}

function dedupeNonEmpty(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const trimmed = (raw ?? "").trim();
    if (!trimmed) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

export function buildAnswerEmbeddingInput(
  title: string | null | undefined,
  answer: string | null | undefined,
  extras?: AnswerEmbeddingExtras,
): string {
  const parts: Array<string | null | undefined> = [title, answer];
  if (extras?.subControlLabel) parts.push(extras.subControlLabel);
  if (extras?.subControlKeywords?.length) {
    parts.push(extras.subControlKeywords.join(", "));
  }
  return dedupeNonEmpty(parts).join("\n");
}

export async function computeAnswerEmbedding(
  title: string | null | undefined,
  answer: string | null | undefined,
  extras?: AnswerEmbeddingExtras,
): Promise<number[]> {
  const text = buildAnswerEmbeddingInput(title, answer, extras);
  if (!text) return [];
  return EmbeddingService.getEmbedding(text);
}
