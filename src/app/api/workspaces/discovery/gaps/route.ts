import { NextResponse } from "next/server";
import { buildAuthContext } from "@/lib/auth/build-context";
import { handleApiError } from "@/lib/api/error-handler";
import { GapDiscoveryService } from "@/modules/knowledge/topics/gap-discovery-service";

/**
 * Trigger Questionnaire-Gap-Driven Topic Discovery.
 * D13-EN-03: Analyzes recurring missing themes in questionnaires to suggest library expansions.
 */
export async function POST(request: Request) {
  try {
    const ctx = await buildAuthContext(request);
    const workspaceId = ctx.workspaceId;

    if (!workspaceId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const topics = await GapDiscoveryService.discoverTopicsFromGaps(workspaceId);

    return NextResponse.json({ 
      success: true, 
      discoveredCount: topics.length,
      topics 
    });
  } catch (error) {
    console.error("api:workspaces:discovery:gaps:failed", error);
    return handleApiError(error);
  }
}
