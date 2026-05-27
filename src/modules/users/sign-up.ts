import bcrypt from "bcrypt";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { DuplicateEmailError } from "@/lib/auth/errors";
import { getPostAuthRedirectForUser } from "@/lib/auth/post-auth-redirect";
import { validateCsrf } from "@/lib/auth/security";
import { AUDIT_EVENT_TYPES, AUDIT_OBJECT_TYPES, recordAuditEventSafe } from "@/lib/audit";
import { logger } from "@/lib/logging/logger";
import { mailService } from "@/lib/mail/mail-service";
import crypto from "crypto";
import { hashToken } from "@/lib/auth/token-hash";

const signUpSchema = z.object({
  email: z
    .string()
    .min(1, "Email is required")
    .email("Invalid email")
    .transform((v) => v.trim().toLowerCase()),
  password: z.string()
    .min(8, "Password must be at least 8 characters")
    .refine((v) => /[a-z]/.test(v), { message: "Password must contain at least one lowercase letter" })
    .refine((v) => /[A-Z]/.test(v), { message: "Password must contain at least one uppercase letter" })
    .refine((v) => /[0-9]/.test(v), { message: "Password must contain at least one number" })
    .refine((v) => /[^A-Za-z0-9]/.test(v), { message: "Password must contain at least one special character" }),
  name: z.preprocess(
    (val) => (val === null || val === undefined || val === "" ? undefined : val),
    z.string().max(100).optional(),
  ),
});

/** Request body shape for signup (validated and normalized by `signUpUser`). */
export type SignUpInput = {
  email: string;
  password: string;
  name?: string;
};

export type SafeUser = { id: string; email: string; name: string | null };

export async function signUpUser(input: unknown, request: Request): Promise<{ user: SafeUser; next: string }> {
  if (!validateCsrf(request)) throw new Error("CSRF_VALIDATION_FAILED");
  // Rate limit disabled for now
  // if (!checkRateLimit(`signup:${request.headers.get("x-forwarded-for") || 'anon'}`, 3, 60 * 60 * 1000)) {
  //   throw new Error("RATE_LIMIT_EXCEEDED");
  // }
  const data = signUpSchema.parse(input);

  const existing = await prisma.user.findUnique({
    where: { email: data.email },
    select: { id: true },
  });
  if (existing) {
    throw new DuplicateEmailError();
  }

  const passwordHash = await bcrypt.hash(data.password, 12);
  const rawToken = crypto.randomBytes(32).toString("hex");
  const verificationTokenHash = hashToken(rawToken);
  const verificationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

  let user: SafeUser;
  try {
    user = await prisma.user.create({
      data: {
        email: data.email,
        name: data.name ?? null,
        passwordHash,
        verificationTokenHash,
        verificationExpiresAt,
      },
      select: { id: true, email: true, name: true },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new DuplicateEmailError();
    }
    throw error;
  }

  // Send verification email asynchronously
  mailService.sendVerificationEmail({
    to: user.email,
    token: rawToken,
  }).catch(err => {
    logger.error("auth:signup:send-verification-failed", {
      userId: user.id,
      error: err instanceof Error ? err.message : String(err),
    });
  });

  const userAgent = request.headers.get("user-agent");
  const ipAddress = request.headers.get("x-forwarded-for")?.split(",")[0] || null;

  await recordAuditEventSafe({
    actorUserId: user.id,
    eventType: AUDIT_EVENT_TYPES.USER_SIGNED_UP,
    objectType: AUDIT_OBJECT_TYPES.USER,
    objectId: user.id,
    metadata: { email: user.email },
    userAgent,
    ipAddress,
  });

  let next: string;
  try {
    next = await getPostAuthRedirectForUser(user.id);
  } catch (error) {
    logger.warn("auth:signup:post-auth-redirect-failed", {
      userId: user.id,
      reason: error instanceof Error ? error.message : String(error),
    });
    next = "/onboarding";
  }

  return { user, next };
}
