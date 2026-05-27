import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { TopicPackService } from "@/modules/knowledge/topics/topic-pack-service";
import { CompanyProfileService } from "@/modules/workspaces/company-profile-service";
import { RecommendationOrchestrator } from "@/modules/workspaces/onboarding/recommendation-orchestrator";
import { WorkspacePreparationOrchestrator } from "@/modules/workspaces/onboarding/workspace-preparation-orchestrator";
import { resolveUserIdentity } from "@/lib/auth/resolve-identity";
import { handleApiError } from "@/lib/api/error-handler";

/** Exported for tests — hides upload/invite next-best rows when linked recs are satisfied in onboarding intel. */
export function shouldShowNextBestAction(
  action: { actionType: string; linkedRecommendationIds?: string[] },
  satisfiedRecommendationIds: Set<string>,
): boolean {
  if (action.actionType !== "upload_document" && action.actionType !== "invite_reviewer") {
    return true;
  }
  const linked = action.linkedRecommendationIds || [];
  if (linked.length === 0) return true;
  const allDone = linked.every((id) => satisfiedRecommendationIds.has(id));
  return !allDone;
}

const PostSchema = z.object({
  workspaceId: z.string(),
  topicKeys: z.array(z.string()),
  onboardingSessionId: z.string().optional(),
  profileSignals: z.object({
    industry: z.array(z.string()).optional(),
    productType: z.array(z.string()).optional(),
    customerSegment: z.array(z.string()).optional(),
    complianceTargets: z.array(z.string()).optional(),
    deepProfileJson: z.any().optional(),
    tailoringConfidence: z.number().optional(),
  }).optional(),
});

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get("workspaceId");

    if (!workspaceId) {
      return NextResponse.json({ error: "Missing workspaceId" }, { status: 400 });
    }

    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
    });

    if (!workspace) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    const companyProfile = CompanyProfileService.build({
      id: workspace.id,
      name: workspace.name,
      industry: workspace.industry,
      productType: workspace.productType,
      customerSegment: workspace.customerSegment,
      dataTypes: workspace.dataTypes,
      complianceTargets: workspace.complianceTargets,
      deepProfileJson: workspace.deepProfileJson,
    });

    // Legacy topic packs (maintained for backward compatibility)
    const packs = TopicPackService.getRecommendationsForProfile(companyProfile);

    // New orchestrated recommendations with scoring and ranking
    const orchestrator = new RecommendationOrchestrator();
    const orchestrationResult = orchestrator.orchestrate(companyProfile, {
      currentStage: "library_seeding",
      groundedSignalCount: companyProfile.tailoringConfidence > 0.5 ? 4 : 2,
      evidenceQuality: companyProfile.tailoringConfidence,
    });

    const intel = workspace.onboardingIntelMetaJson as Record<string, unknown> | null;
    const satisfiedRecommendationIds = new Set<string>(
      Array.isArray(intel?.satisfiedRecommendationIds)
        ? (intel!.satisfiedRecommendationIds as string[])
        : [],
    );

    const mergedRecommendations = orchestrationResult.recommendations.map((r) => {
      if (r.category !== "evidence_uploads") return r;
      const uploaded = satisfiedRecommendationIds.has(r.id);
      if (!r.evidenceMetadata) return r;
      return {
        ...r,
        evidenceMetadata: {
          ...r.evidenceMetadata,
          isUploaded: uploaded || r.evidenceMetadata.isUploaded,
        },
      };
    });

    const filteredNextBest = orchestrationResult.nextBestActions.filter((a) =>
      shouldShowNextBestAction(a, satisfiedRecommendationIds),
    );

    return NextResponse.json({
      // Legacy response
      packs,
      // New orchestrated response
      orchestration: {
        recommendations: mergedRecommendations,
        topRecommendations: orchestrationResult.topRecommendations,
        nextBestActions: filteredNextBest,
        summary: {
          ...orchestrationResult.summary,
          foundation: orchestrationResult.summary.foundation,
          evidenceBackedCount: mergedRecommendations.filter(
            (r) => r.category === "evidence_uploads" && r.evidenceMetadata?.isUploaded,
          ).length,
        },
        byCategory: orchestrationResult.byCategory,
        byStage: orchestrationResult.byStage,
        metadata: {
          ...orchestrationResult.metadata,
          generatedAt: orchestrationResult.metadata.generatedAt.toISOString(),
        },
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const { userId } = await resolveUserIdentity();
    const body = await request.json();
    const parsed = PostSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }

    const { workspaceId, topicKeys, onboardingSessionId } = parsed.data;

    // Verify membership
    const membership = await prisma.workspaceMembership.findFirst({
      where: {
        workspaceId,
        userId,
        status: "ACTIVE",
      },
    });

    if (!membership) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Get workspace and company profile for context
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
    });

    if (!workspace) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    const companyProfile = CompanyProfileService.build({
      id: workspace.id,
      name: workspace.name,
      industry: workspace.industry,
      productType: workspace.productType,
      customerSegment: workspace.customerSegment,
      dataTypes: workspace.dataTypes,
      complianceTargets: workspace.complianceTargets,
      deepProfileJson: workspace.deepProfileJson,
    });

    // Get recommended topic packs for context
    const recommendedTopicPacks = TopicPackService.getRecommendationsForProfile(companyProfile);

    // Orchestrate complete workspace preparation
    const orchestrationResult = await WorkspacePreparationOrchestrator.orchestrateWorkspacePreparation({
      workspaceId,
      userId,
      selectedTopicKeys: new Set(parsed.data.topicKeys),
      recommendedTopicPacks,
      profileSignals: parsed.data.profileSignals || {},
      onboardingSessionId: parsed.data.onboardingSessionId || `session-${Date.now()}`,
      options: {
        forceRerun: false,
        skipEvidenceOrchestration: false,
        skipWorkflowConfiguration: false,
        retryFailedStages: false,
      },
    });

    return NextResponse.json({
      success: orchestrationResult.success,
      workspacePrepared: orchestrationResult.success,
      orchestration: {
        success: orchestrationResult.success,
        finalState: orchestrationResult.finalState,
        stageResults: orchestrationResult.stageResults,
        summary: orchestrationResult.summary,
        nextActions: orchestrationResult.nextActions,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
