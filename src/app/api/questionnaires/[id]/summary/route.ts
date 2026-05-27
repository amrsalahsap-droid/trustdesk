import { NextResponse } from "next/server";
import { buildAuthContext } from "@/lib/auth/build-context";
import { handleApiError } from "@/lib/api/error-handler";
import { QuestionnaireMatchingService } from "@/modules/workspaces/intelligence/questionnaire-matching-service";

import { authorizePermission } from "@/lib/auth/authorize-role";
import { Permission } from "@/lib/auth/permissions";

/**
 * GET /api/questionnaires/[id]/summary
 * 
 * Returns a consolidated summary of gap counts and progress.
 * Fulfills Story D13-EN-05.
 */
export async function GET(
  request: Request,
  segment: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await segment.params;
    const ctx = await buildAuthContext(request); // Verify access
    authorizePermission(ctx, Permission.REVIEW_ROWS);

    const summary = await QuestionnaireMatchingService.getGapSummary(ctx.workspaceId, id);
    return NextResponse.json(summary);
  } catch (err) {
    return handleApiError(err);
  }
}
