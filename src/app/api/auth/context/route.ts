import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { buildAuthContext } from "@/lib/auth/build-context";
import { WorkspaceSelectionRequiredError } from "@/lib/auth/errors";
import { handleApiError } from "@/lib/api/error-handler";

export async function GET(request: Request) {
  try {
    const ctx = await buildAuthContext(request);

    const user = await prisma.user.findUnique({
      where: { id: ctx.userId },
      select: { name: true, email: true },
    });

    return NextResponse.json({
      userId: ctx.userId,
      workspaceId: ctx.workspaceId,
      role: ctx.role,
      permissions: ctx.permissions,
      name: user?.name,
      email: user?.email,
    });
  } catch (error) {
    if (error instanceof WorkspaceSelectionRequiredError) {
      return NextResponse.json({
        requiresWorkspaceSelection: true,
        workspaceIds: error.workspaceIds,
      });
    }

    return handleApiError(error);
  }
}
