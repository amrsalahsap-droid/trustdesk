import { prisma } from "@/lib/db/prisma";
import { getLandingDestination } from "@/lib/navigation/landing-destinations";

/**
 * Server-driven post-auth destination based on workspace memberships.
 */
export async function getPostAuthRedirectForUser(userId: string): Promise<string> {
  const memberships = await prisma.workspaceMembership.findMany({
    where: {
      userId,
      status: "ACTIVE",
      workspace: { status: "ACTIVE" },
    },
    select: { 
      workspaceId: true,
      role: true
    },
  });

  if (memberships.length === 0) {
    return "/onboarding";
  }

  if (memberships.length > 1) {
    return "/workspace-selection";
  }

  const membership = memberships[0];
  const targetPath = getLandingDestination(membership.role);
  
  return `${targetPath}${targetPath.includes("?") ? "&" : "?"}workspaceId=${membership.workspaceId}`;
}
