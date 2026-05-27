const MAX_LENGTH = 200;

/**
 * Produces a single path segment safe for object keys (no slashes, no traversal).
 */
export function sanitizeFilename(name: string): string {
  const base = name
    .replace(/\\/g, "/")
    .split("/")
    .pop()!
    .replace(/[\x00-\x1f\x7f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, MAX_LENGTH);

  if (base.length === 0 || /^\.+$/.test(base)) {
    return "unnamed";
  }
  return base;
}
