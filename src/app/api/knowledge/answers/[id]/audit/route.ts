import { NextResponse } from "next/server";
import { buildAuthContext } from "@/lib/auth/build-context";
import { authorizeAnyPermission } from "@/lib/auth/authorize-role";
import { Permission } from "@/lib/auth/permissions";
import { handleApiError } from "@/lib/api/error-handler";
import { listAnswerAuditEventsEnriched } from "@/lib/audit/list-audit-events";

export async function GET(
  request: Request,
  segment: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await buildAuthContext(request);
    authorizeAnyPermission(ctx, [Permission.VIEW_AUDIT, Permission.VIEW_ANSWERS]);
    const params = await segment.params;

    const events = await listAnswerAuditEventsEnriched({
      workspaceId: ctx.workspaceId,
      answerId: params.id,
      limit: 100,
    });

    return NextResponse.json({ events });
  } catch (error) {
    console.error("api:knowledge:answers:audit:get:failed", error);
    return handleApiError(error);
  }
}
