import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME } from "./session-cookie";
import { verifySessionToken } from "./session-token";

export interface ServerSession {
  user: { id: string };
}

export async function getServerSession(): Promise<ServerSession | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!raw) {
    return null;
  }

  const userId = verifySessionToken(raw);
  if (!userId) {
    return null;
  }

  return { user: { id: userId } };
}
