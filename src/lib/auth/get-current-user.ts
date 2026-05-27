import { prisma } from "@/lib/db/prisma";
import { getServerSession } from "./session";

export type CurrentUserProfile = {
  id: string;
  email: string;
  name: string | null;
};

/**
 * Resolves the authenticated user from the session + database (no password fields).
 */
export async function getCurrentUser(): Promise<CurrentUserProfile | null> {
  const session = await getServerSession();
  if (!session?.user?.id) {
    return null;
  }

  return prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true, name: true },
  });
}
