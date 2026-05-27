import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { buildAuthContext } from "@/lib/auth/build-context";
import { handleApiError } from "@/lib/api/error-handler";
import { retryParseJob } from "@/modules/workspaces/source-documents/parsing/parse-job-service";
import { enqueueAnswerSeedingAfterParse } from "@/modules/workspaces/intelligence/answer-seeding-job-service";
import { logger } from "@/lib/logging/logger";

/**
 * POST /api/documents/bulk
 */
export async function POST(request: Request) {
  try {
    const auth = await buildAuthContext(request);
    const { workspaceId, userId } = auth;

    const { ids, action } = await request.json();

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: "No document IDs provided" }, { status: 400 });
    }

    logger.info("api:documents:bulk", { action, count: ids.length, workspaceId });

    if (action === "retry-parse") {
      // Find all failed parse jobs for these documents
      const docs = await prisma.sourceDocument.findMany({
        where: { id: { in: ids }, workspaceId },
        include: {
          parseJobs: { 
            where: { status: "FAILED" },
            orderBy: { createdAt: "desc" },
            take: 1 
          },
        },
      });

      const jobIds = docs.flatMap(d => d.parseJobs.map(j => j.id));
      
      for (const jobId of jobIds) {
        await retryParseJob(jobId, workspaceId, `bulk-retry-${Date.now()}`);
      }

      return NextResponse.json({ success: true, count: jobIds.length });
    }

    if (action === "retry-seeding") {
      // Re-trigger seeding for the selected documents
      for (const id of ids) {
        const doc = await prisma.sourceDocument.findUnique({
          where: { id, workspaceId },
          include: { parseJobs: { orderBy: { createdAt: "desc" }, take: 1 } }
        });

        if (doc && doc.parseJobs[0]) {
            await enqueueAnswerSeedingAfterParse({
                workspaceId,
                sourceDocumentId: id,
                parseJobId: doc.parseJobs[0].id,
            });
        }
      }
      return NextResponse.json({ success: true, count: ids.length });
    }

    if (action === "delete") {
      await prisma.sourceDocument.updateMany({
        where: { id: { in: ids }, workspaceId },
        data: { uploadStatus: "DELETED" },
      });
      return NextResponse.json({ success: true, count: ids.length });
    }

    return NextResponse.json({ error: "Invalid action type" }, { status: 400 });
  } catch (err) {
    return handleApiError(err);
  }
}
