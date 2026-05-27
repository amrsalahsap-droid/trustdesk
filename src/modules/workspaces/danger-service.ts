import { prisma } from "@/lib/db/prisma";
import { AUDIT_EVENT_TYPES, AUDIT_OBJECT_TYPES, recordAuditEventSafe } from "@/lib/audit";
import { logger } from "@/lib/logging/logger";

/**
 * Service for high-risk, destructive workspace actions.
 * All actions are audit-logged and require admin-level permissions (enforced at API level).
 */
export const WorkspaceDangerService = {
  /**
   * Archives a workspace, marking it as inactive.
   * Archiving prevents further content additions but preserves data.
   */
  async archiveWorkspace(workspaceId: string, actorUserId: string) {
    logger.info("workspace:danger:archive:start", { workspaceId, actorUserId });

    const updated = await prisma.workspace.update({
      where: { id: workspaceId },
      data: { status: "ARCHIVED" },
    });

    await recordAuditEventSafe({
      workspaceId,
      actorUserId,
      eventType: "WORKSPACE_ARCHIVED",
      objectType: AUDIT_OBJECT_TYPES.WORKSPACE,
      objectId: workspaceId,
      metadata: { action: "ARCHIVE", previousStatus: "ACTIVE", newStatus: "ARCHIVED" },
    });

    return updated;
  },

  /**
   * Bulk revokes all pending invitations for the workspace.
   */
  async revokeAllPendingInvites(workspaceId: string, actorUserId: string) {
    logger.info("workspace:danger:revoke-all-invites:start", { workspaceId, actorUserId });

    const now = new Date();
    const result = await prisma.workspaceInvitation.updateMany({
      where: {
        workspaceId,
        status: "PENDING",
      },
      data: {
        status: "REVOKED",
        revokedAt: now,
      },
    });

    await recordAuditEventSafe({
      workspaceId,
      actorUserId,
      eventType: "WORKSPACE_INVITES_REVOKED_BULK",
      objectType: AUDIT_OBJECT_TYPES.WORKSPACE,
      objectId: workspaceId,
      metadata: { action: "REVOKE_ALL_INVITES", count: result.count },
    });

    return { count: result.count };
  },

  /**
   * Resets all export-related defaults to their system initial values.
   */
  async resetExportDefaults(workspaceId: string, actorUserId: string) {
    logger.info("workspace:danger:reset-export-defaults:start", { workspaceId, actorUserId });

    const updated = await prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        exportIncludeEvidence: false,
        exportIncludeProvenance: true,
        exportFormatDefault: "xlsx",
        exportUnresolvedBehavior: "leave_blank",
        exportFontFamily: "Calibri",
        exportFontSize: 11,
        exportBoldHeaders: true,
        exportVerticalTop: true,
        exportWrapText: true,
        exportOutputColumnName: "TrustDesk Answer",
        exportAutoMoveNotesToEnd: true,
        questionnaireExportStrictBuyerMode: true,
        questionnaireExportContradictionMediumPolicy: "WARN",
        requireApproverExportSafeConfirmation: true,
      },
    });

    await recordAuditEventSafe({
      workspaceId,
      actorUserId,
      eventType: "WORKSPACE_EXPORT_DEFAULTS_RESET",
      objectType: AUDIT_OBJECT_TYPES.WORKSPACE,
      objectId: workspaceId,
      metadata: { action: "RESET_EXPORT_DEFAULTS" },
    });

    return updated;
  },
};
