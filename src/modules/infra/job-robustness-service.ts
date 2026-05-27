import { prisma, uncheckedPrisma } from "@/lib/db/prisma";
import { createScopedLogger } from "@/lib/logging/scoped-logger";
import { logger } from "@/lib/logging/logger";

const HEARTBEAT_STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
const PARSE_JOB_HARD_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes
const SEEDING_JOB_HARD_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

export type JobType = "PARSE" | "SEEDING";

export class JobRobustnessService {
  /**
   * Update the heartbeat for a running job.
   */
  static async heartbeat(type: JobType, jobId: string) {
    const now = new Date();
    try {
      if (type === "PARSE") {
        await uncheckedPrisma.sourceDocumentParseJob.update({
          where: { id: jobId },
          data: { lastHeartbeatAt: now }
        });
      } else {
        await uncheckedPrisma.answerSeedingJob.update({
          where: { id: jobId },
          data: { lastHeartbeatAt: now }
        });
      }
    } catch (err) {
      // Don't crash the job just because heartbeat failed
      logger.warn("job-robustness:heartbeat-failed", { type, jobId, error: String(err) });
    }
  }

  /**
   * Scans for PROCESSING/RUNNING jobs that haven't pulsed a heartbeat recently or
   * have exceeded their hard execution timeout.
   * Marks them as FAILED with a STALE_ORPHAN code.
   */
  static async recoverStaleJobs() {
    const now = new Date();
    const staleHeartbeatTime = new Date(Date.now() - HEARTBEAT_STALE_THRESHOLD_MS);
    const staleParseTime = new Date(Date.now() - PARSE_JOB_HARD_TIMEOUT_MS);
    const staleSeedingTime = new Date(Date.now() - SEEDING_JOB_HARD_TIMEOUT_MS);

    const slog = createScopedLogger({ stage: "job-recovery" });
    slog.info("job-robustness:recovery-start", { 
      heartbeatThresholdMs: HEARTBEAT_STALE_THRESHOLD_MS,
      parseHardTimeoutMs: PARSE_JOB_HARD_TIMEOUT_MS
    });

    // 1. Recover Parse Jobs using unchecked client
    const staleParseJobs = await uncheckedPrisma.sourceDocumentParseJob.findMany({
      where: {
        status: "PROCESSING",
        OR: [
          // Heartbeat expired
          { lastHeartbeatAt: { lt: staleHeartbeatTime } },
          { lastHeartbeatAt: null, updatedAt: { lt: staleHeartbeatTime } },
          // Hard timeout exceeded (total execution time)
          { startedAt: { lt: staleParseTime } }
        ]
      },
      select: { id: true, workspaceId: true, sourceDocumentId: true, retryCount: true, startedAt: true, lastHeartbeatAt: true }
    });

    for (const job of staleParseJobs) {
      const reason = job.startedAt && job.startedAt < staleParseTime ? "HARD_TIMEOUT" : "HEARTBEAT_EXPIRED";
      
      slog.warn("job-robustness:recovering-parse-job", { 
        jobId: job.id, 
        workspaceId: job.workspaceId, 
        docId: job.sourceDocumentId,
        reason,
        startedAt: job.startedAt,
        lastHeartbeatAt: job.lastHeartbeatAt,
        retryCount: job.retryCount
      });

      await uncheckedPrisma.sourceDocumentParseJob.update({
        where: { id: job.id },
        data: {
          status: "FAILED",
          failureCode: "STALE_ORPHAN",
          errorMessage: reason === "HARD_TIMEOUT" 
            ? "Job exceeded maximum allowed execution time (15m)." 
            : "Job execution was interrupted or timed out (no heartbeat).",
          staleDetectedAt: now,
          finishedAt: now
        }
      });
    }

    // 2. Recover Seeding Jobs using unchecked client
    const staleSeedingJobs = await uncheckedPrisma.answerSeedingJob.findMany({
      where: {
        status: "RUNNING",
        OR: [
          // Heartbeat expired
          { lastHeartbeatAt: { lt: staleHeartbeatTime } },
          { lastHeartbeatAt: null, updatedAt: { lt: staleHeartbeatTime } },
          // Hard timeout exceeded
          { startedAt: { lt: staleSeedingTime } }
        ]
      },
      select: { id: true, workspaceId: true, triggerSourceDocumentId: true, startedAt: true }
    });

    for (const job of staleSeedingJobs) {
      const reason = job.startedAt && job.startedAt < staleSeedingTime ? "HARD_TIMEOUT" : "HEARTBEAT_EXPIRED";

      slog.warn("job-robustness:recovering-seeding-job", { 
        jobId: job.id, 
        workspaceId: job.workspaceId, 
        docId: job.triggerSourceDocumentId,
        reason
      });

      await uncheckedPrisma.answerSeedingJob.update({
        where: { id: job.id },
        data: {
          status: "FAILED",
          failureCode: "STALE_ORPHAN",
          lastError: reason === "HARD_TIMEOUT"
            ? "Job exceeded maximum allowed execution time (30m)."
            : "Job execution was interrupted or timed out (no heartbeat).",
          staleDetectedAt: now,
          finishedAt: now
        }
      });
    }

    slog.info("job-robustness:recovery-complete", { 
      parseRecovered: staleParseJobs.length, 
      seedingRecovered: staleSeedingJobs.length 
    });

    return {
      staleParseJobs,
      staleSeedingJobs
    };
  }
}
