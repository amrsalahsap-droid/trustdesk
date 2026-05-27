import { NextResponse } from "next/server";
import { buildAuthContext } from "@/lib/auth/build-context";
import { downloadObject } from "@/lib/storage/storage-service";
import { logger } from "@/lib/logging/logger";
import { prisma } from "@/lib/db/prisma";

/**
 * API route to serve files from local storage.
 * Only active when STORAGE_DRIVER=local.
 * 
 * Path: /api/storage/workspaces/[workspaceId]/...
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path } = await params;
    const fullKey = path.join("/");

    // 1. Authenticate user
    const auth = await buildAuthContext(request);
    const { userId, workspaceId: sessionWorkspaceId } = auth;

    // 2. Tenant Isolation Check
    // We expect the path to start with 'workspaces/[workspaceId]'
    if (path[0] !== "workspaces" || path[1] !== sessionWorkspaceId) {
      logger.warn("api:storage:access-denied", {
        userId,
        requestedKey: fullKey,
        sessionWorkspaceId,
      });
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // 3. Fetch file from local storage
    const buffer = await downloadObject(sessionWorkspaceId, fullKey);

    // 4. Determine MIME type
    // We can try to look it up in the DB if it's a source document
    let contentType = "application/octet-stream";
    
    // Attempt to find the source document to get its recorded MIME type
    // Path segment [3] is the documentId based on buildStorageKey
    const documentId = path[3];
    if (path[2] === "source-documents" && documentId) {
      const doc = await prisma.sourceDocument.findUnique({
        where: { id: documentId, workspaceId: sessionWorkspaceId },
        select: { mimeType: true },
      });
      if (doc) {
        contentType = doc.mimeType;
      }
    }

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (err) {
    logger.error("api:storage:failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
}
