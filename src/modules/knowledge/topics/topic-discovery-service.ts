import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logging/logger";
import { SimilarityService } from "@/modules/workspaces/search/similarity-service";
import { AnswerGenerationService } from "@/modules/workspaces/intelligence/answer-generation-service";
import { TopicsService } from "./topics-service";
import { slugify } from "@/lib/utils/slug";
import { createScopedLogger } from "@/lib/logging/scoped-logger";
import { AiFactory } from "@/lib/ai/ai-factory";
import { AiError } from "@/lib/ai/ai-response";

export type DiscoveryCluster = {
  chunks: any[];
  centerEmbedding: number[];
  documentIds: Set<string>;
};

/**
 * TopicDiscoveryService identifies meaningful document themes that are not
 * currently covered by the taxonomy and suggests new topics.
 */
export class TopicDiscoveryService {
  private static ORPHAN_THRESHOLD = 0.65;
  private static THEME_THRESHOLD = 0.82;
  private static MIN_CLUSTER_SIZE = 3;
  private static MIN_DOC_SPAN = 1; // D10-FIX: Relax from 2 to 1 for specialized themes

  /**
   * Orchestrates the discovery process for a workspace.
   */
  static async discoverNewTopics(workspaceId: string) {
    const slog = createScopedLogger({ workspaceId, stage: "discovery" });
    slog.info("discovery:start", { workspaceId });

    // 1. Find Orphan Chunks (no match > 0.65)
    const chunks = await prisma.sourceDocumentChunk.findMany({
      where: { 
        workspaceId,
        embedding: { isEmpty: false }
      },
      include: {
        sourceDocument: { select: { id: true, fileName: true } },
        sourceChunkTopics: {
          select: { score: true }
        }
      }
    });

    const orphans = chunks.filter(c => {
      const maxScore = c.sourceChunkTopics.reduce((max, t) => Math.max(max, t.score), 0);
      return maxScore < this.ORPHAN_THRESHOLD;
    });

    slog.info("discovery:orphans_detected", { 
        totalChunks: chunks.length, 
        orphanCount: orphans.length,
        threshold: this.ORPHAN_THRESHOLD
    });

    if (orphans.length < this.MIN_CLUSTER_SIZE) {
        slog.info("discovery:aborted:insufficient_orphans", { count: orphans.length, min: this.MIN_CLUSTER_SIZE });
        return [];
    }

    // 2. Clustering Logic
    const clusters = this.findClusters(orphans, slog);
    slog.info("discovery:clustering_complete", { 
        clusterCount: clusters.length, 
        orphansScanned: orphans.length 
    });

    const results = [];

    // 3. Synthesis & Creation
    for (const cluster of clusters) {
      slog.info("discovery:synthesizing:proposal", { 
          chunkCount: cluster.chunks.length, 
          docSpan: cluster.documentIds.size 
      });

      const proposal = await this.synthesizeTopicProposal(cluster, slog);
      
      // 4. Governance Guardrail
      const validation = await TopicsService.validateTopicCreation(workspaceId, {
        key: slugify(proposal.name),
        name: proposal.name,
        description: proposal.description
      });

      if (validation.isBlocked) {
        slog.warn("discovery:candidate_blocked", { 
            name: proposal.name, 
            reason: "duplicate",
            collisionScore: validation.collision?.score,
            collisionName: validation.collision?.item.name
        });
        continue;
      }

      // 5. Create SUGGESTED Topic
      const topic = await prisma.knowledgeTopic.create({
        data: {
          workspaceId,
          key: slugify(proposal.name),
          name: proposal.name,
          description: proposal.description,
          status: "SUGGESTED",
          isRecommended: true,
          suggestionReason: proposal.reason,
          embedding: cluster.centerEmbedding
        }
      });

      slog.info("discovery:topic_created", { 
          topicId: topic.id, 
          name: topic.name
      });

      // 6. Link Evidence (SourceChunkTopic)
      // D10-FIX: Must persist the relationship so the system knows why this topic exists
      try {
        const linkData = cluster.chunks.map(chunk => ({
          workspaceId,
          topicId: topic.id,
          chunkId: chunk.id,
          score: 1.0, // High confidence since it's the discovery seed
          isManual: false
        }));

        await prisma.sourceChunkTopic.createMany({
          data: linkData
        });
        
        slog.info("discovery:evidence_linked", { 
          topicId: topic.id, 
          chunkCount: linkData.length 
        });
      } catch (linkErr) {
        slog.error("discovery:linkage:failed", { 
          topicId: topic.id, 
          error: String(linkErr) 
        });
      }

      // 7. Immediate Seeding
      // D10-FIX: Generate the first draft answer immediately so the topic isn't empty in the UI
      try {
        const { SeedingService } = await import("@/modules/workspaces/intelligence/seeding-service");
        const seedResult = await SeedingService.seedSingleTopic(
          workspaceId,
          topic.id,
          topic.name,
          topic.key ?? null,
        );
        
        slog.info("discovery:seeding_complete", { 
          topicId: topic.id, 
          result: seedResult.kind,
          answerId: seedResult.kind === "created" ? seedResult.answerId : undefined
        });
      } catch (seedErr) {
        slog.error("discovery:seeding:failed", { 
          topicId: topic.id, 
          error: String(seedErr) 
        });
      }

      results.push(topic);
    }

    slog.info("discovery:complete", { suggestedCount: results.length });
    return results;
  }

  /**
   * Greedy semantic clustering of orphan chunks.
   */
  private static findClusters(orphans: any[], slog: any): DiscoveryCluster[] {
    const clusters: DiscoveryCluster[] = [];
    const visited = new Set<string>();

    for (let i = 0; i < orphans.length; i++) {
        const seed = orphans[i];
        if (visited.has(seed.id)) continue;

        const cluster: DiscoveryCluster = {
            chunks: [seed],
            centerEmbedding: seed.embedding as number[],
            documentIds: new Set([seed.sourceDocument.id])
        };
        visited.add(seed.id);

        // Find neighbors for this seed
        for (let j = i + 1; j < orphans.length; j++) {
            const candidate = orphans[j];
            if (visited.has(candidate.id)) continue;

            const score = SimilarityService.cosineSimilarity(
                seed.embedding as number[], 
                candidate.embedding as number[]
            );

            if (score > this.THEME_THRESHOLD) {
                cluster.chunks.push(candidate);
                cluster.documentIds.add(candidate.sourceDocument.id);
                visited.add(candidate.id);
            }
        }

        // Validate cluster strength
        const sizeCheck = cluster.chunks.length >= this.MIN_CLUSTER_SIZE;
        const docCheck = cluster.documentIds.size >= this.MIN_DOC_SPAN;

        if (sizeCheck && docCheck) {
            clusters.push(cluster);
        } else {
            slog.info("discovery:cluster_rejected", { 
                size: cluster.chunks.length, 
                docs: cluster.documentIds.size,
                reason: !sizeCheck ? "insufficient_size" : "insufficient_doc_span",
                sample: cluster.chunks[0].heading || "Untitled chunk"
            });
        }
    }

    return clusters;
  }

  /**
   * Synthesize topic metadata using LLM or fallback logic.
   * D10-EN-02: Provider used ONLY for naming/synthesis over local clusters.
   * Hardened in Turn 33: Significance Gate (5+ clips) prevents AI noise.
   */
  private static async synthesizeTopicProposal(cluster: DiscoveryCluster, slog: any) {
    const chunkCount = cluster.chunks.length;
    const docCount = cluster.documentIds.size;

    // 1. App-Owned Significance Gate (D11-EN-03)
    // Only pay for LLM naming if it's a solid theme
    const isStatisticallySignificant = chunkCount >= 5 || docCount >= 2;

    if (!isStatisticallySignificant) {
      slog.info("discovery:synthesis:significance-gate-skipped", { chunkCount, docCount });
      return {
        name: `Potential Theme (${chunkCount} clips)`,
        description: `Local semantic cluster identified across ${docCount} documents. Requires manual naming.`,
        reason: "Detected locally but below AI-synthesis significance threshold."
      };
    }

    // Prepare context for LLM
    // We favor chunks with headings to provide better naming context
    const context = cluster.chunks
        .slice(0, 10) // Representative sample
        .map(c => `[Heading: ${c.heading || "n/a"}] ${c.content.substring(0, 300)}`)
        .join("\n\n");
    
    const prompt = `
      You are a Security Taxonomy Expert.
      Analyze these 5-10 related fragments from a security knowledge base.
      Synthesize a professional, concise topic name and a 1-sentence description.
      
      EVIDENCE CLIPS:
      ${context}
      
      CONSTRAINTS:
      - TOPIC NAME: 2-3 words (e.g. "Asset Decommissioning", "Vendor Risk Assessment").
      - DESCRIPTION: Focus on the operational control described.
      - REASON: Explain why this is a distinct security theme.

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
          id: 'topic_discovery', 
          context: { workspaceId: (slog as any).workspaceId || 'system' },
          correlationId: `discovery-synth-${Date.now()}` 
      });

      const parsed = response.data;
      return {
          name: parsed.name,
          description: parsed.description,
          reason: `${parsed.reason} (Clustered from ${chunkCount} clips across ${docCount} docs)`
      };
    } catch (err) {
      if (err instanceof AiError && err.code === 'AI_NOT_CONFIGURED') throw err;
      slog.error("discovery:synthesis:failed", { error: String(err) });
      
      return {
        name: "Discovery Candidate",
        description: "Automated theme detected across multiple system documents.",
        reason: `Repeated semantic cluster detected across ${cluster.chunks.length} chunks.`
      };
    }
  }
}
