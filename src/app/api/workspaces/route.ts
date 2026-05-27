import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveUserIdentity } from "@/lib/auth/resolve-identity";
import { createWorkspaceForUser } from "@/modules/workspaces";
import { handleApiError } from "@/lib/api/error-handler";

const CreateWorkspaceSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Workspace name must be at least 2 characters")
    .max(80, "Workspace name must be at most 80 characters"),
});

export async function POST(request: Request) {
  try {
    const { userId } = await resolveUserIdentity();

    const body: unknown = await request.json();
    const parsed = CreateWorkspaceSchema.safeParse(body);

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

    const { workspace, membership } = await createWorkspaceForUser(userId, parsed.data.name);

    return NextResponse.json(
      {
        workspace: {
          id: workspace.id,
          name: workspace.name,
          slug: workspace.slug,
        },
        membership: {
          id: membership.id,
          role: membership.role,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    return handleApiError(error);
  }
}
