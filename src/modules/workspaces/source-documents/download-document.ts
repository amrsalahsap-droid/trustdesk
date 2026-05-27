import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logging/logger";
import { AUDIT_EVENT_TYPES, AUDIT_OBJECT_TYPES, recordAuditEventSafe } from "@/lib/audit";
import { getSignedDownloadUrl } from "@/lib/storage/storage-service";
import { buildAuthContext } from "@/lib/auth/build-context";
import { ScopedResourceNotFoundError } from "@/lib/domain/scoped-resource-not-found";

export interface GetDownloadUrlParams {
  request: Request;
  documentId: string;
}

/**
 * Service to handle secure document download:
 * 1. Resolves auth context and verifies workspace membership.
 * 2. Fetches document record and ensures it belongs to the workspace (Tenant Isolation).
 * 3. Generates a short-lived signed URL for protected access.
 * 4. Records an audit event for the access.
 */
export async function getDownloadUrl(params: GetDownloadUrlParams) {
  const { request, documentId } = params;

  // 1. Resolve Auth Context (Authentication + Workspace Membership)
  const auth = await buildAuthContext(request);
  const { userId, workspaceId } = auth;

  // 2. Fetch Document with Workspace Scope
  const doc = await prisma.sourceDocument.findFirst({
    where: {
      id: documentId,
      workspaceId,
      uploadStatus: "UPLOADED",
    },
  });

  if (!doc) {
    logger.warn("documents:download:not-found", {
      userId,
      workspaceId,
      documentId,
    });
    throw new ScopedResourceNotFoundError("SourceDocument", documentId, workspaceId);
  }

  // 3. Record Audit Event
  await recordAuditEventSafe({
    workspaceId,
    actorUserId: userId,
    eventType: AUDIT_EVENT_TYPES.SOURCE_DOCUMENT_DOWNLOADED,
    objectType: AUDIT_OBJECT_TYPES.SOURCE_DOCUMENT,
    objectId: doc.id,
    metadata: { fileName: doc.originalName },
  });

  // 4. Generate Signed URL
  // Default TTL is 15 minutes (900 seconds)
  const signedUrl = await getSignedDownloadUrl(workspaceId, doc.storageKey);


  logger.info("documents:download:success", {
    userId,
    workspaceId,
    documentId,
  });

  return {
    signedUrl,
    fileName: doc.originalName,
  };
}
