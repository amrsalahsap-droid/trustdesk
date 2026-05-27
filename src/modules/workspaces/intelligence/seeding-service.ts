import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { EmbeddingService } from "@/lib/ai/embedding-service";
import { logger } from "@/lib/logging/logger";
import { createScopedLogger } from "@/lib/logging/scoped-logger";
import { AnswerGenerationService } from "./answer-generation-service";
import { computeAnswerEmbedding } from "./answer-embedding";
import { TopicsService } from "@/modules/knowledge/topics/topics-service";
import {
  getSubControls,
  subControlEmbeddingExtras,
  type SubControl,
} from "@/modules/knowledge/topics/subcontrol-taxonomy";
import { ScoringService } from "@/lib/ai/scoring-service";
import { buildSeedDedupeKey } from "./seed-dedupe";
import { SimilarityService } from "@/modules/workspaces/search/similarity-service";
import { flagAnswerForEvidenceChangeIfNeeded } from "@/lib/knowledge/answer-evidence-review-flag";
import {
  evidenceSnapshotJsonValue,
  itemToVersionSnapshot,
  recordAnswerLibraryVersion,
  VERSION_CHANGE_KIND,
} from "@/lib/knowledge/answer-version-record";
import { recordAuditEventSafe, AUDIT_EVENT_TYPES, AUDIT_OBJECT_TYPES } from "@/lib/audit";
import { buildGovernanceAuditMetadata, governanceAuditSnapshot } from "@/lib/audit/answer-governance-audit";

export type SeedingTopicResult =
  | { kind: "created"; answerId: string }
  | { kind: "skipped_exists"; answerId?: string }
  | { kind: "skipped_duplicate"; answerId: string }
  | { kind: "skipped_no_evidence" }
  | { kind: "skipped_low_quality"; reason: string; facts: string[] }
  | { kind: "failed"; error: string };

interface SeedChunk {
  id: string;
  content: string;
  docName: string;
  embedding: number[];
}

/**
 * SeedingService: orchestrates population of the Answer Library during
 * workspace onboarding using classified document evidence. When the parent
 * topic has a sub-control taxonomy entry (see subcontrol-taxonomy.ts) the
 * service creates one seeded answer per sub-control so the matcher can
 * compose question-specific responses from multiple fine-grained entries
 * instead of reusing a single generic paragraph.
 */
export class SeedingService {
  /**
   * High-level entry point to seed draft answers for an entire workspace.
   */
  static async runTopicSeeding(
    workspaceId: string,
  ): Promise<{ created: number; skipped: number }> {
    const slog = createScopedLogger({ workspaceId, stage: "seeding-batch" });
    slog.info("seeding:start");

    const topics = await TopicsService.resolveWorkspaceTopics(workspaceId);
    
    // 1. Intelligence-driven Scaffolding
    try {
      const { CompanyProfileService } = await import("@/modules/workspaces/company-profile-service");
      const { AnswerLibraryScaffoldingService } = await import("./answer-library-scaffolding-service");
      const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
      if (workspace) {
        const profile = await CompanyProfileService.build(workspace as any);
        await AnswerLibraryScaffoldingService.scaffold(workspaceId, profile);
      }
    } catch (err) {
      logger.warn("seeding:scaffolding:failed", { workspaceId, error: String(err) });
    }

    let createdCount = 0;
    let skippedCount = 0;

    for (const topic of topics) {
      try {
        const result = await SeedingService.seedSingleTopic(
          workspaceId,
          topic.id,
          topic.name,
          topic.key ?? null,
          topic.workspaceId ?? null,
        );
        if (result.kind === "created") createdCount++;
        else skippedCount++;
      } catch (err) {
        logger.error("seeding:topic:failed", { topicId: topic.id, error: String(err) });
        skippedCount++;
      }
    }

    slog.info("seeding:complete", { createdCount, skippedCount });
    return { created: createdCount, skipped: skippedCount };
  }

  /**
   * Per-topic seed. Branches on taxonomy:
   *  - If the topic has no sub-control entries in the taxonomy, keep the
   *    legacy single-answer seeded path.
   *  - Otherwise, iterate each sub-control, rank the topic's tagged chunks
   *    against the sub-control's seed prompt, and seed one answer per
   *    sub-control. Dedupe is unchanged — subControlKey + new titles +
   *    different chunk subsets naturally produce distinct fingerprints.
   */
  static async seedSingleTopic(
    workspaceId: string,
    topicId: string,
    topicName: string,
    topicKey?: string | null,
    topicWorkspaceId?: string | null,
  ): Promise<SeedingTopicResult> {
    const topAssociations = await prisma.sourceChunkTopic.findMany({
      where: {
        topicId,
        chunk: { workspaceId },
      },
      orderBy: { score: "desc" },
      // Overfetch so each sub-control has enough candidates to re-rank
      // against its own seed prompt without cross-contaminating.
      take: 30,
      include: {
        chunk: {
          include: { sourceDocument: true },
        },
      },
    });

    if (topAssociations.length === 0) {
      return { kind: "skipped_no_evidence" };
    }

    const chunkPool: SeedChunk[] = topAssociations.map((assoc) => ({
      id: assoc.chunkId,
      content: assoc.chunk.content,
      docName: assoc.chunk.sourceDocument.fileName,
      embedding: Array.isArray(assoc.chunk.embedding)
        ? (assoc.chunk.embedding as number[])
        : [],
    }));

    const subControls = getSubControls(topicKey);

    if (subControls.length === 0) {
      // Legacy single-answer path: top-5 chunks, one library row, no
      // subControlKey on the row.
      const topFive = chunkPool.slice(0, 5);
      return await SeedingService.seedOneAnswer({
        workspaceId,
        topicId,
        topicName,
        topicWorkspaceId: topicWorkspaceId ?? workspaceId,
        title: topicName,
        chunks: topFive,
        subControl: null,
      });
    }

    // Sub-control path: re-rank the chunk pool per sub-control, seed one
    // answer per sub-control. The most informative outcome for the caller
    // is "any created", so return "created" if at least one sub-control
    // was freshly seeded. Other statuses indicate the library is already
    // up-to-date or low-quality for this topic.
    let anyCreated = false;
    let lastSkip: SeedingTopicResult | null = null;
    for (const sub of subControls) {
      const result = await SeedingService.seedSubControlAnswer({
        workspaceId,
        topicId,
        topicName,
        topicWorkspaceId: topicWorkspaceId ?? workspaceId,
        subControl: sub,
        chunkPool,
      });
      logger.info("seeding:subcontrol:result", {
        workspaceId,
        topicId,
        topicKey,
        subControlKey: sub.key,
        kind: result.kind,
      });
      if (result.kind === "created") anyCreated = true;
      else lastSkip = result;
    }
    if (anyCreated) return { kind: "created", answerId: "subcontrol_batch" };
    return lastSkip ?? { kind: "skipped_exists" };
  }

  /** Re-rank the overfetched chunk pool against the sub-control's seed
   *  prompt by embedding-cosine, then run the shared seeding path. */
  private static async seedSubControlAnswer(args: {
    workspaceId: string;
    topicId: string;
    topicName: string;
    topicWorkspaceId: string;
    subControl: SubControl;
    chunkPool: SeedChunk[];
  }): Promise<SeedingTopicResult> {
    const { workspaceId, topicId, topicName, topicWorkspaceId, subControl, chunkPool } = args;

    let seedVector: number[] = [];
    try {
      seedVector = await EmbeddingService.getEmbedding(subControl.seedPrompt);
    } catch (err) {
      logger.warn("seeding:subcontrol:embed-failed", {
        workspaceId,
        subControlKey: subControl.key,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    const rankedChunks =
      seedVector.length > 0
        ? chunkPool
            .filter((c) => c.embedding.length > 0)
            .map((c) => ({
              c,
              cosine: SimilarityService.cosineSimilarity(seedVector, c.embedding),
            }))
            .sort((a, b) => b.cosine - a.cosine)
            .slice(0, 3)
            .map((r) => r.c)
        : chunkPool.slice(0, 3);

    if (rankedChunks.length === 0) {
      return { kind: "skipped_no_evidence" };
    }

    const title = `${topicName} - ${subControl.label}`;
    return await SeedingService.seedOneAnswer({
      workspaceId,
      topicId,
      topicName,
      topicWorkspaceId,
      title,
      chunks: rankedChunks,
      subControl,
    });
  }

  /** Shared transactional seed path used by BOTH the legacy single-answer
   *  branch and the per-sub-control iteration. Captures the original
   *  fingerprint + quality-gate + dedupe logic with two small additions:
   *   - writes `subControlKey` and `subControlLabels` when provided
   *   - includes the sub-control label in the computed embedding input
   *   - scopes the legacy-match check to the same `subControlKey` so
   *     seeding sub-control N does not collide with sub-control N-1 */
  private static async seedOneAnswer(args: {
    workspaceId: string;
    topicId: string;
    topicName: string;
    topicWorkspaceId: string;
    title: string;
    chunks: Array<Pick<SeedChunk, "id" | "content" | "docName">>;
    subControl: SubControl | null;
  }): Promise<SeedingTopicResult> {
    // Stale-Prisma-client guard. If `prisma generate` has not been re-run
    // after the subcontrol migration, this keyof assertion fails at compile
    // time and the developer gets a clear signal BEFORE runtime, instead of
    // a `tx.answerLibraryItem.findFirst ... Unknown argument subControlKey`
    // PrismaValidationError at request time. Zero runtime cost.
    type _AssertSubControlKey = Prisma.AnswerLibraryItemWhereInput["subControlKey"];
    const _assertKey: keyof Prisma.AnswerLibraryItemWhereInput = "subControlKey";
    void _assertKey;

    const { workspaceId, topicId, topicName, topicWorkspaceId, title, chunks, subControl } = args;
    const { CompanyProfileService } = await import("@/modules/workspaces/company-profile-service");
    const { prisma } = await import("@/lib/db/prisma");

    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: { 
        industry: true,
        productType: true,
        customerSegment: true,
      }
    });

    const profile = workspace ? CompanyProfileService.build(workspace as any) : undefined;

    const genTopicName = subControl
      ? `${topicName} - ${subControl.label}`
      : topicName;

    let generated: Awaited<ReturnType<typeof AnswerGenerationService.generateFromEvidence>>;
    try {
      generated = await AnswerGenerationService.generateFromEvidence(
        genTopicName,
        chunks,
        workspaceId,
        profile
      );
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      return { kind: "failed", error };
    }

    const scoring = ScoringService.evaluateQuality({
      answerText: generated.answer,
      concreteFacts: generated.concreteFacts || [],
      sourceRelevanceScore: generated.confidenceScore,
    });

    if (!scoring.isQualityPassed) {
      const reason =
        scoring.rejectionRationale || "Generated draft failed local quality assessment.";
      logger.warn("seeding:topic:quality-rejected", {
        workspaceId,
        topicName: genTopicName,
        subControlKey: subControl?.key ?? null,
        factCount: generated.concreteFacts?.length,
        rejectionReason: reason,
        draftPreview: (generated.answer ?? "").substring(0, 100) + "...",
      });
      return {
        kind: "skipped_low_quality",
        reason,
        facts: generated.concreteFacts || [],
      };
    }

    const { evidenceFingerprint, contentHash } = buildSeedDedupeKey({
      chunkIds: chunks.map((c) => c.id),
      title,
      answer: generated.answer,
    });

    const embeddingExtras = subControl
      ? subControlEmbeddingExtras(topicName, subControl)
      : undefined;
    const subControlLabels = subControl
      ? [subControl.label, ...subControl.keywords]
      : [];

    let createEmbedding: number[] = [];
    try {
      createEmbedding = await computeAnswerEmbedding(
        title,
        generated.answer,
        embeddingExtras,
      );
    } catch (err) {
      logger.warn("seeding:embedding:failed", {
        workspaceId,
        topicId,
        subControlKey: subControl?.key ?? null,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    try {
      const outcome = await prisma.$transaction(async (tx) => {
        const existingByFingerprint = await tx.answerLibraryItem.findFirst({
          where: {
            workspaceId,
            topicId,
            generationScope: "SEEDED",
            evidenceFingerprint,
            contentHash,
            status: { not: "ARCHIVED" },
          },
          select: { id: true },
        });

        if (existingByFingerprint) {
          await tx.answerLibraryItem.update({
            where: { id: existingByFingerprint.id, workspaceId },
            data: { lastVerified: new Date() },
          });
          logger.info("answer_seeding.skip_existing", {
            workspaceId,
            topicId,
            subControlKey: subControl?.key ?? null,
            existingAnswerId: existingByFingerprint.id,
            source: "fingerprint_match",
          });
          return { kind: "skipped_duplicate" as const, answerId: existingByFingerprint.id };
        }

        // Legacy safety net: during rollout an older row may exist without a
        // fingerprint populated. Scope the check to the SAME subControlKey so
        // seeding one sub-control does not falsely short-circuit another.
        const existingLegacy = await tx.answerLibraryItem.findFirst({
          where: {
            workspaceId,
            topicId,
            subControlKey: subControl?.key ?? null,
            status: { in: ["DRAFT", "APPROVED"] },
            OR: [
              { evidenceFingerprint: null },
              { contentHash: null },
              { generationScope: "MANUAL" },
            ],
          },
          select: { id: true },
        });

        if (existingLegacy) {
          logger.info("answer_seeding.skip_existing", {
            workspaceId,
            topicId,
            subControlKey: subControl?.key ?? null,
            existingAnswerId: existingLegacy.id,
            source: "legacy_match",
          });
          return { kind: "skipped_exists" as const, answerId: existingLegacy.id };
        }

        // 1. Resolve governance defaults
        const subControlGovernance = subControl
          ? await tx.subControlGovernance.findUnique({
              where: {
                workspaceId_topicId_subControlKey: {
                  workspaceId,
                  topicId,
                  subControlKey: subControl.key,
                },
              },
            })
          : null;

        const topicDefaults = await tx.knowledgeTopic.findFirst({
          where: { id: topicId, workspaceId: topicWorkspaceId },
          select: { ownerId: true, approverId: true },
        });

        const ownerId = subControlGovernance?.ownerId || topicDefaults?.ownerId || null;
        const approverId = subControlGovernance?.approverId || topicDefaults?.approverId || null;

        const created = await tx.answerLibraryItem.create({
          data: {
            workspace: { connect: { id: workspaceId } },
            topic: { connect: { id: topicId } },
            title,
            answer: generated.answer,
            status: "DRAFT",
            governanceStatus: "DRAFT",
            ...(ownerId ? { ownerUser: { connect: { id: ownerId } } } : {}),
            ...(approverId ? { approverUser: { connect: { id: approverId } } } : {}),
            confidenceScore: generated.confidenceScore,
            embedding: createEmbedding,
            generationScope: "SEEDED",
            evidenceFingerprint,
            contentHash,
            subControlKey: subControl?.key ?? null,
            subControlLabels,
          },
        });

        if (chunks.length > 0) {
          await tx.answerEvidence.createMany({
            data: chunks.map((c) => ({
              workspaceId,
              answerId: created.id,
              chunkId: c.id,
              quote: c.content.substring(0, 500),
            })),
            skipDuplicates: true,
          });
        }

        const persisted = await tx.answerLibraryItem.findFirst({
          where: { id: created.id, workspaceId },
        });
        if (!persisted) throw new Error("Seeded answer missing after create");
        const evRows = await tx.answerEvidence.findMany({
          where: { answerId: created.id, workspaceId },
          select: { chunkId: true, quote: true },
        });

        await recordAnswerLibraryVersion(tx, {
          workspaceId,
          answerId: persisted.id,
          versionNumber: 1,
          changedById: null,
          changeReason: subControl
            ? `Initial AI Seeding - ${subControl.label}`
            : "Initial AI Seeding during onboarding",
          resetApprovalRequired: false,
          changeDiffJson: null,
          evidenceSnapshotJson: evidenceSnapshotJsonValue(evRows),
          snapshot: itemToVersionSnapshot(persisted),
          changeKind: VERSION_CHANGE_KIND.SYSTEM,
        });

        logger.info("answer_seeding.create", {
          workspaceId,
          topicId,
          subControlKey: subControl?.key ?? null,
          answerId: created.id,
        });

        return { kind: "created" as const, answerId: created.id };
      });

      if (outcome.kind === "created") {
        const seededRow = await prisma.answerLibraryItem.findFirst({
          where: { id: outcome.answerId, workspaceId },
          select: {
            governanceStatus: true,
            approvalScope: true,
            exportSafe: true,
            status: true,
            nextReviewDueAt: true,
            reviewCadenceDays: true,
            ownerId: true,
            approverId: true,
            currentVersion: true,
          },
        });
        if (seededRow) {
          const seedReason = subControl
            ? `Initial AI Seeding - ${subControl.label}`
            : "Initial AI Seeding during onboarding";
          await recordAuditEventSafe({
            workspaceId,
            actorUserId: null,
            eventType: AUDIT_EVENT_TYPES.ANSWER_LIBRARY_VERSION_RECORDED,
            objectType: AUDIT_OBJECT_TYPES.ANSWER_LIBRARY_ITEM,
            objectId: outcome.answerId,
            metadata: {
              ...buildGovernanceAuditMetadata({
                action: "seed_initial",
                version: seededRow.currentVersion,
                source: "seeding",
                changeReason: seedReason,
                after: governanceAuditSnapshot(seededRow),
              }),
            },
          });
        }
        await flagAnswerForEvidenceChangeIfNeeded({
          workspaceId,
          answerId: outcome.answerId,
        });
      }
      return outcome;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        const constraintTarget = Array.isArray(err.meta?.target)
          ? (err.meta?.target as string[]).join(",")
          : String(err.meta?.target ?? "unknown");
        const canonical = await prisma.answerLibraryItem.findFirst({
          where: {
            workspaceId,
            topicId,
            generationScope: "SEEDED",
            evidenceFingerprint,
            contentHash,
            status: { not: "ARCHIVED" },
          },
          select: { id: true },
        });
        logger.warn("answer_seeding.dedupe_conflict", {
          workspaceId,
          topicId,
          subControlKey: subControl?.key ?? null,
          constraintTarget,
          existingAnswerId: canonical?.id ?? null,
        });
        if (canonical) {
          return { kind: "skipped_duplicate", answerId: canonical.id };
        }
      }
      const error = err instanceof Error ? err.message : String(err);
      logger.error("seeding:topic:persist-failed", {
        workspaceId,
        topicId,
        subControlKey: subControl?.key ?? null,
        error,
      });
      return { kind: "failed", error };
    }
  }
}
