import { NextResponse } from "next/server";
import { buildAuthContext } from "@/lib/auth/build-context";
import { listWorkspaceAuditEventsEnriched } from "@/lib/audit/list-audit-events";
import { handleApiError } from "@/lib/api/error-handler";
import { authorizePermission } from "@/lib/auth/authorize-role";
import { Permission } from "@/lib/auth/permissions";

export async function GET(request: Request) {
  try {
    const auth = await buildAuthContext(request);
    authorizePermission(auth, Permission.VIEW_AUDIT);

    const { searchParams } = new URL(request.url);
    const limit = searchParams.get("limit") ? parseInt(searchParams.get("limit")!) : 50;
    const actorUserId = searchParams.get("actorUserId") || undefined;
    const eventType = searchParams.get("eventType") || undefined;
    const objectType = searchParams.get("objectType") || undefined;
    const startDate = searchParams.get("startDate") ? new Date(searchParams.get("startDate")!) : undefined;
    const endDate = searchParams.get("endDate") ? new Date(searchParams.get("endDate")!) : undefined;
    
    const events = await listWorkspaceAuditEventsEnriched({
      workspaceId: auth.workspaceId,
      limit,
      actorUserId,
      eventType,
      objectType,
      startDate,
      endDate,
    });

    return NextResponse.json({ events });
  } catch (err) {
    return handleApiError(err);
  }
}
