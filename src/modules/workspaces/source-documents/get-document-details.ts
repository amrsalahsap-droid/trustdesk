import { prisma } from "@/lib/db/prisma";
import { buildAuthContext } from "@/lib/auth/build-context";
import { ScopedResourceNotFoundError } from "@/lib/domain/scoped-resource-not-found";
import { VersioningService } from "./versioning-service";

export interface GetSourceDocumentDetailsParams {
  request: Request;
  documentId: string;
}

/**
 * Fetches comprehensive details for a specific source document.
 */
export async function getSourceDocumentDetails(params: GetSourceDocumentDetailsParams) {
  const { request, documentId } = params;

  // 1. Resolve Auth Context
  const auth = await buildAuthContext(request);
  const { workspaceId } = auth;

  // 2. Fetch Document with basic relations
  const document = await prisma.sourceDocument.findFirst({
    where: {
      id: documentId,
      workspaceId,
      uploadStatus: { not: "DELETED" },
    },
    select: {
      id: true,
      workspaceId: true,
      uploadedById: true,
      fileName: true,
      originalName: true,
      mimeType: true,
      fileSizeBytes: true,
      uploadStatus: true,
      groupId: true,
      version: true,
      isLatest: true,
      versionLabel: true,
      createdAt: true,
      uploadedBy: {
        select: { name: true, email: true }
      },
      parseJobs: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      content: {
        select: {
          fullText: true,
          pageCount: true,
        },
      },
    }
  });

  if (!document) {
    throw new ScopedResourceNotFoundError("SourceDocument", documentId);
  }

  // 2. Fetch Version History if groupId exists
  const history = document.groupId 
    ? await VersioningService.getDocumentHistory(workspaceId, document.groupId)
    : [];

  // 3. Manual join for seeding jobs (to bypass Prisma sync issues)
  const seedingJob = await prisma.answerSeedingJob.findFirst({
    where: {
      workspaceId,
      triggerSourceDocumentId: documentId,
    },
    orderBy: { createdAt: "desc" },
  });

  // 4. Fetch Stats: Chunks, Topics, Evidence Readiness
  const [chunkCount, topicCount, usedChunkCount] = await Promise.all([
    prisma.sourceDocumentChunk.count({
      where: { 
        id: { not: "" }, // Dummy to ensure where is not empty if needed, but workspaceId is key
        sourceDocumentId: documentId,
        workspaceId,
      },
    }),
    prisma.sourceChunkTopic.count({
      where: { 
        workspaceId,
        chunk: { sourceDocumentId: documentId } 
      },
    }),
    prisma.sourceDocumentChunk.count({
      where: {
        workspaceId,
        sourceDocumentId: documentId,
        evidence: { some: {} },
      }
    }),
  ]);

  // Better Topic Count (Distinct)
  const distinctTopics = await prisma.sourceChunkTopic.groupBy({
    by: ["topicId"],
    where: {
      workspaceId,
      chunk: { sourceDocumentId: documentId }
    }
  });

  // 5. Evidence Readiness heuristic
  const evidenceReadiness = chunkCount > 0 ? (usedChunkCount / chunkCount) : 0;

  return {
    document: {
      ...document,
      history,
    },
    answerSeedingJobs: seedingJob ? [{
      id: seedingJob.id,
      status: seedingJob.status,
      lastError: seedingJob.lastError,
      createdAt: seedingJob.createdAt.toISOString(),
      updatedAt: seedingJob.updatedAt.toISOString(),
    }] : [],
    stats: {
      chunkCount,
      topicCount: distinctTopics.length,
      evidenceReadiness,
      usedChunkCount,
    }
  };
}
