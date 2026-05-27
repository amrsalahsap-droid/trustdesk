import { NextResponse } from "next/server";
import { z } from "zod";
import { Permission, guardRouteWithPermission } from "@/lib/auth/guard";
import { handleApiError } from "@/lib/api/error-handler";
import { WorkspaceDangerService } from "@/modules/workspaces/danger-service";

const DangerActionSchema = z.object({
  action: z.enum(["archive", "revoke-invites", "reset-export-defaults"]),
});

/**
 * POST /api/workspaces/danger
 * High-risk destructive actions. Admin-only.
 */
export async function POST(request: Request) {
  try {
    // Guard: Danger zone requires MANAGE_WORKSPACE permission (OWNER only)
    const guardResult = await guardRouteWithPermission(request, Permission.MANAGE_WORKSPACE);
    if (!guardResult.success) {
      return guardResult.response;
    }
    const ctx = guardResult.context;

    const body: unknown = await request.json();
    const parsed = DangerActionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", issues: parsed.error.issues } },
        { status: 400 }
      );
    }

    const { action } = parsed.data;
    let result;

    switch (action) {
      case "archive":
        result = await WorkspaceDangerService.archiveWorkspace(ctx.workspaceId, ctx.userId);
        break;
      case "revoke-invites":
        result = await WorkspaceDangerService.revokeAllPendingInvites(ctx.workspaceId, ctx.userId);
        break;
      case "reset-export-defaults":
        result = await WorkspaceDangerService.resetExportDefaults(ctx.workspaceId, ctx.userId);
        break;
      default:
        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    return NextResponse.json({ success: true, result });
  } catch (error) {
    return handleApiError(error);
  }
}
