import { createHmac, timingSafeEqual } from "crypto";
import { serverEnv } from "@/lib/env/server";

const SESSION_MS = 7 * 24 * 60 * 60 * 1000;

function encodePayload(userId: string, exp: number): string {
  return Buffer.from(JSON.stringify({ sub: userId, exp }), "utf8").toString("base64url");
}

function signPayload(payloadB64: string): string {
  return createHmac("sha256", serverEnv.SESSION_SECRET).update(payloadB64).digest("base64url");
}

export function createSessionToken(userId: string): string {
  const exp = Date.now() + SESSION_MS;
  const payloadB64 = encodePayload(userId, exp);
  const sig = signPayload(payloadB64);
  return `${payloadB64}.${sig}`;
}

export function verifySessionToken(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, sig] = parts;
  if (!payloadB64 || !sig) return null;

  const expected = signPayload(payloadB64);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const json = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")) as {
      sub?: string;
      exp?: number;
    };
    if (!json.sub || typeof json.exp !== "number") return null;
    if (Date.now() > json.exp) return null;
    return json.sub;
  } catch {
    return null;
  }
}
