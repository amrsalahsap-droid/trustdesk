import { prisma, uncheckedPrisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logging/logger";
import { AUDIT_EVENT_TYPES, AUDIT_OBJECT_TYPES, recordAuditEventSafe } from "@/lib/audit";
import { downloadObject } from "@/lib/storage/storage-service";
import { ExtractorRegistry, PdfExtractor, DocxExtractor } from "./extractors";
import { ChunkingService } from "./chunking-service";
import { ClassificationService } from "./classification-service";
import { enqueueAnswerSeedingAfterParse } from "@/modules/workspaces/intelligence/answer-seeding-job-service";
import { EvidenceOrchestrationService } from "@/modules/workspaces/onboarding/evidence-orchestration-service";
import { createScopedLogger, ScopedLogger } from "@/lib/logging/scoped-logger";

export interface EnqueueParseJobParams {
  workspaceId: string;
  sourceDocumentId: string;
  triggeredById: string;
  correlationId?: string;
}

import { JobRobustnessService } from "@/modules/infra/job-robustness-service";

/**
 * Creates a new parse job record and triggers asynchronous processing.
 */
export async function enqueueParseJob(params: EnqueueParseJobParams) {
  const { workspaceId, sourceDocumentId, triggeredById, correlationId } = params;

  const slog = createScopedLogger({
    workspaceId,
    docId: sourceDocumentId,
    correlationId,
    stage: "parse-enqueue"
  });

  slog.info("parse-job:enqueue:start", {
    workspaceId,
    sourceDocumentId,
    triggeredById,
  });

  // 1. Create the database record
  let job;
  try {
    job = await prisma.sourceDocumentParseJob.create({
      data: {
        workspaceId,
        sourceDocumentId,
        triggeredById,
        status: "QUEUED",
      },
    });
  } catch (err) {
    slog.error("parse-job:enqueue:db-create-failed", {
      workspaceId,
      sourceDocumentId,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    throw err;
  }

  slog.info("parse-job:enqueue:db-created", {
    jobId: job.id,
    workspaceId,
    sourceDocumentId,
    status: job.status,
  });

  await recordAuditEventSafe({
    workspaceId,
    actorUserId: triggeredById,
    eventType: AUDIT_EVENT_TYPES.SOURCE_DOCUMENT_PARSE_JOB_CREATED,
    objectType: AUDIT_OBJECT_TYPES.SOURCE_DOCUMENT_PARSE_JOB,
    objectId: job.id,
    metadata: { sourceDocumentId, correlationId },
  });

  // 2. Trigger asynchronous background execution (non-blocking)
  slog.info("parse-job:enqueue:triggering-run", {
    jobId: job.id,
    workspaceId,
    sourceDocumentId,
  });

  void runParseJob(job.id, correlationId)
    .then(() => {
      slog.info("parse-job:enqueue:run-completed", {
        jobId: job.id,
        workspaceId,
        sourceDocumentId,
      });
    })
    .catch((err) => {
      slog.error("parse-job:enqueue:run-failed", {
        jobId: job.id,
        workspaceId,
        sourceDocumentId,
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      });
    });

  slog.info("parse-job:enqueue:complete", {
    jobId: job.id,
    workspaceId,
    sourceDocumentId,
    status: job.status,
  });

  return job;
}

/**
 * Handles the actual execution of a parse job.
 * Transitions statuses and performs document extraction.
 */
export async function runParseJob(jobId: string, correlationId?: string) {
  logger.info("parse-job:run:entry", { jobId, correlationId });

  // Use uncheckedPrisma to bootstrap the worker context
  const baseJob = await uncheckedPrisma.sourceDocumentParseJob.findUnique({
    where: { id: jobId },
    select: { workspaceId: true, sourceDocumentId: true, triggeredById: true, retryCount: true }
  });

  if (!baseJob) {
    logger.error("parse-job:not-found:bootstrap-failed", { jobId });
    return;
  }

  const slog = createScopedLogger({
    workspaceId: baseJob.workspaceId,
    docId: baseJob.sourceDocumentId,
    jobId,
    correlationId,
    retryCount: baseJob.retryCount,
    stage: "parse-run"
  });

  slog.info("parse-job:run:bootstrapped", {
    workspaceId: baseJob.workspaceId,
    sourceDocumentId: baseJob.sourceDocumentId,
    triggeredById: baseJob.triggeredById,
    retryCount: baseJob.retryCount,
  });

  const job = await prisma.sourceDocumentParseJob.findUnique({
    where: { id: jobId, workspaceId: baseJob.workspaceId },
    include: { sourceDocument: true },
  });

  if (!job) {
    slog.error("parse-job:not-found", { jobId, workspaceId: baseJob.workspaceId });
    return;
  }

  slog.info("parse-job:run:job-loaded", {
    jobId: job.id,
    jobStatus: job.status,
    workspaceId: job.workspaceId,
    sourceDocumentId: job.sourceDocumentId,
    storageKey: job.sourceDocument.storageKey,
    mimeType: job.sourceDocument.mimeType,
    uploadStatus: job.sourceDocument.uploadStatus,
  });

  // Idempotency check: don't process if already completed or in progress
  if (job.status === "COMPLETED" || job.status === "PROCESSING") {
    slog.warn("parse-job:already-processed-or-active", { status: job.status });
    return;
  }

  const now = new Date();
  try {
    // 1. Mark as PROCESSING and set tracking fields
    await prisma.sourceDocumentParseJob.update({
      where: { id: jobId, workspaceId: job.workspaceId },
      data: {
        status: "PROCESSING",
        startedAt: now,
        lastHeartbeatAt: now,
        retryCount: { increment: 1 }
      },
    });

    await recordAuditEventSafe({
      workspaceId: job.workspaceId,
      actorUserId: job.triggeredById,
      eventType: AUDIT_EVENT_TYPES.SOURCE_DOCUMENT_PARSE_JOB_STARTED,
      objectType: AUDIT_OBJECT_TYPES.SOURCE_DOCUMENT_PARSE_JOB,
      objectId: jobId,
    });

    slog.info("parse-job:run:status-processing", {
      status: "PROCESSING",
      startedAt: now,
      retryCount: job.retryCount + 1
    });

    // 2. RETRIEVE DOCUMENT FROM STORAGE
    slog.info("parse-job:run:downloading:start", {
      storageKey: job.sourceDocument.storageKey,
      workspaceId: job.workspaceId,
    });
    let buffer: Buffer;
    try {
      buffer = await downloadObject(job.workspaceId, job.sourceDocument.storageKey);
      slog.info("parse-job:run:downloading:success", {
        storageKey: job.sourceDocument.storageKey,
        bufferSize: buffer.length,
      });
    } catch (err) {
      slog.error("parse-job:run:downloading:failed", {
        storageKey: job.sourceDocument.storageKey,
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      });
      throw err;
    }
    await JobRobustnessService.heartbeat("PARSE", jobId);

    // 3. IDENTIFY & EXECUTE EXTRACTOR
    slog.info("parse-job:run:extractor:selecting", { mimeType: job.sourceDocument.mimeType });
    const extractor = ExtractorRegistry.getExtractor(job.sourceDocument.mimeType);
    if (!extractor) {
      slog.error("parse-job:run:extractor:not-found", {
        mimeType: job.sourceDocument.mimeType,
        availableExtractors: ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain"],
      });
      throw new Error(`No extractor available for mimeType: ${job.sourceDocument.mimeType}`);
    }
    slog.info("parse-job:run:extractor:selected", {
      mimeType: job.sourceDocument.mimeType,
      extractorType: extractor === PdfExtractor ? "PDF" : extractor === DocxExtractor ? "DOCX" : "TXT",
    });

    slog.info("parse-job:run:extracting:start", { bufferSize: buffer.length });
    let result: { fullText: string; pageCount?: number; pages?: any; metadata?: any };
    try {
      result = await extractor.extract(buffer);
      slog.info("parse-job:run:extracting:success", {
        textLength: result.fullText.length,
        pageCount: result.pageCount,
        hasPages: !!result.pages,
        hasMetadata: !!result.metadata,
        preview: result.fullText.substring(0, 200),
      });
    } catch (err) {
      slog.error("parse-job:run:extracting:failed", {
        error: err instanceof Error ? err.message : String(err),
        errorName: err instanceof Error ? err.name : "Unknown",
        stack: err instanceof Error ? err.stack : undefined,
      });
      throw err;
    }
    await JobRobustnessService.heartbeat("PARSE", jobId);

    // 4. PERSIST EXTRACTED CONTENT
    slog.info("parse-job:run:persisting:start", {
      sourceDocumentId: job.sourceDocumentId,
      workspaceId: job.workspaceId,
      pageCount: result.pageCount,
      textLength: result.fullText.length,
    });
    try {
      await prisma.sourceDocumentContent.upsert({
        where: { sourceDocumentId: job.sourceDocumentId, workspaceId: job.workspaceId },
        update: {
          fullText: result.fullText,
          pageCount: result.pageCount,
          pagesJson: (result.pages as any) || null,
          metadataJson: (result.metadata as any) || null,
        },
        create: {
          workspaceId: job.workspaceId,
          sourceDocumentId: job.sourceDocumentId,
          fullText: result.fullText,
          pageCount: result.pageCount,
          pagesJson: (result.pages as any) || null,
          metadataJson: (result.metadata as any) || null,
        },
      });
      slog.info("parse-job:run:persisting:success", {
        sourceDocumentId: job.sourceDocumentId,
        workspaceId: job.workspaceId,
      });
    } catch (err) {
      slog.error("parse-job:run:persisting:failed", {
        sourceDocumentId: job.sourceDocumentId,
        workspaceId: job.workspaceId,
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      });
      throw err;
    }
    await JobRobustnessService.heartbeat("PARSE", jobId);

    // 5. EXECUTE CHUNKING
    slog.info("parse-job:run:chunking:start", {
      workspaceId: job.workspaceId,
      sourceDocumentId: job.sourceDocumentId,
    });
    let chunks: { id: string }[];
    try {
      chunks = await ChunkingService.runChunking(job.workspaceId, job.sourceDocumentId);
      slog.info("parse-job:run:chunking:success", {
        workspaceId: job.workspaceId,
        sourceDocumentId: job.sourceDocumentId,
        chunkCount: chunks.length,
      });
    } catch (err) {
      slog.error("parse-job:run:chunking:failed", {
        workspaceId: job.workspaceId,
        sourceDocumentId: job.sourceDocumentId,
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      });
      throw err;
    }
    await JobRobustnessService.heartbeat("PARSE", jobId);

    // 6. Topic classification + async answer seeding
    if (chunks.length > 0) {
      slog.info("parse-job:run:classification:start", {
        workspaceId: job.workspaceId,
        sourceDocumentId: job.sourceDocumentId,
        chunkCount: chunks.length,
      });
      try {
        const matchCount = await ClassificationService.classifyDocumentChunks(job.workspaceId, job.sourceDocumentId);
        slog.info("parse-job:run:classification:success", {
          workspaceId: job.workspaceId,
          sourceDocumentId: job.sourceDocumentId,
          matchCount,
        });
      } catch (err) {
        slog.error("parse-job:run:classification:failed", {
          workspaceId: job.workspaceId,
          sourceDocumentId: job.sourceDocumentId,
          error: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined,
        });
        // Continue even if classification fails - don't block seeding
      }

      slog.info("parse-job:run:seeding-enqueue:start", {
        workspaceId: job.workspaceId,
        sourceDocumentId: job.sourceDocumentId,
        parseJobId: jobId,
      });
      try {
        const seedResult = await enqueueAnswerSeedingAfterParse({
          workspaceId: job.workspaceId,
          sourceDocumentId: job.sourceDocumentId,
          parseJobId: jobId,
        });
        slog.info("parse-job:run:seeding-enqueue:success", {
          workspaceId: job.workspaceId,
          sourceDocumentId: job.sourceDocumentId,
          parseJobId: jobId,
          seedJobId: seedResult.jobId,
        });
      } catch (err) {
        slog.error("parse-job:run:seeding-enqueue:failed", {
          workspaceId: job.workspaceId,
          sourceDocumentId: job.sourceDocumentId,
          parseJobId: jobId,
          error: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined,
        });
        // Continue even if seeding enqueue fails
      }
    } else {
      slog.warn("parse-job:run:classification:skipped", {
        workspaceId: job.workspaceId,
        sourceDocumentId: job.sourceDocumentId,
        reason: "no-chunks",
      });
    }

    // 7. Verify Content Persistence before final status update
    const contentCheck = await prisma.sourceDocumentContent.findUnique({
      where: { sourceDocumentId: job.sourceDocumentId, workspaceId: job.workspaceId }
    });

    if (!contentCheck) {
      throw new Error("Terminal state reached without persisted content record");
    }

    // 8. Mark as COMPLETED
    const finalNow = new Date();
    await prisma.sourceDocumentParseJob.update({
      where: { id: jobId, workspaceId: job.workspaceId },
      data: { 
        status: "COMPLETED",
        finishedAt: finalNow,
        lastHeartbeatAt: finalNow
      },
    });

    await recordAuditEventSafe({
      workspaceId: job.workspaceId,
      actorUserId: job.triggeredById,
      eventType: AUDIT_EVENT_TYPES.SOURCE_DOCUMENT_PARSE_JOB_COMPLETED,
      objectType: AUDIT_OBJECT_TYPES.SOURCE_DOCUMENT_PARSE_JOB,
      objectId: jobId,
    });

    slog.info("parse-job:run:completed", {
      status: "COMPLETED",
      finishedAt: finalNow,
      chunkCount: chunks.length,
      durationMs: finalNow.getTime() - now.getTime(),
    });

    // 9. Trigger Evidence Orchestration (Non-blocking)
    // Automatically categorize and link uploaded evidence to topics and readiness state
    void (async () => {
        try {
            // Get the extracted text for orchestration
            const content = await prisma.sourceDocumentContent.findUnique({
                where: { sourceDocumentId: job.sourceDocumentId, workspaceId: job.workspaceId },
                select: { fullText: true, metadataJson: true },
            });

            if (content?.fullText) {
                const orchestrationResult = await EvidenceOrchestrationService.orchestrateEvidence(
                    job.sourceDocumentId,
                    job.workspaceId,
                    job.triggeredById,
                    {
                        filename: job.sourceDocument.originalName,
                        extractedText: content.fullText,
                        uploadContext: "document_upload",
                        orchestrationSessionId: `parse-${job.id}`,
                    }
                );

                slog.info("parse-job:evidence-orchestration:success", {
                    workspaceId: job.workspaceId,
                    sourceDocumentId: job.sourceDocumentId,
                    documentType: orchestrationResult.documentType,
                    category: orchestrationResult.category,
                    linkedTopics: orchestrationResult.linkedTopics.length,
                    readinessImpact: orchestrationResult.readinessImpact.readinessScoreDelta,
                });
            } else {
                slog.warn("parse-job:evidence-orchestration:skipped", {
                    workspaceId: job.workspaceId,
                    sourceDocumentId: job.sourceDocumentId,
                    reason: "no_extracted_text",
                });
            }
        } catch (err) {
            slog.error("parse-job:evidence-orchestration:failed", { 
                workspaceId: job.workspaceId,
                sourceDocumentId: job.sourceDocumentId,
                error: String(err) 
            });
        }
    })();

    // 10. Trigger Background Discovery (Non-blocking)
    // D10-EN-02: Proactively scan for new themes once document chunks are available
    void (async () => {
        try {
            const { TopicDiscoveryService } = await import("@/modules/knowledge/topics/topic-discovery-service");
            await TopicDiscoveryService.discoverNewTopics(job.workspaceId);
        } catch (err) {
            slog.error("parse-job:auto-discovery:failed", { 
                workspaceId: job.workspaceId, 
                error: String(err) 
            });
        }
    })();

  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    const failureCode = errorMsg.includes("extractor") ? "EXTRACTOR_MISSING" : "PARSE_ERROR";
    const failNow = new Date();
    slog.error("parse-job:run:caught-exception", {
      error: errorMsg,
      failureCode,
      errorName: err instanceof Error ? err.name : "Unknown",
      stack: err instanceof Error ? err.stack : undefined,
    });

    // 7. Mark as FAILED
    await prisma.sourceDocumentParseJob.update({
      where: { id: jobId, workspaceId: job.workspaceId },
      data: { 
        status: "FAILED",
        errorMessage: errorMsg,
        failureCode,
        finishedAt: failNow,
        lastHeartbeatAt: failNow
      },
    });

    await recordAuditEventSafe({
      workspaceId: job.workspaceId,
      actorUserId: job.triggeredById,
      eventType: AUDIT_EVENT_TYPES.SOURCE_DOCUMENT_PARSE_JOB_FAILED,
      objectType: AUDIT_OBJECT_TYPES.SOURCE_DOCUMENT_PARSE_JOB,
      objectId: jobId,
      metadata: { error: errorMsg },
    });

    slog.error("parse-job:failed", { 
      status: "FAILED",
      failureCode,
      error: errorMsg,
      finishedAt: failNow
    });
  }
}

/**
 * Safely retries a failed parse job.
 */
export async function retryParseJob(jobId: string, workspaceId: string, correlationId?: string) {
    const job = await prisma.sourceDocumentParseJob.findUnique({
        where: { id: jobId, workspaceId }
    });

    if (!job || job.status !== 'FAILED') {
        throw new Error("Only failed jobs can be manually retried");
    }

    // Reset job and re-enqueue
    await prisma.sourceDocumentParseJob.update({
        where: { id: jobId, workspaceId },
        data: { status: 'QUEUED', errorMessage: null, retryCount: 0 }
    });


    void runParseJob(jobId, correlationId).catch((err) => {
        logger.error("parse-job:retry:unhandled-exception", { jobId, correlationId, error: String(err) });
    });
}
