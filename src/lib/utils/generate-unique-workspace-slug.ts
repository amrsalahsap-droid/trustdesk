import { prisma } from "@/lib/db/prisma";
import { slugify } from "@/lib/utils/slug";

/**
 * Produces a unique workspace slug from a display name (lowercase, hyphenated, collision suffixes).
 * Safe under concurrent creates when combined with DB unique constraint + transaction retry.
 */
export async function generateUniqueWorkspaceSlug(name: string): Promise<string> {
  const base = slugify(name);
  if (!base) {
    throw new Error("WORKSPACE_SLUG_EMPTY");
  }

  const existing = await prisma.workspace.findMany({
    where: { slug: { startsWith: base } },
    select: { slug: true },
  });

  const taken = new Set(existing.map((w) => w.slug));

  if (!taken.has(base)) {
    return base;
  }

  let counter = 2;
  while (taken.has(`${base}-${counter}`)) counter++;
  return `${base}-${counter}`;
}
