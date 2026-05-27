import type { Prisma } from "@prisma/client";

const BLOCKED_KEY = /^(password|secret|token|authorization|cookie|refreshtoken|accesstoken|passwordhash|session)$/i;

/**
 * Redacts keys that must never appear in audit metadata (passwords, tokens, secrets).
 * Keep metadata shallow: nested objects are stringified one level; avoid huge blobs.
 */
export function sanitizeAuditMetadata(
  metadata: Record<string, unknown> | null | undefined,
): Prisma.InputJsonValue | undefined {
  if (metadata == null) {
    return undefined;
  }

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (BLOCKED_KEY.test(key)) {
      continue;
    }
    if (value !== null && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date)) {
      out[key] = "[object]";
      continue;
    }
    out[key] = value;
  }

  return Object.keys(out).length > 0 ? (out as Prisma.InputJsonValue) : undefined;
}
