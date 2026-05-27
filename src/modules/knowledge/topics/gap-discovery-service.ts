import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logging/logger";
import { SimilarityService } from "@/modules/workspaces/search/similarity-service";
import { AnswerGenerationService } from "@/modules/workspaces/intelligence/answer-generation-service";
import { TopicsService } from "./topics-service";
import { slugify } from "@/lib/utils/slug";
import { AiFactory } from "@/lib/ai/ai-factory";
import { AiError } from "@/lib/ai/ai-response";

export type GapTheme = {
  items: any[];
  centerEmbedding: number[];
  questionnaireIds: Set<string>;
};

/**
 * GapDiscoveryService identifies recurring unresolved themes in customer questionnaires
 * and suggests new topics to close the knowledge gap.
 */
export class GapDiscoveryService {
  private static THEME_THRESHOLD = 0.85;
  private static MIN_THEME_SIZE = 3;
  private static MIN_QUESTIONNAIRE_SPAN = 2;

  /**
   * Orchestrates the gap discovery process.
   */
  static async discoverTopicsFromGaps(workspaceId: string) {
    logger.info("discovery:gaps:start", { workspaceId });

    // 1. Fetch Unresolved Items
    // We only care about rows that are "unresolved" or have "low" confidence
    const items = await prisma.questionnaireItem.findMany({
      where: {
        workspaceId,
        type: "question_row",
        reviewed: false, // QNS-003: Only discover topics from active (unreviewed) gaps
        OR: [
            { unresolvedReason: { not: null } },
            { confidence: "low" }
        ],
        // D13-EN-03: Exclude items already assigned to a topic if it's a high confidence match (but here we already filter by low/unresolved)
      },
      select: {
          id: true,
          question: true,
          questionnaireId: true,
          rowNumber: true,
      }
    });

    if (items.length < this.MIN_THEME_SIZE) {
        logger.info("discovery:gaps:insufficient_items", { workspaceId, itemCount: items.length });
        return [];
    }

    // 2. Batch get embeddings for these guestions
    const { EmbeddingService } = await import("@/lib/ai/embedding-service");
    const vectors = await EmbeddingService.getEmbeddings(items.map(i => i.question));
    const itemsWithVectors = items.map((item, idx) => ({ ...item, embedding: vectors[idx] }));

    // 3. Semantic Clustering
    const themes = this.findGapThemes(itemsWithVectors);
    logger.info("discovery:gaps:themes_identified", { workspaceId, themeCount: themes.length });

    const results = [];

    for (const theme of themes) {
      // 4. Correlate with Document Evidence
      const evidenceScore = await this.checkDocumentEvidence(workspaceId, theme.centerEmbedding);

      // 5. Synthesize Topic Proposal
      const proposal = await this.synthesizeGapProposal(workspaceId, theme, evidenceScore > 0.70);

      // 6. Governance
      const validation = await TopicsService.validateTopicCreation(workspaceId, {
        key: slugify(proposal.name),
        name: proposal.name,
        description: proposal.description
      });

      if (validation.isBlocked) continue;

      // 7. Create SUGGESTED Topic
      const topic = await prisma.knowledgeTopic.create({
        data: {
          workspaceId,
          key: slugify(proposal.name),
          name: proposal.name,
          description: proposal.description,
          status: "SUGGESTED",
          isRecommended: true,
          suggestionReason: proposal.reason,
          embedding: theme.centerEmbedding
        }
      });

      results.push(topic);
    }

    return results;
  }

  /**
   * Greedy clustering of unresolved questionnaire items.
   */
  private static findGapThemes(items: any[]): GapTheme[] {
    const themes: GapTheme[] = [];
    const visited = new Set<string>();

    for (let i = 0; i < items.length; i++) {
      const seed = items[i];
      if (visited.has(seed.id)) continue;

      const theme: GapTheme = {
        items: [seed],
        centerEmbedding: seed.embedding,
        questionnaireIds: new Set([seed.questionnaireId])
      };
      visited.add(seed.id);

      for (let j = i + 1; j < items.length; j++) {
        const candidate = items[j];
        if (visited.has(candidate.id)) continue;

        const score = SimilarityService.cosineSimilarity(seed.embedding, candidate.embedding);
        if (score > this.THEME_THRESHOLD) {
          theme.items.push(candidate);
          theme.questionnaireIds.add(candidate.questionnaireId);
          visited.add(candidate.id);
        }
      }

      // Signal Check: 3+ occurrences OR 2+ questionnaires
      if (theme.items.length >= this.MIN_THEME_SIZE || theme.questionnaireIds.size >= this.MIN_QUESTIONNAIRE_SPAN) {
        themes.push(theme);
      }
    }

    return themes;
  }

  /**
   * Check if any existing documents cover this theme.
   */
  private static async checkDocumentEvidence(workspaceId: string, embedding: number[]): Promise<number> {
    const matches = await SimilarityService.findSimilarChunksByVector(workspaceId, embedding, 1);
    return matches[0]?.score || 0;
  }

  /**
   * Synthesis via LLM
   * D10-EN-02: Provider used ONLY for naming over locally identified gap themes.
   * Hardened in Turn 33: Significance Gate (3+ questions) prevents AI noise.
   */
  private static async synthesizeGapProposal(workspaceId: string, theme: GapTheme, hasEvidence: boolean) {
    const questionCount = theme.items.length;
    const questionnaireCount = theme.questionnaireIds.size;

    // 1. App-Owned Significance Gate (D11-EN-03)
    // Recurring gaps are meaningful, isolated gaps are noise.
    const isStatisticallySignificant = questionCount >= 3 || questionnaireCount >= 2;

    if (!isStatisticallySignificant) {
      return {
        name: `Customer Gap (${questionCount} questions)`,
        description: `Unresolved theme identified across ${questionnaireCount} questionnaires. Requires manual naming.`,
        reason: "Detected locally but below AI-synthesis significance threshold for gaps."
      };
    }

    const questions = theme.items.map(i => `- ${i.question}`).join("\n");
    
    const prompt = `
      You are a GRC Analyst. 
      Identify a Professional Security Topic Name for these recurring customer questions.
      
      CUSTOMER QUESTIONS: 
      ${questions}
      
      EVIDENCE STATUS: 
      ${hasEvidence ? "Internal documentation clips matched to this cluster." : "No internal documentation found for this theme."}

      CONSTRAINTS:
      - TOPIC NAME: 2-3 words (e.g. "Penetration Testing Scope", "Data Residency").
      - DESCRIPTION: Focus on the customer's intent in asking these questions.
      - REASON: Explain why this is a critical knowledge gap.

      RESPOND JSON:
      {
        "name": "Topic Name",
        "description": "Short summary",
        "reason": "Expert rationale"
      }
    `;

    try {
      const provider = AiFactory.getInstance().getProvider();
      const response = await provider.generateObject<{ 
          name: string, 
          description: string, 
          reason: string 
      }>(prompt, { 
          id: 'gap_discovery', 
          context: { workspaceId },
          correlationId: `gap-discovery-synth-${Date.now()}` 
      });

      const parsed = response.data;
      const evidenceNote = hasEvidence ? " (Internal evidence found)" : " (Source docs required)";
      
      return {
        name: parsed.name,
        description: parsed.description,
        reason: `${parsed.reason}${evidenceNote}. Found across ${questionCount} questions in ${questionnaireCount} questionnaires.`
      };
    } catch (err) {
      if (err instanceof AiError && err.code === 'AI_NOT_CONFIGURED') throw err;
      logger.error("discovery:gaps:synthesis:failed", { error: String(err) });
      
      return {
        name: "Identified Knowledge Gap",
        description: "Proposed topic to close recurring mapping failures in customer questionnaires.",
        reason: `Recurring theme found across ${questionCount} questions in ${questionnaireCount} questionnaires.`
      };
    }
  }
}
