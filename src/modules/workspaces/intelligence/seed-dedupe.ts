import { createHash } from "node:crypto";

/**
 * Canonical dedupe fingerprint for seeded Answer Library drafts.
 *
 * The seeding pipeline has several concurrent entry points (post-parse,
 * topic discovery, manual seed, workspace retry) and a fire-and-forget
 * worker, so an application-level findFirst+create check is not enough
 * to prevent duplicate rows. We derive a deterministic fingerprint from
 * the evidence set and normalized answer text, persist it on
 * `AnswerLibraryItem`, and pair it with a partial unique index to make
 * duplicate inserts impossible at the DB layer.
 *
 * The fingerprint is split into two columns so we can tell at a glance
 * whether two drafts disagreed on evidence, on wording, or on both.
 */

/**
 * Normalize answer text so cosmetic differences (NBSP, smart quotes,
 * duplicate spaces, trailing newlines) do not create distinct hashes
 * for semantically identical drafts.
 */
export function normalizeAnswerText(text: string): string {
  if (!text) return "";
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/**
 * SHA-256 of the sorted, distinct chunk IDs that back a draft. Empty
 * input hashes to a stable sentinel so callers never have to branch.
 */
export function computeEvidenceFingerprint(chunkIds: readonly string[]): string {
  const canonical = Array.from(new Set(chunkIds.map((id) => id.trim()).filter(Boolean))).sort();
  return sha256Hex(canonical.join("|"));
}

/**
 * SHA-256 of `normalize(title) \n normalize(answer)`. Title is included
 * so two drafts with identical bodies but different topic wording do
 * not collide.
 */
export function computeContentHash(title: string, answer: string | null | undefined): string {
  const normalizedTitle = normalizeAnswerText(title ?? "");
  const normalizedAnswer = normalizeAnswerText(answer ?? "");
  return sha256Hex(`${normalizedTitle}\n${normalizedAnswer}`);
}

export interface SeedDedupeKey {
  evidenceFingerprint: string;
  contentHash: string;
}

export interface BuildSeedDedupeKeyInput {
  chunkIds: readonly string[];
  title: string;
  answer: string | null | undefined;
}

/**
 * Convenience composer. `workspaceId` / `topicId` are not hashed in —
 * they are used directly in the DB lookup and partial unique index so
 * the fingerprint stays portable (cleanup scripts can group rows
 * cross-workspace when needed, e.g. for diagnostics).
 */
export function buildSeedDedupeKey({ chunkIds, title, answer }: BuildSeedDedupeKeyInput): SeedDedupeKey {
  return {
    evidenceFingerprint: computeEvidenceFingerprint(chunkIds),
    contentHash: computeContentHash(title, answer),
  };
}
