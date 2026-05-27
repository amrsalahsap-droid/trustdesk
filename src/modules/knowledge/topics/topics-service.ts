import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logging/logger";
import { EmbeddingService } from "@/lib/ai/embedding-service";
import type { KnowledgeTopic, KnowledgeTopicStatus } from "@prisma/client";
import { AUDIT_EVENT_TYPES, AUDIT_OBJECT_TYPES, recordAuditEventSafe } from "@/lib/audit";

export const GLOBAL_WORKSPACE_ID = "SYSTEM_WORKSPACE";

export const MVP_TOPICS = [
  { key: "mfa", name: "MFA", description: "Multi-factor authentication policies and enforcement." },
  { key: "sso", name: "SSO", description: "Single Sign-On integration and identity providers." },
  { key: "access_control", name: "Access Control", description: "General access provisioning and review procedures." },
  { key: "rbac", name: "Role-Based Access", description: "Role definitions and least-privilege enforcement." },
  { key: "encryption_at_rest", name: "Encryption at Rest", description: "Data storage encryption (AES-256, KMS, etc.)." },
  { key: "encryption_in_transit", name: "Encryption in Transit", description: "TLS, mTLS, and network-level encryption." },
  { key: "backups", name: "Backups", description: "Frequency, storage, and health checks of data backups." },
  { key: "retention", name: "Retention", description: "Policies for how long customer data is kept." },
  { key: "deletion", name: "Deletion", description: "Data disposal and sanitization procedures." },
  { key: "logging", name: "Logging", description: "Audit logging and application event tracking." },
  { key: "monitoring", name: "Monitoring", description: "Uptime, performance, and security monitoring." },
  { key: "incident_response", name: "Incident Response", description: "Detection, escalation, and post-mortem procedures." },
  { key: "vulnerability_management", name: "Vulnerability Management", description: "Scans, patching cycles, and bug bounty programs." },
  { key: "employee_training", name: "Employee Training", description: "Security awareness and compliance training." },
  { key: "subprocessors", name: "Subprocessors", description: "Third-party vendor security and data processing terms." },
  { key: "data_residency", name: "Data Residency", description: "Physical locations of data storage and processing." },
  { key: "business_continuity", name: "Business Continuity", description: "Disaster recovery and service availability guarantees." },
  { key: "password_policy", name: "Password Policy", description: "Complexity, rotation, and lockout standards." },
  { key: "data_classification", name: "Data Classification", description: "Classification schemes, labels, and handling rules for sensitive data." },
  { key: "tenant_isolation", name: "Tenant Isolation", description: "Logical and physical isolation of customer tenants, workspaces, and exported evidence." },
  { key: "purview_integration", name: "Enterprise Label Integration", description: "Integrations with enterprise classification systems such as Microsoft Purview." },
];

export const TopicsService = {
  /**
   * Seeds the default MVP taxonomy into the global partition.
   */
  async seedGlobalTopics() {
    console.log("Seeding global topics taxonomy into SYSTEM_WORKSPACE...");
    
    // 1. Ensure the System Partition Workspace exists
    await prisma.workspace.upsert({
      where: { id: GLOBAL_WORKSPACE_ID },
      create: {
        id: GLOBAL_WORKSPACE_ID,
        name: "System Partition",
        slug: "system",
        status: "ACTIVE",
      },
      update: {},
    });

    const results = [];
    for (const topic of MVP_TOPICS) {
      const embedding = await EmbeddingService.getEmbedding(`${topic.name}: ${topic.description}`);
      
      const result = await prisma.knowledgeTopic.upsert({
        where: {
          workspaceId_key: {
            workspaceId: GLOBAL_WORKSPACE_ID,
            key: topic.key
          }
        },
        create: {
          workspaceId: GLOBAL_WORKSPACE_ID,
          key: topic.key,
          name: topic.name,
          description: topic.description,
          embedding,
          status: "ACTIVE",
        },
        update: {
          name: topic.name,
          description: topic.description,
          embedding,
          status: "ACTIVE",
        }
      });
      results.push(result);
    }

    console.log(`Successfully seeded ${results.length} topics into ${GLOBAL_WORKSPACE_ID}.`);
    return results;
  },

  /**
   * Resolve authorized topics for a workspace.
   * Logic: Returns all workspace-specific topics + global topics that are NOT shadowed by workspace versions.
   */
  async resolveWorkspaceTopics(workspaceId: string): Promise<KnowledgeTopic[]> {
    // 1. Fetch all topics for this workspace (Active/Draft only)
    // Refreshed logic to resolve authorized taxonomy
    const workspaceTopics = await prisma.knowledgeTopic.findMany({
      where: { 
        workspaceId,
        status: { in: ["ACTIVE", "DRAFT"] }
      },
      include: {
        owner: { select: { id: true, name: true, email: true } },
        approver: { select: { id: true, name: true, email: true } },
        subControlGovernances: {
          include: {
            owner: { select: { id: true, name: true, email: true } },
            approver: { select: { id: true, name: true, email: true } }
          }
        }
      }
    });

    // 2. Fetch all global topics from the SYSTEM_WORKSPACE
    const globalTopics = await prisma.knowledgeTopic.findMany({
      where: { 
        workspaceId: GLOBAL_WORKSPACE_ID,
        status: "ACTIVE"
      },
      include: {
        owner: { select: { id: true, name: true, email: true } },
        approver: { select: { id: true, name: true, email: true } },
        subControlGovernances: {
          include: {
            owner: { select: { id: true, name: true, email: true } },
            approver: { select: { id: true, name: true, email: true } }
          }
        }
      }
    });

    // 3. Merge: workspace topics shadow global ones by 'key'
    const workspaceKeys = new Set(workspaceTopics.map(t => t.key));
    const finalTopics = [
      ...workspaceTopics,
      ...globalTopics.filter(gt => !workspaceKeys.has(gt.key))
    ];

    return finalTopics.sort((a, b) => a.name.localeCompare(b.name));
  },

  /**
   * Creates a custom topic or overrides a global one for a specific workspace.
   */
  async upsertWorkspaceTopic(workspaceId: string, data: {
    key: string;
    name: string;
    description: string;
    ownerId?: string;
    approverId?: string;
    reviewCadenceDays?: number | null;
    status?: KnowledgeTopicStatus;
  }) {
    // 1. Normalize ownerId: prisma doesn't like empty strings for FKs
    const ownerId = data.ownerId && data.ownerId.trim() !== "" ? data.ownerId : null;
    const approverId = data.approverId && data.approverId.trim() !== "" ? data.approverId : null;
    const status = data.status || "ACTIVE";

    // 2. Generate embedding
    const embedding = await EmbeddingService.getEmbedding(`${data.name}: ${data.description}`);
    return prisma.knowledgeTopic.upsert({
      where: {
        workspaceId_key: {
          workspaceId,
          key: data.key
        }
      },
      update: {
        name: data.name,
        description: data.description,
        embedding,
        ownerId,
        approverId,
        status,
        ...(data.reviewCadenceDays !== undefined ? { reviewCadenceDays: data.reviewCadenceDays } : {}),
      },
      create: {
        workspaceId,
        key: data.key,
        name: data.name,
        description: data.description,
        embedding,
        ownerId,
        approverId,
        status,
        reviewCadenceDays: data.reviewCadenceDays ?? null,
      },
    });
  },

  /**
   * Semantic check for topic overlap.
   */
  async findOverlappingTopics(workspaceId: string, name: string, description: string) {
    const { SimilarityService } = await import("@/modules/workspaces/search/similarity-service");
    const embedding = await EmbeddingService.getEmbedding(`${name}: ${description}`);
    
    // Similarity check includes both workspace and global topics
    const matches = await SimilarityService.findSimilarTopicsByVector(workspaceId, embedding, 5);
    
    return matches.map(m => ({
      ...m,
      isStrongOverlap: m.score > 0.85,
      isPotentialOverlap: m.score > 0.65
    }));
  },

  /**
   * Authoritative duplicate check before creation.
   * Logic: If a topic exists with a DIFFERENT key but > 95% similarity, it's a blocked duplicate.
   */
  async validateTopicCreation(workspaceId: string, data: { key: string, name: string, description: string }) {
    const overlaps = await this.findOverlappingTopics(workspaceId, data.name, data.description);
    
    // 1. Hard Block (> 95% similarity with a different key)
    const hardCollisions = overlaps.filter(o => o.item.key !== data.key && o.score > 0.95);
    if (hardCollisions.length > 0) {
      logger.info("governance:topic:blocked", { 
        workspaceId, 
        topicName: data.name, 
        collisionType: "HARD_DUPLICATE",
        matchedTopic: hardCollisions[0].item.name, 
        score: hardCollisions[0].score 
      });
      return {
        isBlocked: true,
        collision: hardCollisions[0]
      };
    }

    // 2. Soft Warning (80 - 95%)
    const softCollisions = overlaps.filter(o => o.item.key !== data.key && o.score > 0.80);
    if (softCollisions.length > 0) {
      const collision = softCollisions[0];
      const isGlobal = !collision.item.workspaceId;
      
      logger.info("governance:topic:warn", { 
        workspaceId, 
        topicName: data.name, 
        overlapScore: collision.score, 
        match: collision.item.name 
      });

      return {
        isBlocked: false,
        warning: `Near overlap with existing topic: "${collision.item.name}"`,
        governanceInsight: {
          overlapType: "SEMANTIC_DUPLICATE",
          recommendedAction: isGlobal ? "OVERRIDE" : "MERGE",
          targetId: collision.item.id,
          targetName: collision.item.name
        },
        collision: softCollisions[0]
      };
    }

    // 3. Shadowing Check (same key, different content)
    // If the key exists but similarity is LOW (< 0.80), it's a clean override
    const keyMatch = overlaps.find(o => o.item.key === data.key);
    if (keyMatch) {
      const isGlobal = !keyMatch.item.workspaceId;
      console.log(`governance:shadow:key collision for "${data.name}" (Shadowing: ${keyMatch.item.name})`);
      return {
        isBlocked: false,
        governanceInsight: {
          overlapType: "KEY_COLLISION",
          recommendedAction: isGlobal ? "GLOBAL_OVERRIDE" : "LOCAL_OVERWRITE",
          targetId: keyMatch.item.id,
          targetName: keyMatch.item.name
        }
      };
    }
    
    console.log(`governance:pass:unique theme accepted for "${data.name}"`);
    return { isBlocked: false };
  },

  /**
   * Archives a workspace topic or 'soft-shadows' a global topic by creating an ARCHIVED version.
   */
  async archiveTopic(workspaceId: string, key: string) {
    return prisma.knowledgeTopic.upsert({
      where: {
        workspaceId_key: {
          workspaceId,
          key
        }
      },
      update: { status: "ARCHIVED" },
      create: {
        workspaceId,
        key,
        name: "Archived Topic", 
        status: "ARCHIVED",
        embedding: [] 
      }
    });
  },

  /**
   * Fetches all suggested topics awaiting review.
   */
  async resolveSuggestedTopics(workspaceId: string) {
    return prisma.knowledgeTopic.findMany({
      where: { 
        workspaceId,
        status: "SUGGESTED"
      },
      orderBy: { createdAt: "desc" }
    });
  },

  /**
   * Updates a topic's status (Approve/Dismiss logic).
   */
  async updateTopicStatus(workspaceId: string, topicId: string, status: KnowledgeTopicStatus) {
    return prisma.knowledgeTopic.update({
      where: { 
        id: topicId,
        workspaceId // Multi-tenant safety
      },
      data: { status }
    });
  },

  /**
   * Fetches all global topics.
   */
  async getGlobalTopics() {
    return prisma.knowledgeTopic.findMany({
      where: { workspaceId: GLOBAL_WORKSPACE_ID },
      orderBy: { name: "asc" },
    });
  },

  /**
   * Aggregates multi-dimensional health metrics for a set of topics.
   * D15-EN-01: Measures library strength, evidence depth, and real-world usage.
   */
  async getTopicHealthMetrics(workspaceId: string, topicIds: string[]) {
    if (topicIds.length === 0) return {};

    try {
      const [evidencedItems, matches, gaps, sourceDepth] = await Promise.all([
        // 1. Evidence counts (Pivoted to findMany because groupBy doesn't support relation filters)
        prisma.answerLibraryItem.findMany({
          where: { workspaceId, topicId: { in: topicIds }, evidence: { some: {} } },
          select: { topicId: true }
        }),
        // 2. Success Matches (matched)
        prisma.questionnaireItem.groupBy({
          by: ["topicId"],
          where: { 
            workspaceId, 
            topicId: { in: topicIds }, 
            reviewStatus: "matched" 
          },
          _count: true
        }),
        // 3. Gap Counts (unresolved)
        prisma.questionnaireItem.groupBy({
          by: ["topicId"],
          where: { 
            workspaceId, 
            topicId: { in: topicIds }, 
            OR: [
              { unresolvedReason: { not: null } },
              { reviewStatus: "unresolved" }
            ]
          },
          _count: true
        }),
        // 4. Source Depth (Chunks)
        prisma.sourceChunkTopic.groupBy({
          by: ["topicId"],
          where: { 
            workspaceId, // Mandatory scoping guard
            topicId: { in: topicIds } 
          },
          _count: true
        })
      ]);

      // 5. Fetch Latest Seeding Run Status
      const latestSeedingRuns = await prisma.answerSeedingTopicRun.findMany({
        where: { workspaceId, topicId: { in: topicIds } },
        orderBy: { createdAt: "desc" },
        select: { topicId: true, status: true, errorMessage: true }
      });

      const metricsMap: Record<string, any> = {};

      topicIds.forEach(id => {
        // Count evidenced items in memory for this topic
        const evidCount = evidencedItems.filter(e => e.topicId === id).length;
        const matchCount = matches.find(m => m.topicId === id)?._count || 0;
        const gapCount = gaps.find(g => g.topicId === id)?._count || 0;
        const chunkCount = sourceDepth.find(s => s.topicId === id)?._count || 0;
        
        // Find most recent seeding run for this topic
        const latestRun = latestSeedingRuns.find(r => r.topicId === id);

        metricsMap[id] = {
          evidencedAnswers: evidCount,
          usageCount: matchCount,
          gapCount: gapCount,
          sourceChunks: chunkCount,
          seedingStatus: latestRun?.status || null,
          seedingError: latestRun?.errorMessage || null
        };
      });

      return metricsMap;
    } catch (error) {
      console.error("topics:health-metrics:failed", { workspaceId, topicIds, error });
      // Return empty defaults to prevent 500
      return {};
    }
  },

  /**
   * Calculates a weighted 0-100 strength score for a topic.
   */
  calculateStrengthScore(topic: any, metrics: any) {
    let score = 0;

    // 40%: Approved Answer
    if (topic.approvedAnswers > 0) score += 40;
    else if (topic.totalAnswers > 0) score += 10; // Partial for Drafts

    // 30%: Evidence Depth (at least one evidenced answer)
    if (metrics.evidencedAnswers > 0) score += 30;

    // 20%: Usage Signal (successfully matched)
    if (metrics.usageCount > 0) score += 20;

    // 10%: Source Depth (grounded in docs)
    if (metrics.sourceChunks > 2) score += 10;
    else if (metrics.sourceChunks > 0) score += 5;

    return score;
  }
};
