import { buildAuthContext } from "@/lib/auth/build-context";
import type { AuthContext } from "@/lib/auth/types";

/**
 * Wraps a route handler so it always runs with a server-built {@link AuthContext}.
 * Never trust client-supplied `workspaceId` for auth — only `buildAuthContext` + membership.
 */
export function withWorkspaceContext(
  handler: (request: Request, ctx: AuthContext) => Promise<Response>,
): (request: Request) => Promise<Response> {
  return async (request: Request) => {
    const ctx = await buildAuthContext(request);
    return handler(request, ctx);
  };
}

type RouteParams<P extends Record<string, string>> = { params: Promise<P> };

/**
 * Same as {@link withWorkspaceContext}, for dynamic routes that need `params` (e.g. `[id]`).
 */
export function withWorkspaceContextParams<P extends Record<string, string>>(
  handler: (request: Request, ctx: AuthContext, params: P) => Promise<Response>,
): (request: Request, segment: RouteParams<P>) => Promise<Response> {
  return async (request, segment) => {
    const ctx = await buildAuthContext(request);
    const params = await segment.params;
    return handler(request, ctx, params);
  };
}
