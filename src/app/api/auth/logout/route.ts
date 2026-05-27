import { NextResponse } from "next/server";
import { recordAuditEventSafe, AUDIT_EVENT_TYPES, AUDIT_OBJECT_TYPES } from "@/lib/audit";
import { buildAuthContext } from "@/lib/auth/build-context";
import { clearSessionCookie } from "@/lib/auth/session-cookie";
import { logger } from "@/lib/logging/logger";

export async function POST(request: Request) {
  return await handleLogout(request);
}

export async function GET(request: Request) {
  const response = await handleLogout(request);
  // For GET requests, we redirect to the login page
  const loginUrl = new URL("/login", request.url);
  return NextResponse.redirect(loginUrl, {
    headers: response.headers,
  });
}

async function handleLogout(request: Request) {
  logger.info("auth:logout:triggered");
  
  const userAgent = request.headers.get("user-agent");
  const ipAddress = request.headers.get("x-forwarded-for")?.split(",")[0] || null;

  let actorUserId: string | undefined;
  try {
    const ctx = await buildAuthContext(request);
    actorUserId = ctx.userId;
  } catch (err) {
    // Session might already be invalid, but we try to capture the user if possible
  }

  if (actorUserId) {
    await recordAuditEventSafe({
      actorUserId,
      eventType: AUDIT_EVENT_TYPES.USER_SIGNED_OUT,
      objectType: AUDIT_OBJECT_TYPES.USER,
      objectId: actorUserId,
      userAgent,
      ipAddress,
    });
  }
  
  const response = NextResponse.json({ success: true, message: "Logged out successfully" });
  
  // Use the hardened cookie clearing utility
  clearSessionCookie(response);
  
  // Prevent browser caching of the logout transition
  response.headers.set("Cache-Control", "no-store, max-age=0, must-revalidate");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  response.headers.set("Vary", "Cookie");

  return response;
}

