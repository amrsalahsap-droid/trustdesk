import crypto from "crypto";

/**
 * Creates a SHA-256 hash of a token.
 * Used for storing invitation tokens securely in the database.
 */
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}
