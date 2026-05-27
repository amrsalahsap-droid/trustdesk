import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth-utils";
import { WorkspacePreparationOrchestrator } from "@/modules/workspaces/onboarding/workspace-preparation-orchestrator";
import { logger } from "@/lib/logging/logger";

/**
 * API to trigger workspace orchestration upon onboarding completion.
 */
export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { workspaceId, selectedTopicKeys, recommendedTopicPacks, profileSignals } = body;

    if (!workspaceId) {
      return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
    }

    logger.info("onboarding:orchestrate:start", {
      workspaceId,
      userId: session.user.id,
      topicCount: selectedTopicKeys?.length || 0,
    });

    const result = await WorkspacePreparationOrchestrator.orchestrateWorkspacePreparation({
      workspaceId,
      userId: session.user.id,
      selectedTopicKeys: new Set(selectedTopicKeys || []),
      recommendedTopicPacks: recommendedTopicPacks || [],
      profileSignals: profileSignals || {},
      onboardingSessionId: `setup-${Date.now()}`,
      options: {
        forceRerun: false,
        skipEvidenceOrchestration: false,
        skipWorkflowConfiguration: false,
        retryFailedStages: false,
      },
    });

    return NextResponse.json({ 
      success: result.success,
      orchestration: result,
      message: result.success ? "Workspace prepared successfully" : "Workspace preparation had some issues"
    });

  } catch (error) {
    logger.error("onboarding:orchestrate:error", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ 
      error: "Failed to orchestrate workspace", 
      detail: error instanceof Error ? error.message : String(error) 
    }, { status: 500 });
  }
}
