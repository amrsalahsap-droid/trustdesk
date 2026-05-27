import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { workspaceCreateData, workspaceWhere } from "@/lib/db/workspace-scope";
import { authorizeRole } from "@/lib/auth/authorize-role";
import type { AuthContext } from "@/lib/auth/types";
import { buildStorageKey } from "@/lib/storage/storage-key";
import { validateUpload } from "@/lib/storage/validate-upload";
import { deleteObject, uploadObject } from "@/lib/storage/storage-service";
import { requireStorageConfig } from "@/lib/storage/storage-env";
import { StorageConfigError, StorageUploadError } from "@/lib/storage/errors";
import { AUDIT_EVENT_TYPES, AUDIT_OBJECT_TYPES, recordAuditEventSafe } from "@/lib/audit";
import { logger } from "@/lib/logging/logger";

export type TestUploadFileInput = {
  buffer: Uint8Array;
  originalName: string;
  mimeType: string;
  byteLength: number;
};

/**
 * Foundation path: validate file, persist metadata (PENDING), upload bytes, mark UPLOADED.
 * On failure after DB row exists, sets FAILED and best-effort deletes the object.
 */
export async function testUploadSourceDocument(
  ctx: AuthContext,
  input: TestUploadFileInput,
): Promise<{ id: string; storageKey: string }> {
  authorizeRole(ctx, ["OWNER", "ADMIN", "EDITOR"]);

  validateUpload({
    mimeType: input.mimeType,
    byteLength: input.byteLength,
    originalName: input.originalName,
  });

  const cfg = requireStorageConfig();
  const documentId = randomUUID();
  const storageKey = buildStorageKey(ctx.workspaceId, documentId, input.originalName);
  const safeFileName = storageKey.split("/").pop() ?? "unnamed";

  await prisma.sourceDocument.create({
    data: workspaceCreateData(ctx, {
      id: documentId,
      uploadedById: ctx.userId,
      fileName: safeFileName,
      originalName: input.originalName.slice(0, 512),
      mimeType: input.mimeType,
      fileSizeBytes: input.byteLength,
      storageKey,
      storageBucket: cfg.bucket,
      uploadStatus: "PENDING",
    }),
  });

  await recordAuditEventSafe({
    workspaceId: ctx.workspaceId,
    actorUserId: ctx.userId,
    eventType: AUDIT_EVENT_TYPES.SOURCE_DOCUMENT_RECORD_CREATED,
    objectType: AUDIT_OBJECT_TYPES.SOURCE_DOCUMENT,
    objectId: documentId,
    metadata: {
      fileName: safeFileName,
      mimeType: input.mimeType,
      status: "PENDING",
      storageKeyPrefix: storageKey.slice(0, 120),
    },
  });

  await recordAuditEventSafe({
    workspaceId: ctx.workspaceId,
    actorUserId: ctx.userId,
    eventType: AUDIT_EVENT_TYPES.SOURCE_DOCUMENT_UPLOAD_STARTED,
    objectType: AUDIT_OBJECT_TYPES.SOURCE_DOCUMENT,
    objectId: documentId,
    metadata: { mimeType: input.mimeType, byteLength: input.byteLength },
  });

  try {
    await uploadObject({
      key: storageKey,
      body: input.buffer,
      contentType: input.mimeType,
      contentLength: input.byteLength,
      workspaceId: ctx.workspaceId,
    });


    await prisma.sourceDocument.updateMany({
      where: workspaceWhere(ctx, { id: documentId }),
      data: { uploadStatus: "UPLOADED" },
    });

    logger.info("documents:test-upload:complete", {
      userId: ctx.userId,
      workspaceId: ctx.workspaceId,
      documentId,
    });

    await recordAuditEventSafe({
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.userId,
      eventType: AUDIT_EVENT_TYPES.SOURCE_DOCUMENT_UPLOAD_SUCCEEDED,
      objectType: AUDIT_OBJECT_TYPES.SOURCE_DOCUMENT,
      objectId: documentId,
      metadata: { mimeType: input.mimeType, status: "UPLOADED" },
    });

    return { id: documentId, storageKey };
  } catch (err) {
    await prisma.sourceDocument.updateMany({
      where: workspaceWhere(ctx, { id: documentId }),
      data: { uploadStatus: "FAILED" },
    });

    try {
      await deleteObject(ctx.workspaceId, storageKey);

    } catch {
      // best-effort cleanup; row already marked FAILED
    }

    await recordAuditEventSafe({
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.userId,
      eventType: AUDIT_EVENT_TYPES.SOURCE_DOCUMENT_UPLOAD_FAILED,
      objectType: AUDIT_OBJECT_TYPES.SOURCE_DOCUMENT,
      objectId: documentId,
      metadata: {
        mimeType: input.mimeType,
        status: "FAILED",
        errorName: err instanceof Error ? err.name : "Unknown",
      },
    });

    if (err instanceof StorageUploadError || err instanceof StorageConfigError) {
      throw err;
    }
    throw new StorageUploadError();
  }
}
