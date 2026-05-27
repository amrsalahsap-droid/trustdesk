import { NextResponse } from "next/server";
import { buildAuthContext } from "@/lib/auth/build-context";
import { handleApiError } from "@/lib/api/error-handler";
import { TopicDiscoveryService } from "@/modules/knowledge/topics/topic-discovery-service";

/**
 * Trigger Document-Driven Topic Discovery.
 * D10-EN-01: Analyzes orphan chunks to discover new meaningful business themes.
 */
export async function POST(request: Request) {
  try {
    const ctx = await buildAuthContext(request);
    const workspaceId = ctx.workspaceId;

    if (!workspaceId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const topics = await TopicDiscoveryService.discoverNewTopics(workspaceId);

    return NextResponse.json({ 
      success: true, 
      discoveredCount: topics.length,
      topics 
    });
  } catch (error) {
    console.error("api:workspaces:discovery:failed", error);
    return handleApiError(error);
  }
}
