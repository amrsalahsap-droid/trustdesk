import { NextResponse } from "next/server";

import { buildAuthContext } from "@/lib/auth/build-context";
import { handleApiError } from "@/lib/api/error-handler";
import { assertPromoteDrafts } from "@/lib/auth/governance-actions";
import { promoteDrafts } from "@/modules/knowledge/topics/promote-drafts-service";

interface PromoteBody {
  topicKey?: string;
  subControlKey?: string;
  minConfidence?: number;
  dryRun?: boolean;
  maxRows?: number;
}

/**
 * POST /api/knowledge/topics/promote-drafts
 *
 * Bulk promotes SEEDED DRAFT AnswerLibraryItems under the given topic (and
 * optionally under a specific sub-control) to APPROVED. Refreshes embeddings,
 * writes one version row per promoted item, and emits audit events.
 *
 * topicKey travels in the request body (not a URL segment) so this route
 * co-exists with the existing `[topicId]/seed` dynamic segment without
 * colliding on Next.js slug names.
 *
 * Safety:
 *   - Tenant-scoped to the caller's workspaceId via buildAuthContext.
 *   - dryRun returns counts without writing.
 *   - maxRows defaults to 50; reviewers should inspect drafts first.
 *   - minConfidence defaults to 0.6; lower-scored drafts are skipped.
 */
export async function POST(request: Request) {
  try {
    const ctx = await buildAuthContext(request);
    assertPromoteDrafts(ctx);
    const body = (await request.json().catch(() => ({}))) as PromoteBody;

    if (!body.topicKey) {
      return NextResponse.json({ error: "topicKey is required in the request body." }, { status: 400 });
    }

    const result = await promoteDrafts({
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.userId,
      topicKey: body.topicKey,
      subControlKey: body.subControlKey ?? null,
      minConfidence: typeof body.minConfidence === "number" ? body.minConfidence : undefined,
      dryRun: body.dryRun === true,
      maxRows: typeof body.maxRows === "number" ? body.maxRows : undefined,
    });

    return NextResponse.json({ result });
  } catch (err) {
    return handleApiError(err);
  }
}
