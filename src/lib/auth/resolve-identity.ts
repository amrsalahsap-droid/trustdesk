import { AuthenticationError } from "./errors";
import { getServerSession } from "./session";
import { logger } from "@/lib/logging/logger";
import type { AuthIdentity } from "./types";
import { trackNav } from "@/lib/instrumentation/nav-tracker";
import { randomUUID } from "node:crypto";

export async function resolveUserIdentity(): Promise<AuthIdentity> {
  const correlationId = `corr-${randomUUID().slice(0, 8)}`;
  const route = "unknown"; // We don't have easy access to route here without passing it in

  trackNav("nav.auth.start", { correlationId, route });

  const session = await getServerSession();

  if (!session?.user?.id) {
    logger.warn("auth:resolve-identity:failed", {
      reason: "no_session",
      correlationId,
    });
    trackNav("nav.render.error", { correlationId, route, error: "Authentication required" });
    throw new AuthenticationError();
  }

  trackNav("nav.auth.done", { correlationId, route, userId: session.user.id });

  return { userId: session.user.id };
}
