import { NextResponse } from "next/server";
import { buildAuthContext } from "@/lib/auth/build-context";
import { handleApiError } from "@/lib/api/error-handler";
import { prisma, uncheckedPrisma } from "@/lib/db/prisma";
import { SeedingService } from "@/modules/workspaces/intelligence/seeding-service";
import { GLOBAL_WORKSPACE_ID } from "@/modules/knowledge/topics/topics-service";

/**
 * POST /api/knowledge/topics/[topicId]/seed
 * Manually trigger answer seeding for a specific topic based on its linked evidence.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ topicId: string }> }
) {
  try {
    const { topicId } = await params;
    const ctx = await buildAuthContext(request);
    const workspaceId = ctx.workspaceId;

    if (!workspaceId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // D10-EN-08: Use unchecked client to peek outside tenant sandbox for global topics
    const topic = await uncheckedPrisma.knowledgeTopic.findUnique({
      where: { id: topicId },
    });

    // Authorize: topic must be global OR belong to this workspace
    const isGlobal = !topic?.workspaceId || topic.workspaceId === GLOBAL_WORKSPACE_ID;
    const isOwner = topic?.workspaceId === workspaceId;

    if (!topic || (!isGlobal && !isOwner)) {
        return NextResponse.json({ error: "Topic not found or unauthorized" }, { status: 404 });
    }

    const result = await SeedingService.seedSingleTopic(
      workspaceId,
      topic.id,
      topic.name,
      topic.key ?? null,
      topic.workspaceId ?? null,
    );

    if (result.kind === "failed") {
      return NextResponse.json({ 
        success: false, 
        error: result.error 
      }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      kind: result.kind,
      result 
    });
  } catch (error) {
    console.error("api:knowledge:topics:seed:failed", error);
    return handleApiError(error);
  }
}
