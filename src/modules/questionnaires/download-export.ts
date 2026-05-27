import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logging/logger";
import { AUDIT_EVENT_TYPES, AUDIT_OBJECT_TYPES, recordAuditEventSafe } from "@/lib/audit";
import { getSignedDownloadUrl } from "@/lib/storage/s3-object-service";
import { ScopedResourceNotFoundError } from "@/lib/domain/scoped-resource-not-found";

export interface GetExportDownloadUrlParams {
  userId: string;
  workspaceId: string;
  jobId: string;
}

/**
 * Service to handle secure retrieval of persisted export artifacts.
 * 1. Verifies the ExportJob belongs to the authorized workspace.
 * 2. Generates a signed URL for the artifact in S3.
 * 3. Records an audit event.
 */
export async function getExportDownloadUrl(params: GetExportDownloadUrlParams) {
  const { userId, workspaceId, jobId } = params;

  // 1. Fetch ExportJob with Workspace Scope
  const job = await prisma.exportJob.findFirst({
    where: {
      id: jobId,
      workspaceId,
      status: "completed",
    },
  });

  if (!job || !job.storageKey) {
    logger.warn("exports:download:not-found", {
      userId,
      workspaceId,
      jobId,
    });
    throw new ScopedResourceNotFoundError("ExportJob", jobId, workspaceId);
  }

  // 2. Record Audit Event
  await recordAuditEventSafe({
    workspaceId,
    actorUserId: userId,
    eventType: AUDIT_EVENT_TYPES.EXPORT_DOWNLOADED,
    objectType: AUDIT_OBJECT_TYPES.EXPORT_JOB,
    objectId: job.id,
    metadata: { fileName: job.fileName, format: job.format },
  });

  // 3. Generate Signed URL
  const signedUrl = await getSignedDownloadUrl(workspaceId, job.storageKey);

  logger.info("exports:download:success", {
    userId,
    workspaceId,
    jobId,
  });

  return {
    signedUrl,
    fileName: job.fileName || `export.${job.format}`,
  };
}
