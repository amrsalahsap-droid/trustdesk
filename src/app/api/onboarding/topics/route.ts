import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { TopicsService } from "@/modules/knowledge/topics/topics-service";
import { logger } from "@/lib/logging/logger";
import { auth } from "@/lib/auth/auth-utils";

/**
 * API to persist selected topics during onboarding.
 * Mark topics as ACTIVE and "onboarding-prepared".
 */
export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { workspaceId, topicKeys } = body;

    if (!workspaceId || !Array.isArray(topicKeys)) {
      return NextResponse.json({ error: "Invalid request payload" }, { status: 400 });
    }

    logger.info("onboarding:topics:persist", {
      workspaceId,
      topicCount: topicKeys.length,
      userId: session.user.id,
    });

    // 1. Get global topics to copy their metadata
    const globalTopics = await prisma.knowledgeTopic.findMany({
      where: {
        workspaceId: "SYSTEM_WORKSPACE",
        key: { in: topicKeys },
      },
    });

    const results = [];
    for (const key of topicKeys) {
      const globalTopic = globalTopics.find(t => t.key === key);
      
      // If we found a global topic, use its name/desc, otherwise use a placeholder
      const name = globalTopic?.name || key.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
      const description = globalTopic?.description || `Trust topic for ${name}`;

      const topic = await TopicsService.upsertWorkspaceTopic(workspaceId, {
        key,
        name,
        description,
        status: "ACTIVE",
      });
      results.push(topic);
    }

    // 2. Update workspace onboarding metadata
    await prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        onboardingIntelMetaJson: {
          ...(await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { onboardingIntelMetaJson: true } }))?.onboardingIntelMetaJson as any,
          selectedTopicKeys: topicKeys,
          topicsPreparedAt: new Date().toISOString(),
        }
      }
    });

    return NextResponse.json({ 
      success: true, 
      count: results.length,
      message: `Successfully persisted ${results.length} topics`
    });

  } catch (error) {
    logger.error("onboarding:topics:error", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ 
      error: "Failed to persist topics", 
      detail: error instanceof Error ? error.message : String(error) 
    }, { status: 500 });
  }
}
