import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { buildAuthContext } from "@/lib/auth/build-context";
import { handleApiError } from "@/lib/api/error-handler";
import { authorizePermission } from "@/lib/auth/authorize-role";
import { Permission } from "@/lib/auth/permissions";

export async function GET(request: Request) {
  try {
    const ctx = await buildAuthContext(request);
    authorizePermission(ctx, Permission.VIEW_ANSWERS);
    const workspaceId = ctx.workspaceId;

    // Active questionnaires (those created in the last 30 days or not yet fully "done")
    // For now, we'll just count all as a proxy for "active" until we have a proper status field.
    const activeCount = await prisma.questionnaire.count({
      where: { workspaceId },
    });

    return NextResponse.json({
      active: activeCount,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
