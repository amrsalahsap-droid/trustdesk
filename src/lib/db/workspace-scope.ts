import type { AuthContext } from "@/lib/auth/types";

type WorkspaceScopedWhere = Record<string, unknown> & { workspaceId?: string };

/**
 * Merge tenant filter into Prisma `where`. Always sets `workspaceId` from AuthContext (last write wins).
 */
export function workspaceWhere(
  ctx: AuthContext,
  where?: Record<string, unknown>,
): WorkspaceScopedWhere {
  return {
    ...(where ?? {}),
    workspaceId: ctx.workspaceId,
  };
}

type WorkspaceCreateInput = Record<string, unknown>;

/**
 * Merge `workspaceId` from AuthContext into create data. Strips any client-supplied `workspaceId`.
 */
export function workspaceCreateData<T extends WorkspaceCreateInput>(
  ctx: AuthContext,
  data: T,
): T & { workspaceId: string } {
  const { workspaceId: _ignored, ...rest } = data;
  return {
    ...(rest as T),
    workspaceId: ctx.workspaceId,
  };
}

/**
 * `where` for update/delete by primary id (or other key) scoped to the current workspace.
 */
export function workspaceUpdateWhere(
  ctx: AuthContext,
  idField: string,
  id: string,
): Record<string, string> {
  return {
    [idField]: id,
    workspaceId: ctx.workspaceId,
  };
}
