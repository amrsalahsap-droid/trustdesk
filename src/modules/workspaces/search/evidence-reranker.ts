import { logger } from "@/lib/logging/logger";

export interface RerankableChunk {
  id: string;
  content: string;
  docName: string;
  score: number; // Input semantic score
  heading?: string | null;
}

/**
 * D10-EN-02: Local Evidence Reranker.
 * Selects high-signal chunks and prunes noise before synthesis.
 * Refined in Turn 32 to prioritize operational controls over headers.
 */
export class EvidenceReranker {
  private static BOOSTER_KEYWORDS = [
    // Core Operational Verbs
    "must", "requires", "mandatory", "enforce", "approved", "reviewed", 
    "removed", "provisioned", "revoked", "authorized", "monitored",
    // Technical Controls
    "MFA", "least privilege", "RBAC", "offboarding", "retention", 
    "logging", "encryption", "firewall", "patching", "backups",
    "background checks", "confidentiality"
  ];

  private static NOISE_PATTERNS = [
    "table of contents",
    "intended audience",
    "document overview",
    "revision history",
    "scope:",
    "copyright",
    "confidential and proprietary"
  ];

  /**
   * Reranks and prunes a set of semantic matches based on local operational signals.
   */
  static rerank(chunks: RerankableChunk[], topicName?: string): RerankableChunk[] {
    logger.info("ai:reranker:start", { inputCount: chunks.length, topicContext: topicName });

    const scored = chunks.map(chunk => {
      let boostScore = chunk.score;
      const lowerContent = chunk.content.toLowerCase().trim();
      const topicLower = topicName?.toLowerCase() || "";

      // 1. Topic Repetition Penalty (D10-EN-04)
      // If the chunk content IS just the topic name (or very close), it's a header.
      if (topicLower && (lowerContent === topicLower || lowerContent.startsWith(topicLower + ":"))) {
        if (chunk.content.length < topicLower.length + 5) {
            boostScore -= 0.4; // Heavy penalty for title-only headers
            logger.debug("ai:reranker:penalty:title-header", { chunkId: chunk.id });
        }
      }

      // 2. Structural Pruning: Headers vs Policy Text
      const isShort = chunk.content.length < 85;
      const endsWithPunct = /[.!?]$/.test(chunk.content.trim());
      const isHeader = isShort && !endsWithPunct;

      if (isHeader) boostScore -= 0.2;
      
      // 3. Noise Filter (D10-EN-04)
      const hasNoise = this.NOISE_PATTERNS.some(p => lowerContent.includes(p));
      if (hasNoise) boostScore -= 0.3;

      // 4. Keyword Boosting: Operational Control Language
      const hits = this.BOOSTER_KEYWORDS.filter(k => lowerContent.includes(k.toLowerCase()));
      if (hits.length > 0) {
        // Logarithmic boost to prevent keyword stuffing from over-boosting
        const boostAmt = Math.min(0.25, hits.length * 0.05);
        boostScore += boostAmt;
        logger.debug("ai:reranker:boost", { chunkId: chunk.id, hitsCount: hits.length });
      }

      // 5. Heading Alignment
      if (topicLower && chunk.heading?.toLowerCase().includes(topicLower)) {
          boostScore += 0.05; // Slight boost if the chunk is actually UNDER a relevant heading
      }

      return { ...chunk, score: boostScore };
    });

    // Sort by new boosted score and prune weak results (< 0.4 revised)
    // We keep a minimum of 2 chunks if any are present to ensure synthesis has "something" to work with if possible
    const sorted = scored.sort((a, b) => b.score - a.score);
    const filtered = sorted.filter((c, idx) => c.score > 0.4 || idx < 2);

    logger.info("ai:reranker:complete", { 
      outputCount: filtered.length, 
      topScore: filtered[0]?.score 
    });

    return filtered;
  }
}
