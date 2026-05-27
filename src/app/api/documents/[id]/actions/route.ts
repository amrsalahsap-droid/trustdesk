import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { buildAuthContext } from "@/lib/auth/build-context";
import { handleApiError } from "@/lib/api/error-handler";
import { retryParseJob } from "@/modules/workspaces/source-documents/parsing/parse-job-service";
import { enqueueAnswerSeedingAfterParse } from "@/modules/workspaces/intelligence/answer-seeding-job-service";
import { assertDocumentManagement } from "@/lib/auth/governance-actions";
import { logger } from "@/lib/logging/logger";

/**
 * POST /api/documents/[id]/actions
 * Body: { type: 'retry' }
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await buildAuthContext(request);
    assertDocumentManagement(auth);
    const { workspaceId } = auth;

    const { type } = await request.json();

    if (type === "retry") {
      // Find latest status to determine what to retry
      const doc = await prisma.sourceDocument.findUnique({
        where: { id, workspaceId },
        include: {
          parseJobs: { orderBy: { createdAt: "desc" }, take: 1 },
        },
      });

      if (!doc) {
        return NextResponse.json({ error: "Document not found" }, { status: 404 });
      }

      // Logic: If Parse failed, retry parse. If Seeding failed, retry seeding.
      const lastParse = doc.parseJobs[0];

      if (lastParse?.status === "FAILED") {
        logger.info("api:documents:retry:parse", { id, jobId: lastParse.id });
        await retryParseJob(lastParse.id, workspaceId, `retry-${id}`);
        return NextResponse.json({ success: true, stage: "parse" });
      }

      // Check seeding
      const lastSeed = await prisma.answerSeedingJob.findFirst({
        where: { workspaceId, triggerSourceDocumentId: id },
        orderBy: { createdAt: "desc" },
      });

      if (lastSeed?.status === "FAILED" || lastSeed?.status === "PARTIAL") {
        logger.info("api:documents:retry:seeding", { id, jobId: lastSeed.id });
        await enqueueAnswerSeedingAfterParse({
            workspaceId,
            sourceDocumentId: id,
            parseJobId: lastParse?.id || "manual-retry",
        });
        return NextResponse.json({ success: true, stage: "seeding" });
      }

      // If already OK but user forced retry (e.g. Seeding needs re-run)
      if (doc.uploadStatus === "UPLOADED" && lastParse?.status === "COMPLETED") {
         await enqueueAnswerSeedingAfterParse({
            workspaceId,
            sourceDocumentId: id,
            parseJobId: lastParse.id,
        });
        return NextResponse.json({ success: true, stage: "seeding" });
      }

      return NextResponse.json({ error: "No failed stage found to retry" }, { status: 400 });
    }

    return NextResponse.json({ error: "Invalid action type" }, { status: 400 });
  } catch (err) {
    return handleApiError(err);
  }
}

/**
 * DELETE /api/documents/[id]/actions
 * (Or DELETE /api/documents/[id] if we were standard, but we'll use this for now as per plan)
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await buildAuthContext(request);
    assertDocumentManagement(auth);
    const { workspaceId } = auth;

    await prisma.sourceDocument.update({
      where: { id, workspaceId },
      data: { uploadStatus: "DELETED" },
    });

    logger.info("api:documents:delete", { id, workspaceId });
    return NextResponse.json({ success: true });
  } catch (err) {
    return handleApiError(err);
  }
}
