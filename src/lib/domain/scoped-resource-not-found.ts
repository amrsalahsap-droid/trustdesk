/**
 * Missing resource or not visible in the current workspace (same as cross-tenant miss).
 * Always map to HTTP 404 with a generic message — do not leak tenant or existence.
 */
export class ScopedResourceNotFoundError extends Error {
  readonly code = "RESOURCE_NOT_FOUND" as const;

  constructor(message = "Resource not found") {
    super(message);
    this.name = "ScopedResourceNotFoundError";
  }
}
