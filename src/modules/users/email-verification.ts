import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logging/logger";
import { AUDIT_EVENT_TYPES, AUDIT_OBJECT_TYPES, recordAuditEventSafe } from "@/lib/audit";
import { hashToken } from "@/lib/auth/token-hash";

/**
 * Verifies a user's email using a token.
 */
export async function verifyEmail(token: string) {
  const tokenHash = hashToken(token);
  
  const user = await prisma.user.findUnique({
    where: { verificationTokenHash: tokenHash },
  });

  if (!user || (user.verificationExpiresAt && user.verificationExpiresAt < new Date())) {
    throw new Error("INVALID_OR_EXPIRED_TOKEN");
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      emailVerifiedAt: new Date(),
      verificationTokenHash: null,
      verificationExpiresAt: null,
    },
  });

  logger.info("auth:email-verified", { userId: user.id });

  await recordAuditEventSafe({
    actorUserId: user.id,
    eventType: AUDIT_EVENT_TYPES.USER_UPDATED,
    objectType: AUDIT_OBJECT_TYPES.USER,
    objectId: user.id,
    metadata: { action: "EMAIL_VERIFIED" },
  });

  return { success: true };
}
