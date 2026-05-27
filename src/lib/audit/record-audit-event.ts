import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logging/logger";
import { sanitizeAuditMetadata } from "./safe-metadata";

const auditInputSchema = z.object({
  workspaceId: z.string().min(1).nullable().optional(),
  actorUserId: z.string().min(1).nullable().optional(),
  eventType: z.string().min(1).max(128),
  objectType: z.string().min(1).max(128),
  objectId: z.string().min(1).max(128).nullable().optional(),
  correlationId: z.string().max(128).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  userAgent: z.string().nullable().optional(),
  ipAddress: z.string().nullable().optional(),
});

export type AuditEventInput = z.infer<typeof auditInputSchema>;

/**
 * Validates and persists an append-only audit row. Throws on validation/DB errors.
 */
export async function recordAuditEvent(input: AuditEventInput): Promise<void> {
  const parsed = auditInputSchema.parse(input);
  const metadata = parsed.metadata ?? {};
  if (parsed.correlationId) {
    metadata.correlationId = parsed.correlationId;
  }
  const metadataJson = sanitizeAuditMetadata(Object.keys(metadata).length > 0 ? metadata : undefined);

  await prisma.auditEvent.create({
    data: {
      workspaceId: parsed.workspaceId ?? null,
      actorUserId: parsed.actorUserId ?? null,
      eventType: parsed.eventType,
      objectType: parsed.objectType,
      objectId: parsed.objectId ?? null,
      metadataJson: metadataJson ?? undefined,
      userAgent: parsed.userAgent ?? null,
      ipAddress: parsed.ipAddress ?? null,
    },
  });
}

/**
 * Records an audit event without failing the caller. Use after successful domain actions.
 * On failure, logs a structured error (never throws).
 */
export async function recordAuditEventSafe(input: AuditEventInput): Promise<void> {
  try {
    await recordAuditEvent(input);
  } catch (error) {
    logger.error("audit:write-failed", {
      eventType: input.eventType,
      objectType: input.objectType,
      workspaceId: input.workspaceId ?? null,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
