import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { buildAuthContext } from "@/lib/auth/build-context";
import { handleApiError } from "@/lib/api/error-handler";
import { RESPONSE_TONES } from "@/lib/ai/tones";

export async function PATCH(
  request: Request,
  segment: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await buildAuthContext(request);
    const { id } = await segment.params;
    const body = await request.json();
    const { tone } = body;

    if (!tone || !(tone in RESPONSE_TONES)) {
      return NextResponse.json(
        { error: { code: "INVALID_TONE", message: "Invalid tone selected" } },
        { status: 400 },
      );
    }

    const questionnaire = await prisma.questionnaire.update({
      where: { id, workspaceId: ctx.workspaceId },
      data: { tone },
    });

    return NextResponse.json({ tone: questionnaire.tone });
  } catch (err) {
    return handleApiError(err);
  }
}
