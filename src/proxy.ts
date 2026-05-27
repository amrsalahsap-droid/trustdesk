import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE_NAME, clearSessionCookie } from "@/lib/auth/session-cookie";

/**
 * Global Request Proxy (formerly Middleware)
 * Enforces authentication, caching policies, and basic routing rules.
 */
export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // AUTH-001: Clear session cookies on landing to prevent BF-Cache stale snapshots.
  // This ensures that if a user navigates back to the landing page, they are 
  // explicitly treated as unauthenticated in the browser's view.
  if (pathname === "/") {
    const hasSession = request.cookies.has(SESSION_COOKIE_NAME);
    if (hasSession) {
      const response = NextResponse.next();
      clearSessionCookie(response);
      
      // Prevent browser caching of the landing page when we've just cleared the session
      response.headers.set("Cache-Control", "no-store, max-age=0, must-revalidate");
      return response;
    }
  }

  // 1. Define Protected Route Groups
  const isAuthRoute = pathname.startsWith("/auth") && !pathname.startsWith("/auth/invite");
  const isAppRoute = pathname.startsWith("/app");
  const isApiWorkspacesRoute = 
    pathname.startsWith("/api/workspaces") || 
    pathname.startsWith("/api/knowledge") || 
    pathname.startsWith("/api/questionnaires");

  // 2. Check Session
  const sessionToken = request.cookies.get(SESSION_COOKIE_NAME)?.value;

  // 3. Whitelist for public routes (Static assets handled by matcher)
  if (
    pathname === "/" || 
    pathname === "/login" || 
    pathname === "/signup" ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/auth/invite")
  ) {
    // If authenticated and trying to access login/signup, redirect to app
    if (sessionToken && (pathname === "/login" || pathname === "/signup")) {
      return NextResponse.redirect(new URL("/app", request.url));
    }
    return NextResponse.next();
  }

  // 4. Redirect Unauthenticated Users for protected routes
  if (!sessionToken && (isAppRoute || isApiWorkspacesRoute)) {
    if (pathname.startsWith("/api")) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Authentication required" } },
        { status: 401 }
      );
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // 5. Handle Response with Caching Policies
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", pathname);

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  // Aggressively prevent all forms of local and proxy caching for protected routes.
  // This disables BF-Cache for these pages, ensuring that every back/forward 
  // navigation triggers a fresh server request and auth re-validation.
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  
  // Ensure that caching is segmented by session cookie/auth headers
  response.headers.set("Vary", "Cookie, x-workspace-id");

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public (public assets)
     */
    "/((?!_next/static|_next/image|favicon.ico|public).*)",
  ],
};
