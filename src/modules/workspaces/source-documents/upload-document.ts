import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logging/logger";
import { createScopedLogger } from "@/lib/logging/scoped-logger";
import { AUDIT_EVENT_TYPES, AUDIT_OBJECT_TYPES, recordAuditEventSafe } from "@/lib/audit";
import { validateUpload } from "@/lib/storage/validate-upload";
import { uploadObject } from "@/lib/storage/storage-service";
import { buildStorageKey } from "@/lib/storage/storage-key";
import { requireStorageConfig } from "@/lib/storage/storage-env";
import { buildAuthContext } from "@/lib/auth/build-context";
import { enqueueParseJob } from "@/modules/workspaces/source-documents/parsing/parse-job-service";

export interface UploadSourceDocumentParams {
  request: Request;
  file: File;
  /** Optional onboarding context for audit trail (not stored on SourceDocument row). */
  onboardingAudit?: {
    onboardingSessionId?: string;
    recommendationId?: string;
    expectedDocumentType?: string;
    linkedTopicKeys?: string[];
    evidenceCategory?: string;
  };
}

/**
 * Service to handle source document upload:
 * 1. Resolves auth context and verifies workspace membership.
 * 2. Validates file metadata and size.
 * 3. Creates a PENDING record in the database.
 * 4. Uploads file content to storage.
 * 5. Updates record to UPLOADED or FAILED.
 * 6. Records audit events throughout the flow.
 */
export async function uploadSourceDocument(params: UploadSourceDocumentParams) {
  const { request, file, onboardingAudit } = params;

  // 1. Resolve Auth Context (Authentication + Workspace Membership)
  // This throws 401/403/409 errors handled by handleApiError.
  const auth = await buildAuthContext(request);
  const { userId, workspaceId } = auth;

  const originalName = file.name;
  const mimeType = file.type;
  const size = file.size;

  const slog = createScopedLogger({ 
    workspaceId, 
    userId, 
    stage: "upload",
    originalName 
  });

  slog.info("documents:upload:init", {
    size,
  });

  // 2. Validate upload (MVP: PDF, DOCX, TXT / CSV / XLSX are also in allowed set)
  validateUpload({
    mimeType,
    byteLength: size,
    originalName,
  });

  const arrayBuffer = await file.arrayBuffer();
  const body = new Uint8Array(arrayBuffer);

  // 3. Find Existing to determine versioning context
  // We look for the current "Latest" version of a document with the same name.
  const existing = await prisma.sourceDocument.findFirst({
    where: { workspaceId, originalName, uploadStatus: { not: "DELETED" }, isLatest: true },
  });

  const groupId = existing?.groupId ?? existing?.id ?? null;
  const version = (existing?.version ?? 0) + 1;

  const pendingStorageKey = `pending:${randomUUID()}`;

  // Always create a NEW record for versioning support
  let doc = await prisma.sourceDocument.create({
    data: {
      workspaceId,
      uploadedById: userId,
      originalName,
      fileName: originalName,
      mimeType,
      fileSizeBytes: size,
      storageKey: pendingStorageKey,
      storageBucket: "pending",
      uploadStatus: "PENDING",
      groupId, // We'll finalize this below if it's the first record
      version,
      isLatest: version === 1, // New standalone is latest, new version becomes latest only after success
    },
  });

  // Self-reference for first version
  if (!groupId) {
    doc = await prisma.sourceDocument.update({
      where: { id: doc.id, workspaceId },
      data: { groupId: doc.id },
    });
  }

  await recordAuditEventSafe({
    workspaceId,
    actorUserId: userId,
    eventType: AUDIT_EVENT_TYPES.SOURCE_DOCUMENT_UPLOAD_STARTED,
    objectType: AUDIT_OBJECT_TYPES.SOURCE_DOCUMENT,
    objectId: doc.id,
    metadata: {
      originalName,
      size,
      onboardingUpload: onboardingAudit,
    },
  });

  const cfg = requireStorageConfig();
  const storageKey = buildStorageKey(workspaceId, doc.id, originalName);

  try {
    // 4. Upload to Storage
    await uploadObject({
      key: storageKey,
      body,
      contentType: mimeType,
      contentLength: size,
      workspaceId,
    });


    // 5. Update record to UPLOADED and Rotate Active Version
    const updated = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // If this is a new version of an existing group, deactivate old latest
      if (doc.version > 1 && doc.groupId) {
        await tx.sourceDocument.updateMany({
          where: {
            workspaceId,
            groupId: doc.groupId,
            id: { not: doc.id },
            isLatest: true,
          },
          data: { isLatest: false },
        });
      }

      return tx.sourceDocument.update({
        where: { id: doc.id, workspaceId },
        data: {
          storageKey,
          storageBucket: cfg.bucket,
          uploadStatus: "UPLOADED",
          isLatest: true,
        },
      });
    });


    await recordAuditEventSafe({
      workspaceId,
      actorUserId: userId,
      eventType: AUDIT_EVENT_TYPES.SOURCE_DOCUMENT_UPLOAD_SUCCEEDED,
      objectType: AUDIT_OBJECT_TYPES.SOURCE_DOCUMENT,
      objectId: doc.id,
      metadata: { storageKey, bucket: cfg.bucket, onboardingUpload: onboardingAudit },
    });

    slog.info("documents:upload:success", {
      docId: doc.id,
    });

    // 6. Trigger Asynchronous Parsing
    const traceContext = {
      traceId: randomUUID(),
      stage: "upload-to-parse",
      workspaceId,
      sourceDocumentId: doc.id,
      triggeredById: userId,
      storageKey,
      mimeType,
      uploadStatus: updated.uploadStatus,
    };
    slog.info("documents:parse-trigger:start", traceContext);

    void enqueueParseJob({
      workspaceId,
      sourceDocumentId: doc.id,
      triggeredById: userId,
      correlationId: slog.getContext().correlationId,
    })
      .then((job) => {
        slog.info("documents:parse-trigger:success", {
          ...traceContext,
          parseJobId: job.id,
          parseJobStatus: job.status,
        });
      })
      .catch((err) => {
        slog.error("documents:parse-trigger:failed", {
          ...traceContext,
          error: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined,
        });
      });

    return { ...updated, isReused: doc.version > 1 };
  } catch (err) {
    // 6. Handle Failure
    slog.error("documents:upload:failed", {
      docId: doc.id,
      error: err instanceof Error ? err.message : String(err),
    });

    await prisma.sourceDocument.update({
      where: { id: doc.id, workspaceId },
      data: { uploadStatus: "FAILED" },
    });


    await recordAuditEventSafe({
      workspaceId,
      actorUserId: userId,
      eventType: AUDIT_EVENT_TYPES.SOURCE_DOCUMENT_UPLOAD_FAILED,
      objectType: AUDIT_OBJECT_TYPES.SOURCE_DOCUMENT,
      objectId: doc.id,
      metadata: { error: err instanceof Error ? err.message : String(err) },
    });

    throw err;
  }
}
