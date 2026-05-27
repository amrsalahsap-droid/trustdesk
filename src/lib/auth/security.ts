import { NextResponse } from "next/server";
import { logger } from "@/lib/logging/logger";

/**
 * Simple in-memory rate limiter for development.
 * In production, use Redis or a similar store.
 */
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const entry = rateLimitMap.get(key);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (entry.count >= limit) {
    logger.warn("security:rate-limit-exceeded", { key });
    return false;
  }

  entry.count++;
  return true;
}

/**
 * CSRF Protection - simple version using custom header.
 * Next.js Server Actions and standard POSTs can be protected by checking
 * the 'Origin' or 'Referer' headers, or a custom 'X-Requested-With' header.
 */
export function validateCsrf(request: Request) {
  // Browsers usually don't allow cross-origin requests with custom headers
  // unless explicitly allowed via CORS.
  const header = request.headers.get("x-trustdesk-csrf");
  if (!header) {
    logger.error("security:csrf-missing");
    return false;
  }
  return true;
}
