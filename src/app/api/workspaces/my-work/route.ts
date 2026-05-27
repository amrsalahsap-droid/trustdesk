import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { buildAuthContext } from "@/lib/auth/build-context";
import { handleApiError } from "@/lib/api/error-handler";

export async function GET(request: Request) {
  try {
    const ctx = await buildAuthContext(request);
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    // 1. My owned answers (Drafts or Expired)
    const ownedAnswers = await prisma.answerLibraryItem.findMany({
      where: {
        workspaceId: ctx.workspaceId,
        ownerId: ctx.userId,
        OR: [
          { status: "DRAFT" },
          { lastVerified: { lt: ninetyDaysAgo } }
        ]
      },
      include: { topic: true },
      orderBy: { updatedAt: "desc" }
    });

    // 2. My approvals needed
    const pendingApprovals = await prisma.answerLibraryItem.findMany({
      where: {
        workspaceId: ctx.workspaceId,
        approverId: ctx.userId,
        status: "DRAFT" // In this system, DRAFT represents items needing review/approval if assigned
      },
      include: { topic: true },
      orderBy: { updatedAt: "desc" }
    });

    // 3. My assigned questionnaire rows
    const assignedRows = await prisma.questionnaireItem.findMany({
      where: {
        workspaceId: ctx.workspaceId,
        assigneeId: ctx.userId,
        reviewed: false
      },
      include: { questionnaire: true },
      orderBy: { questionnaire: { createdAt: "desc" } }
    });

    return NextResponse.json({
      ownedAnswers: ownedAnswers.map(a => ({
        id: a.id,
        title: a.title,
        status: a.status,
        isExpired: a.lastVerified ? a.lastVerified < ninetyDaysAgo : false,
        topicName: a.topic?.name
      })),
      pendingApprovals: pendingApprovals.map(a => ({
        id: a.id,
        title: a.title,
        topicName: a.topic?.name
      })),
      assignedRows: assignedRows.map(r => ({
        id: r.id,
        question: r.question,
        questionnaireId: r.questionnaireId,
        questionnaireTitle: r.questionnaire?.title
      }))
    });
  } catch (error) {
    return handleApiError(error);
  }
}
