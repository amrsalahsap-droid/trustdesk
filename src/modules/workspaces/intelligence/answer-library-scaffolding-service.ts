import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logging/logger";
import { AiFactory } from "@/lib/ai/ai-factory";
import { CompanyProfile } from "../company-profile-service";
import { TopicsService } from "@/modules/knowledge/topics/topics-service";

export interface ScaffoldingArea {
  topicKey: string;
  topicName: string;
  areas: string[];
}

/**
 * AnswerLibraryScaffoldingService: uses product intelligence signals
 * (capabilities, risk areas, etc.) to create shell answer entries in the
 * library. These entries act as placeholders with specific "areas" to cover,
 * guiding future evidence collection and answer generation.
 */
export class AnswerLibraryScaffoldingService {
  /**
   * Main entry point to scaffold a workspace library.
   */
  static async scaffold(workspaceId: string, profile: CompanyProfile) {
    logger.info("scaffolding:start", { workspaceId });

    // 1. Resolve relevant topics for this workspace
    const topics = await TopicsService.resolveWorkspaceTopics(workspaceId);
    
    // 2. Identify topics that match our capabilities or risk areas
    const activeCapabilities = profile.structuredCapabilities.value || [];
    const activeRiskAreas = profile.procurementRiskAreas.value || [];
    
    const results = [];
    for (const topic of topics) {
      // Find capabilities or risk areas related to this topic
      const relatedCaps = activeCapabilities.filter(c => 
        topic.key && (c.key.includes(topic.key) || topic.key.includes(c.key))
      );
      const relatedRisks = activeRiskAreas.filter(r => 
        topic.key && (r.key.includes(topic.key) || topic.key.includes(r.key))
      );

      if (relatedCaps.length > 0 || relatedRisks.length > 0) {
        const scaffolding = await this.generateScaffoldingAreas(topic.name, relatedCaps, relatedRisks, profile);
        if (scaffolding) {
          const outcome = await this.upsertScaffoldedAnswers(workspaceId, topic.id, topic.name, scaffolding);
          results.push(outcome);
        }
      }
    }

    logger.info("scaffolding:complete", { workspaceId, created: results.length });
    return results;
  }

  /**
   * Use LLM to generate specific "areas to cover" for a topic based on evidence.
   */
  private static async generateScaffoldingAreas(
    topicName: string,
    capabilities: any[],
    riskAreas: any[],
    profile: CompanyProfile
  ): Promise<string[] | null> {
    const capsText = capabilities.map(c => `- ${c.label} (${c.key})`).join("\n");
    const risksText = riskAreas.map(r => `- ${r.key}: ${r.reason}`).join("\n");

    const prompt = `
      You are a Security Compliance Architect.
      
      TOPIC: ${topicName}
      DETECTED CAPABILITIES:
      ${capsText}
      
      PROCUREMENT RISK AREAS:
      ${risksText}
      
      PRODUCT: ${profile.industry.value.join(", ")} in ${profile.businessDomain.value}
      
      TASK:
      Generate 3-5 specific "Answer Areas" (placeholder sub-topics) that should be addressed in the Answer Library for this topic.
      These areas should be operational and specific to the detected capabilities.
      
      RULES:
      - DO NOT generate final answers.
      - DO NOT hallucinate facts.
      - Output specific headers/points that a security officer should document.
      
      Example:
      Topic: Connector Security
      Output: ["Connector authentication", "Required permissions", "Data access scope", "Credential storage"]
      
      Return strict JSON: {"areas": ["Area 1", "Area 2", ...]}
    `;

    try {
      const provider = AiFactory.getInstance().getProvider();
      const response = await provider.generateObject<{ areas: string[] }>(prompt, {
        id: "scaffolding_generation",
        context: { topicName }
      });
      return response.data.areas;
    } catch (err) {
      logger.error("scaffolding:generation:failed", { topicName, error: String(err) });
      return null;
    }
  }

  /**
   * Idempotent upsert of shell answers into the library.
   */
  private static async upsertScaffoldedAnswers(
    workspaceId: string,
    topicId: string,
    topicName: string,
    areas: string[]
  ) {
    const answerText = [
      "<!-- ONBOARDING_GENERATED_SCAFFOLD -->",
      "**Starter areas to document for this topic:**",
      ...areas.map(a => `- [ ] ${a}`),
      "",
      "This placeholder was generated based on detected product capabilities and procurement risks."
    ].join("\n");

    const title = `${topicName} (Scaffolded)`;

    // Idempotency: skip if an answer for this topic already exists (manual or seeded)
    const existing = await prisma.answerLibraryItem.findFirst({
      where: {
        workspaceId,
        topicId,
        status: { not: "ARCHIVED" }
      }
    });

    if (existing) {
      // If it's a scaffold we already created, we might update it if we want, 
      // but the rule is "Preserve manual edits".
      if (existing.answer?.includes("ONBOARDING_GENERATED_SCAFFOLD")) {
        // Optional: update areas if unchanged. For now, just skip to be safe.
        return { kind: "skipped_exists", id: existing.id };
      }
      return { kind: "skipped_manual_exists", id: existing.id };
    }

    const created = await prisma.answerLibraryItem.create({
      data: {
        workspaceId,
        topicId,
        title,
        answer: answerText,
        status: "DRAFT",
        governanceStatus: "DRAFT",
        generationScope: "SEEDED",
        confidenceScore: 0.5,
        evidenceRequired: true,
      }
    });

    return { kind: "created", id: created.id };
  }
}
