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

    const list = await prisma.questionnaire.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        sourceFileName: true,
        createdAt: true,
        _count: { select: { items: true } },
      },
    });

    return NextResponse.json({
      questionnaires: list.map((q) => ({
        id: q.id,
        title: q.title,
        sourceFileName: q.sourceFileName,
        createdAt: q.createdAt.toISOString(),
        itemCount: q._count.items,
      })),
    });
  } catch (err) {
    return handleApiError(err);
  }
}
