import { NextResponse } from "next/server";
import { AnswerGenerationService } from "@/modules/workspaces/intelligence/answer-generation-service";
import { buildAuthContext } from "@/lib/auth/build-context";
import { handleApiError } from "@/lib/api/error-handler";
import { assertAnswerGenerate } from "@/lib/auth/governance-actions";

/**
 * POST: Generate a drafted answer based on a prompt/question.
 * Body: { query, topicId }
 */
export async function POST(request: Request) {
  try {
    const ctx = await buildAuthContext(request);
    assertAnswerGenerate(ctx);
    const workspaceId = ctx.workspaceId;

    const { query } = await request.json();
    if (!query || query.trim().length < 5) {
      return NextResponse.json({ error: "Query too short for generation" }, { status: 400 });
    }

    const result = await AnswerGenerationService.generate(query, workspaceId);

    return NextResponse.json(result);
  } catch (error) {
    console.error("api:knowledge:answers:generate:failed", error);
    return handleApiError(error);
  }
}
