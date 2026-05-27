import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { buildAuthContext } from "@/lib/auth/build-context";
import { authorizePermission } from "@/lib/auth/authorize-role";
import { Permission } from "@/lib/auth/permissions";
import { handleApiError } from "@/lib/api/error-handler";
import type { AnswerLibraryItemVersion } from "@prisma/client";

/**
 * GET /api/knowledge/answers/[id]/versions/compare?from=N&to=M
 * Compare two stored versions (same answer, current workspace).
 */
export async function GET(
  request: Request,
  segment: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await buildAuthContext(request);
    authorizePermission(ctx, Permission.VIEW_ANSWERS);
    const params = await segment.params;
    const { searchParams } = new URL(request.url);
    const fromN = Number(searchParams.get("from"));
    const toN = Number(searchParams.get("to"));
    const includeBodies = searchParams.get("includeBodies") !== "false";

    if (!Number.isFinite(fromN) || !Number.isFinite(toN) || fromN < 1 || toN < 1) {
      return NextResponse.json(
        { error: "Query params from and to must be positive version numbers" },
        { status: 400 },
      );
    }

    const answer = await prisma.answerLibraryItem.findFirst({
      where: { id: params.id, workspaceId: ctx.workspaceId },
      select: { id: true },
    });
    if (!answer) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    const [fromRow, toRow] = await Promise.all([
      prisma.answerLibraryItemVersion.findFirst({
        where: { answerId: params.id, workspaceId: ctx.workspaceId, versionNumber: fromN },
      }),
      prisma.answerLibraryItemVersion.findFirst({
        where: { answerId: params.id, workspaceId: ctx.workspaceId, versionNumber: toN },
      }),
    ]);

    if (!fromRow || !toRow) {
      return NextResponse.json({ error: "One or both versions not found" }, { status: 404 });
    }

    const payload = {
      from: versionPublic(fromRow, includeBodies),
      to: versionPublic(toRow, includeBodies),
    };

    return NextResponse.json(payload);
  } catch (error) {
    console.error("api:knowledge:answers:versions:compare:get:failed", error);
    return handleApiError(error);
  }
}

function versionPublic(v: AnswerLibraryItemVersion, includeBodies: boolean) {
  return {
    versionNumber: v.versionNumber,
    createdAt: v.createdAt,
    changeReason: v.changeReason,
    changeKind: v.changeKind,
    resetApprovalRequired: v.resetApprovalRequired,
    changeDiffJson: v.changeDiffJson,
    governanceStatus: v.governanceStatus,
    approvalScope: v.approvalScope,
    exportSafe: v.exportSafe,
    title: v.title,
    answerText: includeBodies ? v.answerText : undefined,
    evidenceSnapshotJson: v.evidenceSnapshotJson,
    ownerId: v.ownerId,
    approverId: v.approverId,
    changedById: v.changedById,
  };
}
