import bcrypt from "bcrypt";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { InvalidCredentialsError } from "@/lib/auth/errors";
import { getPostAuthRedirectForUser } from "@/lib/auth/post-auth-redirect";
import { recordAuditEventSafe, AUDIT_EVENT_TYPES, AUDIT_OBJECT_TYPES } from "@/lib/audit";
import { validateCsrf, checkRateLimit } from "@/lib/auth/security";
import type { SafeUser } from "./sign-up";

const loginSchema = z.object({
  email: z
    .string()
    .min(1, "Email is required")
    .email("Invalid email")
    .transform((v) => v.trim().toLowerCase()),
  password: z.string().min(1, "Password is required"),
});

export async function loginUser(input: unknown, request: Request): Promise<{ user: SafeUser; next: string }> {
  if (!validateCsrf(request)) throw new Error("CSRF_VALIDATION_FAILED");
  if (!checkRateLimit(`login:${input && typeof input === 'object' && 'email' in input ? input.email : 'anon'}`, 5, 15 * 60 * 1000)) {
    throw new Error("RATE_LIMIT_EXCEEDED");
  }

  const data = loginSchema.parse(input);

  const user = await prisma.user.findUnique({
    where: { email: data.email },
    select: { id: true, email: true, name: true, passwordHash: true },
  });

  if (!user) {
    throw new InvalidCredentialsError();
  }

  const ok = await bcrypt.compare(data.password, user.passwordHash);
  if (!ok) {
    throw new InvalidCredentialsError();
  }

  const next = await getPostAuthRedirectForUser(user.id);

  const userAgent = request.headers.get("user-agent");
  const ipAddress = request.headers.get("x-forwarded-for")?.split(",")[0] || null;

  await recordAuditEventSafe({
    actorUserId: user.id,
    eventType: AUDIT_EVENT_TYPES.USER_SIGNED_IN,
    objectType: AUDIT_OBJECT_TYPES.USER,
    objectId: user.id,
    metadata: { email: user.email },
    userAgent,
    ipAddress,
  });

  return {
    user: { id: user.id, email: user.email, name: user.name },
    next,
  };
}
