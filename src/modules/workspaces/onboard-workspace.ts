import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logging/logger";
import { AlreadyOnboardedError, UserNotFoundError } from "@/lib/auth/errors";
import { slugify } from "@/lib/utils/slug";
import { createWorkspaceForUser } from "./create-workspace";

const workspaceNameSchema = z
  .string()
  .trim()
  .min(2, "Workspace name must be at least 2 characters")
  .max(80, "Workspace name must be at most 80 characters")
  .refine((s) => /\S/.test(s), "Workspace name cannot be only whitespace")
  .refine((s) => slugify(s).length > 0, "Workspace name cannot produce an empty slug");

export type CreateWorkspaceInput = {
  userId: string;
  workspaceName: string;
  website?: string;
  industry?: string[];
  productType?: string[];
  customerSegment?: string[];
  dataTypes?: string[];
  complianceTargets?: string[];
};

export type CreateWorkspaceResult = {
  workspaceId: string;
  workspaceName: string;
  workspaceSlug: string;
  membershipId: string;
  role: "OWNER";
};

export async function createWorkspaceDuringOnboarding(
  input: CreateWorkspaceInput,
): Promise<CreateWorkspaceResult> {
  const workspaceName = workspaceNameSchema.parse(input.workspaceName);

  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { id: true },
  });
  if (!user) {
    throw new UserNotFoundError();
  }

  const existingMembership = await prisma.workspaceMembership.findFirst({
    where: {
      userId: input.userId,
      status: "ACTIVE",
      workspace: {
        status: "ACTIVE",
        isDemo: false,
      },
    },
    include: {
      workspace: {
        select: {
          id: true,
          name: true,
          industry: true,
        },
      },
    },
  });

  if (existingMembership) {
    const isProfileComplete = (existingMembership.workspace.industry?.length ?? 0) > 0;
    logger.warn("onboarding:already-onboarded", {
      userId: input.userId,
      workspaceId: existingMembership.workspace.id,
      isProfileComplete,
    });
    throw new AlreadyOnboardedError("This profile already has a workspace.", {
      workspaceId: existingMembership.workspace.id,
      workspaceName: existingMembership.workspace.name,
      isProfileComplete,
    });
  }

  const { workspace, membership } = await createWorkspaceForUser(input.userId, workspaceName, {
    website: input.website,
    industry: input.industry,
    productType: input.productType,
    customerSegment: input.customerSegment,
    dataTypes: input.dataTypes,
    complianceTargets: input.complianceTargets,
  });

  logger.info("onboarding:workspace-created", {
    userId: input.userId,
    workspaceId: workspace.id,
  });

  return {
    workspaceId: workspace.id,
    workspaceName: workspace.name,
    workspaceSlug: workspace.slug,
    membershipId: membership.id,
    role: "OWNER",
  };
}
