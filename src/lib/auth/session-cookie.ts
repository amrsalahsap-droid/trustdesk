import type { NextResponse } from "next/server";
import { serverEnv } from "@/lib/env/server";
import { createSessionToken } from "./session-token";

export const SESSION_COOKIE_NAME = "td_session";

const isProd = serverEnv.NODE_ENV === "production";

export function setSessionCookie(response: NextResponse, userId: string): void {
  const token = createSessionToken(userId);
  response.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60,
  });

  // Identity marker for client-side integrity checks (non-httpOnly)
  response.cookies.set("td_active_uid", userId, {
    httpOnly: false,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60,
  });
}

export function clearSessionCookie(response: NextResponse): void {
  const cookieOptions = {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax" as const,
    path: "/",
    maxAge: 0,
    expires: new Date(0),
  };

  response.cookies.set(SESSION_COOKIE_NAME, "", cookieOptions);
  
  // Clear the identity marker too
  response.cookies.set("td_active_uid", "", {
    ...cookieOptions,
    httpOnly: false,
  });

  // Also clear workspace selection hint if present
  response.cookies.set("x-workspace-id", "", cookieOptions);
}

