import { sanitizeFilename } from "./sanitize-filename";

/**
 * Workspace-scoped object key. Never include unsanitized user input in segments.
 */
export function buildStorageKey(
  workspaceId: string,
  documentId: string,
  originalFileName: string,
): string {
  const safeName = sanitizeFilename(originalFileName);
  return `workspaces/${workspaceId}/source-documents/${documentId}/${safeName}`;
}
