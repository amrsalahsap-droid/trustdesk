import { headers } from "next/headers";

/**
 * Reads optional workspace selection from a request (header first, then query).
 * Never trusts this id without membership validation.
 */
export function getRequestedWorkspaceIdFromRequest(request: Request): string | null {
  const header = request.headers.get("x-workspace-id");
  const query = new URL(request.url).searchParams.get("workspaceId");
  const raw = header?.trim() || query?.trim() || "";
  return raw.length > 0 ? raw : null;
}

/**
 * Reads optional workspace selection from RSC headers.
 */
export async function getRequestedWorkspaceIdFromRSC(): Promise<string | null> {
  const h = await headers();
  const header = h.get("x-workspace-id");
  const raw = header?.trim() || "";
  return raw.length > 0 ? raw : null;
}
