import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logging/logger";
import { AUDIT_EVENT_TYPES, AUDIT_OBJECT_TYPES, recordAuditEventSafe } from "@/lib/audit";
import { generateUniqueWorkspaceSlug } from "@/lib/utils/generate-unique-workspace-slug";
import type { Workspace, WorkspaceMembership } from "@prisma/client";

const SLUG_RETRY_MAX = 5;

async function createWorkspaceAndOwnerInTransaction(
  userId: string,
  displayName: string,
  slug: string,
  metadata?: {
    website?: string;
    industry?: string[];
    productType?: string[];
    customerSegment?: string[];
    dataTypes?: string[];
    complianceTargets?: string[];
  }
): Promise<{ workspace: Workspace; membership: WorkspaceMembership }> {
  return prisma.$transaction(async (tx) => {
    const workspace = await tx.workspace.create({
      data: {
        name: displayName,
        slug,
        status: "ACTIVE",
        isDemo: false,
        ...metadata,
      },
    });

    const membership = await tx.workspaceMembership.create({
      data: {
        userId,
        workspaceId: workspace.id,
        role: "OWNER",
        status: "ACTIVE",
      },
    });

    await tx.user.update({
      where: { id: userId },
      data: { lastActiveWorkspaceId: workspace.id }
    });

    return { workspace, membership };
  });
}

/**
 * Creates a workspace and OWNER membership transactionally.
 * Retries on unique slug races (P2002) after recomputing slug.
 */
export async function createWorkspaceForUser(
  userId: string,
  name: string,
  metadata?: {
    website?: string;
    industry?: string[];
    productType?: string[];
    customerSegment?: string[];
    dataTypes?: string[];
    complianceTargets?: string[];
  }
): Promise<{ workspace: Workspace; membership: WorkspaceMembership }> {
  const displayName = name.trim();
  let lastError: unknown;

  for (let attempt = 0; attempt < SLUG_RETRY_MAX; attempt++) {
    const slug = await generateUniqueWorkspaceSlug(displayName);
    try {
      const result = await createWorkspaceAndOwnerInTransaction(userId, displayName, slug, metadata);

      logger.info("workspace:created", {
        userId,
        workspaceId: result.workspace.id,
        slug,
      });

      await recordAuditEventSafe({
        workspaceId: result.workspace.id,
        actorUserId: userId,
        eventType: AUDIT_EVENT_TYPES.WORKSPACE_CREATED,
        objectType: AUDIT_OBJECT_TYPES.WORKSPACE,
        objectId: result.workspace.id,
        metadata: { name: result.workspace.name, slug: result.workspace.slug },
      });

      await recordAuditEventSafe({
        workspaceId: result.workspace.id,
        actorUserId: userId,
        eventType: AUDIT_EVENT_TYPES.WORKSPACE_MEMBERSHIP_CREATED,
        objectType: AUDIT_OBJECT_TYPES.WORKSPACE_MEMBERSHIP,
        objectId: result.membership.id,
        metadata: { role: result.membership.role, userId },
      });

      return result;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        lastError = error;
        continue;
      }
      throw error;
    }
  }

  logger.error("workspace:slug-retry-exhausted", { userId, attempts: SLUG_RETRY_MAX });
  throw lastError instanceof Error ? lastError : new Error("Slug collision retry exhausted");
}
