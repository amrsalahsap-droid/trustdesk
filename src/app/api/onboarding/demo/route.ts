import { NextResponse } from "next/server";
import { resolveUserIdentity } from "@/lib/auth/resolve-identity";
import { DemoSeedingService } from "@/modules/workspaces/onboarding/demo-seeding-service";
import { handleApiError } from "@/lib/api/error-handler";

export async function POST() {
  try {
    const { userId } = await resolveUserIdentity();

    const workspace = await DemoSeedingService.createDemoWorkspace(userId);

    return NextResponse.json(
      {
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        workspaceSlug: workspace.slug,
        redirectUrl: `/app/questionnaires?workspaceId=${workspace.id}`,
      },
      { status: 201 },
    );
  } catch (error) {
    return handleApiError(error);
  }
}
