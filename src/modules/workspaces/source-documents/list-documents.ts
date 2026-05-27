import { prisma } from "@/lib/db/prisma";
import { buildAuthContext } from "@/lib/auth/build-context";

export interface ListSourceDocumentsParams {
  request: Request;
  page?: number;
  pageSize?: number;
  searchQuery?: string;
  statusFilter?: string;
}

export interface PaginatedSourceDocuments {
  documents: any[];
  pagination: {
    totalCount: number;
    totalPages: number;
    page: number;
    pageSize: number;
  };
}

/**
 * Service to list source documents for the current workspace with pagination.
 * Resolves auth context and fetches documents from database.
 */
export async function listSourceDocuments(params: ListSourceDocumentsParams): Promise<PaginatedSourceDocuments> {
  const { request, page = 1, pageSize = 25, searchQuery, statusFilter } = params;

  // 1. Resolve Auth Context
  const auth = await buildAuthContext(request);
  const { workspaceId } = auth;

  // 2. Build Where Clauses
  const where: any = {
    workspaceId,
    uploadStatus: { not: "DELETED" },
    isLatest: true,
  };

  // Search filter
  if (searchQuery) {
    where.originalName = {
      contains: searchQuery,
      mode: "insensitive",
    };
  }

  // Status filter (Approximation of frontend logic)
  if (statusFilter && statusFilter !== "all") {
    if (statusFilter === "ready") {
      where.uploadStatus = "UPLOADED";
      where.parseJobs = { some: { status: "COMPLETED" } };
      where.answerSeedingJobs = { some: { status: "COMPLETED" } };
    } else if (statusFilter === "failed") {
      where.OR = [
        { uploadStatus: "FAILED" },
        { parseJobs: { some: { status: "FAILED" } } },
        { answerSeedingJobs: { some: { status: "FAILED" } } },
      ];
    } else if (statusFilter === "processing") {
      // Exclude ready and failed
      where.AND = [
        { NOT: { uploadStatus: "FAILED" } },
        { NOT: { parseJobs: { some: { status: "FAILED" } } } },
        { NOT: { answerSeedingJobs: { some: { status: "FAILED" } } } },
        {
          NOT: {
            AND: [
              { uploadStatus: "UPLOADED" },
              { parseJobs: { some: { status: "COMPLETED" } } },
              { answerSeedingJobs: { some: { status: "COMPLETED" } } },
            ],
          },
        },
      ];
    }
  }

  // 3. Count Total Matching Documents
  const totalCount = await prisma.sourceDocument.count({ where });
  const totalPages = Math.ceil(totalCount / pageSize) || 1;
  const activePage = Math.min(Math.max(1, page), totalPages);

  // 4. Fetch Paginated Documents
  const documents = await prisma.sourceDocument.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (activePage - 1) * pageSize,
    take: pageSize,
    select: {
      id: true,
      originalName: true,
      mimeType: true,
      fileSizeBytes: true,
      uploadStatus: true,
      createdAt: true,
      _count: {
        select: { chunks: true },
      },
      parseJobs: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          id: true,
          status: true,
          errorMessage: true,
          createdAt: true,
          updatedAt: true,
        },
      },
      uploadedBy: {
        select: {
          name: true,
          email: true,
        },
      },
    },
  });

  // 5. Manual Join for Seeding Jobs
  const docIds = documents.map((d) => d.id);
  const seedingJobs = await prisma.answerSeedingJob.findMany({
    where: {
      workspaceId,
      triggerSourceDocumentId: { in: docIds },
    },
    orderBy: { createdAt: "desc" },
  });

  // Attach the latest job for each document
  const documentsWithSeeding = documents.map((doc) => {
    const relevantJobs = seedingJobs.filter((j) => j.triggerSourceDocumentId === doc.id);
    return {
      ...doc,
      answerSeedingJobs: relevantJobs.slice(0, 1).map(j => ({
        id: j.id,
        status: j.status,
        lastError: j.lastError,
        createdAt: j.createdAt.toISOString(),
        updatedAt: j.updatedAt.toISOString(),
      })),
    };
  });

  // 6. Calculate Workspace Metrics (aggregate for entire workspace).
  // Aggregates must match the per-row lifecycle UI, which classifies each
  // document by the status of its LATEST parse job and LATEST seeding job.
  // A naive `some: { status: "FAILED" }` filter would keep counting a doc as
  // failed forever after a successful retry, because the historical FAILED
  // row still satisfies `some`. Compute latest-per-doc in memory.
  const [aggregateDocs, latestSeedingRows, totalEvidence] = await Promise.all([
    prisma.sourceDocument.findMany({
      where: { workspaceId, isLatest: true, uploadStatus: { not: "DELETED" } },
      select: {
        id: true,
        uploadStatus: true,
        parseJobs: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { status: true },
        },
      },
    }),
    prisma.answerSeedingJob.findMany({
      where: { workspaceId, triggerSourceDocumentId: { not: null } },
      orderBy: { createdAt: "desc" },
      select: { triggerSourceDocumentId: true, status: true },
    }),
    prisma.sourceDocumentChunk.count({ where: { workspaceId } }),
  ]);

  // First encounter wins — rows are pre-sorted desc by createdAt.
  const latestSeedStatusByDoc = new Map<string, string>();
  for (const row of latestSeedingRows) {
    const key = row.triggerSourceDocumentId;
    if (key && !latestSeedStatusByDoc.has(key)) {
      latestSeedStatusByDoc.set(key, row.status);
    }
  }

  let ready = 0;
  let failed = 0;
  for (const doc of aggregateDocs) {
    const latestParseStatus = doc.parseJobs[0]?.status ?? null;
    const latestSeedStatus = latestSeedStatusByDoc.get(doc.id) ?? null;

    const isReady =
      doc.uploadStatus === "UPLOADED" &&
      latestParseStatus === "COMPLETED" &&
      latestSeedStatus === "COMPLETED";

    const isFailed =
      doc.uploadStatus === "FAILED" ||
      latestParseStatus === "FAILED" ||
      latestSeedStatus === "FAILED";

    if (isReady) {
      ready++;
    } else if (isFailed) {
      failed++;
    }
  }

  const total = aggregateDocs.length;
  const processing = Math.max(0, total - ready - failed);
  const readinessScore = total > 0 ? ready / total : 0;

  return {
    documents: documentsWithSeeding,
    pagination: {
      totalCount,
      totalPages,
      page: activePage,
      pageSize,
    },
    metrics: {
      total,
      ready,
      processing,
      failed,
      readinessScore,
      evidenceCount: totalEvidence,
    }
  };
}
