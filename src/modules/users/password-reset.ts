import { prisma } from "@/lib/db/prisma";
import crypto from "crypto";
import bcrypt from "bcrypt";
import { logger } from "@/lib/logging/logger";
import { AUDIT_EVENT_TYPES, AUDIT_OBJECT_TYPES, recordAuditEventSafe } from "@/lib/audit";
import { hashToken } from "@/lib/auth/token-hash";
import { checkRateLimit } from "@/lib/auth/security";

const RESET_TOKEN_EXPIRY_MS = 1 * 60 * 60 * 1000; // 1 hour

/**
 * Generates a password reset token for the given email.
 * If user doesn't exist, it still returns "success" to avoid enumeration.
 */
export async function requestPasswordReset(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  
  // 1. Rate Limit
  if (!checkRateLimit(`password-reset:${normalizedEmail}`, 3, 15 * 60 * 1000)) {
    throw new Error("TOO_MANY_REQUESTS");
  }

  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: { id: true },
  });

  if (!user) {
    logger.info("auth:password-reset-requested:user-not-found", { email: normalizedEmail });
    return { success: true }; // Silent success
  }

  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + RESET_TOKEN_EXPIRY_MS);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordResetTokenHash: tokenHash,
      passwordResetExpiresAt: expiresAt,
    },
  });

  logger.info("auth:password-reset-requested", { userId: user.id, email: normalizedEmail });

  await recordAuditEventSafe({
    actorUserId: user.id,
    eventType: AUDIT_EVENT_TYPES.PASSWORD_RESET_REQUESTED,
    objectType: AUDIT_OBJECT_TYPES.USER,
    objectId: user.id,
    metadata: { email: normalizedEmail },
  });

  return { success: true, token: rawToken, userId: user.id };
}

/**
 * Resets the password using a valid token.
 */
export async function resetPassword(token: string, newPassword: string) {
  const tokenHash = hashToken(token);
  const user = await prisma.user.findUnique({
    where: { passwordResetTokenHash: tokenHash },
  });

  if (!user || !user.passwordResetExpiresAt || user.passwordResetExpiresAt < new Date()) {
    throw new Error("INVALID_OR_EXPIRED_TOKEN");
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash,
      passwordResetTokenHash: null,
      passwordResetExpiresAt: null,
    },
  });

  logger.info("auth:password-reset-complete", { userId: user.id });

  await recordAuditEventSafe({
    actorUserId: user.id,
    eventType: AUDIT_EVENT_TYPES.PASSWORD_RESET_COMPLETED,
    objectType: AUDIT_OBJECT_TYPES.USER,
    objectId: user.id,
  });

  return { success: true };
}
