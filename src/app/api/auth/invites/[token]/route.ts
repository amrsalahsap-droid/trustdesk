import { NextResponse } from "next/server";
import { resolveInviteByToken, acceptInvite } from "@/modules/workspaces/workspace-user-service";
import { handleApiError } from "@/lib/api/error-handler";
import { setSessionCookie } from "@/lib/auth/session-cookie";
import { verifySessionToken } from "@/lib/auth/session-token";
import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session-cookie";
import { checkRateLimit } from "@/lib/auth/security";

/**
 * GET: Retrieve invitation details by token.
 */
export async function GET(
  request: Request,
  segment: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await segment.params;
    
    // Rate limit token lookups
    if (!checkRateLimit(`invite-lookup:${token}`, 10, 60 * 1000)) {
      return NextResponse.json({ error: "TOO_MANY_REQUESTS" }, { status: 429 });
    }

    const result = await resolveInviteByToken(token);

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      workspaceName: result.workspace.name,
      email: result.email,
      name: result.existingUser?.name || "",
      needsRegistration: result.needsRegistration,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST: Accept invitation and activate membership.
 */
export async function POST(
  request: Request,
  segment: { params: Promise<{ token: string }> }
) {
  const { token } = await segment.params;
  
  try {
    // Rate limit acceptance attempts
    if (!checkRateLimit(`invite-accept:${token}`, 5, 60 * 1000)) {
      return NextResponse.json({ error: "TOO_MANY_REQUESTS" }, { status: 429 });
    }

    const body = await request.json();
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    const authUserId = sessionToken ? verifySessionToken(sessionToken) : undefined;

    const result = await acceptInvite({
      token,
      password: body.password,
      name: body.name,
      authUserId: authUserId ?? undefined,
    });

    const res = NextResponse.json({
      success: true,
      userId: result.userId,
    });

    // Set session cookie so they are logged in immediately
    setSessionCookie(res, result.userId);

    return res;
  } catch (error) {
    if (error instanceof Error) {
      if (["INVITE_NOT_FOUND", "INVITE_EXPIRED", "INVITE_REVOKED", "ALREADY_MEMBER", "ALREADY_ACCEPTED", "EMAIL_MISMATCH", "AUTHENTICATION_REQUIRED", "INVALID_PASSWORD"].includes(error.message)) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      if (error.message === "REGISTRATION_REQUIRED") {
        return NextResponse.json({ error: error.message }, { status: 422 });
      }
    }
    return handleApiError(error);
  }
}
