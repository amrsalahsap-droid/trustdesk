import { prisma } from "@/lib/db/prisma";
import { workspaceWhere } from "@/lib/db/workspace-scope";
import { ScopedResourceNotFoundError } from "@/lib/domain/scoped-resource-not-found";
import { logger } from "@/lib/logging/logger";
import type { AuthContext } from "@/lib/auth/types";

export type SourceDocumentDTO = {
  id: string;
  fileName: string;
  originalName: string;
  mimeType: string;
  fileSizeBytes: number;
  storageKey: string;
  storageBucket: string;
  uploadStatus: string;
  createdAt: Date;
  updatedAt: Date;
};

export async function getSourceDocumentById(
  ctx: AuthContext,
  documentId: string,
): Promise<SourceDocumentDTO> {
  const doc = await prisma.sourceDocument.findFirst({
    where: workspaceWhere(ctx, { id: documentId }),
    select: {
      id: true,
      fileName: true,
      originalName: true,
      mimeType: true,
      fileSizeBytes: true,
      storageKey: true,
      storageBucket: true,
      uploadStatus: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!doc) {
    logger.warn("tenant:scoped-resource-miss", {
      userId: ctx.userId,
      workspaceId: ctx.workspaceId,
      resource: "SourceDocument",
    });
    throw new ScopedResourceNotFoundError();
  }

  return doc;
}
