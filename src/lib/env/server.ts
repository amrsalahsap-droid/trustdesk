import { z } from "zod";

const serverEnvSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  NODE_ENV: z.enum(["development", "production", "test"]),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
  RESEND_API_KEY: z.string().optional(),
  MAIL_FROM: z.string().default("TrustDesk <invites@trustdesk.ai>"),
  APP_URL: z.string().url().default("http://localhost:3000"),
});

const isServer = typeof window === "undefined";

const parsed = serverEnvSchema.safeParse({
  DATABASE_URL: process.env.DATABASE_URL,
  NODE_ENV: process.env.NODE_ENV ?? "development",
  SESSION_SECRET: process.env.SESSION_SECRET,
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  MAIL_FROM: process.env.MAIL_FROM,
  APP_URL: process.env.APP_URL,
});

if (!parsed.success && isServer) {
  const flat = parsed.error.flatten();
  throw new Error(
    `Invalid server environment: ${JSON.stringify({ fieldErrors: flat.fieldErrors, formErrors: flat.formErrors })}`,
  );
}

export const serverEnv = isServer ? parsed.data! : {} as any;
