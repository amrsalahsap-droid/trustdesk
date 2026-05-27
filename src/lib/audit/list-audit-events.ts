import { prisma } from "@/lib/db/prisma";
import type { AuditEvent } from "@prisma/client";
import { AUDIT_OBJECT_TYPES } from "./audit-event-types";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

export async function listAuditEventsForWorkspace(params: {
  workspaceId: string;
  limit?: number;
  actorUserId?: string;
  eventType?: string;
  objectType?: string;
  startDate?: Date;
  endDate?: Date;
}): Promise<AuditEvent[]> {
  const take = Math.min(params.limit ?? DEFAULT_LIMIT, MAX_LIMIT);

  return prisma.auditEvent.findMany({
    where: {
      workspaceId: params.workspaceId,
      actorUserId: params.actorUserId || undefined,
      eventType: params.eventType || undefined,
      objectType: params.objectType || undefined,
      createdAt: {
        gte: params.startDate || undefined,
        lte: params.endDate || undefined,
      },
    },
    orderBy: { createdAt: "desc" },
    take,
  });
}

/** Audit trail for a single answer (workflow + ownership events). */
export async function listAuditEventsForAnswer(params: {
  workspaceId: string;
  answerId: string;
  limit?: number;
}): Promise<AuditEvent[]> {
  const take = Math.min(params.limit ?? 100, MAX_LIMIT);
  return prisma.auditEvent.findMany({
    where: {
      workspaceId: params.workspaceId,
      objectId: params.answerId,
      objectType: AUDIT_OBJECT_TYPES.ANSWER_LIBRARY_ITEM,
    },
    orderBy: { createdAt: "desc" },
    take,
  });
}

export type AnswerAuditEventRow = AuditEvent & {
  actorLabel: string | null;
  actorEmail: string | null;
};

/** Same as {@link listAuditEventsForAnswer} plus display fields for actor users. */
export async function listAnswerAuditEventsEnriched(params: {
  workspaceId: string;
  answerId: string;
  limit?: number;
}): Promise<AnswerAuditEventRow[]> {
  const events = await listAuditEventsForAnswer(params);
  const actorIds = [
    ...new Set(events.map((e) => e.actorUserId).filter((id): id is string => Boolean(id))),
  ];
  if (actorIds.length === 0) {
    return events.map((e) => ({ ...e, actorLabel: null, actorEmail: null }));
  }
  const users = await prisma.user.findMany({
    where: { id: { in: actorIds } },
    select: { id: true, name: true, email: true },
  });
  const byId = new Map(users.map((u) => [u.id, u]));
  return events.map((e) => {
    const u = e.actorUserId ? byId.get(e.actorUserId) : undefined;
    const label = u?.name?.trim() || u?.email || null;
    return { ...e, actorLabel: label, actorEmail: u?.email ?? null };
  });
}

/** Rich listing for the main Audit Center page. */
export async function listWorkspaceAuditEventsEnriched(params: {
  workspaceId: string;
  limit?: number;
  actorUserId?: string;
  eventType?: string;
  objectType?: string;
  startDate?: Date;
  endDate?: Date;
}): Promise<AnswerAuditEventRow[]> {
  const events = await listAuditEventsForWorkspace(params);
  const actorIds = [
    ...new Set(events.map((e) => e.actorUserId).filter((id): id is string => Boolean(id))),
  ];
  if (actorIds.length === 0) {
    return events.map((e) => ({ ...e, actorLabel: null, actorEmail: null }));
  }
  const users = await prisma.user.findMany({
    where: { id: { in: actorIds } },
    select: { id: true, name: true, email: true },
  });
  const byId = new Map(users.map((u) => [u.id, u]));
  return events.map((e) => {
    const u = e.actorUserId ? byId.get(e.actorUserId) : undefined;
    const label = u?.name?.trim() || u?.email || "System";
    return { ...e, actorLabel: label, actorEmail: u?.email ?? null };
  });
}
