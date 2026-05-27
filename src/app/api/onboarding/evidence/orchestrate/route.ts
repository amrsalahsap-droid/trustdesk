import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth-utils";
import { EvidenceOrchestrationService } from "@/modules/workspaces/onboarding/evidence-orchestration-service";
import { logger } from "@/lib/logging/logger";
import { prisma } from "@/lib/db/prisma";

/**
 * API to orchestrate evidence after upload during onboarding.
 * Automatically categorizes documents and links them to topics/readiness.
 */
export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      workspaceId,
      userId,
      documentId,
      expectedDocumentType,
      linkedTopicKeys,
      recommendationId,
      onboardingSessionId,
      evidenceCategory,
    } = body;

    if (!workspaceId || !documentId) {
      return NextResponse.json({ error: "workspaceId and documentId are required" }, { status: 400 });
    }

    const actorId = userId || session.user.id;

    const membership = await prisma.workspaceMembership.findFirst({
      where: {
        workspaceId,
        userId: actorId,
        status: "ACTIVE",
      },
    });
    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    logger.info("onboarding:evidence:orchestrate:start", {
      workspaceId,
      documentId,
      userId: actorId,
      expectedType: expectedDocumentType,
      recommendationId,
    });

    const document = await prisma.sourceDocument.findUnique({
      where: { id: documentId, workspaceId },
    });

    if (!document) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    let parsedTopicKeys: string[] | undefined;
    if (Array.isArray(linkedTopicKeys)) {
      parsedTopicKeys = linkedTopicKeys.filter((k: unknown) => typeof k === "string");
    } else if (typeof linkedTopicKeys === "string") {
      try {
        const arr = JSON.parse(linkedTopicKeys);
        if (Array.isArray(arr)) parsedTopicKeys = arr.filter((k) => typeof k === "string");
      } catch {
        parsedTopicKeys = undefined;
      }
    }

    const orchestrationSessionId =
      typeof onboardingSessionId === "string" && onboardingSessionId.length > 0
        ? onboardingSessionId
        : `onboarding-${Date.now()}`;

    const result = await EvidenceOrchestrationService.orchestrateEvidence(
      documentId,
      workspaceId,
      actorId,
      {
        filename: document.originalName,
        uploadContext: typeof expectedDocumentType === "string" ? expectedDocumentType : undefined,
        orchestrationSessionId,
        linkedTopicKeys: parsedTopicKeys,
      },
    );

    const orchestrationOk = result.errors.length === 0;

    if (recommendationId && orchestrationOk) {
      const ws = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { onboardingIntelMetaJson: true },
      });
      const meta = (ws?.onboardingIntelMetaJson as Record<string, unknown>) || {};
      const prev = (meta.satisfiedRecommendationIds as string[]) || [];
      const satisfiedRecommendationIds = Array.from(new Set([...prev, recommendationId]));

      await prisma.workspace.update({
        where: { id: workspaceId },
        data: {
          onboardingIntelMetaJson: {
            ...meta,
            satisfiedRecommendationIds,
            lastEvidenceUploadedAt: new Date().toISOString(),
            lastOnboardingEvidenceUpload: {
              recommendationId,
              documentId,
              expectedDocumentType: expectedDocumentType ?? null,
              evidenceCategory: evidenceCategory ?? null,
              orchestrationSessionId,
              linkedTopicKeys: parsedTopicKeys ?? null,
              at: new Date().toISOString(),
            },
          },
        },
      });
    }

    return NextResponse.json({
      success: orchestrationOk,
      orchestration: result,
      message: orchestrationOk
        ? `Successfully orchestrated ${result.documentType}`
        : result.errors.join("; ") || "Orchestration completed with warnings",
    });
  } catch (error) {
    logger.error("onboarding:evidence:orchestrate:error", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      {
        error: "Failed to orchestrate evidence",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
