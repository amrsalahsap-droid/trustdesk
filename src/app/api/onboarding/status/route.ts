import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { buildAuthContext } from "@/lib/auth/build-context";
import { handleApiError } from "@/lib/api/error-handler";

export async function GET(request: Request) {
  try {
    const auth = await buildAuthContext(request);
    const { workspaceId } = auth;

    // 1. Calculate Statuses
    const documentCount = await prisma.sourceDocument.count({
      where: { workspaceId, uploadStatus: { not: "DELETED" } },
    });

    const completedParseJobCount = await prisma.sourceDocumentParseJob.count({
      where: { workspaceId, status: "COMPLETED" },
    });

    // For MVP, libraryReady is true if there's at least one completed parse job,
    // as that implies knowledge is seeding.
    const libraryReady = completedParseJobCount > 0;

    return NextResponse.json({
      status: {
        workspaceCreated: true,
        documentsUploaded: documentCount > 0,
        analysisCompleted: completedParseJobCount > 0,
        libraryReady,
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
