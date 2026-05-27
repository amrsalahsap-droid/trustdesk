import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logging/logger";

export interface DocumentVersionHistory {
  id: string;
  version: number;
  isLatest: boolean;
  versionLabel?: string | null;
  createdAt: Date;
  uploadStatus: string;
  uploadedBy: {
    name: string | null;
    email: string;
  };
}

/**
 * VersioningService handles the lifecycle of document versions,
 * ensuring logical grouping and "Active" version tracking.
 */
export const VersioningService = {
  /**
   * Fetches the entire version history for a logical document group.
   */
  async getDocumentHistory(workspaceId: string, groupId: string): Promise<DocumentVersionHistory[]> {
    const documents = await prisma.sourceDocument.findMany({
      where: {
        workspaceId,
        groupId,
        uploadStatus: { not: "DELETED" },
      },
      orderBy: {
        version: "desc",
      },
      select: {
        id: true,
        version: true,
        isLatest: true,
        versionLabel: true,
        createdAt: true,
        uploadStatus: true,
        uploadedBy: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    });

    return documents as DocumentVersionHistory[];
  },

  /**
   * Finds the currently active version of a document by its original name.
   */
  async findActiveVersionByName(workspaceId: string, originalName: string) {
    return prisma.sourceDocument.findFirst({
      where: {
        workspaceId,
        originalName,
        isLatest: true,
        uploadStatus: { not: "DELETED" },
      },
    });
  },

  /**
   * Atomically transitions the "Latest" flag within a document group.
   */
  async rotateActiveVersion(workspaceId: string, groupId: string, nextLatestId: string) {
    logger.info("documents:versioning:rotate", { workspaceId, groupId, nextLatestId });

    return await prisma.$transaction(async (tx) => {
      // 1. Deactivate current latest
      await tx.sourceDocument.updateMany({
        where: {
          workspaceId,
          groupId,
          isLatest: true,
        },
        data: { isLatest: false },
      });

      // 2. Activate target
      const updated = await tx.sourceDocument.update({
        where: {
          id: nextLatestId,
          workspaceId,
        },
        data: { isLatest: true },
      });

      return updated;
    });
  },
};
