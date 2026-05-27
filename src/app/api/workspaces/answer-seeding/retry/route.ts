import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { buildAuthContext } from "@/lib/auth/build-context";
import { authorizePermission } from "@/lib/auth/authorize-role";
import { Permission } from "@/lib/auth/permissions";
import { handleApiError } from "@/lib/api/error-handler";
import { enqueueAnswerSeedingRetry } from "@/modules/workspaces/intelligence/answer-seeding-job-service";

/** D10-EN-05: Queue a new answer seeding run (safe idempotent re-scan). */
export async function POST(request: Request) {
  try {
    const ctx = await buildAuthContext(request);
    authorizePermission(ctx, Permission.RUN_AI_OPERATIONS);

    const latest = await prisma.answerSeedingJob.findFirst({
      where: { workspaceId: ctx.workspaceId },
      orderBy: { createdAt: "desc" },
      select: { id: true, status: true },
    });

    if (latest && (latest.status === "QUEUED" || latest.status === "RUNNING")) {
      return NextResponse.json(
        { error: { code: "SEEDING_IN_PROGRESS", message: "Answer seeding is already running or queued." } },
        { status: 409 },
      );
    }

    const { jobId } = await enqueueAnswerSeedingRetry(ctx.workspaceId);
    return NextResponse.json({ jobId });
  } catch (err) {
    return handleApiError(err);
  }
}
