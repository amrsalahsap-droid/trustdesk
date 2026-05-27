import { NextResponse } from "next/server";
import { buildAuthContext } from "@/lib/auth/build-context";
import { handleApiError } from "@/lib/api/error-handler";
import { assertSubcontrolGovernancePatch } from "@/lib/auth/governance-actions";
import { AnswerAssignmentService } from "@/modules/knowledge/answers/answer-assignment-service";
import { z } from "zod";

const PatchSchema = z.object({
  ownerId: z.string().nullable().optional(),
  approverId: z.string().nullable().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: { topicId: string; subControlKey: string } }
) {
  try {
    const ctx = await buildAuthContext(request);
    assertSubcontrolGovernancePatch(ctx);
    const workspaceId = ctx.workspaceId;

    if (!workspaceId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { topicId, subControlKey } = params;
    const body = await request.json();
    const parsed = PatchSchema.parse(body);

    const governance = await AnswerAssignmentService.assignSubControlGovernance(
      topicId,
      subControlKey,
      {
        workspaceId,
        actorUserId: ctx.userId!,
        ownerId: parsed.ownerId,
        approverId: parsed.approverId,
      }
    );

    return NextResponse.json({ governance });
  } catch (error) {
    console.error("api:knowledge:subcontrols:governance:patch:failed", error);
    return handleApiError(error);
  }
}
