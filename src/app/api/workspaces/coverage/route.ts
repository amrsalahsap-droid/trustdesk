import { NextResponse } from "next/server";

import { buildAuthContext } from "@/lib/auth/build-context";
import { handleApiError } from "@/lib/api/error-handler";
import { buildWorkspaceCoverageReport } from "@/modules/workspaces/coverage/workspace-coverage-service";
import { ClassificationService } from "@/modules/workspaces/source-documents/parsing/classification-service";
import { SeedingService } from "@/modules/workspaces/intelligence/seeding-service";
import { uncheckedPrisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logging/logger";

/**
 * GET  /api/workspaces/coverage
 *   → Returns the WorkspaceCoverageReport for the caller's workspace. Used
 *     by the DocumentCoverageBanner and the full coverage page.
 *
 * POST /api/workspaces/coverage
 *   Body: { action: "reclassify" | "reseed" }
 *   → "reclassify": wipes + re-runs top-K chunk classification for every
 *                   source document in the workspace.
 *   → "reseed":     re-runs SeedingService for the workspace (idempotent).
 *   Only available to authenticated workspace users. Emits audit/log lines
 *   so operators can trace who triggered a refresh.
 */
export async function GET(request: Request) {
  try {
    const ctx = await buildAuthContext(request);
    const report = await buildWorkspaceCoverageReport(ctx.workspaceId);
    return NextResponse.json({ report });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await buildAuthContext(request);
    const body = (await request.json().catch(() => ({}))) as { action?: string };
    const action = body.action;

    if (action === "reclassify") {
      const docs = await uncheckedPrisma.sourceDocument.findMany({
        where: { workspaceId: ctx.workspaceId },
        select: { id: true },
      });
      let totalMatches = 0;
      for (const d of docs) {
        totalMatches += await ClassificationService.classifyDocumentChunks(ctx.workspaceId, d.id);
      }
      logger.info("coverage:reclassify:complete", {
        workspaceId: ctx.workspaceId,
        actorUserId: ctx.userId,
        documents: docs.length,
        totalMatches,
      });
      const report = await buildWorkspaceCoverageReport(ctx.workspaceId);
      return NextResponse.json({ action, documentsReclassified: docs.length, totalMatches, report });
    }

    if (action === "reseed") {
      const result = await SeedingService.runTopicSeeding(ctx.workspaceId);
      logger.info("coverage:reseed:complete", {
        workspaceId: ctx.workspaceId,
        actorUserId: ctx.userId,
        created: result.created,
        skipped: result.skipped,
      });
      const report = await buildWorkspaceCoverageReport(ctx.workspaceId);
      return NextResponse.json({ action, created: result.created, skipped: result.skipped, report });
    }

    return NextResponse.json({ error: "Unknown action. Expected one of: reclassify, reseed." }, { status: 400 });
  } catch (err) {
    return handleApiError(err);
  }
}
