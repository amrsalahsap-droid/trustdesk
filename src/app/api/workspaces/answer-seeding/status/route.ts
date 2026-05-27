import { NextResponse } from "next/server";
import { buildAuthContext } from "@/lib/auth/build-context";
import { handleApiError } from "@/lib/api/error-handler";
import { getLatestAnswerSeedingJobStatus } from "@/modules/workspaces/intelligence/answer-seeding-job-service";

/** D10-EN-05: Latest workspace answer seeding job status (for polling). */
export async function GET(request: Request) {
  try {
    const ctx = await buildAuthContext(request);
    const payload = await getLatestAnswerSeedingJobStatus(ctx.workspaceId);
    return NextResponse.json({ job: payload });
  } catch (err) {
    return handleApiError(err);
  }
}
