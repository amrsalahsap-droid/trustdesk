import { prisma } from "@/lib/db/prisma";
import { recordAuditEventSafe } from "@/lib/audit/record-audit-event";
import { AUDIT_EVENT_TYPES, AUDIT_OBJECT_TYPES } from "@/lib/audit/audit-event-types";
import { logger } from "@/lib/logging/logger";

export interface AssignmentInput {
  workspaceId: string;
  actorUserId: string;
  ownerId?: string | null;
  approverId?: string | null;
}

export class AnswerAssignmentService {
  /**
   * Reassigns ownership or approver for a specific AnswerLibraryItem.
   */
  static async assignAnswerGovernance(
    answerId: string,
    input: AssignmentInput
  ) {
    const { workspaceId, actorUserId, ownerId, approverId } = input;

    const answer = await prisma.answerLibraryItem.findUnique({
      where: { id: answerId, workspaceId },
      select: { ownerId: true, approverId: true, title: true },
    });

    if (!answer) {
      throw new Error("Answer not found or access denied");
    }

    const data: any = {};
    if (ownerId !== undefined) data.ownerId = ownerId;
    if (approverId !== undefined) data.approverId = approverId;

    const updated = await prisma.answerLibraryItem.update({
      where: { id: answerId },
      data,
    });

    // Record audit events
    if (ownerId !== undefined && ownerId !== answer.ownerId) {
      await recordAuditEventSafe({
        workspaceId,
        actorUserId,
        eventType: AUDIT_EVENT_TYPES.ANSWER_OWNER_CHANGED,
        objectType: AUDIT_OBJECT_TYPES.ANSWER_LIBRARY_ITEM,
        objectId: answerId,
        metadata: {
          previousOwnerId: answer.ownerId,
          newOwnerId: ownerId,
          title: answer.title,
        },
      });
    }

    if (approverId !== undefined && approverId !== answer.approverId) {
      await recordAuditEventSafe({
        workspaceId,
        actorUserId,
        eventType: AUDIT_EVENT_TYPES.APPROVER_CHANGED,
        objectType: AUDIT_OBJECT_TYPES.ANSWER_LIBRARY_ITEM,
        objectId: answerId,
        metadata: {
          previousApproverId: answer.approverId,
          newApproverId: approverId,
          title: answer.title,
        },
      });
    }

    return updated;
  }

  /**
   * Sets governance defaults for a specific KnowledgeTopic.
   */
  static async assignTopicGovernance(
    topicId: string,
    input: AssignmentInput
  ) {
    const { workspaceId, actorUserId, ownerId, approverId } = input;

    const topic = await prisma.knowledgeTopic.findFirst({
      where: { id: topicId, workspaceId },
      select: { ownerId: true, approverId: true, name: true },
    });

    if (!topic) {
      throw new Error("Topic not found or access denied");
    }

    const data: any = {};
    if (ownerId !== undefined) data.ownerId = ownerId;
    if (approverId !== undefined) data.approverId = approverId;

    const updated = await prisma.knowledgeTopic.update({
      where: { id: topicId },
      data,
    });

    await recordAuditEventSafe({
      workspaceId,
      actorUserId,
      eventType: AUDIT_EVENT_TYPES.TOPIC_OWNER_CHANGED,
      objectType: AUDIT_OBJECT_TYPES.KNOWLEDGE_TOPIC,
      objectId: topicId,
      metadata: {
        ownerId,
        approverId,
        topicName: topic.name,
      },
    });

    return updated;
  }

  /**
   * Sets governance defaults for a specific sub-control within a topic.
   */
  static async assignSubControlGovernance(
    topicId: string,
    subControlKey: string,
    input: AssignmentInput
  ) {
    const { workspaceId, actorUserId, ownerId, approverId } = input;

    const governance = await prisma.subControlGovernance.upsert({
      where: {
        workspaceId_topicId_subControlKey: {
          workspaceId,
          topicId,
          subControlKey,
        },
      },
      create: {
        workspaceId,
        topicId,
        subControlKey,
        ownerId,
        approverId,
      },
      update: {
        ownerId,
        approverId,
      },
    });

    await recordAuditEventSafe({
      workspaceId,
      actorUserId,
      eventType: AUDIT_EVENT_TYPES.GOVERNANCE_ASSIGNMENT_UPDATED,
      objectType: AUDIT_OBJECT_TYPES.SUB_CONTROL_GOVERNANCE,
      objectId: governance.id,
      metadata: {
        topicId,
        subControlKey,
        ownerId,
        approverId,
      },
    });

    return governance;
  }
}
