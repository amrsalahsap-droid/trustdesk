import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveUserIdentity } from "@/lib/auth/resolve-identity";
import { resolveWorkspaceMembership } from "@/lib/auth/resolve-membership";
import { handleApiError } from "@/lib/api/error-handler";

const SelectWorkspaceSchema = z
  .object({
    workspaceId: z.string().min(1, "workspaceId is required"),
  })
  .strict();

export async function POST(request: Request) {
  try {
    const { userId } = await resolveUserIdentity();

    const body: unknown = await request.json();
    const parsed = SelectWorkspaceSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid request body",
            issues: parsed.error.issues,
          },
        },
        { status: 400 },
      );
    }

    const membership = await resolveWorkspaceMembership({
      userId,
      requestedWorkspaceId: parsed.data.workspaceId,
    });
    
    // Persist as last active
    await prisma.user.update({
      where: { id: userId },
      data: { lastActiveWorkspaceId: membership.workspaceId }
    });

    return NextResponse.json({
      userId,
      workspaceId: membership.workspaceId,
      membershipId: membership.membershipId,
      role: membership.role,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
