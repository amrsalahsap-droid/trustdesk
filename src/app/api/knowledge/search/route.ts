import { NextResponse } from "next/server";
import { buildAuthContext } from "@/lib/auth/build-context";
import { authorizePermission } from "@/lib/auth/authorize-role";
import { Permission } from "@/lib/auth/permissions";
import { SemanticSearchService } from "@/modules/workspaces/search/semantic-search-service";

/**
 * GET: Perform a semantic search across a workspace's documents.
 * Query Param: q = the search term
 */
export async function GET(request: Request) {
  try {
    // Build auth context and verify VIEW_ANSWERS permission
    const ctx = await buildAuthContext(request);
    authorizePermission(ctx, Permission.VIEW_ANSWERS);
    const workspaceId = ctx.workspaceId;

    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q");

    if (!query || query.trim().length < 2) {
      return NextResponse.json({ results: [] });
    }

    const results = await SemanticSearchService.search(query, workspaceId, 10);

    return NextResponse.json({ results });
  } catch (error) {
    console.error("api:knowledge:search:failed", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
