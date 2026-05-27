import { prisma, uncheckedPrisma } from "@/lib/db/prisma";
import { AnswerSeedingTopicRunStatus } from "@prisma/client";
import { logger } from "@/lib/logging/logger";
import { createScopedLogger } from "@/lib/logging/scoped-logger";
import { SeedingService, type SeedingTopicResult } from "./seeding-service";
import { JobRobustnessService } from "@/modules/infra/job-robustness-service";
import { TopicsService } from "@/modules/knowledge/topics/topics-service";

/** Pure helper for tests and job completion logic (D10-EN-05). */
export function computeAnswerSeedingJobTerminalStatus(
  statuses: AnswerSeedingTopicRunStatus[],
): "COMPLETED" | "PARTIAL" | "FAILED" {
  if (statuses.length === 0) return "COMPLETED";
  const hasFailed = statuses.some((s) => s === "FAILED");
  const hasPositive = statuses.some(
    (s) => s === "SUCCEEDED" || s === "SKIPPED_EXISTS" || s === "SKIPPED_NO_EVIDENCE",
  );
  if (!hasFailed) return "COMPLETED";
  return hasPositive ? "PARTIAL" : "FAILED";
}

/** D10-EN-05: Enqueue workspace answer seeding after parse chunking + classification (async, non-blocking). */
export async function enqueueAnswerSeedingAfterParse(params: {
  workspaceId: string;
  sourceDocumentId: string;
  parseJobId: string;
  correlationId?: string;
}): Promise<{ jobId: string }> {
  const { aiConfig } = require("@/lib/ai/ai-config-service");
  if (!aiConfig.isGenerationEnabled) {
    logger.warn("answer-seeding:aborted:generation-disabled", { workspaceId: params.workspaceId });
    return { jobId: "auto-skipped" };
  }
  const { workspaceId, sourceDocumentId, parseJobId, correlationId } = params;

  const slog = createScopedLogger({ 
    workspaceId, 
    docId: sourceDocumentId, 
    correlationId,
    stage: "seeding-enqueue" 
  });

  const topicIds = await listSeedableTopicIds(workspaceId);
  if (topicIds.length === 0) {
    slog.info("answer-seeding:enqueue:no-topics");
    const job = await prisma.answerSeedingJob.create({
      data: {
        workspaceId,
        status: "COMPLETED",
        triggerSourceDocumentId: sourceDocumentId,
        triggerParseJobId: parseJobId,
        startedAt: new Date(),
        finishedAt: new Date(),
      },
    });
    return { jobId: job.id };
  }

  const existingQueued = await prisma.answerSeedingJob.findFirst({
    where: { workspaceId, status: "QUEUED" },
    orderBy: { createdAt: "asc" },
    include: { topicRuns: { select: { topicId: true } } },
  });

  if (existingQueued) {
    await prisma.answerSeedingJob.update({
      where: { id: existingQueued.id, workspaceId },
      data: {

        triggerSourceDocumentId: sourceDocumentId,
        triggerParseJobId: parseJobId,
      },
    });
    const existingTopicIds = new Set(existingQueued.topicRuns.map((r) => r.topicId));
    const missing = topicIds.filter((id) => !existingTopicIds.has(id));
    if (missing.length > 0) {
      await prisma.answerSeedingTopicRun.createMany({
        data: missing.map((topicId) => ({
          workspaceId,
          seedingJobId: existingQueued.id,
          topicId,
          status: "PENDING" as const,
        })),
        skipDuplicates: true,
      });
    }
    void processAnswerSeedingJob(existingQueued.id);
    return { jobId: existingQueued.id };
  }

  const job = await prisma.answerSeedingJob.create({
    data: {
      workspaceId,
      status: "QUEUED",
      triggerSourceDocumentId: sourceDocumentId,
      triggerParseJobId: parseJobId,
      topicRuns: {
        create: topicIds.map((topicId) => ({
          workspaceId,
          topicId,
          status: "PENDING" as const,
        })),
      },
    },
  });

  slog.info("answer-seeding:enqueued", { jobId: job.id, topicCount: topicIds.length });
  void processAnswerSeedingJob(job.id, correlationId);
  return { jobId: job.id };
}

async function listSeedableTopicIds(workspaceId: string): Promise<string[]> {
  const topics = await TopicsService.resolveWorkspaceTopics(workspaceId);
  return topics.map((t) => t.id);
}

function mapResultToTopicStatus(result: SeedingTopicResult): {
  status: "SUCCEEDED" | "SKIPPED_NO_EVIDENCE" | "SKIPPED_EXISTS" | "FAILED";
  answerLibraryItemId?: string;
  errorMessage?: string;
} {
  switch (result.kind) {
    case "created":
      return { status: "SUCCEEDED", answerLibraryItemId: result.answerId };
    case "skipped_exists":
      return { status: "SKIPPED_EXISTS", answerLibraryItemId: result.answerId };
    case "skipped_duplicate":
      // Fingerprint-level dedupe hit (or P2002 recovery). Treat as
      // SKIPPED_EXISTS so the job terminal classification in
      // computeAnswerSeedingJobTerminalStatus stays correct without
      // needing a new enum value / migration.
      return { status: "SKIPPED_EXISTS", answerLibraryItemId: result.answerId };
    case "skipped_no_evidence":
      return { status: "SKIPPED_NO_EVIDENCE" };
    case "skipped_low_quality": 
      return { 
        status: "REJECTED_LOW_QUALITY" as any, 
        errorMessage: result.reason 
      };
    case "failed":
      return { status: "FAILED", errorMessage: result.error };
    default:
      return { status: "FAILED", errorMessage: "Unknown outcome" };
  }
}

/** Process a single seeding job (claim QUEUED → RUNNING, then per-topic). Fire-and-forget safe. */
export async function processAnswerSeedingJob(jobId: string, correlationId?: string): Promise<void> {
  // Use unchecked client to bootstrap workspace context
  const baseJob = await uncheckedPrisma.answerSeedingJob.findUnique({
    where: { id: jobId },
    select: { workspaceId: true, triggerSourceDocumentId: true }
  });

  if (!baseJob) {
    logger.error("answer-seeding:not-found:bootstrap-failed", { jobId });
    return;
  }

  const { workspaceId, triggerSourceDocumentId } = baseJob;
  const now = new Date();

  const claimed = await prisma.answerSeedingJob.updateMany({
    where: { id: jobId, status: "QUEUED", workspaceId },
    data: {
      status: "RUNNING",
      startedAt: now,
      lastHeartbeatAt: now,
      attempt: { increment: 1 },
    },
  });

  if (claimed.count === 0) {
    logger.info("answer-seeding:claim-skipped", { jobId, workspaceId });
    return;
  }

  const slog = createScopedLogger({ 
    workspaceId, 
    docId: triggerSourceDocumentId ?? undefined, 
    correlationId,
    stage: "seeding-run" 
  });

  try {
    const runs = await prisma.answerSeedingTopicRun.findMany({
      where: { seedingJobId: jobId, status: { in: ["PENDING", "FAILED"] }, workspaceId },
      include: { topic: { select: { name: true, key: true } } },
    });


    for (const run of runs) {
      try {
        const result = await SeedingService.seedSingleTopic(
          workspaceId,
          run.topicId,
          run.topic.name,
          run.topic.key ?? null,
        );
        const mapped = mapResultToTopicStatus(result);
        await prisma.answerSeedingTopicRun.update({
          where: { id: run.id, workspaceId },
          data: {

            status: mapped.status,
            answerLibraryItemId: mapped.answerLibraryItemId ?? null,
            errorMessage: mapped.errorMessage ?? null,
            attemptCount: { increment: 1 },
          },
        });
        await JobRobustnessService.heartbeat("SEEDING", jobId);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await prisma.answerSeedingTopicRun.update({
          where: { id: run.id, workspaceId },
          data: {

            status: "FAILED",
            errorMessage: msg.slice(0, 2000),
            attemptCount: { increment: 1 },
          },
        });
        logger.error("answer-seeding:topic-run-exception", { jobId, topicId: run.topicId, error: msg });
      }
    }

    const allRuns = await prisma.answerSeedingTopicRun.findMany({
      where: { seedingJobId: jobId, workspaceId },
      select: { status: true },
    });


    const jobStatus = computeAnswerSeedingJobTerminalStatus(allRuns.map((r) => r.status));
    const hasFailed = allRuns.some((r) => r.status === "FAILED");
    const finalNow = new Date();

    await prisma.answerSeedingJob.update({
      where: { id: jobId, workspaceId },
      data: {

        status: jobStatus,
        finishedAt: finalNow,
        lastHeartbeatAt: finalNow,
        lastError:
          hasFailed && jobStatus === "FAILED"
            ? "All topics failed or produced no recoverable outcome"
            : null,
      },
    });

    logger.info("answer-seeding:job-finished", { jobId, jobStatus });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const failNow = new Date();
    await prisma.answerSeedingJob.update({
      where: { id: jobId, workspaceId },
      data: {

        status: "FAILED",
        failureCode: "SEEDING_ERROR",
        finishedAt: failNow,
        lastHeartbeatAt: failNow,
        lastError: msg.slice(0, 2000),
      },
    });
    logger.error("answer-seeding:job-failed", { jobId, error: msg });
  }
}

/** D10-EN-05: Create a new queued job (e.g. after PARTIAL/FAILED) and start processing. */
export async function enqueueAnswerSeedingRetry(workspaceId: string): Promise<{ jobId: string }> {
  const topicIds = await listSeedableTopicIds(workspaceId);
  if (topicIds.length === 0) {
    const job = await prisma.answerSeedingJob.create({
      data: {
        workspaceId,
        status: "COMPLETED",
        startedAt: new Date(),
        finishedAt: new Date(),
      },
    });
    return { jobId: job.id };
  }

  const job = await prisma.answerSeedingJob.create({
    data: {
      workspaceId,
      status: "QUEUED",
      topicRuns: {
        create: topicIds.map((topicId) => ({
          workspaceId,
          topicId,
          status: "PENDING" as const,
        })),
      },
    },
  });
  void processAnswerSeedingJob(job.id);
  return { jobId: job.id };
}

export async function getLatestAnswerSeedingJobStatus(workspaceId: string) {
  const job = await prisma.answerSeedingJob.findFirst({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
    include: {
      topicRuns: { select: { status: true } },
    },
  });
  if (!job) return null;

  const counts = job.topicRuns.reduce(
    (acc, r) => {
      acc[r.status] = (acc[r.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  return {
    jobId: job.id,
    status: job.status,
    attempt: job.attempt,
    lastError: job.lastError,
    startedAt: job.startedAt?.toISOString() ?? null,
    finishedAt: job.finishedAt?.toISOString() ?? null,
    createdAt: job.createdAt.toISOString(),
    topicStatusCounts: counts,
    totalTopics: job.topicRuns.length,
  };
}
