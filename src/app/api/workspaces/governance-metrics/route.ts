import { NextResponse } from "next/server";
import { buildAuthContext } from "@/lib/auth/build-context";
import { handleApiError } from "@/lib/api/error-handler";
import { Permission } from "@/lib/auth/permissions";
import { getGovernanceMetricsSnapshot } from "@/lib/knowledge/governance-metrics";

/**
 * Workspace-level governance posture for dashboard and auditors (read-only).
 */
export async function GET(request: Request) {
  try {
    const ctx = await buildAuthContext(request);
    if (!ctx.permissions.includes(Permission.VIEW_ANSWERS)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const metrics = await getGovernanceMetricsSnapshot(ctx.workspaceId);
    return NextResponse.json(metrics);
  } catch (error) {
    return handleApiError(error);
  }
}
